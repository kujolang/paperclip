import { useEffect, useRef, useState } from "react";
import { usePluginAction } from "@paperclipai/plugin-sdk/ui";
import type { ExecutionPlan } from "../execution/contracts.js";
import type { starterCreationSummary, starterCreationView } from "../features/starters/bridge.js";
import type { StarterPreview } from "../features/starters/preview.js";

type View = ReturnType<typeof starterCreationView> & { history?: { notice: string } };
type Summary = ReturnType<typeof starterCreationSummary>;
const terminal = new Set(["succeeded", "failed", "cancelled", "expired", "rejected", "stale", "uncertain"]);
const pre = { whiteSpace: "pre-wrap" as const, overflowWrap: "anywhere" as const, maxHeight: 360, overflow: "auto", fontSize: 12 };
const controls = { display: "flex", flexWrap: "wrap" as const, gap: 8 };
export function StarterCreationPanel({ issueId, enabled, ready, refreshEvidence }: { issueId: string; enabled: boolean; ready: boolean; refreshEvidence: () => unknown }) {
  const invoke = usePluginAction("manage-kujo-starter");
  const [kind, setKind] = useState<StarterPreview["kind"]>("script"), [name, setName] = useState("my-kujo-project");
  const [files, setFiles] = useState<StarterPreview | null>(null), [file, setFile] = useState("");
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
        ...(["inspect", "prepare"].includes(operation) ? { kind, name } : {}),
        ...(operation === "prepare" ? { submissionId: submission.current } : {}) });
      if (!live.current || ticket !== generation.current) return;
      if (operation === "inspect") { const value = data as { plan: ExecutionPlan; preview: StarterPreview }; setPreview(value.plan); setFiles(value.preview); setFile(value.preview.entrypoint); }
      else if (operation === "cancel") setSelected(null);
      else { setSelected(data as View); setPreview(null); }
      if (operation === "prepare") submission.current = null;
      await refresh();
    } catch (reason) { if (live.current && ticket === generation.current) setError(reason instanceof Error ? reason.message : "Starter creation failed"); }
    finally { if (live.current && ticket === generation.current) setBusy(null); }
  }
  return <section aria-label="Approved Kujo project creation" className="kujo-starter-creation" style={{ border: "1px solid var(--border,#ddd)", borderRadius: 12, padding: 18, display: "grid", gap: 12, overflowWrap: "anywhere" }}>
    <style>{`.kujo-starter-creation button,.kujo-starter-creation input,.kujo-starter-creation select { min-height:38px; padding:10px 14px; border:1px solid var(--border,#ddd); border-radius:9px; background:var(--card,#fff); color:var(--foreground,#111); font:inherit; font-size:13px; } .kujo-starter-creation button:disabled { opacity:.5; } .kujo-starter-creation label { display:grid; gap:6px; }`}</style>
    <h3 style={{ margin: 0 }}>Create a Kujo project</h3>
    <p style={{ margin: 0 }}>Review canonical starter files, request human approval in this issue’s decision card, then explicitly create the project here.</p>
    <p style={{ margin: 0 }}>Creates reviewed files in a new workspace directory. No existing file is overwritten. Interrupted creation may leave files; programs and dependency installation are separate steps.</p>
    {!enabled && <p role="status">Kujo project creation is disabled. Refresh and cancellation remain available.</p>}
    {enabled && <><label>Project starter<select aria-label="Creation starter" value={kind} disabled={!!busy} onChange={event => { setKind(event.target.value as StarterPreview["kind"]); setPreview(null); setFiles(null); submission.current = null; }}>
      <option value="script">Local script</option><option value="api">SQLite API</option><option value="mcp">MCP server</option><option value="agent">Fixture AI agent</option>
    </select></label><label>New directory name<input aria-label="Creation directory name" value={name} maxLength={64} disabled={!!busy} onChange={event => { setName(event.target.value); setPreview(null); setFiles(null); submission.current = null; }} /></label></>}
    <div style={controls}>{enabled && <><button disabled={!ready || !!busy || !/^[a-z][a-z0-9_-]{0,63}$/.test(name)} onClick={() => void act("inspect")}>Preview creation files</button>
      <button disabled={!ready || !!busy || !preview || !/^[a-z][a-z0-9_-]{0,63}$/.test(name)} onClick={() => void act("prepare")}>Request file creation approval</button></>}
      <button disabled={!!busy} onClick={() => void act("list")}>Refresh creation requests</button></div>
    {busy && <div role="status">{busy === "start" ? "Creating approved starter files…" : "Loading creation request…"}</div>}
    {error && <div role="alert">{error}</div>}
    {pendingHistory && <p role="status">Some creation evidence is waiting to be saved. Refresh requests; this will not recreate files.</p>}
    {preview && <details open><summary>Destination and approved file inventory</summary><p>{preview.summary}</p><pre style={pre}>{preview.preview}</pre></details>}
    {files && <div><label>Creation file<select aria-label="Creation file" value={file} onChange={event => setFile(event.target.value)}>{files.files.map(item => <option key={item.path}>{item.path}</option>)}</select></label><pre aria-label="Creation source" style={pre}>{files.files.find(item => item.path === file)?.content}</pre></div>}
    {selected && <div style={{ display: "grid", gap: 8 }}><strong>{selected.kind} · {selected.name}</strong><span>Creation: {selected.state}</span>
      {selected.classification && <strong>{String(selected.classification)}</strong>}
      {selected.diagnostic && <p>{selected.diagnostic}</p>}
      {selected.state === "pending" && <p>Accept the human-only decision card, then select Create approved files. A pending request does not prove approval.</p>}
      <div style={controls}>{selected.state === "pending" && <button disabled={!enabled || !ready || !!busy} onClick={() => void act("start", selected.id)}>Create approved files</button>}
        {!terminal.has(selected.state) && <button disabled={busy !== null && busy !== "start"} onClick={() => void act("cancel", selected.id)}>Cancel creation</button>}</div>
      {selected.result && <div aria-label="Created files">
        <p>{selected.result.classification === "created" ? "Starter files created in" : "Creation did not finish in"} <code>{String(selected.result.destination ?? selected.name)}</code>.</p>
        <p>Entry point: <code>{String(selected.result.entrypoint ?? "See the starter README")}</code></p>
        {selected.result.classification === "created" && <p>{selected.kind === "script" ? "Next: select this entry point in Run or test Kujo to try the script." : `Next: read ${selected.name}/README.md for setup and local usage. The application has not been started.`}</p>}
        <details><summary>Published file inventory</summary><ul>{Array.isArray(selected.result.files) && selected.result.files.map((item, index) => <li key={index}><code>{String(item.path)}</code></li>)}</ul></details>
      </div>}
      {["failed", "cancelled", "uncertain"].includes(selected.state) && <p>Failed, cancelled or uncertain requests may leave files; inspect them before another request. No rollback or automatic retry occurs.</p>}
      {selected.history && <p>{selected.history.notice}</p>}
      {selected.state === "uncertain" && <p>Effects may have occurred. Reconcile the affected resources before requesting another run.</p>}
      <details><summary>Creation receipt and approved inventory</summary><pre style={pre}>{JSON.stringify(selected, null, 2)}</pre></details>
    </div>}
    {!!requests.length && <ul>{requests.map(request => <li key={request.id}>{request.kind} · {request.name} · {request.state}<div style={controls}>
      <button disabled={!enabled || !!busy} onClick={() => void act("status", request.id)}>Inspect creation {request.id.slice(-8)}</button>
      {!terminal.has(request.state) && <button disabled={busy !== null && busy !== "start"} onClick={() => void act("cancel", request.id)}>Cancel creation {request.id.slice(-8)}</button>}</div></li>)}</ul>}
    <small>Creation is limited to 27 seconds. Requests and receipts can be recovered after reload; approval never starts creation automatically.</small>
  </section>;
}
