import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { ExecutionRecord, ExecutionScope } from "../../execution/contracts.js";
import { executionAbilityReceipt } from "../../execution/receipt.js";
import { executionLedger } from "../../execution/ledger.js";
import { evidenceDigest } from "../../storage/history.js";
import { publishExecutionEvidence, tables, type EvaluationHistory } from "../eval/history.js";

export function sourceExecutionEvidence(scope: ExecutionScope, record: ExecutionRecord) {
  if (!record.request.plan.operation.startsWith("source.")) throw new Error("Not a source execution request");
  const target = { companyId: scope.companyId, entityType: "issue" as const, entityId: scope.issueId };
  const identity = (kind: string) => `evidence_${evidenceDigest({ ...target, kind, artifactId: record.id })}`;
  const planId = identity("source-execution-plan"), outcomeId = identity("source-execution-result");
  const plan = { schemaVersion: 1, id: record.id, phase: "requested-plan", sourceKind: "observed", classification: "not-run",
    requestDigest: record.requestDigest, requestedAt: record.createdAt, approvalExpiresAt: record.expiresAt,
    requester: record.request.requester, plan: record.request.plan,
    notice: "Observed source/test request, not proof of human approval or execution." };
  const classification = record.state === "uncertain" ? "uncertain" : ["rejected", "expired", "stale"].includes(record.state) ? "not-run"
    : record.state === "cancelled" ? "cancelled" : typeof record.result?.classification === "string" ? record.result.classification : "execution-error";
  const outcome = { schemaVersion: 1, id: record.id, phase: "execution-outcome", sourceKind: "observed", classification,
    executionState: record.state, requestDigest: record.requestDigest, planEvidence: { id: planId, digest: evidenceDigest(plan) },
    requestedAt: record.createdAt, finishedAt: record.finishedAt, requester: record.request.requester,
    approval: { interactionId: record.interactionId, approvedBy: record.approvedBy }, diagnostic: record.diagnostic,
    native: record.result, abilityReceipt: executionAbilityReceipt(scope, record),
    notice: "Observed native process status/output on frozen inputs, not an independent test-count or full-project verification claim. The portable contract identifies the Paperclip source adapter. Uncertainty never implies rollback." };
  return { target, planId, outcomeId, plan, outcome, inputDigest: record.request.plan.inputDigest, definitionDigest: record.request.plan.definitionDigest };
}
export async function publishSourceExecution(ctx: PluginContext, scope: ExecutionScope, record: ExecutionRecord) {
  return publishExecutionEvidence(ctx, scope, record, sourceExecutionEvidence(scope, record), "source-execution");
}
export async function reconcileSourceExecutionHistory(ctx: PluginContext, scope: ExecutionScope) {
  const { executions } = tables(ctx);
  try {
    const pending = await ctx.db.query<{ id: string }>(`SELECT id FROM ${executions} WHERE company_id = $1 AND issue_id = $2 AND history_published_at IS NULL
      AND state NOT IN ('preparing', 'pending', 'running', 'cancel_requested') AND request->'plan'->>'operation' IN ('source.run', 'source.test', 'source.fixtures') ORDER BY created_at DESC, id DESC LIMIT 5`, [scope.companyId, scope.issueId]);
    const results: EvaluationHistory[] = [];
    for (const item of pending.slice(0, 4)) {
      const record = await executionLedger(ctx).read(scope, item.id);
      if (record) results.push(await publishSourceExecution(ctx, scope, record));
    }
    return { pending: pending.length > 4 || results.some(result => result.status === "pending"), processed: results.length };
  } catch { return { pending: true, processed: 0 }; }
}
