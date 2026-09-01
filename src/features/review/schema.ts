import { z } from "zod";

export const reviewPackSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  generatedAt: z.string(),
  projectId: z.string(),
  workspaceId: z.string(),
  issueId: z.string().optional(),
  runId: z.string().optional(),
  source: z.object({
    gitRoot: z.string(),
    branch: z.string(),
    head: z.string(),
    base: z.string(),
    dirty: z.boolean(),
    fingerprint: z.string(),
  }),
  footprint: z.object({
    filesChanged: z.number().int().nonnegative(),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    churn: z.number().int().nonnegative(),
    riskLevel: z.enum(["low", "medium", "high"]),
    files: z.array(z.unknown()),
    categories: z.record(z.string(), z.array(z.string())),
    signals: z.array(z.object({ id: z.string(), severity: z.enum(["info", "attention"]), message: z.string() })),
  }),
  summary: z.unknown().optional(),
  suggestedTests: z.array(z.object({ command: z.string(), reason: z.string().optional() })),
  handoff: z.unknown().optional(),
  componentStatus: z.object({
    footprint: z.enum(["ok", "failed"]),
    summary: z.enum(["ok", "failed"]),
    suggestedTests: z.enum(["ok", "failed"]),
    handoff: z.enum(["ok", "failed"]),
  }),
  stale: z.boolean(),
  provenance: z.object({
    pluginVersion: z.string(),
    kujoRuntimeVersion: z.string(),
    components: z.array(z.object({ id: z.string(), version: z.string(), commit: z.string() })),
  }),
});

export type ReviewPack = z.infer<typeof reviewPackSchema>;

