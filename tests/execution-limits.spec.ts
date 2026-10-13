import { describe, expect, it } from "vitest";
import { createTestHarness, testDatabase } from "./helpers/harness.js";
import manifest from "../src/manifest.js";
import { executionLedger } from "../src/execution/ledger.js";
import { evidenceDigest, EVIDENCE_NAMESPACE } from "../src/storage/history.js";
import type { ExecutionRequest } from "../src/execution/contracts.js";
const digest = evidenceDigest({ fixture: true });
const request: ExecutionRequest = { requester: { kind: "human", id: "human" }, plan: {
  operation: "eval.run", suite: "eval.json", summary: "Quota fixture", projectId: "project", workspaceId: "workspace", effects: ["write_reports"],
  inputDigest: digest, workspaceDigest: digest, definitionDigest: digest, componentDigest: digest, runtimeDigest: digest, policyDigest: digest, timeoutMs: 5000,
} };
const scope = { companyId: "company", issueId: "issue" };
const ledger = () => executionLedger(createTestHarness({ manifest }).ctx);
describe("execution admission and retention", () => {
  it("enforces twenty active requests across issue/worker instances and isolates company capacity", async () => {
    const workers = [ledger(), ledger()];
    const results = await Promise.allSettled(Array.from({ length: 25 }, (_, index) => workers[index % 2]!.insert({ ...scope, issueId: `issue-${index}` }, `request-${index}`, request)));
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(20);
    expect(await workers[0]!.insert({ ...scope, companyId: "other" }, "other", request)).toBe(true);
    await workers[0]!.cancel({ ...scope, issueId: "issue-0" }, "request-0");
    expect(await workers[1]!.insert(scope, "replacement", request)).toBe(true);
  });
  it("admits at most two leased runs and releases slots after terminal completion", async () => {
    const store = ledger();
    for (let index = 0; index < 3; index++) { await store.insert(scope, `request-${index}`, request); await store.bind(scope, `request-${index}`, `card-${index}`); }
    const claims = await Promise.all(Array.from({ length: 3 }, (_, index) => store.claim(scope, `request-${index}`, `card-${index}`, "human", `owner-${index}`, `claim-${index}`, new Date().toISOString())));
    expect(claims).toEqual([true, true, false]);
    expect(await store.finish(scope, "request-0", "owner-0", "claim-0", "succeeded", {}, null)).toBe(true);
    expect(await store.claim(scope, "request-2", "card-2", "human", "owner-2", "claim-2", new Date().toISOString())).toBe(true);
  });
  it("expires abandoned approvals and uncertain leases before new admission without replay", async () => {
    const store = ledger(); await store.insert(scope, "expired", request); await store.insert(scope, "lost", request); await store.bind(scope, "lost", "card");
    await store.claim(scope, "lost", "card", "human", "owner", "claim", new Date().toISOString());
    const db = await testDatabase();
    await db.query(`UPDATE ${EVIDENCE_NAMESPACE}.executions SET expires_at = clock_timestamp() - interval '1 second' WHERE id = 'expired'`);
    await db.query(`UPDATE ${EVIDENCE_NAMESPACE}.executions SET lease_until = clock_timestamp() - interval '1 second' WHERE id = 'lost'`);
    await store.insert(scope, "next", request);
    expect((await store.read(scope, "expired"))?.state).toBe("expired");
    expect((await store.read(scope, "lost"))?.state).toBe("uncertain");
    expect(await store.claim(scope, "lost", "card", "human", "other", "other", new Date().toISOString())).toBe(false);
  });
  it("bounds terminal history by count and age without pruning active or other-company requests", async () => {
    const store = ledger(); const db = await testDatabase();
    await store.insert(scope, "seed", request); await store.cancel(scope, "seed");
    await db.query(`INSERT INTO ${EVIDENCE_NAMESPACE}.executions (id, company_id, issue_id, request_digest, request, state, finished_at, created_at)
      SELECT 'terminal-' || n, company_id, issue_id, request_digest, request, state, clock_timestamp(), clock_timestamp() + n * interval '1 millisecond'
      FROM ${EVIDENCE_NAMESPACE}.executions CROSS JOIN generate_series(1, 110) n WHERE id = 'seed'`);
    await store.insert({ ...scope, companyId: "other" }, "other-active", request);
    await store.insert(scope, "active", request);
    expect((await store.list(scope)).length).toBe(100);
    expect((await store.read(scope, "active"))?.state).toBe("preparing");
    expect((await store.read({ ...scope, companyId: "other" }, "other-active"))?.state).toBe("preparing");
    const terminal = await db.query(`SELECT count(*)::int AS count FROM ${EVIDENCE_NAMESPACE}.executions WHERE company_id = 'company' AND state = 'cancelled'`);
    expect(terminal.rows).toEqual([{ count: 100 }]);
    await db.query(`UPDATE ${EVIDENCE_NAMESPACE}.executions SET finished_at = clock_timestamp() - interval '31 days' WHERE state = 'cancelled'`);
    await store.maintain(scope.companyId);
    expect((await store.list(scope)).map(item => item.id)).toEqual(["active"]);
  });
  it("does not evict legacy active requests without admission slots", async () => {
    const store = ledger(); await store.insert(scope, "legacy", request);
    await (await testDatabase()).query(`UPDATE ${EVIDENCE_NAMESPACE}.executions SET request_slot = NULL WHERE id = 'legacy'`);
    await expect(store.insert(scope, "new", request)).rejects.toThrow(/capacity/);
    expect((await store.read(scope, "legacy"))?.state).toBe("preparing");
    await store.cancel(scope, "legacy"); expect(await store.insert(scope, "new", request)).toBe(true);
  });
});
