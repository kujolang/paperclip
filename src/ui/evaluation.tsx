import { useEffect, useRef, useState } from "react";
import { usePluginAction } from "@paperclipai/plugin-sdk/ui";
import type { ExecutionPlan } from "../execution/contracts.js";
import type { EvaluationSummary, EvaluationView } from "../features/eval/bridge.js";

type Props = { issueId: string; enabled: boolean; ready: boolean; refreshEvidence: () => unknown };
const terminal = new Set(["succeeded", "failed", "cancelled", "expired", "rejected", "stale", "uncertain"]);
const wrap = { overflowWrap: "anywhere" as const, border: "1px solid var(--border, #ddd)", borderRadius: 12, padding: 18, display: "grid", gap: 12 };
const controls = { display: "flex", flexWrap: "wrap" as const, gap: 8 };
const pre = { whiteSpace: "pre-wrap" as const, maxHeight: 360, overflow: "auto", fontSize: 12 };
export function EvaluationPanel({ issueId, enabled, ready, refreshEvidence }: Props) {
  const invoke = usePluginAction("manage-evaluation");
  const [suite, setSuite] = useState("eval.json");
  const [requests, setRequests] = useState<EvaluationSummary[]>([]);
  const [selected, setSelected] = useState<EvaluationView | null>(null);
  const [preview, setPreview] = useState<{ plan: ExecutionPlan; coverage: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyPending, setHistoryPending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const live = useRef(true);
  const generation = useRef(0);
  const submission = useRef<string | null>(null);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  async function refresh() {
    const data = await invoke({ operation: "list", issueId }) as { requests: EvaluationSummary[]; history?: { pending: boolean } };
    if (live.current) { setRequests(data.requests); setHistoryPending(!!data.history?.pending); await refreshEvidence(); }
  }
  async function act(operation: string, id?: string) {
    const ticket = ++generation.current;
    setError(null); setBusy(operation);
    try {
      if (operation === "list") { await refresh(); return; }
      if (operation === "prepare") submission.current ??= crypto.randomUUID();
      const data = await invoke({ operation, issueId, ...(id ? { id } : {}),
        ...(["inspect", "prepare"].includes(operation) ? { suite } : {}),
        ...(operation === "prepare" ? { submissionId: submission.current } : {}) });
      if (!live.current || ticket !== generation.current) return;
      if (operation === "inspect") setPreview(data as { plan: ExecutionPlan; coverage: unknown });
      else if (operation === "cancel") setSelected(null);
      else { setSelected(data as EvaluationView); setPreview(null); }
      if (operation === "prepare") submission.current = null;
      await refresh();
    } catch (reason) { if (live.current && ticket === generation.current) setError(reason instanceof Error ? reason.message : "Evaluation request failed"); }
    finally { if (live.current && ticket === generation.current) setBusy(null); }
  }
  // No polling loop or automatic execution: approval and start stay explicit.
  return <section aria-label="Approved evaluation" className="kujo-evaluation" style={wrap}>
    <style>{`.kujo-evaluation button { min-height:38px; padding:10px 14px; border:1px solid var(--border,#ddd); border-radius:9px; background:var(--card,#fff); color:var(--foreground,#111); font:inherit; font-size:13px; cursor:pointer; } .kujo-evaluation button:disabled { opacity:.5; cursor:not-allowed; } .kujo-evaluation input { padding:10px 12px; margin-top:6px; border:1px solid var(--border,#ddd); border-radius:9px; background:var(--card,#fff); color:var(--foreground,#111); font:inherit; }`}</style>
    <h3 style={{ margin: 0 }}>Run an evaluation</h3>
    <p style={{ margin: 0 }}>Review a Kujo Eval suite, request human approval in this issue’s decision card, then start it here. Preparation does not run checks.</p>
    <p style={{ margin: 0 }}>Suites can execute code, access the network and write files. Inputs use a private copy of Git-visible text; ignored dependencies and external resources are not frozen.</p>
    {!enabled && <p role="status">Execution is disabled. You can still refresh and cancel outstanding requests.</p>}
    {enabled && <label>Eval suite file<input style={{ display: "block", width: "100%", boxSizing: "border-box" }} value={suite} onChange={event => { setSuite(event.target.value); submission.current = null; setPreview(null); }} disabled={busy !== null} /></label>}
    <div style={controls}>
      {enabled && <><button disabled={!ready || !!busy || !suite} onClick={() => void act("inspect")}>Preview suite</button>
        <button disabled={!ready || !!busy || !suite} onClick={() => void act("prepare")}>Request approval</button></>}
      <button disabled={!!busy} onClick={() => void act("list")}>Refresh requests</button>
    </div>
    {busy && <div role="status">{busy === "start" ? "Running approved evaluation…" : "Loading evaluation…"}</div>}
    {error && <div role="alert">{error}</div>}
    {historyPending && <p role="status">Some execution evidence is waiting to be saved. Refresh requests to retry; evaluations will not rerun.</p>}
    {preview !== null && <details open><summary>Suite and input coverage</summary><p>{preview.plan.summary}</p><p>Effects: {preview.plan.effects.join(", ")}</p><pre style={pre}>{preview.plan.preview ?? JSON.stringify(preview.coverage, null, 2)}</pre></details>}
    {selected && <div style={{ display: "grid", gap: 8 }}>
      <strong>{selected.suite}</strong>
      <span>Process: {selected.state}</span>
      {selected.classification && <strong>Evaluation: {String(selected.classification)}{selected.result?.nativeClassification && selected.result.nativeClassification !== selected.classification ? ` (native checks: ${String(selected.result.nativeClassification)})` : ""}</strong>}
      {selected.classification === "partial" && <p style={{ margin: 0 }}>Some inputs were omitted. A native pass does not establish complete workspace coverage.</p>}
      {selected.diagnostic && <p style={{ margin: 0 }}>{selected.diagnostic}</p>}
      {selected.state === "pending" && <p>Accept the human-only confirmation in the issue thread, then select Start approved evaluation. Pending means execution has not started; it does not prove approval.</p>}
      <div style={controls}>
        {selected.state === "pending" && <button disabled={!enabled || !ready || !!busy} onClick={() => void act("start", selected.id)}>Start approved evaluation</button>}
        {!terminal.has(selected.state) && <button disabled={busy !== null && busy !== "start"} onClick={() => void act("cancel", selected.id)}>Cancel evaluation</button>}
      </div>
      {selected.history && <p style={{ margin: 0 }}>{selected.history.notice}</p>}
      <details><summary>Execution receipt and approved inputs</summary><pre style={pre}>{JSON.stringify(selected, null, 2)}</pre></details>
      {selected.state === "uncertain" && <p>Execution may have produced effects. Inspect the receipt and external resources before requesting a new run.</p>}
    </div>}
    {requests.length > 0 && <ul>{requests.map(request => <li key={request.id} style={{ marginBottom: 8 }}>
      {request.suite} · {request.state}{request.classification ? ` · ${String(request.classification)}` : ""}
      <div style={controls}><button disabled={!enabled || !!busy} onClick={() => void act("status", request.id)}>Inspect {request.id.slice(-8)}</button>
        {!terminal.has(request.state) && <button disabled={busy !== null && busy !== "start"} onClick={() => void act("cancel", request.id)}>Cancel {request.id.slice(-8)}</button>}</div>
    </li>)}</ul>}
    <small>Up to 20 active requests and two running owners per company. No automatic retry. The execution ledger retains up to 100 terminal requests for 30 days; Evidence history retains 20 records per issue for 30 days.</small>
  </section>;
}
