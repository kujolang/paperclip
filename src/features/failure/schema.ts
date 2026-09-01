import { z } from "zod";

export const failureEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  capturedAt: z.string(),
  context: z.object({
    companyId: z.string(),
    projectId: z.string(),
    workspaceId: z.string().optional(),
    issueId: z.string().optional(),
    runId: z.string().optional(),
  }),
  failure: z.object({
    title: z.string(),
    command: z.string().optional(),
    exitCode: z.number().int().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    summary: z.string().optional(),
  }),
  environment: z.array(z.object({ key: z.string(), value: z.string(), sensitivity: z.enum(["public", "redacted"]) })),
  reproduction: z.object({ command: z.string().optional(), notes: z.string().optional() }).optional(),
  evidence: z.array(z.object({
    kind: z.enum(["stdout", "stderr", "log", "file", "metadata"]),
    label: z.string(),
    content: z.string().optional(),
    truncated: z.boolean(),
    originalBytes: z.number().int().nonnegative().optional(),
    storedBytes: z.number().int().nonnegative().optional(),
  })),
  redaction: z.object({ applied: z.boolean(), rulesVersion: z.string(), redactedCount: z.number().int().nonnegative() }),
  provenance: z.object({
    pluginVersion: z.string(),
    kujoRuntimeVersion: z.string(),
    componentId: z.string(),
    componentVersion: z.string(),
    componentCommit: z.string(),
  }),
});

export type FailureEvidence = z.infer<typeof failureEvidenceSchema>;

