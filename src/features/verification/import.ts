import { createHash, randomUUID } from "node:crypto";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { z } from "zod";
import contract from "../../../bundled/verification-contract/evaluation-result.schema.json" with { type: "json" };
import sourceLock from "../../../bundled/verification-sources.lock.json" with { type: "json" };
import { redactText } from "../failure/redact.js";

export const IMPORT_MAX_BYTES = 65_536;
export const verificationInput = z.object({ json: z.string().min(1).max(IMPORT_MAX_BYTES) }).strict();
const ajv = new Ajv2020({ strict: false, allErrors: false, ownProperties: true });
// The package exposes a CommonJS default while this plugin builds as ESM.
const addFormats = addFormatsModule as unknown as (instance: Ajv2020) => void;
addFormats(ajv);
const validate = ajv.compile(contract);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const selectedResultSchema = z.object({
  result_id: z.string(), evaluator: z.object({ name: z.string(), version: z.string(), configuration_sha256: z.string().optional() }),
  subject: z.object({ run_id: z.string(), step_id: z.string().optional(), attempt_id: z.string().optional() }),
  verdict: z.enum(["pass", "fail", "warn", "indeterminate"]), severity: z.enum(["info", "warning", "error", "critical"]),
  checks: z.object({ passed: count, failed: count, warned: count, skipped: count }),
  started_at: z.string(), finished_at: z.string(), evaluation_status: z.enum(["completed", "error", "blocked"]).optional(),
});
export const verificationReportSchema = z.object({
  schemaVersion: z.literal(1), id: z.string(), generatedAt: z.string(), sourceKind: z.literal("imported"),
  classification: z.enum(["passed", "failed", "warnings", "partial", "not-run", "indeterminate", "blocked", "error"]),
  result: selectedResultSchema, sourceDigest: z.string(), sourceBytes: z.number(),
  referenceCount: z.number(), unresolvedReferences: z.literal(true), executionObserved: z.literal(false),
  workspaceFreshness: z.literal("unknown"), redactedCount: z.number(), notice: z.string(),
  provenance: z.object({ schemaId: z.string(), repository: z.string(), commit: z.string(), schemaSha256: z.string() }),
});
export type VerificationReport = z.infer<typeof verificationReportSchema>;

// Bound nesting before schema validation and sanitization. The caller supplies
// data only; no schema, executable, path or evidence URI is ever evaluated.
function checkDepth(value: unknown, depth = 0): void {
  if (depth > 32) throw new Error("Evaluation JSON exceeds the nesting limit");
  if (value && typeof value === "object") for (const item of Object.values(value)) checkDepth(item, depth + 1);
}

export function importVerification(json: string): VerificationReport {
  const sourceBytes = Buffer.byteLength(json);
  if (sourceBytes > IMPORT_MAX_BYTES) throw new Error("Evaluation JSON exceeds the 64 KiB import limit");
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new Error("Paste a valid evaluation-result.json object"); }
  checkDepth(raw);
  if (!validate(raw)) throw new Error("Evaluation result does not match the pinned kujo.evaluation-result/v1 contract");
  // Select the bounded summary only. Unknown extensions, commands, annotations,
  // referenced paths and raw logs are neither retained nor followed.
  const original = selectedResultSchema.parse(raw);
  if (Date.parse(original.finished_at) < Date.parse(original.started_at)) throw new Error("Evaluation finished before it started");
  if (original.verdict === "pass" && original.checks.failed > 0) throw new Error("Passing verdict contradicts failed checks");
  const { passed, failed, warned, skipped } = original.checks;
  const classification: VerificationReport["classification"] = original.evaluation_status === "blocked" ? "blocked"
    : original.evaluation_status === "error" ? "error"
    : original.verdict === "indeterminate" ? "indeterminate"
    : failed > 0 || original.verdict === "fail" ? "failed"
    : warned > 0 || original.verdict === "warn" ? "warnings"
    : passed === 0 ? "not-run" : skipped > 0 ? "partial" : "passed";
  let redactedCount = 0;
  const redact = (value: unknown): unknown => {
    if (typeof value === "string") { const redacted = redactText(value); redactedCount += redacted.count; return redacted.text; }
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
    return value;
  };
  const result = selectedResultSchema.parse(redact(original));
  const source = sourceLock.sources[0]!;
  const refs = (raw as { evidence: unknown[] }).evidence;
  return verificationReportSchema.parse({
    schemaVersion: 1, id: `verification_${randomUUID()}`, generatedAt: new Date().toISOString(), sourceKind: "imported", classification, result,
    sourceDigest: createHash("sha256").update(json).digest("hex"), sourceBytes, referenceCount: refs.length,
    unresolvedReferences: true, executionObserved: false, workspaceFreshness: "unknown", redactedCount,
    notice: "Imported claim, not a check executed or authenticated by Paperclip. Producer, subject and timestamps are supplied. Evidence references are not opened or verified; applicability to this workspace is unknown. Source digest identifies supplied bytes; retained evidence contains only a redacted summary.",
    provenance: { schemaId: contract.$id, repository: source.repository, commit: source.commit, schemaSha256: source.files[0]!.sha256 },
  });
}
