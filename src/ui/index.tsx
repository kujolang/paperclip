import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  StatusBadge,
  Spinner,
  usePluginAction,
  usePluginData,
  type PluginDetailTabProps,
} from "@paperclipai/plugin-sdk/ui";
import { EvaluationPanel } from "./evaluation.js";
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

import type { VerificationReport } from "../features/verification/import.js";
import type { SpecReport } from "../features/spec/inspect.js";

import type { ShipcheckReport } from "../features/shipcheck/schema.js";
import type { ConcordReport } from "../features/concord/schema.js";
import type { FenceReport } from "../features/fence/schema.js";

type Detail = { executionHistory?: { pending: boolean }; executionActive?: boolean; shipcheck?: ShipcheckReport | null; concord?: ConcordReport | null; fence?: FenceReport | null; spec?: SpecReport | null; specs?: { files: string[]; truncated: boolean }; verification?: VerificationReport | null; verificationEnabled?: boolean; catalog?: CapabilityCatalog; history?: EvidenceMetadata[]; language?: LanguageReport | null; sources?: { files: string[]; truncated: boolean }; understanding?: Understanding | null; review: ReviewPack | null; failure: FailureEvidence | null; context: ContextPack | null; readiness?: DoctorReport; workspace?: WorkspaceReadiness; suggestedTask?: string };
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
      {record?.parentId && <div style={muted}>Related request: {records.some(item => item.id === record.parentId) ? <ActionButton tone="secondary" disabled={busy} onClick={() => { setSelected(record.parentId!); setOther(""); setResult(null); }}>Select request plan</ActionButton> : "The request plan is no longer retained here; its reference remains in the outcome."}</div>}
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

function VerificationSection({ context, report, refresh }: { context: PanelProps["context"]; report: VerificationReport | null; refresh: () => void }) {
  const importResult = usePluginAction("import-verification");
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<VerificationReport | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const current = imported ?? report;
  const bytes = new TextEncoder().encode(json).byteLength;
  async function submit() {
    setBusy(true); setError(null);
    try {
      const result = await importResult({ entityType: context.entityType, entityId: context.entityId, json }) as VerificationReport;
      if (!active.current) return;
      setImported(result); setJson(""); await refresh();
    } catch (value) { if (active.current) setError(value instanceof Error ? value.message : String(value)); }
    finally { if (active.current) setBusy(false); }
  }
  return <section style={{ ...card, overflowWrap: "anywhere" }} aria-label="Verification evidence">
    <SectionTitle title="Verification evidence" detail="Bring a canonical Kujo evaluation result into this work record." badge={<StatusBadge status="pending" label="IMPORTED CLAIMS" />} />
    <div style={muted}>Imports do not run checks or authenticate a producer. Referenced evidence is not opened, and applicability to the current workspace remains unknown.</div>
    {context.entityType !== "run" && <>
      <label>Evaluation result JSON<textarea aria-label="Evaluation result JSON" style={input} rows={4} maxLength={65_536} disabled={busy} value={json} onChange={(event) => setJson(event.target.value)} placeholder="Paste kujo.evaluation-result/v1 JSON" /></label>
      <div style={muted}>{bytes.toLocaleString()} / 65,536 bytes. Only a redacted summary is retained; keep the original report with its producer.</div>
      <ActionButton disabled={busy || !json.trim() || bytes > 65_536} onClick={() => { void submit(); }}>{busy ? "Importing…" : "Import evaluation result"}</ActionButton>
    </>}
    {error && <div role="alert" style={{ color: colors.danger }}>{error}</div>}
    {current ? <div aria-label="Imported evaluation summary">
      <strong>Imported · {current.classification}</strong>
      <div style={muted}>Claimed producer: {current.result.evaluator.name} {current.result.evaluator.version}</div>
      <div style={muted}>Claimed checks: {current.result.checks.passed} passed · {current.result.checks.failed} failed · {current.result.checks.warned} warned · {current.result.checks.skipped} skipped</div>
      <div style={muted}>Claimed verdict: {current.result.verdict} · Claimed subject: {current.result.subject.run_id}</div>
      <div style={muted}>Claimed completion: {current.result.finished_at} · Imported: {current.generatedAt}</div>
      <div style={muted}>Reference count: {current.referenceCount} · References unverified · Workspace freshness unknown</div>
      <div style={muted}>Use Evidence history to inspect, compare, export or explicitly attach this imported record.</div>
    </div> : <div style={muted}>No evaluation result imported. Suggested checks have not been run by this workflow.</div>}
  </section>;
}

function ShipcheckSection({ context, report, ready, refresh }: { context: PanelProps["context"]; report: ShipcheckReport | null; ready: boolean; refresh: () => void }) {
  const inspect = usePluginAction("inspect-release-readiness");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function submit() {
    setBusy(true); setError(null);
    try {
      await inspect({ entityType: context.entityType, entityId: context.entityId });
      if (active.current) await refresh();
    } catch (value) { if (active.current) setError(value instanceof Error ? value.message : String(value)); }
    finally { if (active.current) setBusy(false); }
  }
  return <section style={{ ...card, overflowWrap: "anywhere" }} aria-label="Release readiness">
    <SectionTitle title="Release readiness" detail="Find missing repository, documentation and release metadata signals." badge={<span style={{ flexShrink: 0 }}><StatusBadge status="pending" label="SIGNALS" /></span>} />
    <div style={muted}>ShipCheck checks 16 readiness signals. Tests and linters are detected, not run; entry metadata is a declaration, not validation of its target. Git detection uses the real workspace, while artifact checks use private copies.</div>
    <ActionButton disabled={busy || !ready} onClick={() => { void submit(); }}>{busy ? "Inspecting release readiness…" : "Inspect release readiness"}</ActionButton>
    {!ready && <div style={muted}>A working Kujo runtime and intact ShipCheck component are required. Check runtime readiness above.</div>}
    {error && <div role="alert" style={{ color: colors.danger }}>{error}</div>}
    {report ? <div aria-label="Release readiness result">
      <strong>Release signals: {report.status}{report.stale ? " · STALE — inspect again" : ""}</strong>
      <p>{report.message}</p>
      <div style={muted}>ShipCheck {report.provenance.version} · Project type: {report.report.project_type} · {report.coverage.copied} files copied from {report.coverage.gitVisible} Git-visible paths. Copy counts do not establish that files or tests were verified.</div>
      <p>Native metadata gate: {report.report.summary.gate_passed === 1 ? "passed" : "failed"} · {report.report.summary.passed}/{report.report.summary.total_checks} signals present · {report.report.summary.failed_errors} blockers · {report.report.summary.warnings} {report.report.summary.warnings === 1 ? "warning" : "warnings"}</p>
      {report.coverage.truncated && <p>Path inventory was truncated at 1,000 entries. Coverage is incomplete.</p>}
      {report.coverage.rejectedNames > 0 && <p>{report.coverage.rejectedNames} nonportable or unsafe path names were excluded.</p>}
      <ul>{report.report.checks.filter((item) => item.passed === 0).map((item) => <li key={item.name}>
        <strong>{item.name}: {item.passed === 1 ? "signal present" : item.severity === "error" ? "blocker" : "warning"}</strong>
        <div>{item.message}</div>{item.detail && <p>{item.detail}</p>}
      </li>)}</ul>
      <details><summary>Signals present ({report.report.summary.passed})</summary><ul>{report.report.checks.filter((item) => item.passed === 1).map((item) => <li key={item.name}>
        <strong>{item.name}: signal present</strong><div>{item.message}</div>{item.detail && <p>{item.detail}</p>}
      </li>)}</ul></details>
      {!!report.coverage.omitted.length && <details open><summary>Files omitted ({report.coverage.omitted.length})</summary><ul>{report.coverage.omitted.slice(0, 100).map((item, index) => <li key={index}>{item.path}: {item.reason}</li>)}</ul></details>}
      <p style={muted}>{report.scope} Omission lists show at most 100 items; use Evidence history for the full retained result.</p>
    </div> : <div style={muted}>No release readiness inspection yet.</div>}
  </section>;
}

function ConcordSection({ context, report, ready, refresh }: { context: PanelProps["context"]; report: ConcordReport | null; ready: boolean; refresh: () => void }) {
  const inspect = usePluginAction("inspect-artifact-drift");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function submit() {
    setBusy(true); setError(null);
    try {
      await inspect({ entityType: context.entityType, entityId: context.entityId });
      if (active.current) await refresh();
    } catch (value) { if (active.current) setError(value instanceof Error ? value.message : String(value)); }
    finally { if (active.current) setBusy(false); }
  }
  return <section style={{ ...card, overflowWrap: "anywhere" }} aria-label="Artifact drift">
    <SectionTitle title="Artifact drift" detail="Keep documentation, examples and metadata aligned with your project." badge={<StatusBadge status="pending" label="DRIFT LEADS" />} />
    <div style={muted}>Experimental Concord checks compare recognizable README, manifest, changelog, Spec, Eval, documentation and example artifacts. It reads a private snapshot without executing project commands or examples.</div>
    <ActionButton disabled={busy || !ready} onClick={() => { void submit(); }}>{busy ? "Inspecting artifact drift…" : "Inspect artifact drift"}</ActionButton>
    {!ready && <div style={muted}>A working Kujo runtime and intact Concord component are required. Check runtime readiness above.</div>}
    {error && <div role="alert" style={{ color: colors.danger }}>{error}</div>}
    {report ? <div aria-label="Artifact drift result">
      <strong>Artifact drift: {report.status}{report.stale ? " · STALE — inspect again" : ""}</strong>
      <p>{report.message}</p>
      <div style={muted}>Concord {report.provenance.version} · {report.coverage.copied} files copied from {report.coverage.gitVisible} Git-visible paths. Copied files are available to native discovery; this is not a count of checked artifacts.</div>
      {report.coverage.truncated && <p>Path inventory was truncated at 1,000 entries. Coverage is incomplete.</p>}
      {report.coverage.rejectedNames > 0 && <p>{report.coverage.rejectedNames} nonportable or unsafe path names were excluded.</p>}
      {report.issues.slice(0, 100).map((item, index) => <p key={index}>{item.artifact} · {item.field}: {item.reason}</p>)}
      {report.report && <>
        <p>{report.report.summary.total_findings} drift {report.report.summary.total_findings === 1 ? "lead" : "leads"} · Highest severity: {report.report.summary.highest_severity}</p>
        {report.report.findings.length ? <ul>{report.report.findings.slice(0, 100).map((item, index) => <li key={index}>
          <strong>{item.severity}: {item.title}</strong><div>{item.category} · Confidence: {item.confidence} · Human review: {item.human_review_required ? "required" : "suggested"}</div>
          <p>{item.summary}</p><div>Source: {item.source_artifact} → Target: {item.target_artifact}</div>
          <div>Expected: {item.expected}</div><div>Observed: {item.actual}</div><p>Suggested fix: {item.suggested_fix}</p>
        </li>)}</ul> : <div style={muted}>No drift leads in the admitted artifact scope.</div>}
      </>}
      {!!report.coverage.omitted.length && <details open><summary>Files omitted ({report.coverage.omitted.length})</summary><ul>{report.coverage.omitted.slice(0, 100).map((item, index) => <li key={index}>{item.path}: {item.reason}</li>)}</ul></details>}
      <p style={muted}>{report.scope} Lists show at most 100 items each; use Evidence history to inspect or export the full retained result.</p>
    </div> : <div style={muted}>No artifact drift inspection yet.</div>}
  </section>;
}

function FenceSection({ context, report, ready, refresh }: { context: PanelProps["context"]; report: FenceReport | null; ready: boolean; refresh: () => void }) {
  const inspect = usePluginAction("inspect-architecture");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function submit() {
    setBusy(true); setError(null);
    try {
      await inspect({ entityType: context.entityType, entityId: context.entityId });
      if (active.current) await refresh();
    } catch (value) { if (active.current) setError(value instanceof Error ? value.message : String(value)); }
    finally { if (active.current) setBusy(false); }
  }
  return <section style={{ ...card, overflowWrap: "anywhere" }} aria-label="Architecture boundaries">
    <SectionTitle title="Architecture boundaries" detail="Check imports against your project's Fence policy." badge={<StatusBadge status="pending" label="BEST-EFFORT BOUNDARIES" />} />
    <div style={muted}>Uses a Git-visible fence.toml or fence.json at the workspace root. Define source roots, zones and allowed dependencies in that policy. Project commands and tests are not executed.</div>
    <ActionButton disabled={busy || !ready} onClick={() => { void submit(); }}>{busy ? "Inspecting architecture…" : "Inspect architecture"}</ActionButton>
    {!ready && <div style={muted}>A working Kujo runtime and intact Fence component are required. Check runtime readiness above.</div>}
    {error && <div role="alert" style={{ color: colors.danger }}>{error}</div>}
    {report ? <div aria-label="Architecture result">
      <strong>Architecture inspection: {report.status}{report.stale ? " · STALE — inspect again" : ""}</strong>
      <p>{report.message}</p>
      <div style={muted}>Fence {report.provenance.version} · {report.coverage.inspected} of {report.coverage.selected} selected files inspected · {report.coverage.gitVisible} Git-visible paths</div>
      {report.threshold && <p>Declared fail_on: {report.threshold} · Threshold result: {report.thresholdStatus ?? "not-run"}. This threshold does not establish that every finding is resolved.</p>}
      {report.coverage.truncated && <p>Path inventory was truncated at 1,000 entries. Coverage is incomplete.</p>}
      {report.coverage.rejectedNames > 0 && <p>{report.coverage.rejectedNames} nonportable or unsafe path names were excluded.</p>}
      {report.diagnostics.map((item, index) => <div key={index}>{item.severity}: {item.message}</div>)}
      {report.report && <>
        <p>{report.report.summary.imports_checked} imports checked · {report.report.summary.errors} errors · {report.report.summary.warnings} warnings · {report.report.summary.ignored_violations} ignored findings</p>
        <details><summary>Zones ({report.report.zones.length})</summary><ul>{report.report.zones.slice(0, 100).map((item, index) => <li key={index}>{item.name}: {item.files} files · {item.errors} errors · {item.warnings} warnings</li>)}</ul></details>
        <h4>Boundary findings</h4>
        {report.report.violations.length ? <ul>{report.report.violations.slice(0, 100).map((item, index) => <li key={index}>
          <strong>{item.severity}: {item.file}:{item.line}</strong><div>{item.message}</div><div>{item.from_zone} → {item.to_zone}{item.from_owner || item.to_owner ? ` · Owners: ${item.from_owner || "unspecified"} → ${item.to_owner || "unspecified"}` : ""}</div>
          <div>{item.suggestion}</div>
        </li>)}</ul> : <div style={muted}>No boundary findings in the inspected subset.</div>}
        {!!report.report.skipped_files.length && <details><summary>Native skipped files ({report.report.skipped_files.length})</summary><ul>{report.report.skipped_files.slice(0, 100).map((item, index) => <li key={index}>{item.file}: {item.reason}</li>)}</ul></details>}
        {!!report.report.ignored_violations.length && <details><summary>Policy exceptions ({report.report.ignored_violations.length})</summary><ul>{report.report.ignored_violations.slice(0, 100).map((item, index) => <li key={index}>{item.file}:{item.line}: {item.reason}{item.expires ? ` · Expires ${item.expires}` : ""}</li>)}</ul></details>}
      </>}
      {!!report.coverage.omitted.length && <details open><summary>Selected files omitted ({report.coverage.omitted.length})</summary><ul>{report.coverage.omitted.slice(0, 100).map((item, index) => <li key={index}>{item.path}: {item.reason}</li>)}</ul></details>}
      <p style={muted}>{report.scope} Lists show at most 100 items each; use Evidence history to inspect or export the full retained result.</p>
    </div> : <div style={muted}>No architecture inspection yet. If no policy exists, the result will explain that the check was not run.</div>}
  </section>;
}

function SpecSection({ context, report, files, ready, refresh }: { context: PanelProps["context"]; report: SpecReport | null; files: { files: string[]; truncated: boolean }; ready: boolean; refresh: () => void }) {
  const inspect = usePluginAction("inspect-task-contract");
  const [path, setPath] = useState(report?.path ?? "");
  const [strict, setStrict] = useState(report?.validation.strict ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function submit() {
    setBusy(true); setError(null);
    try {
      await inspect({ entityType: context.entityType, entityId: context.entityId, path, strict });
      if (active.current) await refresh();
    } catch (value) { if (active.current) setError(value instanceof Error ? value.message : String(value)); }
    finally { if (active.current) setBusy(false); }
  }
  return <section style={{ ...card, overflowWrap: "anywhere" }} aria-label="Task contract">
    <SectionTitle title="Task contract" detail="Review the expected outcome before running checks." badge={<StatusBadge status="pending" label="CHECKS NOT RUN" />} />
    <div style={muted}>Validate a Git-visible .spec.json, .spec.yml, .spec.yaml or .spec.toml file. Contract validity does not prove acceptance criteria or grant approval.</div>
    <label>Contract file<select aria-label="Contract file" style={input} value={path} disabled={busy || !files.files.length} onChange={(event) => setPath(event.target.value)}>
      <option value="">{files.files.length ? "Choose a task contract" : "No Git-visible task contracts found"}</option>
      {files.files.map((file) => <option key={file} value={file}>{file}</option>)}
    </select></label>
    {files.truncated && <div style={muted}>Showing the first 1,000 contract paths.</div>}
    <label><input type="checkbox" checked={strict} disabled={busy} onChange={(event) => setStrict(event.target.checked)} /> Treat warnings as validation failures</label>
    <ActionButton disabled={busy || !ready || !path} onClick={() => { void submit(); }}>{busy ? "Reviewing contract…" : "Review task contract"}</ActionButton>
    {!ready && <div style={muted}>A working Kujo runtime and intact Spec component are required. Check runtime readiness above.</div>}
    {error && <div role="alert" style={{ color: colors.danger }}>{error}</div>}
    {report && <div aria-label="Task contract result">
      <strong>Contract validation: {report.validation.status}{report.stale ? " · STALE — review again" : ""}</strong>
      <div style={muted}>{report.path} · Spec {report.provenance.version} · {report.validation.native ? "Native validation completed" : "Input rejected before native validation"}</div>
      {report.validation.errors.map((message, index) => <div key={`error-${index}`} style={{ color: colors.danger }}>Error: {message}</div>)}
      {report.validation.warnings.map((message, index) => <div key={`warning-${index}`}>Warning: {message}</div>)}
      {report.contract && <>
        <h3 style={{ marginBottom: 4 }}>{report.contract.name}</h3><div>{report.contract.goal}</div>
        {report.contract.scope && <p>Scope: {report.contract.scope}</p>}
        <h4>Acceptance criteria</h4>
        {report.contract.criteria.length ? <ul>{report.contract.criteria.map((item, index) => <li key={index}>Not run · {item.text}</li>)}</ul> : <div style={muted}>No acceptance criteria declared.</div>}
        <h4>Declared checks</h4>
        {report.contract.checks.length ? <ul>{report.contract.checks.map((item, index) => <li key={index}>Not run · {item.description} · {item.checkType ?? "Check type unspecified"}</li>)}</ul> : <div style={muted}>No checks declared. No checks have been inferred or executed.</div>}
        {!!report.contract.nonGoals.length && <><h4>Outside scope</h4><ul>{report.contract.nonGoals.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
        {!!report.contract.approvalPoints.length && <><h4>Declared approval points</h4><ul>{report.contract.approvalPoints.map((item, index) => <li key={index}>{item} · Approval not granted</li>)}</ul></>}
      </>}
      <div style={muted}>{report.scope} Use Evidence history to compare or export this record.</div>
    </div>}
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

  const hasArtifacts = (data?.history?.length ?? 0) > 0 || data?.verification || data?.shipcheck || data?.concord || data?.fence || data?.spec || data?.language || data?.understanding || Boolean(data?.review || data?.failure || data?.context);

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

      {context.entityType === "issue" && (data?.executionActive || data?.catalog?.capabilities.some(item => item.tool === "manage-evaluation" && item.enabled)) && <EvaluationPanel refreshEvidence={refresh} key={`eval:${targetKey}`} issueId={context.entityId} enabled={!!data?.catalog?.capabilities.find(item => item.tool === "manage-evaluation")?.enabled} ready={data?.catalog?.capabilities.find(item => item.tool === "manage-evaluation")?.status === "ready"} />}

      {data?.executionHistory?.pending && <div role="status" style={card}>Execution outcomes are durable, but some Evidence history records are pending. Refresh to retry saving them; evaluations will not rerun.<button onClick={() => void refresh()}>Refresh evidence</button></div>}

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

      {data?.verificationEnabled && data.catalog?.capabilities.some((entry) => entry.tool === "inspect-release-readiness" && entry.selectedByProfile) && canGenerate && <ShipcheckSection key={`shipcheck:${targetKey}:${data.shipcheck?.id ?? "none"}`} context={context} report={data.shipcheck ?? null} ready={data.readiness?.capabilities.shipcheck === "ready"} refresh={refresh} />}
      {data?.verificationEnabled && data.catalog?.capabilities.some((entry) => entry.tool === "inspect-artifact-drift" && entry.selectedByProfile) && canGenerate && <ConcordSection key={`concord:${targetKey}:${data.concord?.id ?? "none"}`} context={context} report={data.concord ?? null} ready={data.readiness?.capabilities.concord === "ready"} refresh={refresh} />}
      {data?.verificationEnabled && data.catalog?.capabilities.some((entry) => entry.tool === "inspect-architecture" && entry.selectedByProfile) && canGenerate && <FenceSection key={`fence:${targetKey}:${data.fence?.id ?? "none"}`} context={context} report={data.fence ?? null} ready={data.readiness?.capabilities.fence === "ready"} refresh={refresh} />}
      {data?.verificationEnabled && data.catalog?.capabilities.some((entry) => entry.tool === "inspect-task-contract" && entry.selectedByProfile) && canGenerate && <SpecSection key={`spec:${targetKey}:${data.spec?.id ?? "none"}`} context={context} report={data.spec ?? null} files={data.specs ?? { files: [], truncated: false }} ready={data.readiness?.capabilities.spec === "ready"} refresh={refresh} />}
      {data?.verificationEnabled && data.catalog?.capabilities.some((entry) => entry.tool === "import-verification" && entry.selectedByProfile) && <VerificationSection key={`verification:${targetKey}:${data.verification?.id ?? "none"}`} context={context} report={data.verification ?? null} refresh={refresh} />}

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
