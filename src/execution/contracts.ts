import { z } from "zod";
import type { ExecuteKujoInput, ExecuteKujoResult } from "../runtime/types.js";

const identity = z.string().min(1).max(200);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const executionScopeSchema = z.object({ companyId: identity, issueId: identity }).strict();
export type ExecutionScope = z.infer<typeof executionScopeSchema>;
export const executionPlanSchema = z.object({
  operation: z.enum(["eval.run", "source.run", "source.test", "source.fixtures"]),
  // Frozen at preparation. Absent on legacy requests; never backfill from a
  // newer catalog when rendering an old immutable outcome.
  abilityReceipt: z.object({
    serializerVersion: z.literal(1),
    abilityId: z.enum(["kujo.eval.suite.run", "kujo.paperclip.source.execute"]),
    abilityVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    definitionDigest: digest,
    handlerVersion: z.literal("1.0.0"),
  }).strict().optional(),
  projectId: identity,
  workspaceId: identity,
  suite: z.string().min(1).max(500),
  summary: z.string().min(1).max(4000),
  preview: z.string().max(12000).optional(),
  maxStdoutBytes: z.number().int().min(1024).max(500000).optional(),
  maxStderrBytes: z.number().int().min(1024).max(64000).optional(),
  effects: z.array(z.enum(["read_workspace", "write_reports", "write_files", "execute_project", "network"])).min(1).max(4),
  inputDigest: digest,
  workspaceDigest: digest,
  definitionDigest: digest,
  componentDigest: digest,
  runtimeDigest: digest,
  policyDigest: digest,
  timeoutMs: z.number().int().min(100).max(27000),
}).strict();
export type ExecutionPlan = z.infer<typeof executionPlanSchema>;
export const executionRequestSchema = z.object({
  plan: executionPlanSchema,
  requester: z.object({ kind: z.enum(["human", "agent"]), id: identity, runId: identity.optional() }).strict(),
}).strict();
export type ExecutionRequest = z.infer<typeof executionRequestSchema>;
export const executionStateSchema = z.enum(["preparing", "pending", "running", "cancel_requested", "succeeded", "failed", "cancelled", "expired", "rejected", "stale", "uncertain"]);
export type ExecutionState = z.infer<typeof executionStateSchema>;
export const executionRecordSchema = z.object({
  id: identity, requestDigest: digest, request: executionRequestSchema, state: executionStateSchema,
  interactionId: z.string().nullable(), approvedBy: z.string().nullable(), ownerId: z.string().nullable(), claimId: z.string().nullable(),
  createdAt: z.string(), expiresAt: z.string(), leaseUntil: z.string().nullable(), finishedAt: z.string().nullable(),
  result: z.record(z.string(), z.unknown()).nullable(), diagnostic: z.string().nullable(),
});
export type ExecutionRecord = z.infer<typeof executionRecordSchema>;

// Internal adapter boundary, never a tool accepting commands or workspace paths.
// Materialization must recheck admission and digests, then freeze the approved
// inputs. Returning null means the approved plan can no longer be executed.
// Only reviewed adapter code can provide an invocation; the coordinator owns
// spawn, process-tree cancellation, byte limits and timeouts.
export type ExecutionAdapter = {
  materialize(scope: ExecutionScope, plan: ExecutionPlan, signal: AbortSignal): Promise<{
    invocation: Omit<ExecuteKujoInput, "signal" | "timeoutMs" | "maxStdoutBytes" | "maxStderrBytes">;
    collect(result: ExecuteKujoResult): Promise<Record<string, unknown>>;
    dispose(): Promise<void>;
  } | null>;
};
