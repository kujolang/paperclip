import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { importVerification } from "../src/features/verification/import.js";
import { createTestHarness, testDatabase } from "./helpers/harness.js";
import { getEvidence, listEvidence } from "../src/storage/history.js";
import { capabilityCatalog } from "../src/abilities/catalog.js";
import { parsePluginConfig } from "../src/config/schema.js";
import { doctor } from "../src/health/doctor.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

const fixture = JSON.parse(readFileSync(new URL("../bundled/verification-contract/evaluation-result.example.json", import.meta.url), "utf8"));
function result(overrides: Record<string, unknown> = {}) { return JSON.stringify({ ...fixture, ...overrides }); }
beforeAll(async () => { await testDatabase(); }, 30_000);

describe("canonical evaluation imports", () => {
  it("accepts the pinned canonical example and stores a summary, not referenced files or an execution claim", () => {
    const json = result({ annotations: [{ code: "test", message: "unretained-private-log" }], extension: { command: "do-not-run" } });
    const imported = importVerification(json);
    expect(imported).toMatchObject({ classification: "failed", sourceKind: "imported", executionObserved: false, workspaceFreshness: "unknown", unresolvedReferences: true, referenceCount: 1 });
    expect(imported.sourceDigest).toBe(createHash("sha256").update(json).digest("hex"));
    expect(JSON.stringify(imported)).not.toMatch(/file:|unretained-private-log|do-not-run/);
    expect(imported.result.subject.run_id).toBe("run_1");
  });

  it.each([
    [{ passed: 3, failed: 0, warned: 0, skipped: 0 }, "pass", undefined, "passed"],
    [{ passed: 0, failed: 0, warned: 0, skipped: 3 }, "pass", undefined, "not-run"],
    [{ passed: 0, failed: 0, warned: 0, skipped: 0 }, "pass", undefined, "not-run"],
    [{ passed: 3, failed: 0, warned: 0, skipped: 1 }, "pass", undefined, "partial"],
    [{ passed: 3, failed: 0, warned: 1, skipped: 0 }, "pass", undefined, "warnings"],
    [{ passed: 0, failed: 0, warned: 0, skipped: 0 }, "indeterminate", "blocked", "blocked"],
    [{ passed: 0, failed: 0, warned: 0, skipped: 0 }, "indeterminate", "error", "error"],
    [{ passed: 3, failed: 0, warned: 0, skipped: 0 }, "indeterminate", undefined, "indeterminate"],
  ])("classifies reported checks without turning missing or skipped work into a pass", (checks, verdict, evaluation_status, expected) => {
    expect(importVerification(result({ checks, verdict, evaluation_status })).classification).toBe(expected);
  });

  it("rejects malformed contracts, contradictions, invalid dates, unsafe integers, deep and oversized inputs", () => {
    for (const json of ["{", "{}", result({ schema: "kujo.execution-result/v1" }), result({ verdict: "pass" }), result({ finished_at: "yesterday" }), result({ finished_at: "2026-09-23T00:00:00Z" }), result({ evaluation_status: "error" }), result({ checks: { passed: Number.MAX_SAFE_INTEGER + 1, failed: 0, warned: 0, skipped: 0 } }), result({ extra: "x".repeat(65_536) }), result({ extra: "界".repeat(25_000) }), result({ evidence_refs: [{ ...fixture.evidence_refs[0], integrity: { status: "sha256" } }] })]) expect(() => importVerification(json)).toThrow();
    let nested: unknown = {}; for (let i = 0; i < 40; i++) nested = { nested };
    expect(() => importVerification(result({ extension: nested }))).toThrow("nesting");
  });

  it("redacts selected strings and drops unknown extensions instead of retaining supplied secrets", () => {
    const imported = importVerification(result({ evaluator: { name: "Bearer abcdefghijklmnop", version: "2", password: "never-store-me" } }));
    expect(imported.result.evaluator.name).toBe("[REDACTED]");
    expect(imported.redactedCount).toBe(1);
    expect(JSON.stringify(imported)).not.toContain("never-store-me");
  });
});

describe("scoped verification bridge", () => {
  async function harness(config: unknown = { features: { verification: true } }) {
    const h = createTestHarness({ manifest, config: config as Record<string, unknown> });
    h.ctx.projects.get = vi.fn(async (id, company) => company === "company" && id === "project" ? { id, companyId: company } as NonNullable<Awaited<ReturnType<typeof h.ctx.projects.get>>> : null);
    h.ctx.issues.get = vi.fn(async (id, company) => company === "company" && id === "issue" ? { id, companyId: company } as NonNullable<Awaited<ReturnType<typeof h.ctx.issues.get>>> : null);
    await plugin.definition.setup(h.ctx);
    return h;
  }
  it("persists imported provenance, filters other tenants and survives a new worker context", async () => {
    const h = await harness();
    const context = { companyId: "company", projectId: "project", runId: "run" };
    const imported = await h.executeTool("import-verification", { json: result() }, context);
    expect(imported.error).toBeUndefined();
    const target = { companyId: "company", entityType: "project" as const, entityId: "project" };
    const restarted = await harness();
    const [receipt] = await listEvidence(restarted.ctx, target);
    expect(receipt).toMatchObject({ sourceKind: "imported", kind: "verification-latest", result: "imported failed" });
    const stored = await getEvidence(restarted.ctx, target, receipt!.id);
    expect(stored?.payload.kujoProjection).toMatchObject({ id: "kujo.paperclip.verification.import", canonical: [] });
    expect((await restarted.executeTool("get-evidence", { evidenceId: receipt!.id }, context)).content).toContain("Imported claim");
    expect((await restarted.executeTool("get-evidence", { evidenceId: receipt!.id }, { ...context, companyId: "other" })).error).toContain("unavailable");
    expect((await restarted.executeTool("import-verification", { json: result(), companyId: "other" }, context)).error).toBeTruthy();
    await expect(restarted.performAction("import-verification", { entityType: "project", entityId: "project", json: result(), companyId: "company" }, { companyId: "other" })).rejects.toThrow("not found");
  });
  it("honors default-off, feature and profile settings, while imports need no Kujo runtime", async () => {
    for (const config of [{}, { features: { verification: false } }, { capabilityProfile: "essentials", features: { verification: true } }, { capabilityProfile: "build", features: { verification: true } }]) {
      const h = await harness(config);
      expect((await h.executeTool("import-verification", { json: result() }, { companyId: "company", projectId: "project" })).error).toContain("disabled");
      await expect(h.performAction("import-verification", { entityType: "issue", entityId: "issue", json: result() }, { companyId: "company" })).rejects.toThrow("disabled");
    }
    const config = parsePluginConfig({ features: { verification: true }, runtime: { binary: "/missing/kujo" } });
    const catalog = capabilityCatalog(config, await doctor(config));
    expect(catalog.capabilities.find((item) => item.tool === "import-verification")).toMatchObject({ enabled: true, status: "ready" });
  });
  it("imports and clears a host-owned issue without a workspace, but rejects unknown entities and run writes", async () => {
    const h = await harness();
    const params = { entityType: "issue", entityId: "issue", json: result() };
    const report = await h.performAction("import-verification", params, { companyId: "company" });
    expect(report).toMatchObject({ sourceKind: "imported", executionObserved: false });
    await expect(h.performAction("import-verification", { ...params, entityId: "missing" }, { companyId: "company" })).rejects.toThrow("not found");
    await expect(h.performAction("import-verification", { ...params, entityType: "run" }, { companyId: "company" })).rejects.toThrow();
    await h.performAction("clear-artifacts", { entityType: "issue", entityId: "issue" }, { companyId: "company" });
    expect(await listEvidence(h.ctx, { companyId: "company", entityType: "issue", entityId: "issue" })).toHaveLength(0);
  });
});
