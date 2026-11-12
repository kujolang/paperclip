import { describe, expect, it, vi } from "vitest";
import { importRunLedger, type HostBinding } from "../src/features/runledger/import.js";
import { createTestHarness } from "./helpers/harness.js";
import { compareEvidence, getEvidence, listEvidence } from "../src/storage/history.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
const binding: HostBinding = { companyId: "company", projectId: "project", issueId: "issue", parentIssueId: "parent", agentId: "agent", runId: "run", attribution: "host-agent-importer" };
const fixture = { id: "attempt-1", created_at: "2026-11-12T12:00:00Z", updated_at: "2026-11-12T12:01:00Z", status: "pass", provider: "local", model: "test", task_name: "task", tests: [{ at: "2026-11-12T12:01:00Z", name: "checks", status: "pass", details: null }] };
const json = (change: object = {}) => JSON.stringify({ ...fixture, ...change });

describe("RunLedger admission", () => {
  it("never promotes supplied passes; preserves unknown usage and strips unselected data", () => {
    const report = importRunLedger(json({ repo_path: "/private/repo", commands: [{ text: "do-not-run" }], host: { agentId: "impersonation" }, notes: ["private"] }), binding);
    expect(report).toMatchObject({ classification: "unverified", executionObserved: false, host: binding, record: { usage: { input_tokens: null }, cost: null } });
    expect(JSON.stringify(report)).not.toMatch(/private|do-not-run|impersonation/);
    expect(importRunLedger(json({ tests: [] }), binding).classification).toBe("incomplete");
    expect(importRunLedger(json({ tests: [{ ...fixture.tests[0], status: "fail" }] }), binding).classification).toBe("failed");
  });
  it("rejects malformed, unsupported, reversed, oversized, unsafe numeric and deeply nested records", () => {
    let nested: unknown = {}; for (let i = 0; i < 35; i++) nested = { nested };
    for (const input of ["{", "{}", json({ status: "verified" }), json({ created_at: "tomorrow" }), json({ updated_at: "2026-01-01T00:00:00Z" }), json({ usage: { input_tokens: -1 } }), json({ usage: { input_tokens: Number.MAX_SAFE_INTEGER + 1 } }), json({ notes: "界".repeat(30_000) }), json({ nested })]) expect(() => importRunLedger(input, binding)).toThrow();
  });
  it("retains zero, separates currency and redacts selected strings", () => {
    const report = importRunLedger(json({ verdict: "Bearer abcdefghijklmnop", usage: { input_tokens: 0 }, cost: { currency: "EUR", total_cost: 0 }, correlation: { watchdog_trace_id: "trace-1" } }), binding);
    expect(report.record).toMatchObject({ verdict: "[REDACTED]", usage: { input_tokens: 0, output_tokens: null }, cost: { currency: "EUR", total_cost: 0 }, correlation: { watchdog_trace_id: "trace-1" } });
  });
});

async function harness(config: Record<string, unknown> = { features: { verification: true } }) {
  const h = createTestHarness({ manifest, config });
  h.ctx.projects.get = vi.fn(async (id, company) => company === "company" && id === "project" ? { id, companyId: company } as never : null);
  h.ctx.issues.get = vi.fn(async (id, company) => company === "company" && id === "issue" ? { id, companyId: company, projectId: "project", parentId: "parent", assigneeAgentId: "agent", executionRunId: "run" } as never : null);
  await plugin.definition.setup(h.ctx); return h;
}
const run = { companyId: "company", projectId: "project", agentId: "agent", runId: "run" };
const target = { companyId: "company", entityType: "issue" as const, entityId: "issue" };
describe("RunLedger host correlation", () => {
  it("retains distinct attempts, host attribution and comparison across worker restart", async () => {
    const h = await harness();
    for (const status of ["fail", "pass"]) {
      const result = await h.executeTool("import-verification", { format: "runledger", issueId: "issue", json: json({ status }) }, run);
      expect(result.error).toBeUndefined();
    }
    const restarted = await harness();
    const receipts = await listEvidence(restarted.ctx, target);
    expect(receipts).toHaveLength(2);
    expect(receipts.every(r => r.sourceKind === "imported")).toBe(true);
    const left = await getEvidence(restarted.ctx, target, receipts[0]!.id);
    const right = await getEvidence(restarted.ctx, target, receipts[1]!.id);
    expect(left?.payload.host).toEqual(binding);
    expect(compareEvidence(left, right).left.summary.runledger).toBeDefined();
    expect((await restarted.executeTool("get-evidence", { scope: "issue", issueId: "issue", evidenceId: receipts[0]!.id }, run)).content).toContain("schema-validation-only");
    expect(await getEvidence(restarted.ctx, { ...target, companyId: "other" }, receipts[0]!.id)).toBeNull();
  });
  it("rejects forged attribution, stale or foreign issue contexts and disabled imports", async () => {
    const h = await harness();
    const input = { format: "runledger", issueId: "issue", json: json() };
    for (const identity of [{ ...run, agentId: "other" }, { ...run, runId: "old" }, { ...run, companyId: "other" }]) expect((await h.executeTool("import-verification", input, identity)).error).toBeTruthy();
    expect((await h.executeTool("import-verification", { ...input, agentId: "other" }, run)).error).toBeTruthy();
    const disabled = await harness({});
    expect((await disabled.executeTool("import-verification", input, run)).error).toContain("disabled");
    await expect(h.performAction("import-verification", { entityType: "issue", entityId: "issue", format: "runledger", json: json() }, { companyId: "company" })).rejects.toThrow("human");
  });
});
