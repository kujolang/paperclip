import { publicWorkflowControl, publicWorkflowPlan } from "./public.js";
import { publishWorkflow, reconcileWorkflowHistory } from "./history.js";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { workflowTool } from "../../abilities/generated.js";
import { toolEnabled } from "../../abilities/catalog.js";
import { parsePluginConfig } from "../../config/schema.js";
import type { ExecutionRecord, ExecutionRequest, ExecutionScope } from "../../execution/contracts.js";
import { executionAbilityReceipt } from "../../execution/receipt.js";
import { normalizeError } from "../../runtime/errors.js";
import { createWorkflowService, workflowStartInput } from "./service.js";

const identity = z.string().min(1).max(200), base = z.object({ issueId: identity });
export const workflowInput = z.discriminatedUnion("operation", [
  base.extend({ operation: z.literal("inspect"), ...workflowStartInput.shape }).strict(),
  base.extend({ operation: z.literal("prepare"), ...workflowStartInput.shape, submissionId: identity }).strict(),
  ...(["start", "status", "cancel", "observe"] as const).map(operation => base.extend({ operation: z.literal(operation), id: identity }).strict()),
  base.extend({ operation: z.literal("list") }).strict(),
  base.extend({ operation: z.literal("decide"), id: identity, decision: z.enum(["approve", "reject"]), response: z.string().min(1).max(2000), submissionId: identity }).strict(),
]);
export function workflowSummary(record: ExecutionRecord) {
  return { id: record.id, parentId: record.request.plan.workflow!.parentId, operation: record.request.plan.operation, name: record.request.plan.suite,
    state: record.state, requester: record.request.requester, interactionId: record.interactionId,
    queuedAt: record.startRequestedAt ?? null, createdAt: record.createdAt, expiresAt: record.expiresAt, finishedAt: record.finishedAt, diagnostic: record.diagnostic };
}
export function workflowView(scope: ExecutionScope, record: ExecutionRecord) {
  return { ...workflowSummary(record), plan: publicWorkflowPlan(record.request.plan), result: record.result, requestDigest: record.requestDigest, abilityReceipt: executionAbilityReceipt(scope, record) };
}
export function registerWorkflows(ctx: PluginContext) {
  const service = createWorkflowService(ctx);
  async function execute(value: z.infer<typeof workflowInput>, scope: ExecutionScope, requester: ExecutionRequest["requester"]) {
    if (value.operation === "inspect") return { plan: publicWorkflowPlan((await service.inspect(scope, { template: value.template, topic: value.topic })).plan) };
    if (value.operation === "prepare") return workflowView(scope, await service.prepare(scope, { template: value.template, topic: value.topic }, value.submissionId, requester));
    if (value.operation === "list") return { requests: (await service.list(scope)).map(workflowSummary), history: await reconcileWorkflowHistory(ctx, scope) };
    if (value.operation === "decide") return workflowView(scope, await service.decide(scope, value.id, value.decision, value.response, value.submissionId, requester));
    if (value.operation === "observe") { const observed = await service.observe(scope, value.id); return { ...observed, control: publicWorkflowControl(observed.control), notice: "Redacted display of native observation; the controller privately rechecks complete authoritative state before execution." }; }
    if (requester.kind === "agent" && (value.operation === "start" || value.operation === "cancel")) {
      const record = await service.status(scope, value.id);
      if (record.request.requester.kind !== "agent" || record.request.requester.id !== requester.id || record.request.requester.runId !== requester.runId) throw new Error("Only the requesting agent run or a human may start or cancel this operation");
    }
    const record = value.operation === "start" ? await service.start(scope, value.id, requester.kind === "human" ? { kind: "human", id: requester.id } : { kind: "agent", id: requester.id, runId: z.string().min(1).parse(requester.runId) }) : await service[value.operation](scope, value.id);
    const enabled = toolEnabled(parsePluginConfig(await ctx.config.get(scope.companyId)), workflowTool);
    const history = await publishWorkflow(ctx, scope, record);
    return enabled ? { ...workflowView(scope, record), history } : { ...workflowSummary(record), history };
  }
  ctx.actions.register(workflowTool.name, async (params, action) => {
    if (!action.companyId || action.actor?.type !== "user" || !action.actor.userId || action.actor.companyId !== action.companyId) throw new Error("Authenticated human company context is required");
    const { companyId: _companyId, renderEnvironment: _renderEnvironment, ...raw } = params;
    const value = workflowInput.parse(raw);
    return execute(value, { companyId: action.companyId, issueId: value.issueId }, { kind: "human", id: action.actor.userId });
  });
  ctx.tools.register(workflowTool.name, workflowTool, async (raw, run) => {
    try {
      const value = workflowInput.parse(raw);
      const issue = await ctx.issues.get(value.issueId, run.companyId);
      if (!issue || issue.id !== value.issueId || issue.companyId !== run.companyId || issue.assigneeAgentId !== run.agentId || !run.agentId || !run.runId || issue.checkoutRunId !== run.runId) throw new Error("Workflow access requires the host's assigned issue and current agent run");
      const data = await execute(value, { companyId: run.companyId, issueId: value.issueId }, { kind: "agent", id: run.agentId, runId: run.runId });
      return { content: JSON.stringify(data), data };
    } catch (error) { return { error: normalizeError(error).message }; }
  });
  ctx.jobs.register("dispatch-workflows", async () => {
    const result = await service.drainQueued();
    if (result.errors) throw new Error("Some queued workflow operations could not be verified; inspect retained request status");
  });
  return { ...service, reconcileHistory: (scope: ExecutionScope) => reconcileWorkflowHistory(ctx, scope) };
}
