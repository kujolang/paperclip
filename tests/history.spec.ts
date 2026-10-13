import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createTestHarness, testDatabase } from "./helpers/harness.js";
import plugin from "../src/worker.js";
import manifest from "../src/manifest.js";
import { appendEvidence, clearHistory, compareEvidence, EVIDENCE_NAMESPACE, evidenceDigest, exportEvidence, getEvidence, listEvidence } from "../src/storage/history.js";
import { loadArtifact, saveArtifact } from "../src/storage/state.js";
import { languageReportSchema } from "../src/features/language/schema.js";

const target = { companyId: "company", entityType: "project" as const, entityId: "project" };
const pack = (id: string, check: "passed" | "failed" = "passed") => ({ schemaVersion: 1, id, generatedAt: "2026-10-12T00:00:00Z", projectId: "project", workspaceId: "workspace", path: "src/main.kujo", sourceDigest: "a".repeat(64), runtimeVersion: "1.8.1", check, lint: "passed", diagnostics: [], stale: false,
  snapshot: { gitRoot: "/private/project", branch: "main", head: "abc", fingerprint: "abc", dirty: false },
  scope: "Single-file lex/parse/compile and lint; project tests, imports and runtime behavior are not verified." });
beforeAll(async () => { await testDatabase(); }, 30_000);

describe("durable evidence", () => {
  it("uses the actual host-derived namespace and repeatable migration", async () => {
    const expected = `plugin_kujo_evidence_${createHash("sha256").update(manifest.id).digest("hex").slice(0, 10)}`;
    expect(EVIDENCE_NAMESPACE).toBe(expected);
    await (await testDatabase()).exec(await readFile(new URL("../migrations/001_evidence.sql", import.meta.url), "utf8"));
  });

  it("keeps records after a new worker context and rejects changed content under one identity", async () => {
    const first = createTestHarness({ manifest });
    await appendEvidence(first.ctx, target, "language-latest", pack("one"), { inputs: { path: "src/main.kujo" } });
    await appendEvidence(first.ctx, target, "language-latest", pack("one"), { inputs: { path: "src/main.kujo" } });
    const restarted = createTestHarness({ manifest });
    const records = await listEvidence(restarted.ctx, target);
    expect(records).toHaveLength(1);
    expect(records[0]?.inputDigest).toBe(evidenceDigest({ path: "src/main.kujo" }));
    await expect(appendEvidence(restarted.ctx, target, "language-latest", pack("one", "failed"))).rejects.toThrow("Immutable evidence");
    expect((await getEvidence(restarted.ctx, target, records[0]!.id))?.payload.check).toBe("passed");
  });

  it("isolates companies and entities even when their artifact IDs collide", async () => {
    const { ctx } = createTestHarness({ manifest });
    await appendEvidence(ctx, target, "language-latest", pack("same"));
    const other = { ...target, companyId: "other" };
    await appendEvidence(ctx, other, "language-latest", pack("same", "failed"));
    const [own] = await listEvidence(ctx, target);
    expect(await getEvidence(ctx, other, own!.id)).toBeNull();
    expect(await getEvidence(ctx, { ...target, entityId: "elsewhere" }, own!.id)).toBeNull();
    await clearHistory(ctx, target);
    expect(await listEvidence(ctx, target)).toHaveLength(0);
    expect(await listEvidence(ctx, other)).toHaveLength(1);
  });

  it("bounds concurrent appends and removes expired records", async () => {
    const { ctx } = createTestHarness({ manifest });
    await Promise.all(Array.from({ length: 30 }, (_, index) => appendEvidence(ctx, target, "language-latest", pack(`item-${index}`))));
    const recent = await listEvidence(ctx, target);
    expect(recent).toHaveLength(20);
    expect(new Set(recent.map((item) => item.id)).size).toBe(20);
    await (await testDatabase()).query(`UPDATE ${EVIDENCE_NAMESPACE}.artifacts SET stored_at = clock_timestamp() - interval '31 days' WHERE id = $1`, [recent[0]!.id]);
    expect(await getEvidence(ctx, target, recent[0]!.id)).toBeNull();
    expect(await listEvidence(ctx, target)).toHaveLength(19);
  });

  it("migrates legacy latest records once, without inventing input or definition receipts", async () => {
    const { ctx } = createTestHarness({ manifest });
    const key = { scopeKind: "project" as const, scopeId: "project", namespace: "kujo-artifacts:company", stateKey: "language-latest" };
    await ctx.state.set(key, pack("legacy"));
    expect((await loadArtifact(ctx, target, "language-latest", languageReportSchema))?.id).toBe("legacy");
    const rows = await listEvidence(ctx, target);
    expect(rows[0]).toMatchObject({ sourceKind: "legacy", inputDigest: null, definitionDigest: null });
    expect(await ctx.state.get(key)).toBeNull();
    await clearHistory(ctx, target);
    expect(await loadArtifact(ctx, target, "language-latest", languageReportSchema)).toBeNull();
  });

  it("provides integrity-checked redacted exports and truthful comparisons", async () => {
    const { ctx } = createTestHarness({ manifest });
    await saveArtifact(ctx, target, "language-latest", pack("before"), { inputs: { path: "src/main.kujo" } });
    await saveArtifact(ctx, target, "language-latest", pack("after", "failed"), { inputs: { path: "src/main.kujo" } });
    const rows = await listEvidence(ctx, target);
    const before = await getEvidence(ctx, target, rows[1]!.id), after = await getEvidence(ctx, target, rows[0]!.id);
    const comparison = compareEvidence(before, after);
    expect(comparison.samePayload).toBe(false); expect(comparison.sameInputs).toBe(true);
    expect(comparison.left.summary.check).toBe("passed"); expect(comparison.right.summary.check).toBe("failed");
    const exported = exportEvidence(before!);
    expect(JSON.stringify(exported)).not.toContain("/private/project");
    expect(exported.exportDigest).not.toBe(exported.receipt.digest);
    await (await testDatabase()).query(`UPDATE ${EVIDENCE_NAMESPACE}.artifacts SET payload = '{}'::jsonb WHERE id = $1`, [rows[0]!.id]);
    await expect(getEvidence(ctx, target, rows[0]!.id)).rejects.toThrow("integrity");
  });
});


describe("evidence host bridge", () => {
  it("binds reads to the host company and honors disabled features", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    await saveArtifact(harness.ctx, target, "language-latest", pack("bridge"));
    const [record] = await listEvidence(harness.ctx, target);
    const params = { entityType: target.entityType, entityId: target.entityId, evidenceId: record!.id, companyId: "company" };
    await expect(harness.performAction("inspect-evidence", params, { companyId: "other" })).rejects.toThrow("unavailable");
    const exported = await harness.performAction("inspect-evidence", params, { companyId: "company" });
    expect(JSON.stringify(exported)).not.toContain("/private/project");
    const disabled = createTestHarness({ manifest, config: { features: { language: false } } });
    await plugin.definition.setup(disabled.ctx);
    await expect(disabled.performAction("export-evidence", params, { companyId: "company" })).rejects.toThrow("disabled");
  });

  it("bounds agent evidence reads and derives project/run scope from host context", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    await saveArtifact(harness.ctx, target, "language-latest", pack("tool"));
    const runCtx = { companyId: "company", projectId: "project", runId: "run" };
    const listed = await harness.executeTool("list-evidence", {}, runCtx);
    const id = JSON.parse(listed.content!).records[0].id;
    const read = await harness.executeTool("get-evidence", { evidenceId: id }, runCtx);
    expect(read.error).toBeUndefined(); expect(read.content).not.toContain("/private/project");
    expect((await harness.executeTool("get-evidence", { evidenceId: id, scope: "run" }, runCtx)).error).toContain("unavailable");
    expect((await harness.executeTool("list-evidence", { companyId: "other" }, runCtx)).error).toBeTruthy();
    await appendEvidence(harness.ctx, target, "language-latest", { ...pack("large"), notes: "x".repeat(70_000) });
    const [large] = await listEvidence(harness.ctx, target);
    expect((await harness.executeTool("get-evidence", { evidenceId: large!.id }, runCtx)).error).toContain("64 KiB");
  });

  it("rejects agent attachment even when caller parameters claim a human", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    const params = { entityType: "issue", entityId: "issue", evidenceId: "missing" };
    await expect(harness.performAction("attach-evidence", params, { companyId: "company", actor: { type: "agent", agentId: "agent", companyId: "company" } })).rejects.toThrow("authenticated human");
    await expect(harness.performAction("attach-evidence", { ...params, actor: { type: "user" } }, { companyId: "company" })).rejects.toThrow();
  });

  it("attaches a bounded redacted receipt only to its own issue after a human action", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    const issueTarget = { ...target, entityType: "issue" as const, entityId: "issue" };
    await saveArtifact(harness.ctx, issueTarget, "language-latest", pack("issue-evidence"));
    const [record] = await listEvidence(harness.ctx, issueTarget);
    let attached: unknown;
    harness.ctx.issues.get = async () => ({ id: "issue", companyId: "company" }) as Awaited<ReturnType<typeof harness.ctx.issues.get>>;
    harness.ctx.issues.documents.upsert = async (input) => { attached = input; return { id: "document" } as Awaited<ReturnType<typeof harness.ctx.issues.documents.upsert>>; };
    const params = { entityType: "issue", entityId: "issue", evidenceId: record!.id };
    const human = { companyId: "company", actor: { type: "user" as const, userId: "human", companyId: "company" } };
    expect(await harness.performAction("attach-evidence", params, human)).toEqual({ status: "attached", documentId: "document" });
    expect(attached).toMatchObject({ issueId: "issue", companyId: "company", format: "markdown" });
    expect(JSON.stringify(attached)).toContain(record!.digest);
    expect(JSON.stringify(attached)).not.toContain("/private/project");
    await expect(harness.performAction("attach-evidence", { ...params, entityId: "other-issue" }, human)).rejects.toThrow("unavailable");
  });
});
