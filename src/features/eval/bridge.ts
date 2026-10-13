import type { PluginContext, ToolRunContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { evalTool } from "../../abilities/generated.js";
import type { ExecutionRecord, ExecutionRequest, ExecutionScope } from "../../execution/contracts.js";
import { normalizeError } from "../../runtime/errors.js";
import { publishEvaluation, reconcileEvaluationHistory, type EvaluationHistory } from "./history.js";
import { evalAbilityReceipt } from "./receipt.js";
import { createEvalHostService } from "./host.js";

const identity = z.string().min(1).max(200);
const base = z.object({ issueId: identity });
export const evalInput = z.discriminatedUnion("operation", [
  base.extend({ operation: z.literal("inspect"), suite: z.string().min(1).max(500) }).strict(),
  base.extend({ operation: z.literal("prepare"), suite: z.string().min(1).max(500), submissionId: identity }).strict(),
  ...(["start", "status", "cancel"] as const).map(operation => base.extend({ operation: z.literal(operation), id: identity }).strict()),
  base.extend({ operation: z.literal("list") }).strict(),
]);
export function executionSummary(record: ExecutionRecord) {
  return { id: record.id, state: record.state, suite: record.request.plan.suite, requester: record.request.requester,
    interactionId: record.interactionId, createdAt: record.createdAt, expiresAt: record.expiresAt, finishedAt: record.finishedAt,
    diagnostic: record.diagnostic, classification: record.result?.classification ?? null };
}
export function executionView(record: ExecutionRecord, history?: EvaluationHistory, scope?: ExecutionScope) {
  return { ...executionSummary(record), requestDigest: record.requestDigest, plan: record.request.plan, result: record.result, ...(scope ? { abilityReceipt: evalAbilityReceipt(scope, record) } : {}), ...(history ? { history } : {}) };
}
export type EvaluationView = ReturnType<typeof executionView>;
export type EvaluationSummary = ReturnType<typeof executionSummary>;

export async function requireAgentIssue(ctx: PluginContext, issueId: string, run: ToolRunContext) {
  for (const id of [run.companyId, run.projectId, run.agentId, run.runId]) identity.parse(id);
  const issue = await ctx.issues.get(issueId, run.companyId);
  if (!issue || issue.id !== issueId || issue.companyId !== run.companyId || issue.projectId !== run.projectId
    || issue.assigneeAgentId !== run.agentId || (issue.checkoutRunId !== run.runId && issue.executionRunId !== run.runId)) {
    throw new Error("Eval requires the host's assigned issue and current agent run");
  }
}

/** All identity comes from host action/tool context. No route accepts an
 * approval token, workspace path, executable, command, or requester override. */
export function registerEvaluation(ctx: PluginContext) {
  const service = createEvalHostService(ctx);
  async function execute(value: z.infer<typeof evalInput>, scope: ExecutionScope, requester: ExecutionRequest["requester"]) {
    if (value.operation === "inspect") return await service.inspect(scope, value.suite);
    if (value.operation === "prepare") {
      const record = await service.prepare(scope, value.suite, value.submissionId, requester);
      return executionView(record, await publishEvaluation(ctx, scope, record), scope);
    }
    // Scoped metadata is available after disabling, so people can still find
    // and cancel outstanding requests without reading suite/result contents.
    if (value.operation === "list") {
      const requests = (await service.recoveryList(scope)).map(executionSummary);
      return { requests, history: await reconcileEvaluationHistory(ctx, scope) };
    }
    if (requester.kind === "agent" && (value.operation === "start" || value.operation === "cancel")) {
      const record = (await service.recoveryList(scope)).find(record => record.id === value.id);
      if (!record || record.request.requester.kind !== "agent" || record.request.requester.id !== requester.id
        || record.request.requester.runId !== requester.runId) throw new Error("Only the requesting agent run or a human may start or cancel this request");
    }
    if (value.operation === "cancel") {
      const record = await service.cancel(scope, value.id);
      return { ...executionSummary(record), history: await publishEvaluation(ctx, scope, record) };
    }
    const record = await service[value.operation](scope, value.id);
    return executionView(record, await publishEvaluation(ctx, scope, record), scope);
  }
  ctx.actions.register("manage-evaluation", async (params, actionCtx) => {
    const actor = actionCtx.actor;
    if (!actionCtx.companyId || actor?.type !== "user" || !actor.userId || actor.companyId !== actionCtx.companyId) throw new Error("Authenticated human company context is required");
    const { companyId: _companyId, renderEnvironment: _renderEnvironment, ...raw } = params;
    const value = evalInput.parse(raw);
    return await execute(value, { companyId: actionCtx.companyId, issueId: value.issueId }, { kind: "human", id: actor.userId });
  });
  ctx.tools.register(evalTool.name, evalTool, async (raw, run) => {
    try {
      const value = evalInput.parse(raw);
      await requireAgentIssue(ctx, value.issueId, run);
      const data = await execute(value, { companyId: run.companyId, issueId: value.issueId }, { kind: "agent", id: run.agentId, runId: run.runId });
      return { content: JSON.stringify(data), data };
    } catch (error) { return { error: normalizeError(error).message }; }
  });
  return { ...service, async reconcileHistory(scope: ExecutionScope) {
    await service.recoveryList(scope);
    return await reconcileEvaluationHistory(ctx, scope);
  } };
}
