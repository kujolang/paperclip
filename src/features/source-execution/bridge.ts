import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { sourceExecutionTool } from "../../abilities/generated.js";
import type { ExecutionRecord, ExecutionRequest, ExecutionScope } from "../../execution/contracts.js";
import { executionAbilityReceipt } from "../../execution/receipt.js";
import { evidenceDigest } from "../../storage/history.js";
import { normalizeError } from "../../runtime/errors.js";
import { requireAgentIssue } from "../eval/bridge.js";
import { createSourceExecutionService, sourceMode } from "./host.js";
import { publishSourceExecution, reconcileSourceExecutionHistory } from "./history.js";

const identity = z.string().min(1).max(200), base = z.object({ issueId: identity });
export const sourceExecutionInput = z.discriminatedUnion("operation", [
  base.extend({ operation: z.literal("inspect"), mode: sourceMode, path: z.string().min(1).max(500).optional() }).strict(),
  base.extend({ operation: z.literal("prepare"), mode: sourceMode, path: z.string().min(1).max(500).optional(), submissionId: identity }).strict(),
  ...(["start", "status", "cancel"] as const).map(operation => base.extend({ operation: z.literal(operation), id: identity }).strict()),
  base.extend({ operation: z.literal("list") }).strict(),
]);
export function sourceExecutionSummary(record: ExecutionRecord) {
  return { id: record.id, state: record.state, mode: record.request.plan.operation.replace("source.", ""), path: record.request.plan.suite,
    requester: record.request.requester, interactionId: record.interactionId, createdAt: record.createdAt, expiresAt: record.expiresAt,
    finishedAt: record.finishedAt, diagnostic: record.diagnostic, classification: record.result?.classification ?? null };
}
export function sourceExecutionView(scope: ExecutionScope, record: ExecutionRecord) {
  return { ...sourceExecutionSummary(record), requestDigest: record.requestDigest, plan: record.request.plan, result: record.result, abilityReceipt: executionAbilityReceipt(scope, record) };
}
export function registerSourceExecution(ctx: PluginContext) {
  const service = createSourceExecutionService(ctx);
  async function execute(value: z.infer<typeof sourceExecutionInput>, scope: ExecutionScope, requester: ExecutionRequest["requester"]) {
    if (value.operation === "inspect") return service.inspect(scope, value.mode, value.path);
    if (value.operation === "prepare") {
      const record = await service.prepare(scope, value.mode, value.path, `source:${evidenceDigest(value.submissionId)}`, requester);
      return { ...sourceExecutionView(scope, record), history: await publishSourceExecution(ctx, scope, record) };
    }
    if (value.operation === "list") return { requests: (await service.recoveryList(scope)).map(sourceExecutionSummary), history: await reconcileSourceExecutionHistory(ctx, scope) };
    if (requester.kind === "agent" && (value.operation === "start" || value.operation === "cancel")) {
      const record = (await service.recoveryList(scope)).find(item => item.id === value.id);
      if (!record || record.request.requester.kind !== "agent" || record.request.requester.id !== requester.id || record.request.requester.runId !== requester.runId) throw new Error("Only the requesting agent run or a human may start or cancel this request");
    }
    const record = await service[value.operation](scope, value.id);
    const history = await publishSourceExecution(ctx, scope, record);
    return value.operation === "cancel" ? { ...sourceExecutionSummary(record), history } : { ...sourceExecutionView(scope, record), history };
  }
  ctx.actions.register(sourceExecutionTool.name, async (params, action) => {
    if (!action.companyId || action.actor?.type !== "user" || !action.actor.userId || action.actor.companyId !== action.companyId) throw new Error("Authenticated human company context is required");
    const { companyId: _companyId, renderEnvironment: _renderEnvironment, ...raw } = params;
    const value = sourceExecutionInput.parse(raw);
    return execute(value, { companyId: action.companyId, issueId: value.issueId }, { kind: "human", id: action.actor.userId });
  });
  ctx.tools.register(sourceExecutionTool.name, sourceExecutionTool, async (raw, run) => {
    try {
      const value = sourceExecutionInput.parse(raw); await requireAgentIssue(ctx, value.issueId, run);
      const data = await execute(value, { companyId: run.companyId, issueId: value.issueId }, { kind: "agent", id: run.agentId, runId: run.runId });
      return { content: JSON.stringify(data), data };
    } catch (error) { return { error: normalizeError(error).message }; }
  });
  return { ...service, async reconcileHistory(scope: ExecutionScope) { await service.recoveryList(scope); return reconcileSourceExecutionHistory(ctx, scope); } };
}
