import { useState, type CSSProperties, type ReactNode } from "react";
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

type Detail = { review: ReviewPack | null; failure: FailureEvidence | null; context: ContextPack | null };
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

function KujoPanel({ context, compact = false }: PanelProps) {
  const { data, loading, error, refresh } = usePluginData<Detail>("detail", { entityType: context.entityType, entityId: context.entityId });
  const generateReview = usePluginAction("generate-review");
  const generateContext = usePluginAction("generate-context");
  const captureFailure = usePluginAction("capture-failure");
  const clearArtifacts = usePluginAction("clear-artifacts");
  const [task, setTask] = useState("");
  const [failureTitle, setFailureTitle] = useState("");
  const [failureLog, setFailureLog] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canGenerate = context.entityType === "project" || context.entityType === "issue";

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (value) {
      setActionError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Spinner label="Loading Kujo workspace intelligence" />;
  if (error) return <div role="alert" style={{ ...card, color: colors.danger }}>Unable to load Kujo: {error.message}</div>;

  const hasArtifacts = Boolean(data?.review || data?.failure || data?.context);

  return (
    <div style={{ ...panel, ...(compact ? { marginTop: 12 } : {}) }}>
      <header style={hero}>
        <KujoMark />
        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <span style={eyebrow}>Workspace intelligence</span>
          <strong style={{ fontSize: compact ? 17 : 20, letterSpacing: "-0.02em" }}>Kujo</strong>
          <span style={muted}>Scope the work. Review the change. Preserve the evidence.</span>
        </div>
        <StatusBadge status="ok" label="READY" />
      </header>

      {actionError && <div role="alert" style={{ ...card, borderColor: colors.danger, color: colors.danger }}>{actionError}</div>}

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
              <ActionButton disabled={busy !== null} onClick={() => run("review", () => generateReview({ entityType: context.entityType, entityId: context.entityId }))}>
                {busy === "review" ? "Generating…" : "Generate Review Pack"} <span aria-hidden="true">→</span>
              </ActionButton>
            </div>

            <div style={actionCard}>
              <SectionTitle title="Select context" detail="Build a focused, bounded file set for a task." />
              <label style={{ ...eyebrow, display: "block" }}>
                Task
                <textarea
                  value={task}
                  onChange={(event) => setTask(event.target.value)}
                  maxLength={10_000}
                  placeholder="What should the agent investigate?"
                  rows={3}
                  style={input}
                />
              </label>
              <ActionButton disabled={busy !== null || !task.trim()} onClick={() => run("context", () => generateContext({ entityType: context.entityType, entityId: context.entityId, task, depth: "focused" }))}>
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
              <ActionButton disabled={busy !== null || !failureTitle.trim()} onClick={() => run("failure", () => captureFailure({ entityType: context.entityType, entityId: context.entityId, title: failureTitle, log: failureLog }))}>
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

      {hasArtifacts && (
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
