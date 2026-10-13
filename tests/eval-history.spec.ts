import { describe, expect, it } from "vitest";
import { createTestHarness, testDatabase } from "./helpers/harness.js";
import manifest from "../src/manifest.js";
import { executionLedger } from "../src/execution/ledger.js";
import type { ExecutionRequest, ExecutionState } from "../src/execution/contracts.js";
import { clearHistory, compareEvidence, evidenceDigest, EVIDENCE_NAMESPACE, getEvidence, listEvidence } from "../src/storage/history.js";
import { evaluationEvidence, publishEvaluation, reconcileEvaluationHistory } from "../src/features/eval/history.js";

const scope = { companyId: "company", issueId: "issue" };
const target = { companyId: "company", entityType: "issue" as const, entityId: "issue" };
const digest = evidenceDigest({ fixture: true });
const request: ExecutionRequest = { requester: { kind: "agent", id: "agent", runId: "run" }, plan: {
  operation: "eval.run", suite: "eval.json", summary: "History fixture", projectId: "project", workspaceId: "workspace", effects: ["read_workspace", "write_reports", "execute_project", "network"],
  inputDigest: digest, workspaceDigest: digest, definitionDigest: digest, componentDigest: digest, runtimeDigest: digest, policyDigest: digest, timeoutMs: 1000,
} };
async function fixture(id = "execution", state: ExecutionState = "succeeded") {
  const h = createTestHarness({ manifest }); const ledger = executionLedger(h.ctx);
  await ledger.insert(scope, id, request);
  await (await testDatabase()).query(`UPDATE ${EVIDENCE_NAMESPACE}.executions SET state = $2, finished_at = clock_timestamp(), approved_by = 'human', interaction_id = 'card', result = $3::jsonb WHERE id = $1`,
    [id, state, JSON.stringify({ sourceKind: "native", classification: state === "failed" ? "failed" : "passed", result: { checks: { passed: 1, failed: state === "failed" ? 1 : 0 } } })]);
  return { h, ledger, record: (await ledger.read(scope, id))! };
}
describe("Eval Evidence history publication", () => {
  it("atomically links immutable requested-plan and native-outcome records under the issue", async () => {
    const f = await fixture();
    const outputs = await Promise.all(Array.from({ length: 4 }, () => publishEvaluation(f.h.ctx, scope, f.record)));
    expect(outputs.every(item => item.status === "retained")).toBe(true);
    const rows = await listEvidence(f.h.ctx, target); expect(rows).toHaveLength(2);
    const parent = rows.find(row => row.kind === "evaluation-plan")!, child = rows.find(row => row.kind === "evaluation-result")!;
    expect(parent).toMatchObject({ sourceKind: "observed", result: "requested evaluation; not run", inputDigest: digest, definitionDigest: digest });
    expect(child).toMatchObject({ sourceKind: "observed", parentId: parent.id, result: "evaluation passed · execution succeeded" });
    const record = (await getEvidence(f.h.ctx, target, child.id))!;
    expect(record.payload).toMatchObject({ phase: "execution-outcome", requestDigest: f.record.requestDigest, planEvidence: { id: parent.id, digest: parent.digest }, approval: { approvedBy: "human" } });
    expect(JSON.stringify(record.payload)).not.toContain("ownerId"); expect(JSON.stringify(record.payload)).not.toContain("claimId");
    expect(await getEvidence(f.h.ctx, { ...target, companyId: "other" }, child.id)).toBeNull();
    expect(await publishEvaluation(f.h.ctx, scope, f.record)).toEqual(outputs[0]);
  });
  it("recovers an inserted pair after a lost response without duplicate records or execution", async () => {
    const f = await fixture(); const execute = f.h.ctx.db.execute; let lost = false;
    f.h.ctx.db.execute = async (sql, args) => { const result = await execute(sql, args); if (!lost && sql.startsWith("INSERT INTO") && sql.includes("evaluation-plan")) { lost = true; throw new Error("lost response"); } return result; };
    expect((await publishEvaluation(f.h.ctx, scope, f.record)).status).toBe("pending");
    expect(await listEvidence(f.h.ctx, target)).toHaveLength(2);
    f.h.ctx.db.execute = execute;
    expect((await publishEvaluation(f.h.ctx, scope, f.record)).status).toBe("retained");
    expect(await listEvidence(f.h.ctx, target)).toHaveLength(2);
    expect(await f.ledger.read(scope, f.record.id)).toEqual(f.record);
  });
  it("does not acknowledge conflicting immutable evidence or rewrite it", async () => {
    const f = await fixture(); const execute = f.h.ctx.db.execute;
    f.h.ctx.db.execute = async (sql, args) => { if (sql.startsWith("UPDATE") && sql.includes("history_published_at =")) throw new Error("ack unavailable"); return await execute(sql, args); };
    expect((await publishEvaluation(f.h.ctx, scope, f.record)).status).toBe("pending");
    const { outcomeId } = evaluationEvidence(scope, f.record);
    await (await testDatabase()).query(`UPDATE ${EVIDENCE_NAMESPACE}.artifacts SET digest = $2 WHERE id = $1`, [outcomeId, "b".repeat(64)]);
    f.h.ctx.db.execute = execute;
    expect((await publishEvaluation(f.h.ctx, scope, f.record)).status).toBe("pending");
    const row = await (await testDatabase()).query(`SELECT history_published_at FROM ${EVIDENCE_NAMESPACE}.executions WHERE id = $1`, [f.record.id]);
    expect(row.rows[0]).toEqual({ history_published_at: null });
  });
  it("preserves an explicit clear even when the publication response or acknowledgment was lost", async () => {
    const f = await fixture(); const execute = f.h.ctx.db.execute;
    f.h.ctx.db.execute = async (sql, args) => { if (sql.startsWith("UPDATE") && sql.includes("history_published_at =")) throw new Error("ack unavailable"); return await execute(sql, args); };
    expect((await publishEvaluation(f.h.ctx, scope, f.record)).status).toBe("pending");
    f.h.ctx.db.execute = execute;
    await clearHistory(f.h.ctx, target);
    expect((await publishEvaluation(f.h.ctx, scope, f.record)).status).toBe("not-retained");
    expect(await listEvidence(f.h.ctx, target)).toEqual([]);
    expect((await reconcileEvaluationHistory(f.h.ctx, scope)).processed).toBe(0);
  });
  it("serializes a late publication with clear and does not resurrect the pair", async () => {
    const f = await fixture(); const execute = f.h.ctx.db.execute;
    let release!: () => void, reached!: () => void;
    const entered = new Promise<void>(resolve => { reached = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    f.h.ctx.db.execute = async (sql, args) => { if (sql.startsWith("INSERT INTO") && sql.includes("evaluation-plan")) { reached(); await gate; } return await execute(sql, args); };
    const publishing = publishEvaluation(f.h.ctx, scope, f.record); await entered;
    await clearHistory(f.h.ctx, target); release();
    expect((await publishing).status).toBe("not-retained");
    expect(await listEvidence(f.h.ctx, target)).toEqual([]);
  });
  it("reconciles in bounded batches and does not restore records after retention pruning", async () => {
    for (let index = 0; index < 11; index++) await fixture(`batch-${index}`);
    const h = createTestHarness({ manifest });
    expect(await reconcileEvaluationHistory(h.ctx, scope)).toEqual({ pending: true, processed: 4 });
    expect(await reconcileEvaluationHistory(h.ctx, scope)).toEqual({ pending: true, processed: 4 });
    expect(await reconcileEvaluationHistory(h.ctx, scope)).toEqual({ pending: false, processed: 3 });
    expect(await listEvidence(h.ctx, target)).toHaveLength(20);
    expect(await reconcileEvaluationHistory(h.ctx, scope)).toEqual({ pending: false, processed: 0 });
    await (await testDatabase()).query(`UPDATE ${EVIDENCE_NAMESPACE}.artifacts SET stored_at = clock_timestamp() - interval '31 days'`);
    expect(await listEvidence(h.ctx, target)).toEqual([]);
    const record = (await executionLedger(h.ctx).read(scope, "batch-0"))!;
    expect((await publishEvaluation(h.ctx, scope, record)).status).toBe("not-retained");
  });
  it("keeps not-run, cancelled, failed and uncertain outcomes distinct and compares native checks", async () => {
    const records = [];
    for (const state of ["expired", "stale", "cancelled", "failed", "uncertain"] as const) {
      const f = await fixture(state, state); const history = await publishEvaluation(f.h.ctx, scope, f.record);
      const record = (await getEvidence(f.h.ctx, target, history.outcomeId!))!; records.push(record);
      expect(record.payload.classification).toBe(state === "expired" || state === "stale" ? "not-run" : state);
      expect(record.receipt.sourceKind).toBe("observed");
    }
    expect(compareEvidence(records[3]!, records[4]!).left.summary).toMatchObject({ executionState: "failed", nativeChecks: { failed: 1 } });
  });
});
