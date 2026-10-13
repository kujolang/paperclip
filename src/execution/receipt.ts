import { validateAbilityReceipt } from "../../bundled/ability-contract/index.js";
import type { ExecutionRecord, ExecutionScope } from "./contracts.js";
import { evidenceDigest } from "../storage/history.js";

const active = new Set(["preparing", "pending", "running", "cancel_requested"]);
/** V1 is a pure serialization of the immutable admitted request and outcome.
 * Timing measures the durable request lifecycle, including approval/queue wait;
 * it does not claim a process start timestamp. Never consult the current catalog. */
export function executionAbilityReceipt(scope: ExecutionScope, record: ExecutionRecord) {
  const evaluation = record.request.plan.operation === "eval.run";
  const creation = record.request.plan.operation === "starter.create";
  const workflow = record.request.plan.operation.startsWith("dispatch.");
  const binding = record.request.plan.abilityReceipt;
  if (!binding || active.has(record.state)) return null;
  const started = Date.parse(record.createdAt), completed = Date.parse(record.finishedAt ?? "");
  const status = record.state === "uncertain" ? "failed" : record.state === "cancelled" ? "cancelled"
    : ["expired", "rejected", "stale"].includes(record.state) ? "rejected"
      : record.diagnostic === "KUJO_EXEC_TIMEOUT" ? "timed_out" : record.state === "succeeded" ? "succeeded" : "failed";
  const key = evidenceDigest({ ...scope, id: record.id });
  const receipt = {
    schema: "kujo.ability.receipt/v1", receipt_id: `ability_receipt_${key}`, invocation_id: record.id,
    ability_id: binding.abilityId, ability_version: binding.abilityVersion, definition_digest: binding.definitionDigest,
    handler_id: workflow ? "kujo.paperclip.workflow.host" : evaluation ? "kujo.paperclip.eval.host" : creation ? "kujo.paperclip.starter.host" : "kujo.paperclip.source.host", handler_version: binding.handlerVersion, status,
    result: record.result,
    error: status === "succeeded" ? null : {
      code: record.state === "uncertain" ? "execution_outcome_uncertain" : `${workflow ? "workflow" : evaluation ? "evaluation" : creation ? "starter" : "source"}_${record.state}`,
      message: record.state === "uncertain" ? "Outcome is uncertain; reconcile effects before requesting another run." : workflow ? "Workflow control operation did not complete successfully; inspect native state without replaying effects." : evaluation ? "Evaluation request did not complete successfully; inspect its execution state and native result." : creation ? "Starter creation did not complete; inspect retained files before any new request." : "Source/test request did not complete successfully; inspect the execution state and native output.",
      details: { execution_state: record.state, diagnostic: record.diagnostic },
    },
    policy_decision: {
      schema: "kujo.ability.policy-decision/v1", decision_id: `policy_${record.requestDigest}`, outcome: "approval_required",
      reason: "Host company/profile admission requires a matching human-only confirmation before execution.",
      requirements: ["paperclip.human-only-confirmation"], policy_id: workflow ? "kujo.paperclip.workflow.admission" : evaluation ? "kujo.paperclip.eval.admission" : creation ? "kujo.paperclip.starter.admission" : "kujo.paperclip.source.admission", policy_version: "1.0.0",
    },
    approval_id: record.approvedBy ? record.interactionId ?? "" : "",
    idempotency: { mode: "keyed", state: record.state === "uncertain" ? "reconciliation_required" : "completed",
      request_digest: record.requestDigest, replay_authority: "paperclip.execution-ledger", automatic_retry: false },
    request_id: record.id, trace_id: record.request.requester.runId ?? record.id, surface: "paperclip.issue",
    principal: { type: record.request.requester.kind, id: record.request.requester.id, tenant_id: scope.companyId, claims: {} },
    started_at_ms: started, completed_at_ms: completed, duration_ms: completed - started,
    audit: { source: "paperclip.execution-ledger", record_id: record.id,
      notice: "Derived from the durable host request/outcome, not a claim of an external audit sink or canonical runtime approval store." },
    metadata: {
      serializer_version: binding.serializerVersion, company_id: scope.companyId, issue_id: scope.issueId,
      project_id: record.request.plan.projectId, workspace_id: record.request.plan.workspaceId,
      execution_state: record.state, ...(evaluation ? { evaluation_classification: record.result?.classification ?? null } : creation ? { operation: record.request.plan.operation, publication_classification: record.result?.classification ?? null } : { operation: record.request.plan.operation, process_classification: record.result?.classification ?? null }),
      timing_basis: "durable-request-lifecycle-including-approval-wait", process_duration_measured: false,
      input_digest: record.request.plan.inputDigest, suite_digest: record.request.plan.definitionDigest,
      component_digest: record.request.plan.componentDigest, runtime_digest: record.request.plan.runtimeDigest,
      policy_digest: record.request.plan.policyDigest, approved_by: record.approvedBy,
      notice: "Canonical receipt contract, produced by the Paperclip host adapter. Status does not replace native check classification or establish complete workspace coverage. Approval is host-owned, not a portable permission grant. Uncertainty never implies effects were rolled back.",
    },
  };
  const validation = validateAbilityReceipt(receipt);
  if (!validation.ok) throw new Error(`Invalid host Ability receipt: ${validation.code}`);
  return receipt;
}
