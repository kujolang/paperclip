import { z } from "zod";
import { languageReportSchema } from "../language/schema.js";

const text = z.string().max(20000);
const count = z.number().int().nonnegative();
export const concordNativeSchema = z.object({
  tool: z.literal("concord"), version: z.string(),
  summary: z.object({ total_findings: count, highest_severity: z.enum(["none", "low", "medium", "high", "critical"]) }),
  findings: z.array(z.object({ id: text, severity: z.enum(["low", "medium", "high", "critical"]), confidence: z.enum(["low", "medium", "high"]),
    category: text, title: text, summary: text, source_artifact: text, target_artifact: text, expected: text, actual: text, suggested_fix: text, human_review_required: z.boolean() })).max(10000),
});
export const concordBridgeSchema = z.object({ phase: z.enum(["blocked", "empty", "analyzed"]),
  issues: z.array(z.object({ artifact: text, field: text, reason: text })).max(10000), report: concordNativeSchema.nullable() }).strict();
export const CONCORD_SCOPE = "Experimental convention-based artifact drift leads in a bounded Git-visible snapshot. No project commands, examples or tests were executed. No findings means only that Concord found no drift in the admitted artifacts; it does not verify project correctness." as const;
export const concordReportSchema = z.object({ schemaVersion: z.literal(1), id: z.string(), generatedAt: z.string(), projectId: z.string(), workspaceId: z.string(),
  status: z.enum(["passed", "failed", "warnings", "partial", "blocked", "not-run"]), message: text,
  issues: concordBridgeSchema.shape.issues, report: concordNativeSchema.nullable(),
  coverage: z.object({ gitVisible: count, admittedNames: count.max(1000), copied: count.max(1000), copiedBytes: count.max(16777216), truncated: z.boolean(), rejectedNames: count, excludedSensitive: count,
    omitted: z.array(z.object({ path: text, reason: z.enum(["oversize", "budget", "unreadable", "not-text", "sensitive"]) })).max(1000) }),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/), runtimeVersion: z.string(), provenance: z.object({ component: z.literal("concord"), version: z.string(), commit: z.string() }),
  snapshot: languageReportSchema.shape.snapshot, stale: z.boolean(), redactedCount: count, scope: z.literal(CONCORD_SCOPE),
});
export type ConcordReport = z.infer<typeof concordReportSchema>;
