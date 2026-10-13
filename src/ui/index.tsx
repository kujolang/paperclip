import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  StatusBadge,
  Spinner,
  usePluginAction,
  usePluginData,
  type PluginDetailTabProps,
} from "@paperclipai/plugin-sdk/ui";
import type { ReviewPack } from "../features/review/schema.js";
import type { FailureEvidence } from "../features/failure/schema.js";
import type { ContextPack } from "../features/context/schema.js";
import type { DoctorReport } from "../health/doctor.js";
import type { WorkspaceReadiness } from "../paperclip/workspace.js";
import type { ExampleResult } from "../features/onboarding/example.js";

import type { Understanding } from "../features/understand/schema.js";

import type { LanguageReport, FormatPreview } from "../features/language/schema.js";

import type { CapabilityCatalog } from "../abilities/catalog.js";
import type { EvidenceMetadata } from "../storage/history.js";

type Detail = { catalog?: CapabilityCatalog; history?: EvidenceMetadata[]; language?: LanguageReport | null; sources?: { files: string[]; truncated: boolean }; understanding?: Understanding | null; review: ReviewPack | null; failure: FailureEvidence | null; context: ContextPack | null; readiness?: DoctorReport; workspace?: WorkspaceReadiness; suggestedTask?: string };
type PanelProps = PluginDetailTabProps & { compact?: boolean };

const colors = {
  ink: "var(--foreground, #111111)",
  muted: "var(--muted-foreground, #6b7280)",
  border: "var(--border, #e5e7eb)",
  surface: "var(--card, #ffffff)",
  canvas: "var(--background, #ffffff)",
  soft: "var(--muted, #f5f5f5)",
  danger: "var(--destructive, #b42318)",
};

const panel: CSSProperties = {
  color: colors.ink,
  display: "grid",
  gap: 16,
  width: "100%",
  fontFamily: "inherit",
};

const card: CSSProperties = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 14,
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
  display: "grid",
  gap: 14,
  padding: 18,
};

const hero: CSSProperties = {
  ...card,
  alignItems: "center",
  background: `linear-gradient(135deg, ${colors.surface} 0%, ${colors.soft} 100%)`,
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
};

const actionGrid: CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
};

const actionCard: CSSProperties = {
  background: colors.canvas,
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minWidth: 0,
  padding: 16,
};

const input: CSSProperties = {
  background: colors.canvas,
  border: `1px solid ${colors.border}`,
  borderRadius: 9,
  boxSizing: "border-box",
  color: colors.ink,
  display: "block",
  font: "inherit",
  fontSize: 13,
  lineHeight: 1.45,
  marginTop: 6,
  outline: "none",
  padding: "10px 12px",
  resize: "vertical",
  width: "100%",
};

const buttonBase: CSSProperties = {
  alignItems: "center",
  borderRadius: 9,
  cursor: "pointer",
  display: "inline-flex",
  font: "inherit",
  fontSize: 13,
  fontWeight: 650,
  gap: 7,
  justifyContent: "center",
  lineHeight: 1,
  minHeight: 38,
  padding: "10px 14px",
  transition: "opacity 120ms ease, transform 120ms ease",
};

const primaryButton: CSSProperties = {
  ...buttonBase,
  background: colors.ink,
  border: `1px solid ${colors.ink}`,
  color: colors.canvas,
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.14)",
};

const secondaryButton: CSSProperties = {
  ...buttonBase,
  background: colors.canvas,
  border: `1px solid ${colors.border}`,
  color: colors.ink,
};

const dangerButton: CSSProperties = {
  ...secondaryButton,
  color: colors.danger,
};

const eyebrow: CSSProperties = {
  color: colors.muted,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
};

const muted: CSSProperties = { color: colors.muted, fontSize: 13, lineHeight: 1.5 };

function KujoMark() {
  return (
    <svg
      aria-label="Kujo logo"
      role="img"
      viewBox="0 0 1527 1536"
      style={{
        color: colors.ink,
        display: "block",
        flex: "0 0 auto",
        height: 42,
        width: 42,
      }}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M0 0 H1527 V1536 H0 Z M178 234 L593 234 L593 700 L597 699 L1008 235 L1350 234 L1332 258 L594 1080 L592 1350 L294 1349 L293 427 L281 361 L260 310 L244 287 L222 264 L178 234 Z M1006 721 L1036 746 L1078 789 L1118 839 L1153 894 L1181 950 L1199 997 L1213 1043 L1225 1101 L1232 1157 L1233 1234 L1222 1328 L1208 1385 L1187 1445 L1159 1503 L1139 1536 L1038 1536 L1036 1455 L1025 1383 L1002 1304 L969 1231 L930 1169 L879 1108 L821 1056 L749 1009 L1006 721 Z M1010 805 L965 854 L962 862 L1011 911 L1055 969 L1094 1036 L1120 1097 L1139 1159 L1153 1232 L1157 1275 L1155 1361 L1171 1284 L1176 1221 L1171 1129 L1157 1056 L1132 981 L1100 917 L1046 841 L1010 805 Z"
      />
    </svg>
  );
}

function ActionButton({ children, disabled, onClick, tone = "primary" }: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  tone?: "primary" | "secondary" | "danger";
}) {
  const style = tone === "primary" ? primaryButton : tone === "danger" ? dangerButton : secondaryButton;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ ...style, ...(disabled ? { cursor: "not-allowed", opacity: 0.45 } : {}) }}
    >
      {children}
    </button>
  );
}

function SectionTitle({ title, detail, badge }: { title: string; detail: string; badge?: ReactNode }) {
  return (
    <div style={{ alignItems: "flex-start", display: "flex", gap: 12, justifyContent: "space-between" }}>
      <div style={{ display: "grid", gap: 4 }}>
        <strong style={{ fontSize: 15 }}>{title}</strong>
        <span style={muted}>{detail}</span>
      </div>
      {badge}
    </div>
  );
}

function EmptySection({ title, detail }: { title: string; detail: string }) {
  return (
    <section style={card}>
      <SectionTitle title={title} detail={detail} badge={<StatusBadge status="pending" label="NOT GENERATED" />} />
    </section>
  );
}

function ReviewSection({ review }: { review: ReviewPack | null }) {
  if (!review) return <EmptySection title="Review Pack" detail="Generate a bounded summary of the current workspace changes." />;
  return (
    <section style={card}>
      <SectionTitle
        title="Review Pack"
        detail="Change size, risk signals, and suggested checks."
        badge={<StatusBadge
          status={review.footprint.riskLevel === "high" ? "error" : review.footprint.riskLevel === "medium" ? "warning" : "ok"}
          label={`${review.footprint.riskLevel.toUpperCase()} RISK`}
        />}
      />
      {review.stale && <div role="alert" style={{ ...muted, color: colors.danger }}>This review is stale. Generate a new Review Pack before using it.</div>}
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
        {[
          [review.footprint.filesChanged, "Files changed"],
          [`+${review.footprint.additions} / -${review.footprint.deletions}`, "Line delta"],
          [review.footprint.churn, "Lines churn"],
        ].map(([value, label]) => (
          <div key={label} style={{ background: colors.soft, borderRadius: 10, display: "grid", gap: 3, padding: 12 }}>
            <strong style={{ fontSize: 18 }}>{value}</strong>
            <span style={eyebrow}>{label}</span>
          </div>
        ))}
      </div>
      {review.footprint.signals.length > 0 && (
        <div>
          <strong style={{ fontSize: 13 }}>Signals</strong>
          <ul style={{ ...muted, marginBottom: 0, paddingLeft: 20 }}>{review.footprint.signals.map((signal) => <li key={signal.id}>{signal.message}</li>)}</ul>
        </div>
      )}
      <div>
        <strong style={{ fontSize: 13 }}>Suggested verification</strong>
        <div style={muted}>Suggestions only. Kujo does not claim these commands ran.</div>
        <ul style={{ marginBottom: 0, paddingLeft: 20 }}>{review.suggestedTests.slice(0, 12).map((test) => <li key={test.command}><code>{test.command}</code></li>)}</ul>
      </div>
      <span style={eyebrow}>ChangeBucket + PatchBrief</span>
    </section>
  );
}

function FailureSection({ failure }: { failure: FailureEvidence | null }) {
  if (!failure) return <EmptySection title="Failure Evidence" detail="No redacted failure record has been captured." />;
  return (
    <section style={card}>
      <SectionTitle title="Failure Evidence" detail={failure.failure.title} badge={<StatusBadge status="error" label="CAPTURED" />} />
      {failure.failure.command && <div><span style={eyebrow}>Command</span><br /><code>{failure.failure.command}</code></div>}
      <div style={muted}>
        {failure.failure.exitCode !== undefined ? `Exit code ${failure.failure.exitCode} · ` : ""}
        {failure.redaction.redactedCount} sensitive match(es) redacted
      </div>
      {failure.evidence.map((item) => (
        <details key={item.label} style={{ background: colors.soft, borderRadius: 10, padding: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 650 }}>{item.label}{item.truncated ? " · truncated" : ""}</summary>
          <pre style={{ fontSize: 12, marginBottom: 0, maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap" }}>{item.content}</pre>
        </details>
      ))}
      <span style={eyebrow}>CaseFile</span>
    </section>
  );
}

function ContextSection({ context }: { context: ContextPack | null }) {
  if (!context) return <EmptySection title="Context Pack" detail="Select the files that matter before an agent reads broadly." />;
  return (
    <section style={card}>
      <SectionTitle
        title="Context Pack"
        detail={context.task}
        badge={<StatusBadge status={context.stale ? "warning" : "ok"} label={context.stale ? "STALE" : "READY"} />}
      />
      <div style={{ ...muted, fontWeight: 600 }}>{context.files.length} files · about {context.estimatedTokens.toLocaleString()} tokens · {context.depth} depth</div>
      <div style={{ display: "grid", gap: 8 }}>
        {context.files.slice(0, 20).map((file) => (
          <div key={file.path} style={{ background: colors.soft, borderRadius: 9, display: "grid", gap: 3, padding: "10px 12px" }}>
            <code style={{ fontSize: 12 }}>{file.path}</code>
            <span style={muted}>{file.reason}</span>
          </div>
        ))}
      </div>
      {context.truncated && <div style={muted}>The configured token budget bounded this selection.</div>}
      <span style={eyebrow}>Scent</span>
    </section>
  );
}

function CapabilityExplorer({ catalog }: { catalog: CapabilityCatalog }) {
  const [expanded, setExpanded] = useState(false);
  return <section style={{ ...card, overflowWrap: "anywhere" }} aria-label="Explore Kujo capabilities">
    <SectionTitle title="Explore Kujo" detail="Find the tools available for this company and discover the wider Kujo ecosystem." />
    <div style={muted}>Profile: <strong>{catalog.profile}</strong>. Change the capability profile in Kujo plugin settings. Authorization is checked when an operation is requested.</div>
    <div style={{ display: "grid", gap: 8 }}>
      {catalog.capabilities.map((item) => <details key={item.id} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
        <summary><strong>{item.title}</strong> · {item.status}</summary>
        <p style={muted}>{item.description}</p>
        <div>{item.reason}</div>
        <div style={muted}>Installed: yes · Enabled: {item.enabled ? "yes" : "no"} · Platform supported: {item.supported ? "yes" : "no"}</div>
        <div style={muted}>Authorization: checked on call</div>
        <code>kujolang.paperclip:{item.tool}</code>
        <div style={muted}>Effects: {item.effects.map((effect) => `${effect.kind} ${effect.resource}`).join("; ")}</div>
        {item.canonicalIds.length > 0 && <div style={muted}>Canonical capabilities: {item.canonicalIds.join(", ")}</div>}
        <div style={muted}>Projection: {item.id}<br />Definition SHA-256: {item.definitionDigest}</div>
      </details>)}
    </div>
    <ActionButton tone="secondary" onClick={() => setExpanded(!expanded)}>{expanded ? "Hide ecosystem catalog" : `Explore ${catalog.ecosystem.length} canonical capabilities`}</ActionButton>
    {expanded && <div aria-label="Canonical ecosystem catalog" style={{ display: "grid", gap: 8 }}>
      <div style={muted}>Entries without a Paperclip adapter are discovery references. Profile selection does not install or authorize them.</div>
      {catalog.ecosystem.map((item) => <details key={item.id} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
        <summary><strong>{item.title}</strong> · {item.status === "projected" ? "Paperclip adapter available" : "Not integrated yet"}</summary>
        <p>{item.description}</p><div style={muted}>{item.reason}</div>
        <code>{item.id}@{item.version}</code>
        <div style={muted}>Canonical effects: {item.effects.map((effect) => `${effect.kind} ${effect.resource}`).join("; ")}</div>
        <div style={muted}>Source: {item.source} · Definition SHA-256: {item.definitionDigest}</div>
      </details>)}
    </div>}
  </section>;
}

function EvidenceHistory({ context, records }: { context: PanelProps["context"]; records: EvidenceMetadata[] }) {
  const inspect = usePluginAction("inspect-evidence");
  const exportRecord = usePluginAction("export-evidence");
  const compare = usePluginAction("compare-evidence");
  const attach = usePluginAction("attach-evidence");
  const [selected, setSelected] = useState("");
  const [other, setOther] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const record = records.find((item) => item.id === selected);
  async function perform(operation: "inspect" | "export" | "compare" | "attach") {
    setBusy(true); setError(null); setResult(null);
    try {
      const params = { entityType: context.entityType, entityId: context.entityId, evidenceId: selected, ...(operation === "compare" ? { otherId: other } : {}) };
      const value = await ({ inspect, export: exportRecord, compare, attach }[operation])(params);
      if (!active.current) return;
      const json = JSON.stringify(value, null, 2);
      if (operation === "export") {
        const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const link = document.createElement("a"); link.href = url; link.download = `${selected}.json`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setResult("Redacted evidence export downloaded.");
      } else setResult(operation === "attach" ? "Evidence attached to this issue as a document." : json.slice(0, 20_000) + (json.length > 20_000 ? "\nPreview truncated; download the full export." : ""));
    } catch (value) { if (active.current) setError(value instanceof Error ? value.message : String(value)); }
    finally { if (active.current) setBusy(false); }
  }
  return <section style={{ ...card, overflowWrap: "anywhere" }} aria-label="Evidence history">
    <SectionTitle title="Evidence history" detail="Up to 20 records per project, issue, or run, retained for 30 days. Observations are not proof that project tests passed." />
    {!records.length ? <div style={muted}>Create a Kujo work record to start your history.</div> : <>
      <label>Evidence record<select aria-label="Evidence record" style={input} disabled={busy} value={selected} onChange={(event) => { setSelected(event.target.value); setOther(""); setResult(null); }}>
        <option value="">Choose a record</option>{records.map((item) => <option key={item.id} value={item.id}>{item.kind.replace("-latest", "")} · {item.result} · {item.sourceKind} · {item.storedAt}</option>)}
      </select></label>
      {record && <div style={muted}>SHA-256: <code>{record.digest}</code><br />{record.sourceKind === "legacy" ? "Migrated legacy record; original input and definition receipts are unavailable." : "Digest identifies the retained payload. Exports have a separate digest after redaction."}</div>}
      <label>Compare with<select aria-label="Compare with" style={input} disabled={busy || !record} value={other} onChange={(event) => setOther(event.target.value)}>
        <option value="">Choose another record of the same kind</option>{records.filter((item) => item.id !== selected && item.kind === record?.kind).map((item) => <option key={item.id} value={item.id}>{item.result} · {item.storedAt}</option>)}
      </select></label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <ActionButton disabled={busy || !record} onClick={() => perform("inspect")}>Inspect evidence</ActionButton>
        <ActionButton tone="secondary" disabled={busy || !record || !other} onClick={() => perform("compare")}>Compare evidence</ActionButton>
        <ActionButton tone="secondary" disabled={busy || !record} onClick={() => perform("export")}>Download redacted export</ActionButton>
        {context.entityType === "issue" && <ActionButton tone="secondary" disabled={busy || !record} onClick={() => perform("attach")}>Attach to this issue</ActionButton>}
      </div>
    </>}
    {error && <div role="alert" style={{ color: colors.danger }}>{error}</div>}
    {result && <pre aria-label="Evidence result" style={{ whiteSpace: "pre-wrap", overflow: "auto", maxHeight: 400, fontSize: 12 }}>{result}</pre>}
  </section>;
}

function KujoPanel({ context, compact = false }: PanelProps) {
  const { data, loading, error, refresh } = usePluginData<Detail>("detail", { entityType: context.entityType, entityId: context.entityId });
  const generateReview = usePluginAction("generate-review");
  const generateContext = usePluginAction("generate-context");
  const captureFailure = usePluginAction("capture-failure");
  const clearArtifacts = usePluginAction("clear-artifacts");
  const checkSource = usePluginAction("check-kujo-source");
  const formatSource = usePluginAction("preview-kujo-format");
  const targetKey = `${context.companyId}:${context.entityType}:${context.entityId}`;
  const generation = useRef({ key: targetKey, value: 0 });
  if (generation.current.key !== targetKey) generation.current = { key: targetKey, value: generation.current.value + 1 };
  const originalSource = useRef<HTMLPreElement>(null);
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const [sourcePath, setSourcePath] = useState("");
  const [formatPreview, setFormatPreview] = useState<FormatPreview | null>(null);
  const understand = usePluginAction("understand-repository");
  const runExample = usePluginAction("run-example");
  const [example, setExample] = useState<ExampleResult | null>(null);
  const [task, setTask] = useState<string | null>(null);
  const [failureTitle, setFailureTitle] = useState("");
  const [failureLog, setFailureLog] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canGenerate = context.entityType === "project" || context.entityType === "issue";
  const taskValue = task ?? data?.suggestedTask ?? "";
  const workspaceAvailable = data?.workspace?.state === "ready" || data?.workspace?.state === "empty";
  useEffect(() => { setBusy(null); setActionError(null); setFocusLine(null); setSourcePath(""); setFormatPreview(null); setTask(null); setExample(null); setFailureTitle(""); setFailureLog(""); }, [targetKey]);

  useEffect(() => {
    if (focusLine && formatPreview) originalSource.current?.querySelector(`[data-source-line="${focusLine}"]`)?.scrollIntoView({ block: "center" });
  }, [focusLine, formatPreview]);

  async function run(label: string, fn: () => Promise<unknown>) {
    const requestGeneration = generation.current.value;
    setBusy(label);
    setActionError(null);
    try {
      await fn();
      if (generation.current.value === requestGeneration) await refresh();
    } catch (value) {
      if (generation.current.value === requestGeneration) setActionError(value instanceof Error ? value.message : String(value));
    } finally {
      if (generation.current.value === requestGeneration) setBusy(null);
    }
  }

  async function showFormat(path: string, line: number | null = null) {
    const requestGeneration = generation.current.value;
    const preview = await formatSource({ entityType: context.entityType, entityId: context.entityId, path }) as FormatPreview;
    if (generation.current.value !== requestGeneration) return;
    setSourcePath(path); setFocusLine(line); setFormatPreview(preview);
  }

  if (loading) return <Spinner label="Loading Kujo workspace intelligence" />;
  if (error) return <div role="alert" style={{ ...card, color: colors.danger }}>Unable to load Kujo: {error.message}</div>;

  const hasArtifacts = data?.language || data?.understanding || Boolean(data?.review || data?.failure || data?.context);

  return (
    <div style={{ ...panel, ...(compact ? { marginTop: 12 } : {}) }}>
      <header style={hero}>
        <KujoMark />
        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <span style={eyebrow}>Workspace intelligence</span>
          <strong style={{ fontSize: compact ? 17 : 20, letterSpacing: "-0.02em" }}>Kujo</strong>
          <span style={muted}>Scope the work. Review the change. Preserve the evidence.</span>
        </div>
        <StatusBadge status={data?.readiness?.status === "ok" && (!canGenerate || workspaceAvailable) ? "ok" : "warning"} label={data?.readiness?.status === "ok" && (!canGenerate || workspaceAvailable) ? "READY" : "NEEDS ATTENTION"} />
      </header>

      {data?.readiness?.status !== "ok" && <div role="status" style={card}>
        {data?.readiness?.runtime.repair ?? "Kujo readiness has not been verified. Check runtime and component health in plugin settings."}
        <ActionButton tone="secondary" onClick={() => { void refresh(); }}>Check again</ActionButton>
      </div>}

      {actionError && <div role="alert" style={{ ...card, borderColor: colors.danger, color: colors.danger }}>{actionError}</div>}

      {canGenerate && data?.workspace && <section style={card} aria-label="Getting started with Kujo">
        <strong>Start with Kujo</strong>
        <div role="status" style={muted}>{data.workspace.message}</div>
        <div style={muted}>Try a bundled Kujo program: structured data, a function, and JSON output. It runs locally without reading or changing your project files.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ActionButton disabled={busy !== null || !workspaceAvailable || data.readiness?.capabilities.understand !== "ready"}
            onClick={() => run("understand", () => understand({ entityType: context.entityType, entityId: context.entityId }))}>
            {busy === "understand" ? "Mapping repository…" : "Understand this repository"}
          </ActionButton>
          <ActionButton disabled={busy !== null || data.readiness?.capabilities.examples !== "ready"}
            onClick={() => run("example", async () => { setExample(await runExample({}) as ExampleResult); })}>
            {busy === "example" ? "Checking and running…" : "Try the Kujo example"}
          </ActionButton>
          {!workspaceAvailable && <ActionButton tone="secondary" onClick={() => { void refresh(); }}>Check workspace again</ActionButton>}
        </div>
        {example && <div>
          <strong>Example passed · Kujo {example.runtimeVersion}</strong>
          <div style={muted}>Bundled example, not an analysis of your project. Source check and execution both passed.</div>
          <details><summary>View Kujo source</summary><pre style={{ overflow: "auto", fontSize: 12 }}>{example.source}</pre></details>
          <pre aria-label="Example output" style={{ whiteSpace: "pre-wrap" }}>{example.output}</pre>
        </div>}
      </section>}

      {canGenerate && <section style={{ ...card, overflowWrap: "anywhere" }} aria-label="Build with Kujo">
        <SectionTitle title="Build with Kujo" detail="Check your source and preview formatting before you make a change." />
        <label style={{ ...eyebrow, display: "block" }}>Kujo source
          <select disabled={busy !== null} aria-label="Kujo source" value={sourcePath} onChange={(event) => { setSourcePath(event.target.value); setFocusLine(null); setFormatPreview(null); }} style={input}>
            <option value="">{data?.sources?.files.length ? "Choose a source file" : "No Git-visible .kujo files found"}</option>
            {data?.sources?.files.map((path) => <option key={path} value={path}>{path}</option>)}
          </select>
        </label>
        {data?.sources?.truncated && <div style={muted}>Showing the first 1,000 eligible source paths.</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ActionButton disabled={busy !== null || !sourcePath || data?.readiness?.capabilities.language !== "ready"}
            onClick={() => run("language", () => checkSource({ entityType: context.entityType, entityId: context.entityId, path: sourcePath }))}>
            {busy === "language" ? "Checking source…" : "Check and lint source"}
          </ActionButton>
          <ActionButton tone="secondary" disabled={busy !== null || !sourcePath || data?.readiness?.capabilities.language !== "ready"}
            onClick={() => run("format", () => showFormat(sourcePath))}>
            {busy === "format" ? "Preparing preview…" : "Preview formatting"}
          </ActionButton>
        </div>
        <div style={muted}>Checks do not run your program. Formatting previews read the selected source, redact common secrets, and leave project files unchanged.</div>
        {formatPreview && <div aria-label="Formatting preview">
          <strong>{formatPreview.changed ? "Formatting changes available" : "Already formatted"}{formatPreview.stale ? " · STALE — preview again" : ""}</strong>
          <div style={muted}>{formatPreview.redactedCount} redactions · Preview only; no changes applied. Redacted text is unsuitable for automatic replacement.</div>
          <details open={focusLine !== null}><summary>Original source</summary><pre ref={originalSource} style={{ overflow: "auto", maxHeight: 400 }}>{formatPreview.source.split("\n").map((line, index) => <div key={index} data-source-line={index + 1} style={focusLine === index + 1 ? { background: colors.border } : undefined}><span style={muted}>{index + 1} | </span>{line || " "}</div>)}</pre></details>
          <details open><summary>Formatted preview</summary><pre style={{ overflow: "auto", maxHeight: 400 }}>{formatPreview.formatted}</pre></details>
        </div>}
      </section>}
      {data?.language && <section style={{ ...card, overflowWrap: "anywhere" }} aria-label="Kujo diagnostics">
        <SectionTitle title="Kujo diagnostics" detail={`${data.language.path} · Kujo ${data.language.runtimeVersion}${data.language.stale ? " · STALE — check again" : ""}`} />
        <strong>Source check: {data.language.check} · Lint: {data.language.lint}</strong>
        <div style={muted}>{data.language.scope}</div>
        {data.language.diagnostics.map((diagnostic, index) => <div key={index}>
          <button type="button" disabled={busy !== null || !canGenerate || data.readiness?.capabilities.language !== "ready"}
            style={{ font: "inherit", color: "inherit", background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline" }}
            onClick={() => run("format", () => showFormat(data.language!.path, diagnostic.line ?? 1))}>
            {data.language!.path}{diagnostic.line ? `:${diagnostic.line}:${diagnostic.column ?? 1}` : ""}
          </button>
          <div>{diagnostic.severity} · {diagnostic.tool} · {diagnostic.code}: {diagnostic.message}</div>
        </div>)}
      </section>}

      {data?.understanding && <section style={{ ...card, overflowWrap: "anywhere" }} aria-label="Repository understanding">
        <SectionTitle title="Repository map" detail={`Scout ${data.understanding.provenance.componentVersion} · ${data.understanding.status === "partial" ? "Partial scan" : "Scan complete"}${data.understanding.stale ? " · STALE — scan again" : ""}`} />
        <div>{data.understanding.intelligence.metrics.total_files} code files · {data.understanding.intelligence.metrics.total_lines} lines · {data.understanding.intelligence.dependencies.length} dependencies · {data.understanding.intelligence.routes.length} routes</div>
        <div style={muted}>{Object.entries(data.understanding.intelligence.metrics.languages).map(([language, count]) => `${language}: ${count}`).join(" · ") || "No supported source files found"}</div>
        <details open><summary>Project structure</summary><pre style={{ overflow: "auto", maxHeight: 280, fontSize: 12 }}>{data.understanding.fileTree}</pre></details>
        <details><summary>Dependencies and routes</summary>
          {data.understanding.intelligence.dependencies.map((item, index) => <div key={`d${index}`}><code>{item.module}</code> — {item.source}</div>)}
          {data.understanding.intelligence.routes.map((item, index) => <div key={`r${index}`}><code>{item.method} {item.path}</code> — {item.source}</div>)}
        </details>
        <details><summary>Heuristic observations ({data.understanding.intelligence.security_findings.length}) and scan diagnostics ({data.understanding.intelligence.parse_errors.length})</summary>
          {data.understanding.intelligence.security_findings.map((item, index) => <div key={`s${index}`}>{item.severity}: {item.label} — {item.file}:{item.line}</div>)}
          {data.understanding.intelligence.parse_errors.map((item, index) => <div key={`e${index}`}>{item.file}: {item.error}</div>)}
        </details>
        {data.understanding.warnings.map((warning, index) => <div key={index} style={muted}>{warning}</div>)}
        <div style={muted}>Next: use the task below to select relevant Context Pack files, then review their content before planning changes.</div>
      </section>}

      {data?.catalog && <CapabilityExplorer key={`catalog:${targetKey}`} catalog={data.catalog} />}

      <EvidenceHistory key={targetKey} context={context} records={data?.history ?? []} />

      {canGenerate && (
        <section style={card}>
          <div>
            <div style={eyebrow}>Actions</div>
            <strong style={{ display: "block", fontSize: 16, marginTop: 4 }}>Create a reviewable work record</strong>
          </div>
          <div style={actionGrid}>
            <div style={actionCard}>
              <SectionTitle title="Review changes" detail="Measure blast radius and prepare a review handoff." />
              <div style={{ flex: 1 }} />
              <ActionButton disabled={busy !== null || !workspaceAvailable || data?.readiness?.capabilities.review !== "ready"} onClick={() => run("review", () => generateReview({ entityType: context.entityType, entityId: context.entityId }))}>
                {busy === "review" ? "Generating…" : "Generate Review Pack"} <span aria-hidden="true">→</span>
              </ActionButton>
            </div>

            <div style={actionCard}>
              <SectionTitle title="Select context" detail="Build a focused, bounded file set for a task." />
              <label style={{ ...eyebrow, display: "block" }}>
                Task
                <textarea
                  value={taskValue}
                  onChange={(event) => setTask(event.target.value)}
                  maxLength={10_000}
                  placeholder="What should the agent investigate?"
                  rows={3}
                  style={input}
                />
              </label>
              <ActionButton disabled={busy !== null || !workspaceAvailable || data?.workspace?.state === "empty" || !taskValue.trim() || data?.readiness?.capabilities.context !== "ready"} onClick={() => run("context", () => generateContext({ entityType: context.entityType, entityId: context.entityId, task: taskValue, depth: "focused" }))}>
                {busy === "context" ? "Selecting…" : "Generate Context Pack"} <span aria-hidden="true">→</span>
              </ActionButton>
            </div>

            <div style={actionCard}>
              <SectionTitle title="Capture a failure" detail="Store bounded logs with sensitive values redacted." />
              <label style={{ ...eyebrow, display: "block" }}>
                Title
                <input
                  value={failureTitle}
                  onChange={(event) => setFailureTitle(event.target.value)}
                  maxLength={200}
                  placeholder="CI verification failure"
                  style={input}
                />
              </label>
              <label style={{ ...eyebrow, display: "block" }}>
                Bounded log
                <textarea
                  value={failureLog}
                  onChange={(event) => setFailureLog(event.target.value)}
                  maxLength={200_000}
                  placeholder="Paste the relevant output here."
                  rows={3}
                  style={input}
                />
              </label>
              <ActionButton disabled={busy !== null || !workspaceAvailable || !failureTitle.trim() || data?.readiness?.capabilities.failureEvidence !== "ready"} onClick={() => run("failure", () => captureFailure({ entityType: context.entityType, entityId: context.entityId, title: failureTitle, log: failureLog }))}>
                {busy === "failure" ? "Capturing…" : "Capture Failure Evidence"} <span aria-hidden="true">→</span>
              </ActionButton>
            </div>
          </div>
        </section>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        <ReviewSection review={data?.review ?? null} />
        <FailureSection failure={data?.failure ?? null} />
        <ContextSection context={data?.context ?? null} />
      </div>

      {hasArtifacts && canGenerate && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <ActionButton tone="danger" disabled={busy !== null} onClick={() => run("clear", () => clearArtifacts({ entityType: context.entityType, entityId: context.entityId }))}>
            {busy === "clear" ? "Clearing…" : "Clear Kujo data"}
          </ActionButton>
        </div>
      )}
    </div>
  );
}

export function KujoDetailTab(props: PluginDetailTabProps) {
  return <KujoPanel {...props} />;
}

export function KujoTaskDetailView(props: PluginDetailTabProps) {
  return <KujoPanel {...props} compact />;
}
