import { z } from "zod";

const text = z.string().max(1000);
const count = z.number().int().nonnegative();
// Strip all unrecognized Scout fields, particularly snippets and absolute paths.
export const scoutIntelligenceSchema = z.object({
  tool: z.object({ name: z.literal("scout"), version: text }),
  metrics: z.object({ total_files: count, total_lines: count, total_size: count,
    languages: z.record(text, count),
    largest_files: z.array(z.object({ path: text, lang: text, size: count })).max(100),
  }),
  dependencies: z.array(z.object({ module: text, source: text, type: text })).max(1000),
  routes: z.array(z.object({ method: text, path: text, source: text })).max(1000),
  security_findings: z.array(z.object({ file: text, line: count, severity: text, label: text })).max(1000),
  parse_errors: z.array(z.object({ file: text, error: text })).max(10000),
});

export const understandingSchema = z.object({
  schemaVersion: z.literal(1), id: z.string(), generatedAt: z.string(),
  projectId: z.string(), workspaceId: z.string(), issueId: z.string().optional(),
  status: z.enum(["complete", "partial"]),
  snapshot: z.object({ gitRoot: z.string(), branch: z.string(), head: z.string(), dirty: z.boolean(), fingerprint: z.string() }),
  stale: z.boolean(),
  intelligence: scoutIntelligenceSchema,
  fileTree: z.string().max(100000),
  limits: z.object({ maxEntries: count, maxCodeFiles: count, maxAnalyzedBytes: count, maxFileBytes: count }),
  warnings: z.array(text).max(100),
  provenance: z.object({ pluginVersion: text, kujoRuntimeVersion: text, componentVersion: text, componentCommit: text }),
});
export type Understanding = z.infer<typeof understandingSchema>;
