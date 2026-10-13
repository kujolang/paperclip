import { z } from "zod";
import { languageReportSchema } from "../language/schema.js";
import { concordReportSchema } from "../concord/schema.js";

const text = z.string().max(20000);
const count = z.number().int().nonnegative();
export const SHIPCHECK_CHECKS = ["git-repo", "readme", "license", "ignore-files", "tests-exist", "lint-command", "format-command", "ci-config", "readme-install", "readme-usage", "examples", "docs", "version-metadata", "changelog", "kennel-manifest", "entry-point"] as const;
export const shipcheckNativeSchema = z.object({ tool: z.literal("shipcheck"), version: z.string(), dir: z.literal("."), project_type: text,
  summary: z.object({ total_checks: z.literal(16), passed: count.max(16), failed_errors: count.max(16), warnings: count.max(16), gate_passed: z.union([z.literal(0), z.literal(1)]) }),
  checks: z.array(z.object({ name: z.enum(SHIPCHECK_CHECKS), passed: z.union([z.literal(0), z.literal(1)]), severity: z.enum(["info", "warning", "error"]), message: text, detail: text })).length(16),
});
export const SHIPCHECK_SCOPE = "Readiness signals from bounded Git-visible artifact copies, with native Git detection against the host workspace. Tests, linters and examples were not executed; release artifacts and publication were not verified. A passing metadata gate is not release certification." as const;
export const shipcheckReportSchema = z.object({ schemaVersion: z.literal(1), id: z.string(), generatedAt: z.string(), projectId: z.string(), workspaceId: z.string(),
  status: z.enum(["passed", "failed", "warnings", "partial"]), message: text, report: shipcheckNativeSchema,
  coverage: concordReportSchema.shape.coverage,
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/), runtimeVersion: z.string(), provenance: z.object({ component: z.literal("shipcheck"), version: z.string(), commit: z.string() }),
  snapshot: languageReportSchema.shape.snapshot, stale: z.boolean(), redactedCount: count, scope: z.literal(SHIPCHECK_SCOPE),
});
export type ShipcheckReport = z.infer<typeof shipcheckReportSchema>;
