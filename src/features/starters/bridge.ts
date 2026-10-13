import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { starterCreationTool } from "../../abilities/generated.js";
import type { ExecutionRecord, ExecutionRequest, ExecutionScope } from "../../execution/contracts.js";
import { executionAbilityReceipt } from "../../execution/receipt.js";
import { evidenceDigest } from "../../storage/history.js";
import { normalizeError } from "../../runtime/errors.js";
import { requireAgentIssue } from "../eval/bridge.js";
import { createStarterCreationService } from "./creation.js";
import { publishStarterCreation, reconcileStarterCreationHistory } from "./history.js";

const starterKind = z.enum(["script", "agent", "api", "mcp"]);
const starterName = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const identity = z.string().min(1).max(200), base = z.object({ issueId: identity });
export const starterCreationInput = z.discriminatedUnion("operation", [
  base.extend({ operation: z.literal("inspect"), kind: starterKind, name: starterName }).strict(),
  base.extend({ operation: z.literal("prepare"), kind: starterKind, name: starterName, submissionId: identity }).strict(),
  ...(["start", "status", "cancel"] as const).map(operation => base.extend({ operation: z.literal(operation), id: identity }).strict()),
  base.extend({ operation: z.literal("list") }).strict(),
]);
export function starterCreationSummary(record: ExecutionRecord) {
  return { id: record.id, state: record.state, kind: record.request.plan.starter?.kind, name: record.request.plan.suite,
    requester: record.request.requester, interactionId: record.interactionId, createdAt: record.createdAt, expiresAt: record.expiresAt,
    finishedAt: record.finishedAt, diagnostic: record.diagnostic, classification: record.result?.classification ?? null };
}
export function starterCreationView(scope: ExecutionScope, record: ExecutionRecord) {
  return { ...starterCreationSummary(record), requestDigest: record.requestDigest, plan: record.request.plan, result: record.result, abilityReceipt: executionAbilityReceipt(scope, record) };
}
export function registerStarterCreation(ctx: PluginContext) {
  const service = createStarterCreationService(ctx);
  async function execute(value: z.infer<typeof starterCreationInput>, scope: ExecutionScope, requester: ExecutionRequest["requester"]) {
    if (value.operation === "inspect") return service.inspect(scope, { kind: value.kind, name: value.name });
    if (value.operation === "prepare") {
      const record = await service.prepare(scope, { kind: value.kind, name: value.name }, `starter:${evidenceDigest(value.submissionId)}`, requester);
      return { ...starterCreationView(scope, record), history: await publishStarterCreation(ctx, scope, record) };
    }
    if (value.operation === "list") return { requests: (await service.recoveryList(scope)).map(starterCreationSummary), history: await reconcileStarterCreationHistory(ctx, scope) };
    if (requester.kind === "agent" && (value.operation === "start" || value.operation === "cancel")) {
      const record = (await service.recoveryList(scope)).find(item => item.id === value.id);
      if (!record || record.request.requester.kind !== "agent" || record.request.requester.id !== requester.id || record.request.requester.runId !== requester.runId) throw new Error("Only the requesting agent run or a human may start or cancel this request");
    }
    const record = await service[value.operation](scope, value.id);
    const history = await publishStarterCreation(ctx, scope, record);
    return value.operation === "cancel" ? { ...starterCreationSummary(record), history } : { ...starterCreationView(scope, record), history };
  }
  ctx.actions.register(starterCreationTool.name, async (params, action) => {
    if (!action.companyId || action.actor?.type !== "user" || !action.actor.userId || action.actor.companyId !== action.companyId) throw new Error("Authenticated human company context is required");
    const { companyId: _companyId, renderEnvironment: _renderEnvironment, ...raw } = params;
    const value = starterCreationInput.parse(raw);
    return execute(value, { companyId: action.companyId, issueId: value.issueId }, { kind: "human", id: action.actor.userId });
  });
  ctx.tools.register(starterCreationTool.name, starterCreationTool, async (raw, run) => {
    try {
      const value = starterCreationInput.parse(raw); await requireAgentIssue(ctx, value.issueId, run);
      const data = await execute(value, { companyId: run.companyId, issueId: value.issueId }, { kind: "agent", id: run.agentId, runId: run.runId });
      return { content: JSON.stringify(data), data };
    } catch (error) { return { error: normalizeError(error).message }; }
  });
  return { ...service, async reconcileHistory(scope: ExecutionScope) { await service.recoveryList(scope); return reconcileStarterCreationHistory(ctx, scope); } };
}
