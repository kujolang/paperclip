import { assuranceSelection } from "./native.js";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { assuranceTool } from "../../abilities/generated.js";
import type { ExecutionRecord, ExecutionRequest, ExecutionScope } from "../../execution/contracts.js";
import { executionAbilityReceipt } from "../../execution/receipt.js";
import { evidenceDigest } from "../../storage/history.js";
import { normalizeError } from "../../runtime/errors.js";
import { requireReadableEntity } from "../../paperclip/workspace.js";
import { requireAgentIssue } from "../eval/bridge.js";
import { createAssuranceService } from "./service.js";
import { publishAssurance, reconcileAssuranceHistory } from "./history.js";

const identity = z.string().min(1).max(200), base = z.object({ issueId: identity });
export const assuranceInput = z.discriminatedUnion("operation", [
  base.extend({ operation: z.literal("inspect"), selection: assuranceSelection }).strict(),
  base.extend({ operation: z.literal("prepare"), selection: assuranceSelection, submissionId: identity }).strict(),
  ...(["start", "status", "cancel", "recover"] as const).map(operation => base.extend({ operation: z.literal(operation), id: identity }).strict()),
  base.extend({ operation: z.literal("list") }).strict(),
  base.extend({ operation: z.literal("discover") }).strict(),
]);
export function assuranceSummary(record: ExecutionRecord) {
  return { id: record.id, state: record.state, mode: record.request.plan.operation.replace("assurance.", ""), path: record.request.plan.suite,
    requester: record.request.requester, interactionId: record.interactionId, createdAt: record.createdAt, expiresAt: record.expiresAt,
    startRequestedAt: record.startRequestedAt, finishedAt: record.finishedAt, diagnostic: record.diagnostic, classification: record.result?.classification ?? null };
}
export function assuranceView(scope: ExecutionScope, record: ExecutionRecord) {
  return { ...assuranceSummary(record), requestDigest: record.requestDigest, plan: record.request.plan, result: record.result, abilityReceipt: executionAbilityReceipt(scope, record) };
}
export function registerAssurance(ctx: PluginContext) {
  const service = createAssuranceService(ctx);
  async function execute(value: z.infer<typeof assuranceInput>, scope: ExecutionScope, requester: ExecutionRequest["requester"]) {
    await requireReadableEntity(ctx, { entityType: "issue", entityId: scope.issueId, companyId: scope.companyId });
    if (value.operation === "discover") return service.discover(scope);
    if (value.operation === "inspect") return service.inspect(scope, value.selection);
    if (value.operation === "prepare") {
      const record = await service.prepare(scope, value.selection, `assurance:${evidenceDigest(value.submissionId)}`, requester);
      return { ...assuranceView(scope, record), history: await publishAssurance(ctx, scope, record) };
    }
    if (value.operation === "list") return { requests: (await service.list(scope)).map(assuranceSummary), history: await reconcileAssuranceHistory(ctx, scope) };
    if (value.operation === "recover") { if (requester.kind !== "human") throw new Error("Only a human may recover owned resources"); return service.recover(scope, value.id); }
    if (requester.kind === "agent" && (value.operation === "start" || value.operation === "cancel")) {
      const record = (await service.list(scope)).find(item => item.id === value.id);
      if (!record || record.request.requester.kind !== "agent" || record.request.requester.id !== requester.id || record.request.requester.runId !== requester.runId) throw new Error("Only the requesting agent run or a human may start or cancel this request");
    }
    const record = value.operation === "start" ? await service.start(scope, value.id, requester.kind === "human" ? { kind: "human", id: requester.id } : { kind: "agent", id: requester.id, runId: requester.runId! }) : await service[value.operation](scope, value.id);
    const history = await publishAssurance(ctx, scope, record);
    return value.operation === "cancel" ? { ...assuranceSummary(record), history } : { ...assuranceView(scope, record), history };
  }
  ctx.actions.register(assuranceTool.name, async (params, action) => {
    if (!action.companyId || action.actor?.type !== "user" || !action.actor.userId || action.actor.companyId !== action.companyId) throw new Error("Authenticated human company context is required");
    const { companyId: _companyId, renderEnvironment: _renderEnvironment, ...raw } = params;
    const value = assuranceInput.parse(raw);
    return execute(value, { companyId: action.companyId, issueId: value.issueId }, { kind: "human", id: action.actor.userId });
  });
  ctx.tools.register(assuranceTool.name, assuranceTool, async (raw, run) => {
    try {
      const value = assuranceInput.parse(raw); await requireAgentIssue(ctx, value.issueId, run);
      const data = await execute(value, { companyId: run.companyId, issueId: value.issueId }, { kind: "agent", id: run.agentId, runId: run.runId });
      return { content: JSON.stringify(data), data };
    } catch (error) { return { error: normalizeError(error).message }; }
  });
  ctx.jobs.register("assurance-workflows", async () => { const result = await service.drainQueued(); if (result.errors) throw new Error("Some assurance jobs require outcome inspection"); });
  return { ...service, async reconcileHistory(scope: ExecutionScope) { await service.list(scope); return reconcileAssuranceHistory(ctx, scope); } };
}
