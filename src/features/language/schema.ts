import { z } from "zod";
export const diagnosticSchema = z.object({
  tool: z.enum(["check", "lint"]), code: z.string().max(200), severity: z.enum(["error", "warning", "info"]),
  message: z.string().max(4000), line: z.number().int().positive().optional(), column: z.number().int().positive().optional(),
});
export const languageReportSchema = z.object({
  schemaVersion: z.literal(1), id: z.string(), generatedAt: z.string(), projectId: z.string(), workspaceId: z.string(),
  path: z.string(), sourceDigest: z.string(), runtimeVersion: z.string(),
  check: z.enum(["passed", "failed"]), lint: z.enum(["passed", "warnings", "failed"]),
  diagnostics: z.array(diagnosticSchema).max(200), stale: z.boolean(),
  snapshot: z.object({ gitRoot: z.string(), branch: z.string(), head: z.string(), dirty: z.boolean(), fingerprint: z.string() }),
  scope: z.literal("Single-file lex/parse/compile and lint; project tests, imports and runtime behavior are not verified."),
});
export type LanguageReport = z.infer<typeof languageReportSchema>;
export type Diagnostic = z.infer<typeof diagnosticSchema>;
export type FormatPreview = { path: string; sourceDigest: string; runtimeVersion: string; changed: boolean; source: string; formatted: string; redactedCount: number; stale: boolean };
