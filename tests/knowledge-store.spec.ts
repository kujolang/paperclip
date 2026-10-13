import { describe, expect, it, vi } from "vitest";
import manifest from "../src/manifest.js";
import { parsePluginConfig } from "../src/config/schema.js";
import { createTestHarness, testDatabase } from "./helpers/harness.js";
import { ingestKnowledge, knowledgeNamespace } from "../src/features/knowledge/native.js";
import { deleteKnowledge, readKnowledge, replaceKnowledge, knowledgeSummary, listKnowledge } from "../src/features/knowledge/store.js";
import { EVIDENCE_NAMESPACE, listEvidence } from "../src/storage/history.js";
const scope = { companyId: "company", projectId: "project", workspaceId: "workspace" };
const harness = () => createTestHarness({ manifest }).ctx;
const fixture = () => ingestKnowledge({ namespace: knowledgeNamespace(scope.companyId, scope.projectId, scope.workspaceId), files: [{ path: "readme.md", content: "# Fixture\nKujo runs local programs.\n" }], config: parsePluginConfig({}) });

describe("private knowledge storage", () => {
  it("retains private indexes across worker contexts without exporting them as evidence", async () => {
    const retained = await fixture(), ctx = harness();
    const query = ctx.db.query.bind(ctx.db);
    vi.spyOn(ctx.db, "query").mockImplementation((sql, parameters) => {
      if (!/^\s*SELECT\b/i.test(sql)) throw new Error("Host query API accepts only SELECT");
      return query(sql, parameters);
    });
    const stored = await replaceKnowledge(ctx, scope, null, retained);
    const restarted = harness();
    expect(await readKnowledge(restarted, scope)).toEqual(stored);
    expect(knowledgeSummary(stored)).not.toHaveProperty("index");
    expect(await listKnowledge(ctx, scope)).toEqual([{ workspaceId: scope.workspaceId, revision: stored.revision, storedAt: stored.storedAt, expiresAt: stored.expiresAt }]);
    expect(await listKnowledge(ctx, { ...scope, companyId: "other" })).toEqual([]);
    expect(await listEvidence(ctx, { companyId: scope.companyId, entityType: "project", entityId: scope.projectId })).toEqual([]);
    for (const other of [{ ...scope, companyId: "other" }, { ...scope, projectId: "other" }, { ...scope, workspaceId: "other" }]) {
      expect(await readKnowledge(ctx, other)).toBeNull();
      expect(await deleteKnowledge(ctx, other, stored.revision)).toBe(false);
      await expect(replaceKnowledge(ctx, other, null, retained)).rejects.toThrow("identity or integrity");
    }
    await (await testDatabase()).query(`UPDATE ${EVIDENCE_NAMESPACE}.knowledge_indexes SET digest = $1`, ["0".repeat(64)]);
    await expect(readKnowledge(ctx, scope)).rejects.toThrow("integrity");
  }, 60_000);

  it("allows one concurrent replacement and rejects stale writers after delete/recreate", async () => {
    const ctx = harness(), retained = await fixture();
    const first = await replaceKnowledge(ctx, scope, null, retained);
    const raced = await Promise.allSettled([replaceKnowledge(ctx, scope, first.revision, retained), replaceKnowledge(ctx, scope, first.revision, retained)]);
    expect(raced.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const current = (await readKnowledge(ctx, scope))!;
    expect(await deleteKnowledge(ctx, scope, first.revision)).toBe(false);
    expect(await deleteKnowledge(ctx, scope, current.revision)).toBe(true);
    const recreated = await replaceKnowledge(ctx, scope, null, retained);
    await expect(replaceKnowledge(ctx, scope, current.revision, retained)).rejects.toThrow("changed or expired");
    expect((await readKnowledge(ctx, scope))?.revision).toBe(recreated.revision);
    await expect(replaceKnowledge(ctx, scope, recreated.revision, { ...retained, index: retained.index + "x" })).rejects.toThrow("integrity");
    expect((await readKnowledge(ctx, scope))?.retained).toEqual(retained);
  }, 60_000);

  it("enforces twenty company slots under competing inserts, expiry and safe reuse", async () => {
    const ctx = harness(), retained = await fixture();
    const scopes = Array.from({ length: 22 }, (_, i) => ({ ...scope, workspaceId: `workspace-${i}` }));
    const results = await Promise.allSettled(scopes.map(target => replaceKnowledge(ctx, target, null, { ...retained, namespace: knowledgeNamespace(target.companyId, target.projectId, target.workspaceId) })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(20);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(2);
    const existing = scopes[results.findIndex(result => result.status === "fulfilled")]!;
    const prior = (await readKnowledge(ctx, existing))!;
    await (await testDatabase()).query(`UPDATE ${EVIDENCE_NAMESPACE}.knowledge_indexes SET stored_at = clock_timestamp() - interval '32 days', expires_at = clock_timestamp() - interval '1 day' WHERE workspace_id = $1`, [existing.workspaceId]);
    expect(await readKnowledge(ctx, existing)).toBeNull();
    await expect(replaceKnowledge(ctx, existing, prior.revision, prior.retained)).rejects.toThrow("changed or expired");
    const next = await replaceKnowledge(ctx, existing, null, prior.retained);
    expect(next.revision).not.toBe(prior.revision);
  }, 60_000);
});
