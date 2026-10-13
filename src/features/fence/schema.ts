import { z } from "zod";
import { languageReportSchema } from "../language/schema.js";

const count = z.number().int().nonnegative();
const text = z.string().max(20000);
const severity = z.enum(["error", "warning", "info"]);
export const fenceNativeSchema = z.object({
  schema_version: z.literal(1), version: z.string(), status: z.enum(["passed", "failed"]),
  summary: z.object({ files_scanned: count.max(1000), imports_checked: count.max(20000), violations: count, errors: count, warnings: count, skipped_files: count, ignored_violations: count }),
  config: z.object({ path: z.enum(["fence.toml", "fence.json"]) }),
  zones: z.array(z.object({ name: text, files: count, errors: count, warnings: count })).max(1000),
  violations: z.array(z.object({ severity, from_zone: text, to_zone: text, from_owner: text.default(""), to_owner: text.default(""), confidence: z.literal("best_effort"), file: text, line: count, import: text, resolved: text, rule: text, message: text, suggestion: text })).max(20000),
  skipped_files: z.array(z.object({ file: text, reason: text })).max(1000),
  ignored_violations: z.array(z.object({ file: text, line: count, import: text, reason: text, expires: text })).max(20000),
});
export const fenceBridgeSchema = z.object({
  phase: z.enum(["blocked", "not-configured", "empty", "analyzed"]), message: text,
  diagnostics: z.array(z.object({ severity, message: text })).max(1000),
  selected: z.array(z.string().max(1000)).max(1000), threshold: z.enum(["", "none", "warning", "error"]), report: fenceNativeSchema.nullable(),
}).strict();
export const FENCE_SCOPE = "Best-effort import boundaries in a bounded Git-visible snapshot. No project commands or tests were executed. Passing means the declared Fence threshold was met within this scope, not that the project is verified." as const;
export const fenceReportSchema = z.object({
  schemaVersion: z.literal(1), id: z.string(), generatedAt: z.string(), projectId: z.string(), workspaceId: z.string(),
  status: z.enum(["passed", "failed", "partial", "blocked", "not-run"]), message: text,
  threshold: z.enum(["none", "warning", "error"]).nullable(), thresholdStatus: z.enum(["passed", "failed"]).nullable(),
  diagnostics: fenceBridgeSchema.shape.diagnostics,
  report: fenceNativeSchema.nullable(),
  coverage: z.object({ gitVisible: count, admittedNames: count.max(1000), selected: count.max(1000), inspected: count.max(1000), copiedBytes: count.max(16777216), truncated: z.boolean(), rejectedNames: count, excludedSensitive: count,
    omitted: z.array(z.object({ path: text, reason: z.enum(["oversize", "budget", "unreadable", "not-text", "sensitive"]) })).max(1000) }),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/), runtimeVersion: z.string(),
  provenance: z.object({ component: z.literal("fence"), version: z.string(), commit: z.string() }),
  snapshot: languageReportSchema.shape.snapshot, stale: z.boolean(), redactedCount: count, scope: z.literal(FENCE_SCOPE),
});
export type FenceReport = z.infer<typeof fenceReportSchema>;
