import type { DecisionObservation } from "../features/dispatch/decision-observation.js";
import { useEffect, useRef, useState } from "react";
import { usePluginAction } from "@paperclipai/plugin-sdk/ui";
import type { PublicWorkflowPlan } from "../features/dispatch/public.js";
import type { workflowSummary, workflowView } from "../features/dispatch/bridge.js";
import type { DispatchControlView } from "../features/dispatch/control.js";

type Summary = ReturnType<typeof workflowSummary>;
type View = Summary & Partial<ReturnType<typeof workflowView>>;
const terminal = new Set(["succeeded", "failed", "cancelled", "expired", "rejected", "stale", "uncertain"]);
const pre = { whiteSpace: "pre-wrap" as const, overflowWrap: "anywhere" as const, maxHeight: 320, overflow: "auto", fontSize: 12 };
export function WorkflowPanel({ issueId, enabled, ready, refreshEvidence }: { issueId: string; enabled: boolean; ready: boolean; refreshEvidence: () => unknown }) {
  const invoke = usePluginAction("manage-kujo-workflow");
  const [template, setTemplate] = useState("approval-handoff"), [topic, setTopic] = useState("Explore Kujo workflow approvals");
  const [decisionReceipt, setDecisionReceipt] = useState<DecisionObservation | null>(null);
  const [response, setResponse] = useState("I reviewed this checkpoint.");
  const [requests, setRequests] = useState<Summary[]>([]), [selected, setSelected] = useState<View | null>(null);
  const [preview, setPreview] = useState<PublicWorkflowPlan | null>(null), [control, setControl] = useState<DispatchControlView | null>(null);
  const [notice, setNotice] = useState<string | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState<string | null>(null);
  const live = useRef(true), generation = useRef(0), submission = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => { live.current = true; return () => { live.current = false; generation.current++; }; }, []);
  useEffect(() => {
    if (!selected || busy || !(selected.state === "running" || selected.state === "cancel_requested" || (selected.state === "pending" && selected.queuedAt))) return;
    const id = selected.id, ticket = generation.current;
    let disposed = false, fetching = false;
    const timer = setInterval(() => {
      if (fetching) return;
      fetching = true;
      void invoke({ operation: "status", issueId, id }).then(data => {
        if (!disposed && live.current && generation.current === ticket) {
          setSelected(data as View);
          setNotice(current => current === "Status refresh unavailable. Retry with Refresh status." ? null : current);
          if (terminal.has((data as View).state)) void refreshEvidence();
        }
      }).catch(() => {
        if (!disposed && live.current && generation.current === ticket) setNotice("Status refresh unavailable. Retry with Refresh status.");
      }).finally(() => { fetching = false; });
    }, 3000);
    return () => { disposed = true; clearInterval(timer); };
  }, [selected?.id, selected?.state, selected?.queuedAt, busy, issueId, invoke, refreshEvidence]);
  async function act(operation: string, id?: string, decision?: "approve" | "reject") {
    const ticket = ++generation.current; setBusy(operation); setError(null); setNotice(null);
    if (operation === "observe") { setControl(null); setDecisionReceipt(null); }
    try {
      const payload = { operation, issueId, ...(id ? { id } : {}), ...(["inspect", "prepare"].includes(operation) ? { template, topic } : {}), ...(decision ? { decision, response } : {}) };
      if (operation === "prepare" || operation === "decide") {
        const key = JSON.stringify(payload);
        if (submission.current?.key !== key) submission.current = { key, id: crypto.randomUUID() };
      }
      const data = await invoke({ ...payload, ...(["prepare", "decide"].includes(operation) ? { submissionId: submission.current!.id } : {}) });
      if (!live.current || generation.current !== ticket) return;
      if (operation === "inspect") setPreview((data as { plan: PublicWorkflowPlan }).plan);
      else if (operation === "list") setRequests((data as { requests: Summary[] }).requests);
      else if (operation === "observe") {
        const value = data as { status: string; control: DispatchControlView | null; decisionReceipt?: DecisionObservation };
        setDecisionReceipt(value.decisionReceipt ?? null);
        setControl(value.control); setNotice(value.status === "decision-observed" ? "Native checkpoint receipt observed. The original host command receipt is unchanged; this never authorizes replay." : value.status === "observed" ? "Native state observed now. This does not rewrite an uncertain command receipt." : "No native state is available yet; refresh the operation status first.");
      } else {
        setSelected(data as View); setPreview(null); setControl(null); setDecisionReceipt(null);
        if (operation === "prepare" || operation === "decide") submission.current = null;
      }
      if (operation !== "list") {
        const list = await invoke({ operation: "list", issueId }) as { requests: Summary[] };
        if (live.current && generation.current === ticket) setRequests(list.requests);
        await refreshEvidence();
      }
    } catch (reason) { if (live.current && generation.current === ticket) setError(reason instanceof Error ? reason.message : "Workflow operation failed"); }
    finally { if (live.current && generation.current === ticket) setBusy(null); }
  }
  const paused = control?.available && ["paused", "needs_changes"].includes(control.run_status);
  return <section aria-label="Kujo workflows" className="kujo-workflows" style={{ border: "1px solid var(--border,#ddd)", borderRadius: 12, padding: 18, display: "grid", gap: 12 }}>
    <style>{`.kujo-workflows button,.kujo-workflows input,.kujo-workflows select { min-height:38px; padding:10px 14px; border:1px solid var(--border,#ddd); border-radius:9px; background:var(--card,#fff); color:var(--foreground,#111); font:inherit; font-size:13px; } .kujo-workflows button:disabled { opacity:.5; } .kujo-workflows label { display:grid; gap:6px; } .kujo-workflows .controls { display:flex; flex-wrap:wrap; gap:8px; }`}</style>
    <h3 style={{ margin: 0 }}>Run a Kujo workflow</h3>
    <p style={{ margin: 0 }}>Try a shipped Dispatch example with no API key. Review its effects, accept the issue’s human decision card, then explicitly queue the operation. Examples use offline fixtures, not live research or providers.</p>
    {!enabled && <p role="status">Enable Human-approved Dispatch workflows in company settings. Retained request status and cancellation remain available.</p>}
    <p>macOS/Linux only. An operator must configure the company’s <code>workflow-state</code> folder as an existing private directory owned by the Paperclip OS user.</p>
    {enabled && <><label>Workflow example<select aria-label="Workflow example" disabled={!!busy} value={template} onChange={e => { setTemplate(e.target.value); setPreview(null); submission.current = null; }}><option value="approval-handoff">Approval handoff</option><option value="research-report">Research report</option><option value="crud-reliability">CRUD reliability</option></select></label>
      <label>Workflow topic<input aria-label="Workflow topic" value={topic} maxLength={500} disabled={!!busy} onChange={e => { setTopic(e.target.value); setPreview(null); submission.current = null; }} /></label></>}
    <div className="controls">{enabled && <><button disabled={!ready || !!busy || !topic.trim()} onClick={() => void act("inspect")}>Preview workflow</button><button disabled={!ready || !!busy || !preview} onClick={() => void act("prepare")}>Request workflow approval</button></>}<button disabled={!!busy} onClick={() => void act("list")}>Refresh workflow requests</button></div>
    {busy && <div role="status">{busy === "start" ? "Submitting approved operation to the durable queue…" : "Loading workflow…"}</div>}
    {error && <div role="alert">{error}</div>}{notice && <p role="status">{notice}</p>}
    {preview && <details open><summary>Workflow effects and provenance</summary><p>{preview.summary}</p><pre style={pre}>{preview.preview}</pre></details>}
    {selected && <div style={{ display: "grid", gap: 8 }}><strong>{selected.name}</strong><span>Control operation: {selected.state}{selected.queuedAt && selected.state === "pending" ? " · queued" : ""}</span>
      {selected.state === "pending" && <p>{selected.queuedAt ? "Waiting for the host workflow job. You can close this panel; the submitted start survives reload." : "Accept the issue’s matching decision card, then queue this operation. Approval alone does not start work."}</p>}
      <div className="controls">{selected.state === "pending" && enabled && !selected.queuedAt && <button disabled={!!busy} onClick={() => void act("start", selected.id)}>Queue approved operation</button>}<button disabled={!!busy} onClick={() => void act("status", selected.id)}>Refresh operation status</button>
        {enabled && <button disabled={!!busy || !terminal.has(selected.state)} onClick={() => void act("observe", selected.parentId)}>Inspect native workflow</button>}
        {enabled && selected.operation === "dispatch.decide" && <button disabled={!!busy || !terminal.has(selected.state)} onClick={() => void act("observe", selected.id)}>Inspect checkpoint receipt</button>}
        {!terminal.has(selected.state) && <button disabled={!!busy} onClick={() => void act("cancel", selected.id)}>Cancel operation</button>}</div>
      {selected.diagnostic && <p>{selected.diagnostic}</p>}
      {["failed", "cancelled", "uncertain"].includes(selected.state) && <p>Effects may remain. Inspect native state before another action. This request is never automatically replayed, and cancellation of a command does not erase the retained workflow.</p>}
      {control && (control.available ? <div><strong>Workflow: {control.run_status}</strong><p>Observed revision {control.state_revision}</p><details open><summary>Native checkpoint</summary><pre style={pre}>{JSON.stringify(control.human_intervention ?? control.current_control_boundary, null, 2)}</pre></details></div> : <p>The canonical control view is too large to review here. No checkpoint decision can be admitted.</p>)}
      {decisionReceipt && <section aria-label="Native checkpoint receipt"><strong>{decisionReceipt.match === "exact" ? `Exact checkpoint decision: ${decisionReceipt.decision_status}` : `Checkpoint receipt: ${decisionReceipt.match}`}</strong><p>{decisionReceipt.match === "exact" && decisionReceipt.decision_status === "applied" ? "Dispatch recorded this exact decision as applied. This does not prove that every workflow step succeeded." : "The observation does not prove successful application. Do not replay the decision to discover its outcome."}</p><p>Native workflow: {decisionReceipt.run_status} · observed revision {decisionReceipt.observed_state_revision}</p><details><summary>Observed receipt</summary><pre style={pre}>{JSON.stringify(decisionReceipt, null, 2)}</pre></details></section>}
      {paused && enabled && <><label>Checkpoint review<input aria-label="Checkpoint review" value={response} maxLength={2000} onChange={e => setResponse(e.target.value)} /></label><div className="controls"><button disabled={!!busy || !response.trim()} onClick={() => void act("decide", selected.parentId, "approve")}>Request checkpoint approval</button><button disabled={!!busy || !response.trim()} onClick={() => void act("decide", selected.parentId, "reject")}>Request checkpoint rejection</button></div><p>This creates a separate human confirmation bound to the observed checkpoint. Accept it, then explicitly queue the decision.</p></>}
      <details><summary>Operation receipt</summary><pre style={pre}>{JSON.stringify(selected, null, 2)}</pre></details></div>}
    {!!requests.length && <ul>{requests.map(item => <li key={item.id}>{item.name} · {item.state}{item.queuedAt && item.state === "pending" ? " · queued" : ""}<div className="controls"><button disabled={!!busy} onClick={() => void act("status", item.id)}>Inspect workflow operation {item.id.slice(-8)}</button>{!terminal.has(item.state) && <button disabled={!!busy} onClick={() => void act("cancel", item.id)}>Cancel workflow operation {item.id.slice(-8)}</button>}</div></li>)}</ul>}
    <small>Approved effects run for at most two minutes per job. Up to 20 started workflows are retained per company. Native state and control-command receipts describe different things.</small>
  </section>;
}
