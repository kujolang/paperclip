import { useEffect, useRef, useState } from "react";
import { usePluginAction } from "@paperclipai/plugin-sdk/ui";
import type { RunLedgerReport } from "../features/runledger/import.js";

export function RunLedgerPanel({ entityType, entityId, report, refresh }: {
  entityType: string; entityId: string; report: RunLedgerReport | null; refresh: () => unknown;
}) {
  const invoke = usePluginAction("import-verification");
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<RunLedgerReport | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const current = imported ?? report;
  async function submit() {
    setBusy(true); setError(null);
    try {
      const result = await invoke({ entityType, entityId, format: "runledger", json }) as RunLedgerReport;
      if (!active.current) return;
      setImported(result); setJson(""); await refresh();
    } catch (value) { if (active.current) setError(value instanceof Error ? value.message : String(value)); }
    finally { if (active.current) setBusy(false); }
  }
  return <section aria-label="RunLedger accountability" style={{ border: "1px solid var(--border, #ddd)", borderRadius: 12, padding: 18, display: "grid", gap: 12, overflowWrap: "anywhere" }}>
    <strong>RunLedger accountability</strong>
    <p>Link a recorded attempt to this work. Imported test outcomes, usage and costs remain supplied claims. A reported pass does not verify completion.</p>
    {entityType !== "run" && <>
      <label>RunLedger record JSON<textarea aria-label="RunLedger record JSON" rows={4} maxLength={65_536} value={json} disabled={busy} onChange={event => setJson(event.target.value)} style={{ width: "100%", boxSizing: "border-box" }} /></label>
      <button disabled={busy || !json.trim() || new TextEncoder().encode(json).byteLength > 65_536} onClick={() => void submit()}>{busy ? "Importing receipt…" : "Import RunLedger receipt"}</button>
    </>}
    {error && <div role="alert">{error}</div>}
    {current ? <div aria-label="RunLedger summary">
      <strong>Verification: {current.classification}</strong>
      <p>Recorded attempt: {current.record.id} · {current.record.model} · Claimed status: {current.record.status}</p>
      <p>Starting commit: {current.record.start_commit ?? "unknown"} · Resulting commit: {current.record.end_commit ?? "unknown"}</p>
      <p>Host importing agent: {current.host.agentId ?? "human import"} · Host run: {current.host.runId ?? "not linked"}</p>
      <p>Parent issue: {current.host.parentIssueId ?? "none recorded"} · Tests reported: {current.record.tests.length}</p>
      <p>{current.notice}</p>
      <details><summary>Recorded usage and correlation</summary><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify({ usage: current.record.usage, cost: current.record.cost, correlation: current.record.correlation }, null, 2)}</pre></details>
    </div> : <p>No RunLedger evidence retained. Verification is incomplete.</p>}
    <small>Inspect, compare, export or attach attempts in Evidence history below. Earlier failures remain until the existing 20-record/30-day retention limit or explicit clearing.</small>
  </section>;
}
