import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { ExecutionRecord, ExecutionScope } from "../../execution/contracts.js";
import { executionLedger } from "../../execution/ledger.js";
import { canonicalJson, evidenceDigest, EVIDENCE_NAMESPACE, getEvidence, pruneHistory } from "../../storage/history.js";

import { evalAbilityReceipt } from "./receipt.js";

const active = new Set(["preparing", "pending", "running", "cancel_requested"]);
const terminalSql = "state NOT IN ('preparing', 'pending', 'running', 'cancel_requested')";
export type EvaluationHistory = { status: "not-terminal" | "retained" | "not-retained" | "pending"; planId?: string; outcomeId?: string; notice: string };
function tables(ctx: PluginContext) {
  if (ctx.db.namespace !== EVIDENCE_NAMESPACE) throw new Error("Execution history migration is unavailable");
  return { executions: `${EVIDENCE_NAMESPACE}.executions`, artifacts: `${EVIDENCE_NAMESPACE}.artifacts` };
}
// Version 1 serialization uses only immutable ledger fields; never substitute
// current tool/catalog/runtime metadata for the definition admitted by the request.
export function evaluationEvidence(scope: ExecutionScope, record: ExecutionRecord) {
  const target = { companyId: scope.companyId, entityType: "issue" as const, entityId: scope.issueId };
  const identity = (kind: string) => `evidence_${evidenceDigest({ ...target, kind, artifactId: record.id })}`;
  const planId = identity("evaluation-plan"), outcomeId = identity("evaluation-result");
  const plan = { schemaVersion: 1, id: record.id, phase: "requested-plan", sourceKind: "observed", classification: "not-run",
    requestDigest: record.requestDigest, requestedAt: record.createdAt, approvalExpiresAt: record.expiresAt,
    requester: record.request.requester, plan: record.request.plan,
    notice: "Observed request, not proof of approval or execution. Its outcome is a separate child record." };
  const classification = record.state === "uncertain" ? "uncertain" : ["rejected", "expired", "stale"].includes(record.state) ? "not-run"
    : record.state === "cancelled" ? "cancelled" : typeof record.result?.classification === "string" ? record.result.classification : "execution-error";
  const abilityReceipt = evalAbilityReceipt(scope, record);
  const outcome = { schemaVersion: abilityReceipt ? 2 : 1, id: record.id, phase: "execution-outcome", sourceKind: "observed", classification,
    executionState: record.state, requestDigest: record.requestDigest, planEvidence: { id: planId, digest: evidenceDigest(plan) },
    requestedAt: record.createdAt, finishedAt: record.finishedAt, requester: record.request.requester,
    approval: { interactionId: record.interactionId, approvedBy: record.approvedBy }, diagnostic: record.diagnostic,
    evaluation: record.result,
    ...(abilityReceipt ? { abilityReceipt } : {}),
    notice: abilityReceipt ? "Observed execution ledger outcome with a canonical-contract Ability receipt. Native classifications and uncertainty remain distinct. Parent retention is independent; this reference preserves its digest." : "Observed execution ledger outcome, not imported evidence or a canonical Ability invocation receipt. Uncertainty and external effects are not inferred away. Parent retention is independent; this reference preserves its digest." };
  return { target, planId, outcomeId, plan, outcome, inputDigest: record.request.plan.inputDigest, definitionDigest: record.request.plan.definitionDigest };
}

/** Publish a terminal request without executing code. The two immutable records
 * are inserted in one statement; a separate durable acknowledgment makes lost
 * responses retryable. Cleared/pruned acknowledged records are never recreated. */
export async function publishEvaluation(ctx: PluginContext, scope: ExecutionScope, record: ExecutionRecord): Promise<EvaluationHistory> {
  if (active.has(record.state)) return { status: "not-terminal", notice: "The outcome has not settled." };
  const { executions, artifacts } = tables(ctx);
  const value = evaluationEvidence(scope, record);
  const args = [scope.companyId, scope.issueId, record.id];
  const plan = canonicalJson(value.plan), outcome = canonicalJson(value.outcome);
  const digests = [evidenceDigest(value.plan), evidenceDigest(value.outcome)];
  try {
    // The execution-row lock serializes publication with clearHistory's marker
    // update. Runtime SQL stays one INSERT/UPDATE per host API call (no CTE DML).
    await ctx.db.execute(`INSERT INTO ${artifacts}
      (id, company_id, entity_type, entity_id, kind, artifact_id, stored_at, source_kind, result, digest, input_digest, definition_digest, parent_id, payload_bytes, payload)
      SELECT item.id, owner.company_id, 'issue', owner.issue_id, item.kind, owner.id, owner.finished_at, 'observed', item.label,
        item.digest, $12, $13, item.parent_id, octet_length(item.payload::text), item.payload::jsonb
      FROM ${executions} owner CROSS JOIN (VALUES
        ($4::text, 'evaluation-plan', 'requested evaluation; not run', $6::text, NULL::text, $8::text),
        ($5::text, 'evaluation-result', $10::text, $7::text, $4::text, $9::text)
      ) AS item(id, kind, label, digest, parent_id, payload)
      WHERE owner.company_id = $1 AND owner.issue_id = $2 AND owner.id = $3 AND owner.request_digest = $11
        AND owner.history_published_at IS NULL AND owner.finished_at IS NOT NULL AND owner.${terminalSql}
      FOR UPDATE OF owner ON CONFLICT DO NOTHING`,
    [...args, value.planId, value.outcomeId, ...digests, plan, outcome, `evaluation ${value.outcome.classification} · execution ${record.state}`, record.requestDigest, value.inputDigest, value.definitionDigest]);
    // A conflict can only be acknowledged when BOTH persisted payloads match.
    await ctx.db.execute(`UPDATE ${executions} SET history_published_at = clock_timestamp()
      WHERE company_id = $1 AND issue_id = $2 AND id = $3 AND history_published_at IS NULL AND ${terminalSql}
      AND EXISTS (SELECT 1 FROM ${artifacts} WHERE company_id = $1 AND entity_type = 'issue' AND entity_id = $2 AND id = $4 AND digest = $6)
      AND EXISTS (SELECT 1 FROM ${artifacts} WHERE company_id = $1 AND entity_type = 'issue' AND entity_id = $2 AND id = $5 AND digest = $7 AND parent_id = $4)`,
    [...args, value.planId, value.outcomeId, ...digests]);
    const rows = await ctx.db.query<{ published: boolean }>(`SELECT history_published_at IS NOT NULL AS published FROM ${executions} WHERE company_id = $1 AND issue_id = $2 AND id = $3`, args);
    if (!rows[0]?.published) throw new Error("Execution evidence publication did not converge");
    await pruneHistory(ctx, value.target);
    const retained = await Promise.all([getEvidence(ctx, value.target, value.planId), getEvidence(ctx, value.target, value.outcomeId)]);
    return { status: retained[1] ? "retained" : "not-retained", planId: value.planId, outcomeId: value.outcomeId,
      notice: retained[1] ? retained[0] ? "Plan and outcome retained in this issue's Evidence history." : "Outcome retained; its parent was cleared or pruned." : "History was cleared or pruned; the execution ledger remains independently available." };
  } catch {
    return { status: "pending", planId: value.planId, outcomeId: value.outcomeId,
      notice: "Execution outcome is durable, but Evidence history publication is pending. Refresh to retry publication; the evaluation will not rerun." };
  }
}

export async function reconcileEvaluationHistory(ctx: PluginContext, scope: ExecutionScope) {
  const { executions } = tables(ctx);
  try {
    const pending = await ctx.db.query<{ id: string }>(`SELECT id FROM ${executions} WHERE company_id = $1 AND issue_id = $2 AND history_published_at IS NULL AND ${terminalSql} ORDER BY created_at DESC, id DESC LIMIT 5`, [scope.companyId, scope.issueId]);
    const results: EvaluationHistory[] = [];
    for (const item of pending.slice(0, 4)) {
      const record = await executionLedger(ctx).read(scope, item.id);
      if (record) results.push(await publishEvaluation(ctx, scope, record));
    }
    return { pending: pending.length > 4 || results.some(result => result.status === "pending"), processed: results.length };
  } catch { return { pending: true, processed: 0 }; }
}
