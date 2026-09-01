import { z } from "zod";

export const contextFileSchema = z.object({
  path: z.string(),
  reason: z.string(),
  score: z.number().optional(),
  estimatedTokens: z.number().int().nonnegative().optional(),
});

export const contextPackSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  generatedAt: z.string(),
  task: z.string(),
  depth: z.enum(["minimal", "focused", "broad"]),
  budget: z.number().int().positive(),
  estimatedTokens: z.number().int().nonnegative(),
  files: z.array(contextFileSchema),
  ignoredFiles: z.number().int().nonnegative(),
  truncated: z.boolean(),
  truncationReason: z.string().optional(),
  exclusions: z.array(z.string()),
  workspaceId: z.string(),
  projectId: z.string(),
  snapshot: z.object({
    gitRoot: z.string(), branch: z.string(), head: z.string(), dirty: z.boolean(), fingerprint: z.string(),
  }),
  stale: z.boolean(),
  cacheKey: z.string(),
  provenance: z.object({ pluginVersion: z.string(), kujoRuntimeVersion: z.string(), componentId: z.string(), componentVersion: z.string(), componentCommit: z.string() }),
});

export type ContextPack = z.infer<typeof contextPackSchema>;

