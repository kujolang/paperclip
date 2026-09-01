import { useState } from "react";
import { StatusBadge, Spinner, usePluginAction, usePluginData, type PluginDetailTabProps } from "@paperclipai/plugin-sdk/ui";
import type { ReviewPack } from "../features/review/schema.js";
import type { FailureEvidence } from "../features/failure/schema.js";
import type { ContextPack } from "../features/context/schema.js";

type Detail = { review: ReviewPack | null; failure: FailureEvidence | null; context: ContextPack | null };

const card: React.CSSProperties = { border: "1px solid var(--border, #ddd)", borderRadius: 8, padding: 16, display: "grid", gap: 10 };
const grid: React.CSSProperties = { display: "grid", gap: 16 };
const metrics: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 };

function ReviewSection({ review }: { review: ReviewPack | null }) {
  if (!review) return <section style={card}><strong>Review Pack</strong><span>Not generated</span></section>;
  return <section style={card}>
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <strong>Review Pack</strong>
      <StatusBadge
        status={review.footprint.riskLevel === "high" ? "error" : review.footprint.riskLevel === "medium" ? "warning" : "ok"}
        label={`${review.footprint.riskLevel.toUpperCase()} BLAST RADIUS`}
      />
    </div>
    {review.stale && <div role="alert">This review was generated for an earlier workspace state.</div>}
    <div style={metrics}>
      <span><b>{review.footprint.filesChanged}</b><br />files changed</span>
      <span><b>+{review.footprint.additions} / -{review.footprint.deletions}</b><br />lines</span>
      <span><b>{review.footprint.churn}</b><br />lines churn</span>
    </div>
    {review.footprint.signals.length > 0 && <div><b>Signals</b><ul>{review.footprint.signals.map((signal) => <li key={signal.id}>{signal.message}</li>)}</ul></div>}
    <div><b>Suggested verification</b><div style={{ fontSize: 12 }}>Suggestions only — no command is claimed as executed.</div>
      <ul>{review.suggestedTests.slice(0, 12).map((test) => <li key={test.command}><code>{test.command}</code></li>)}</ul>
    </div>
    <small>Generated with Kujo ChangeBucket + PatchBrief</small>
  </section>;
}

function FailureSection({ failure }: { failure: FailureEvidence | null }) {
  if (!failure) return <section style={card}><strong>Failure Evidence</strong><span>None</span></section>;
  return <section style={card}>
    <div style={{ display: "flex", justifyContent: "space-between" }}><strong>Failure Evidence</strong><StatusBadge status="error" label="FAILED" /></div>
    <div><b>{failure.failure.title}</b></div>
    {failure.failure.command && <div><small>Command</small><br /><code>{failure.failure.command}</code></div>}
    {failure.failure.exitCode !== undefined && <div>Exit code: {failure.failure.exitCode}</div>}
    <div>Redaction applied: {failure.redaction.redactedCount} match(es)</div>
    {failure.evidence.map((item) => <details key={item.label}><summary>{item.label}{item.truncated ? " (truncated)" : ""}</summary><pre style={{ whiteSpace: "pre-wrap", maxHeight: 320, overflow: "auto" }}>{item.content}</pre></details>)}
    <small>Captured with Kujo CaseFile</small>
  </section>;
}

function ContextSection({ context }: { context: ContextPack | null }) {
  if (!context) return <section style={card}><strong>Context Pack</strong><span>Available</span></section>;
  return <section style={card}>
    <strong>Context Pack</strong>
    <div>{context.task}</div>
    <div>{context.files.length} relevant files · about {context.estimatedTokens.toLocaleString()} tokens · {context.depth}</div>
    {context.stale && <div role="alert">This context was generated for an earlier workspace state.</div>}
    <ul>{context.files.slice(0, 20).map((file) => <li key={file.path}><code>{file.path}</code><br /><small>{file.reason}</small></li>)}</ul>
    {context.truncated && <div>Selection was bounded by the configured budget.</div>}
    <small>Selected with Kujo Scent</small>
  </section>;
}

export function KujoDetailTab({ context }: PluginDetailTabProps) {
  const { data, loading, error, refresh } = usePluginData<Detail>("detail", { entityType: context.entityType, entityId: context.entityId });
  const generateReview = usePluginAction("generate-review");
  const generateContext = usePluginAction("generate-context");
  const captureFailure = usePluginAction("capture-failure");
  const [task, setTask] = useState("");
  const [failureTitle, setFailureTitle] = useState("");
  const [failureLog, setFailureLog] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canGenerate = context.entityType === "project" || context.entityType === "issue";

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setActionError(null);
    try { await fn(); await refresh(); }
    catch (value) { setActionError(value instanceof Error ? value.message : String(value)); }
    finally { setBusy(null); }
  }

  if (loading) return <Spinner label="Loading Kujo artifacts" />;
  if (error) return <div role="alert">Unable to load Kujo artifacts: {error.message}</div>;

  return <div style={grid}>
    <header><h2 style={{ marginBottom: 4 }}>Kujo</h2><div>Scope, review, and reproduce agent work.</div></header>
    {actionError && <div role="alert">{actionError}</div>}
    {canGenerate && <section style={card}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={busy !== null} onClick={() => run("review", () => generateReview({ entityType: context.entityType, entityId: context.entityId }))}>
          {busy === "review" ? "Generating…" : "Generate Review Pack"}
        </button>
      </div>
      <label>Task for Context Pack<input value={task} onChange={(event) => setTask(event.target.value)} maxLength={10000} style={{ display: "block", width: "100%" }} /></label>
      <button disabled={busy !== null || !task.trim()} onClick={() => run("context", () => generateContext({ entityType: context.entityType, entityId: context.entityId, task, depth: "focused" }))}>
        {busy === "context" ? "Selecting…" : "Generate Context Pack"}
      </button>
      <label>Failure title<input value={failureTitle} onChange={(event) => setFailureTitle(event.target.value)} maxLength={200} style={{ display: "block", width: "100%" }} /></label>
      <label>Bounded failure log<textarea value={failureLog} onChange={(event) => setFailureLog(event.target.value)} maxLength={200000} rows={5} style={{ display: "block", width: "100%" }} /></label>
      <button disabled={busy !== null || !failureTitle.trim()} onClick={() => run("failure", () => captureFailure({ entityType: context.entityType, entityId: context.entityId, title: failureTitle, log: failureLog }))}>
        {busy === "failure" ? "Capturing…" : "Capture Failure Evidence"}
      </button>
    </section>}
    <ReviewSection review={data?.review ?? null} />
    <FailureSection failure={data?.failure ?? null} />
    <ContextSection context={data?.context ?? null} />
  </div>;
}
