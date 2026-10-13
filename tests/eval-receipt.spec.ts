import { describe, expect, it } from "vitest";
import { validateAbilityReceipt } from "../bundled/ability-contract/index.js";
import { canonicalDefinitions } from "../src/abilities/generated.js";
import { evalAbilityReceipt } from "../src/features/eval/receipt.js";
import { evaluationEvidence } from "../src/features/eval/history.js";
import { executionRecordSchema, type ExecutionState } from "../src/execution/contracts.js";

const scope = { companyId: "company", issueId: "issue" };
const definition = canonicalDefinitions.find(item => item.definition.id === "kujo.eval.suite.run")!;
function record(state: ExecutionState = "succeeded") {
  return executionRecordSchema.parse({ id: "execution_fixture", requestDigest: "a".repeat(64), state,
    request: { requester: { kind: "agent", id: "agent", runId: "run" }, plan: {
      operation: "eval.run", projectId: "project", workspaceId: "workspace", suite: "eval.json", summary: "Fixture", effects: ["read_workspace"], timeoutMs: 1000,
      inputDigest: "b".repeat(64), workspaceDigest: "c".repeat(64), definitionDigest: "d".repeat(64), componentDigest: "e".repeat(64), runtimeDigest: "f".repeat(64), policyDigest: "0".repeat(64),
      abilityReceipt: { serializerVersion: 1, abilityId: definition.definition.id, abilityVersion: definition.definition.version, definitionDigest: definition.definitionDigest, handlerVersion: "1.0.0" },
    } }, interactionId: "card", approvedBy: "board", ownerId: "private-owner", claimId: "private-claim",
    createdAt: "2026-10-13 10:00:00.123456+00", finishedAt: "2026-10-13 10:01:00.456789+00", expiresAt: "2026-10-13 10:15:00+00", leaseUntil: null,
    result: { classification: "partial", nativeClassification: "passed", result: { checks: { passed: 1, skipped: 1 } } }, diagnostic: null,
  });
}
describe("canonical-contract host Eval receipts", () => {
  it("uses frozen canonical identity, host principal, durable timing and preserves partial native evidence", () => {
    const request = record(); const receipt = evalAbilityReceipt(scope, request)!;
    expect(validateAbilityReceipt(receipt).ok).toBe(true);
    expect(receipt).toMatchObject({ status: "succeeded", ability_id: definition.definition.id, definition_digest: definition.definitionDigest,
      duration_ms: 60333, principal: { id: "agent", tenant_id: "company", type: "agent" }, trace_id: "run",
      result: { classification: "partial", nativeClassification: "passed" }, metadata: { timing_basis: "durable-request-lifecycle-including-approval-wait", process_duration_measured: false, suite_digest: "d".repeat(64) } });
    expect(JSON.stringify(receipt)).not.toMatch(/private-owner|private-claim/);
    expect(evalAbilityReceipt(scope, request)).toEqual(receipt);
    request.request.plan.abilityReceipt!.abilityVersion = "9.9.9";
    request.request.plan.abilityReceipt!.definitionDigest = "9".repeat(64);
    expect(evalAbilityReceipt(scope, request)).toMatchObject({ ability_version: "9.9.9", definition_digest: "9".repeat(64) });
    expect(evalAbilityReceipt({ ...scope, companyId: "other" }, request)!.receipt_id).not.toBe(receipt.receipt_id);
  });
  it.each(["rejected", "expired", "stale", "cancelled", "failed", "uncertain"] as const)("preserves %s without granting approval or erasing uncertainty", state => {
    const request = record(state); request.approvedBy = null; request.result = null;
    const receipt = evalAbilityReceipt(scope, request)!;
    expect(validateAbilityReceipt(receipt).ok).toBe(true);
    expect(receipt.approval_id).toBe("");
    expect(receipt.metadata.execution_state).toBe(state);
    expect(receipt.status).toBe(["expired", "stale", "rejected"].includes(state) ? "rejected" : state === "cancelled" ? "cancelled" : "failed");
    if (state === "uncertain") {
      expect(receipt.error?.code).toBe("execution_outcome_uncertain");
      expect(receipt.idempotency).toMatchObject({ state: "reconciliation_required", automatic_retry: false });
    }
  });
  it("retains observed timeout and native failed-check details", () => {
    const request = record("failed"); request.diagnostic = "KUJO_EXEC_TIMEOUT";
    expect(evalAbilityReceipt(scope, request)).toMatchObject({ status: "timed_out", error: { details: { diagnostic: "KUJO_EXEC_TIMEOUT" } } });
    request.diagnostic = null; request.result = { classification: "failed", result: { checks: { failed: 2 } } };
    expect(evalAbilityReceipt(scope, request)).toMatchObject({ status: "failed", result: { result: { checks: { failed: 2 } } } });
  });
  it("does not fabricate receipts for legacy requests, active requests or invalid clocks", () => {
    const request = record(); delete request.request.plan.abilityReceipt;
    expect(evalAbilityReceipt(scope, request)).toBeNull();
    const legacy = evaluationEvidence(scope, request).outcome;
    expect(legacy.schemaVersion).toBe(1); expect(legacy).not.toHaveProperty("abilityReceipt");
    for (const state of ["preparing", "pending", "running", "cancel_requested"] as const) expect(evalAbilityReceipt(scope, record(state))).toBeNull();
    const invalid = record(); invalid.finishedAt = "2020-01-01T00:00:00Z";
    expect(() => evalAbilityReceipt(scope, invalid)).toThrow(/timing/);
  });
  it("embeds a stable canonical receipt in the linked v2 outcome while retaining the parent's digest", () => {
    const request = record(); const evidence = evaluationEvidence(scope, request);
    expect(evidence.outcome).toMatchObject({ schemaVersion: 2, planEvidence: { id: evidence.planId }, abilityReceipt: evalAbilityReceipt(scope, request) });
    expect(evidence.plan.schemaVersion).toBe(1);
    expect(evidence.outcome.abilityReceipt?.metadata.input_digest).toBe(evidence.inputDigest);
  });
});
