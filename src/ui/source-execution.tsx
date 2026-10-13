import { useEffect, useRef, useState } from "react";
import { usePluginAction } from "@paperclipai/plugin-sdk/ui";
import type { ExecutionPlan } from "../execution/contracts.js";
import type { sourceExecutionSummary, sourceExecutionView } from "../features/source-execution/bridge.js";
import type { SourceMode } from "../features/source-execution/host.js";

type View = ReturnType<typeof sourceExecutionView> & { history?: { notice: string } };
type Summary = ReturnType<typeof sourceExecutionSummary>;
const terminal = new Set(["succeeded", "failed", "cancelled", "expired", "rejected", "stale", "uncertain"]);
const pre = { whiteSpace: "pre-wrap" as const, overflowWrap: "anywhere" as const, maxHeight: 360, overflow: "auto", fontSize: 12 };
const controls = { display: "flex", flexWrap: "wrap" as const, gap: 8 };
export function SourceExecutionPanel({ issueId, enabled, ready, refreshEvidence }: { issueId: string; enabled: boolean; ready: boolean; refreshEvidence: () => unknown }) {
  const invoke = usePluginAction("manage-kujo-execution");
  const [mode, setMode] = useState<SourceMode>("run"), [path, setPath] = useState("src/main.kujo");
  const [requests, setRequests] = useState<Summary[]>([]), [selected, setSelected] = useState<View | null>(null);
  const [preview, setPreview] = useState<ExecutionPlan | null>(null), [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null), [pendingHistory, setPendingHistory] = useState(false);
  const live = useRef(true), generation = useRef(0), submission = useRef<string | null>(null);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  async function refresh() {
    const data = await invoke({ operation: "list", issueId }) as { requests: Summary[]; history?: { pending: boolean } };
    if (live.current) { setRequests(data.requests); setPendingHistory(!!data.history?.pending); await refreshEvidence(); }
  }
  async function act(operation: string, id?: string) {
    const ticket = ++generation.current; setError(null); setBusy(operation);
    try {
      if (operation === "list") { await refresh(); return; }
      if (operation === "prepare") submission.current ??= crypto.randomUUID();
      const data = await invoke({ operation, issueId, ...(id ? { id } : {}),
        ...(["inspect", "prepare"].includes(operation) ? { mode, ...(mode === "fixtures" ? {} : { path }) } : {}),
        ...(operation === "prepare" ? { submissionId: submission.current } : {}) });
      if (!live.current || ticket !== generation.current) return;
      if (operation === "inspect") setPreview((data as { plan: ExecutionPlan }).plan);
      else if (operation === "cancel") setSelected(null);
      else { setSelected(data as View); setPreview(null); }
      if (operation === "prepare") submission.current = null;
      await refresh();
    } catch (reason) { if (live.current && ticket === generation.current) setError(reason instanceof Error ? reason.message : "Source execution failed"); }
    finally { if (live.current && ticket === generation.current) setBusy(null); }
  }
  return <section aria-label="Approved Kujo run and test" className="kujo-source-execution" style={{ border: "1px solid var(--border,#ddd)", borderRadius: 12, padding: 18, display: "grid", gap: 12, overflowWrap: "anywhere" }}>
    <style>{`.kujo-source-execution button,.kujo-source-execution input,.kujo-source-execution select { min-height:38px; padding:10px 14px; border:1px solid var(--border,#ddd); border-radius:9px; background:var(--card,#fff); color:var(--foreground,#111); font:inherit; font-size:13px; } .kujo-source-execution button:disabled { opacity:.5; } .kujo-source-execution label { display:grid; gap:6px; }`}</style>
    <h3 style={{ margin: 0 }}>Run or test Kujo</h3>
    <p style={{ margin: 0 }}>Preview a fixed native command, request human approval in this issue’s decision card, then start it here.</p>
    <p style={{ margin: 0 }}>Uses a temporary copy of Git-visible text. Ignored dependencies and credentials are not supplied; relative output is removed afterward. Code is trusted and can still affect host files, processes or the network. This is not a sandbox or a persistent server.</p>
    {!enabled && <p role="status">Kujo run/test is disabled. Refresh and cancellation remain available.</p>}
    {enabled && <><label>Kujo operation<select aria-label="Kujo operation" value={mode} disabled={!!busy} onChange={event => { setMode(event.target.value as SourceMode); setPreview(null); submission.current = null; }}>
      <option value="run">Run a script</option><option value="test">Test a file (test-run)</option><option value="fixtures">Project fixture tests (tests/)</option>
    </select></label>{mode !== "fixtures" && <label>Kujo entry file<input aria-label="Kujo entry file" value={path} disabled={!!busy} onChange={event => { setPath(event.target.value); setPreview(null); submission.current = null; }} /></label>}</>}
    <div style={controls}>{enabled && <><button disabled={!ready || !!busy || (mode !== "fixtures" && !path)} onClick={() => void act("inspect")}>Preview command</button>
      <button disabled={!ready || !!busy || (mode !== "fixtures" && !path)} onClick={() => void act("prepare")}>Request run/test approval</button></>}
      <button disabled={!!busy} onClick={() => void act("list")}>Refresh run/test requests</button></div>
    {busy && <div role="status">{busy === "start" ? "Running approved Kujo command…" : "Loading run/test request…"}</div>}
    {error && <div role="alert">{error}</div>}
    {pendingHistory && <p role="status">Some run/test evidence is waiting to be saved. Refresh requests; this will not rerun commands.</p>}
    {preview && <details open><summary>Command and approved input coverage</summary><p>{preview.summary}</p><pre style={pre}>{preview.preview}</pre></details>}
    {selected && <div style={{ display: "grid", gap: 8 }}><strong>{selected.mode} · {selected.path}</strong><span>Process: {selected.state}</span>
      {selected.classification && <strong>{String(selected.classification)}</strong>}
      {selected.diagnostic && <p>{selected.diagnostic}</p>}
      {selected.state === "pending" && <p>Accept the human-only decision card, then select Start approved command. A pending request does not prove approval.</p>}
      <div style={controls}>{selected.state === "pending" && <button disabled={!enabled || !ready || !!busy} onClick={() => void act("start", selected.id)}>Start approved command</button>}
        {!terminal.has(selected.state) && <button disabled={busy !== null && busy !== "start"} onClick={() => void act("cancel", selected.id)}>Cancel command</button>}</div>
      {selected.result && <><p>Exit status and output were observed. Exit zero alone does not establish that tests ran or that the whole project passed.</p><pre aria-label="Native Kujo output" style={pre}>{String(selected.result.stdout ?? "")}{String(selected.result.stderr ?? "")}</pre></>}
      {selected.history && <p>{selected.history.notice}</p>}
      {selected.state === "uncertain" && <p>Effects may have occurred. Reconcile the affected resources before requesting another run.</p>}
      <details><summary>Run/test receipt and approved inputs</summary><pre style={pre}>{JSON.stringify(selected, null, 2)}</pre></details>
    </div>}
    {!!requests.length && <ul>{requests.map(request => <li key={request.id}>{request.mode} · {request.path} · {request.state}<div style={controls}>
      <button disabled={!enabled || !!busy} onClick={() => void act("status", request.id)}>Inspect run/test {request.id.slice(-8)}</button>
      {!terminal.has(request.state) && <button disabled={busy !== null && busy !== "start"} onClick={() => void act("cancel", request.id)}>Cancel run/test {request.id.slice(-8)}</button>}</div></li>)}</ul>}
    <small>Bounded by company runtime/output limits, at most 27 seconds. Shares the 20-request/two-owner company limits with Eval. No automatic retry; retained ledger and Evidence history use the existing expiry and retention rules.</small>
  </section>;
}
