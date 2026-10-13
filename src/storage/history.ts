import { createHash } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import type { ProjectionReceipt } from "../abilities/catalog.js";
import type { StateTarget } from "./state.js";
import { redactText } from "../features/failure/redact.js";

export const EVIDENCE_NAMESPACE = "plugin_kujo_evidence_c15d42de56";
export const HISTORY_LIMIT = 20;
export const HISTORY_DAYS = 30;
export const LEGACY_ARTIFACT_KINDS = ["review-latest", "context-latest", "failure-latest", "understand-latest", "language-latest", "verification-latest", "spec-latest", "fence-latest", "concord-latest", "shipcheck-latest"] as const;
export const ARTIFACT_KINDS = [...LEGACY_ARTIFACT_KINDS, "packages-latest", "evaluation-plan", "evaluation-result", "source-execution-plan", "source-execution-result"] as const;
export type ArtifactKind = typeof ARTIFACT_KINDS[number];
export type ReceiptOptions = { inputs?: unknown; definition?: unknown; parentId?: string; legacy?: boolean; projection?: ProjectionReceipt };
export const evidenceMetadataSchema = z.object({
  id: z.string(), kind: z.enum(ARTIFACT_KINDS), artifactId: z.string(), storedAt: z.string(),
  sourceKind: z.enum(["observed", "supplied", "legacy", "imported"]), result: z.string(),
  digest: z.string(), inputDigest: z.string().nullable(), definitionDigest: z.string().nullable(), parentId: z.string().nullable(), payloadBytes: z.number(),
});
export type EvidenceMetadata = z.infer<typeof evidenceMetadataSchema>;
const columns = `id, kind, artifact_id AS "artifactId", stored_at::text AS "storedAt", source_kind AS "sourceKind", result, digest,
  input_digest AS "inputDigest", definition_digest AS "definitionDigest", parent_id AS "parentId", payload_bytes AS "payloadBytes"`;
function table(ctx: PluginContext) {
  if (ctx.db.namespace !== EVIDENCE_NAMESPACE) throw new Error("Kujo evidence database is unavailable; upgrade the host and reapply plugin migrations");
  return `${EVIDENCE_NAMESPACE}.artifacts`;
}
function targetParams(target: StateTarget) { return [target.companyId, target.entityType, target.entityId]; }
const scoped = "company_id = $1 AND entity_type = $2 AND entity_id = $3";
export function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => Array.isArray(item) ? item.map(normalize)
    : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, normalize(entry)])) : item;
  const result = JSON.stringify(normalize(value));
  if (result === undefined) throw new Error("Evidence must be JSON-serializable");
  return result;
}
export function evidenceDigest(value: unknown) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
function resultLabel(kind: ArtifactKind, payload: Record<string, unknown>) {
  if (kind === "packages-latest") return `package inspection ${payload.status}`;
  if (kind === "shipcheck-latest") return `release signals ${payload.status}`;
  if (kind === "concord-latest") return `artifact drift ${payload.status}`;
  if (kind === "fence-latest") return `architecture ${payload.status}`;
  if (kind === "spec-latest") return `contract ${(payload.validation as { status: string }).status}`;
  if (kind === "verification-latest") return `imported ${payload.classification}`;
  if (kind === "failure-latest") return "supplied failure";
  if (payload.check === "failed" || payload.lint === "failed") return "failed";
  if (payload.lint === "warnings") return "warnings";
  if (payload.status === "partial" || payload.truncated === true || Object.values((payload.componentStatus ?? {}) as object).includes("failed")) return "partial";
  return "observed";
}

export async function pruneHistory(ctx: PluginContext, target: StateTarget) {
  // Separate bounded statements avoid an index read/modify/write race. Every
  // successful append prunes by database insertion order, not client timestamps.
  await ctx.db.execute(`DELETE FROM ${table(ctx)} WHERE ${scoped} AND
    (stored_at < clock_timestamp() - interval '30 days' OR id IN
      (SELECT id FROM ${table(ctx)} WHERE ${scoped} ORDER BY stored_at DESC, id DESC OFFSET 20))`, targetParams(target));
}

export async function appendEvidence(ctx: PluginContext, target: StateTarget, kind: ArtifactKind, value: unknown, options: ReceiptOptions = {}): Promise<void> {
  const payload: Record<string, unknown> = { ...z.record(z.string(), z.unknown()).parse(value), ...(options.projection ? { kujoProjection: options.projection } : {}) };
  const artifactId = z.string().min(1).max(200).parse(payload.id);
  const serialized = canonicalJson(payload);
  const bytes = Buffer.byteLength(serialized);
  if (bytes > 5_000_000) throw new Error("Evidence payload exceeds the 5 MB retention limit");
  const id = `evidence_${evidenceDigest({ ...target, kind, artifactId })}`;
  const digest = evidenceDigest(payload);
  const inputDigest = options.inputs === undefined ? null : evidenceDigest(options.inputs);
  const definitionDigest = options.legacy ? null : evidenceDigest({ operation: options.definition ?? kind, schemaVersion: payload.schemaVersion, provenance: payload.provenance ?? { runtimeVersion: payload.runtimeVersion ?? null }, receiptAdapterVersion: 1 });
  if (options.parentId) {
    const parent = await getEvidence(ctx, target, options.parentId);
    if (!parent) throw new Error("Parent evidence was not found within this company and entity");
  }
  const inserted = await ctx.db.execute(`INSERT INTO ${table(ctx)}
    (id, company_id, entity_type, entity_id, kind, artifact_id, source_kind, result, digest, input_digest, definition_digest, parent_id, payload_bytes, payload)
    VALUES ($4, $1, $2, $3, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb) ON CONFLICT DO NOTHING`,
    [...targetParams(target), id, kind, artifactId, options.legacy ? "legacy" : kind === "failure-latest" ? "supplied" : kind === "verification-latest" ? "imported" : "observed",
      resultLabel(kind, payload), digest, inputDigest, definitionDigest, options.parentId ?? null, bytes, serialized]);
  if (inserted.rowCount === 0) {
    const stored = await getEvidence(ctx, target, id);
    if (!stored || stored.receipt.digest !== digest || (!options.legacy && (stored.receipt.inputDigest !== inputDigest || stored.receipt.definitionDigest !== definitionDigest || stored.receipt.parentId !== (options.parentId ?? null)))) throw new Error("Immutable evidence identity conflicts with different content or inputs");
  }
  await pruneHistory(ctx, target);

}

export async function listEvidence(ctx: PluginContext, target: StateTarget): Promise<EvidenceMetadata[]> {
  await pruneHistory(ctx, target);
  const rows = await ctx.db.query(`SELECT ${columns} FROM ${table(ctx)} WHERE ${scoped} ORDER BY stored_at DESC, id DESC LIMIT 20`, targetParams(target));
  return z.array(evidenceMetadataSchema).parse(rows);
}
export async function getEvidence(ctx: PluginContext, target: StateTarget, id: string): Promise<{ receipt: EvidenceMetadata; payload: Record<string, unknown> } | null> {
  const rows = await ctx.db.query(`SELECT ${columns}, payload FROM ${table(ctx)} WHERE ${scoped} AND id = $4 AND stored_at >= clock_timestamp() - interval '30 days'`, [...targetParams(target), id]);
  if (!rows[0]) return null;
  const receipt = evidenceMetadataSchema.parse(rows[0]);
  const payload = z.record(z.string(), z.unknown()).parse(rows[0].payload);
  if (evidenceDigest(payload) !== receipt.digest) throw new Error("Stored evidence failed its integrity check");
  return { receipt, payload };
}
export async function latestEvidence(ctx: PluginContext, target: StateTarget, kind: ArtifactKind) {
  const rows = await ctx.db.query(`SELECT id FROM ${table(ctx)} WHERE ${scoped} AND kind = $4 AND stored_at >= clock_timestamp() - interval '30 days' ORDER BY stored_at DESC, id DESC LIMIT 1`, [...targetParams(target), kind]);
  return rows[0] ? await getEvidence(ctx, target, z.string().parse(rows[0].id)) : null;
}

export async function clearHistory(ctx: PluginContext, target: StateTarget) {
  if (target.entityType === "issue") {
    table(ctx);
    // Suppress republishing settled execution evidence before deleting history.
    // The publisher locks this same row during its atomic parent/child insert.
    await ctx.db.execute(`UPDATE ${EVIDENCE_NAMESPACE}.executions SET history_published_at = clock_timestamp()
      WHERE company_id = $1 AND issue_id = $2 AND history_published_at IS NULL
      AND state NOT IN ('preparing', 'pending', 'running', 'cancel_requested')`, [target.companyId, target.entityId]);
  }
  await ctx.db.execute(`DELETE FROM ${table(ctx)} WHERE ${scoped}`, targetParams(target));
}

export function exportEvidence(record: { receipt: EvidenceMetadata; payload: Record<string, unknown> }) {
  const roots = [record.payload.snapshot, record.payload.source].flatMap((value) => value && typeof value === "object" && "gitRoot" in value && typeof value.gitRoot === "string" ? [value.gitRoot] : []);
  const sanitize = (value: unknown, key = ""): unknown => {
    if (["gitRoot", "cwd", "workspacePath"].includes(key)) return "[workspace]";
    if (typeof value === "string") return redactText(roots.reduce((text, root) => root ? text.split(root).join("[workspace]") : text, value)).text;
    if (Array.isArray(value)) return value.map((entry) => sanitize(entry));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, sanitize(entry, name)]));
    return value;
  };
  const payload = sanitize(record.payload);
  return { schemaVersion: 1, receipt: record.receipt, exportDigest: evidenceDigest(payload),
    notice: "Redacted export; receipt digest identifies retained original evidence, exportDigest identifies this exported payload. Redaction is defense in depth.", payload };
}

export function compareEvidence(left: Awaited<ReturnType<typeof getEvidence>>, right: Awaited<ReturnType<typeof getEvidence>>) {
  if (!left || !right) throw new Error("Both evidence records must exist within this company and entity");
  if (left.receipt.kind !== right.receipt.kind) throw new Error("Compare evidence of the same kind");
  const summarize = (payload: Record<string, unknown>) => {
    const footprint = payload.footprint as Record<string, unknown> | undefined;
    const intelligence = payload.intelligence as Record<string, unknown> | undefined;
    const contract = payload.contract as Record<string, unknown> | null | undefined;
    return { executionState: payload.executionState, nativeExitCode: (payload.native as Record<string, unknown> | undefined)?.exitCode, nativeChecks: ((payload.evaluation as Record<string, unknown> | null)?.result as Record<string, unknown> | undefined)?.checks, classification: payload.classification, sourceKind: payload.sourceKind, claimedChecks: (payload.result as Record<string, unknown> | undefined)?.checks, check: payload.check, lint: payload.lint, status: payload.status, staleAtCreation: payload.stale,
      declaredDependencies: payload.dependencyCount, lockStatus: (payload.lock as Record<string, unknown> | undefined)?.status,
      lockRecords: (payload.lock as Record<string, unknown> | undefined)?.count, truncated: payload.truncated,
      contractValidation: (payload.validation as Record<string, unknown> | undefined)?.status,
      acceptanceCriteria: Array.isArray(contract?.criteria) ? contract.criteria.length : undefined,
      declaredChecks: Array.isArray(contract?.checks) ? contract.checks.length : undefined,
      filesChanged: footprint?.filesChanged, churn: footprint?.churn, risk: footprint?.riskLevel,
      selectedFiles: Array.isArray(payload.files) ? payload.files.length : undefined,
      diagnostics: Array.isArray(payload.diagnostics) ? payload.diagnostics.length : undefined,
      metrics: intelligence?.metrics };
  };
  return { kind: left.receipt.kind, left: { receipt: left.receipt, summary: summarize(left.payload) },
    right: { receipt: right.receipt, summary: summarize(right.payload) }, samePayload: left.receipt.digest === right.receipt.digest,
    sameInputs: left.receipt.inputDigest && right.receipt.inputDigest ? left.receipt.inputDigest === right.receipt.inputDigest : null };
}
