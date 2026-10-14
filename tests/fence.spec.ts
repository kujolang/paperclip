import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePluginConfig } from "../src/config/schema.js";
import { inspectFence } from "../src/features/fence/inspect.js";

import type { PluginWorkspace } from "@paperclipai/plugin-sdk";
import type { FenceReport } from "../src/features/fence/schema.js";
import { createTestHarness } from "./helpers/harness.js";
import { getEvidence, listEvidence } from "../src/storage/history.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const policy = { version: 1, source_roots: ["src"], fail_on: "error", scan: { include: ["src/**/*.ts"] },
  zones: { ui: { paths: ["src/ui/**"], cannot_depend_on: ["core"] }, core: { paths: ["src/core/**"] } } };
async function fixture(config: unknown = policy) {
  const cwd = await mkdtemp(join(tmpdir(), "kujo-fence-test-")); roots.push(cwd);
  execFileSync("git", ["init", "--quiet", cwd]);
  for (const [path, source] of Object.entries({ "fence.json": JSON.stringify(config), "src/ui/view.ts": 'import { value } from "../core/service";\n', "src/core/service.ts": 'export const value = 42;\n' })) {
    await mkdir(dirname(join(cwd, path)), { recursive: true }); await writeFile(join(cwd, path), source);
  }
  return { cwd, projectId: "project", workspaceId: "workspace", config: parsePluginConfig({ features: { verification: true } }) };
}

describe("canonical Fence snapshot inspection", () => {
  it("reports native boundaries, locations, provenance and actual coverage without modifying source", async () => {
    const input = await fixture();
    const before = execFileSync("git", ["-C", input.cwd, "status", "--porcelain=v1", "-z"], { encoding: "utf8" });
    const report = await inspectFence(input);
    expect(report).toMatchObject({ status: "failed", threshold: "error", thresholdStatus: "failed", stale: false, provenance: { component: "fence", version: "1.1.0" } });
    expect(report.report?.summary).toMatchObject({ files_scanned: 2, violations: 1, errors: 1 });
    expect(report.report?.violations[0]).toMatchObject({ file: "src/ui/view.ts", line: 1, resolved: "src/core/service.ts", from_zone: "ui", to_zone: "core", confidence: "best_effort" });
    expect(report.coverage).toMatchObject({ selected: 2, inspected: 2, omitted: [], truncated: false });
    expect(report.inputDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(execFileSync("git", ["-C", input.cwd, "status", "--porcelain=v1", "-z"], { encoding: "utf8" })).toBe(before);
    expect(await readFile(join(input.cwd, "src/ui/view.ts"), "utf8")).toContain('from "../core/service"');
  }, 60_000);

  it("preserves findings when a declared threshold allows them", async () => {
    const report = await inspectFence(await fixture({ ...policy, fail_on: "none" }));
    expect(report).toMatchObject({ status: "passed", threshold: "none", thresholdStatus: "passed" });
    expect(report.report?.summary.errors).toBe(1);
    expect(report.scope).toContain("No project commands or tests were executed");
  }, 60_000);

  it("distinguishes missing/empty policy from configuration errors", async () => {
    const input = await fixture();
    await rm(join(input.cwd, "fence.json"));
    expect((await inspectFence(input)).status).toBe("not-run");
    await writeFile(join(input.cwd, "fence.json"), JSON.stringify({ ...policy, source_roots: ["absent"] }));
    expect((await inspectFence(input)).status).toBe("not-run");
    await writeFile(join(input.cwd, "fence.json"), "{");
    expect((await inspectFence(input)).status).toBe("blocked");
  }, 60_000);

  it("does not execute configured parser commands or copied project modules", async () => {
    const input = await fixture(); const marker = join(input.cwd, "executed.txt");
    await writeFile(join(input.cwd, "src/config.kujo"), `write_file(${JSON.stringify(marker)}, "workspace module executed")\n`);
    const inspected = await inspectFence(input);
    expect(inspected.status).toBe("failed");
    await expect(access(marker)).rejects.toThrow();
    await writeFile(join(input.cwd, "fence.json"), JSON.stringify({ ...policy, parser_adapters: { ".ts": ["node", "-e", `require('fs').writeFileSync(${JSON.stringify(marker)}, 'adapter executed')`] } }));
    const blocked = await inspectFence(input);
    expect(blocked.status).toBe("blocked");
    expect(blocked.message).toContain("parser commands");
    expect(JSON.stringify(blocked)).not.toContain("writeFileSync");
    await expect(access(marker)).rejects.toThrow();
  }, 60_000);

  it("keeps omitted selected sources visible and does not penalize explicitly excluded files", async () => {
    const input = await fixture();
    await writeFile(join(input.cwd, "src/ui/large.ts"), "x".repeat(65537));
    await writeFile(join(input.cwd, "src/ui/secret.ts"), "TOKEN=fixture-secret");
    const partial = await inspectFence(input);
    expect(partial.status).toBe("partial");
    expect(partial.coverage.omitted).toContainEqual({ path: "src/ui/large.ts", reason: "oversize" });
    expect(partial.coverage.omitted).toContainEqual({ path: "src/ui/secret.ts", reason: "sensitive" });
    expect(JSON.stringify(partial)).not.toContain("fixture-secret");
    await writeFile(join(input.cwd, "fence.json"), JSON.stringify({ ...policy, scan: { ...policy.scan, exclude: ["src/ui/large.ts", "src/ui/secret.ts"] } }));
    const excluded = await inspectFence(input);
    expect(excluded.status).toBe("failed");
    expect(excluded.coverage.omitted).toEqual([]);
  }, 60_000);

  it("blocks unsafe aliases, escaping roots, failed config admission and disabled features", async () => {
    const input = await fixture({ ...policy, aliases: { "@": "../ambient" } });
    expect((await inspectFence(input)).status).toBe("blocked");
    await writeFile(join(input.cwd, "fence.json"), JSON.stringify({ ...policy, source_roots: ["../ambient"] }));
    expect((await inspectFence(input)).status).toBe("blocked");
    await writeFile(join(input.cwd, "fence.json"), JSON.stringify(policy));
    await writeFile(join(input.cwd, "fence.toml"), "x".repeat(65537));
    const config = await inspectFence(input);
    expect(config).toMatchObject({ status: "blocked", report: null, thresholdStatus: null });
    await expect(inspectFence({ ...input, config: parsePluginConfig({}) })).rejects.toThrow("disabled");
  }, 60_000);

  it("retains canonical warnings and defensively redacts declared owner text", async () => {
    const input = await fixture({ ...policy, version: 999, zones: { ...policy.zones, ui: { ...policy.zones.ui, owner: "api_key=fixtureSecret123" } } });
    const report = await inspectFence(input);
    expect(report.diagnostics.some((item) => item.severity === "warning")).toBe(true);
    expect(report.redactedCount).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toContain("fixtureSecret123");
  }, 60_000);
});


describe("scoped Fence integration", () => {
  async function harness(input: Awaited<ReturnType<typeof fixture>>, profile = "installed") {
    const h = createTestHarness({ manifest, config: { features: { verification: true }, capabilityProfile: profile } });
    const workspace: PluginWorkspace = { id: input.workspaceId, projectId: input.projectId, path: input.cwd, name: "Fixture", repoUrl: null, repoRef: null, defaultRef: null, isPrimary: true, createdAt: "", updatedAt: "" };
    vi.spyOn(h.ctx.projects, "getPrimaryWorkspace").mockImplementation(async (_id, companyId) => companyId === "company" ? workspace : null);
    await plugin.definition.setup(h.ctx);
    return h;
  }
  it("retains observed boundary evidence across worker contexts with scoped history and freshness", async () => {
    const input = await fixture();
    const h = await harness(input);
    const target = { entityType: "project" as const, entityId: "project", companyId: "company" };
    const result = await h.executeTool("inspect-architecture", {}, { companyId: "company", projectId: "project" });
    expect(result.error).toBeUndefined(); expect(result.data).not.toHaveProperty("snapshot");
    expect(result.data).toMatchObject({ status: "failed", provenance: { commit: "d3173049b5365af975624fddd48e943d39738c75" } });
    const restarted = await harness(input);
    const [receipt] = await listEvidence(restarted.ctx, target);
    expect(receipt).toMatchObject({ kind: "fence-latest", sourceKind: "observed", result: "architecture failed" });
    const stored = await getEvidence(restarted.ctx, target, receipt!.id);
    expect(stored?.payload.kujoProjection).toMatchObject({ id: "kujo.paperclip.fence.inspect", canonical: [expect.objectContaining({ id: "kujo.fence.architecture.check" })] });
    expect(await listEvidence(restarted.ctx, { ...target, companyId: "other" })).toEqual([]);
    expect((await restarted.getData<{ fence: FenceReport }>("detail", target)).fence.stale).toBe(false);
    await writeFile(join(input.cwd, "src/ui/view.ts"), "export const changed = true;\n");
    expect((await restarted.getData<{ fence: FenceReport }>("detail", target)).fence.stale).toBe(true);
    expect((await getEvidence(restarted.ctx, target, receipt!.id))?.payload.stale).toBe(false);
    const build = await harness(input, "build");
    expect((await build.executeTool("get-evidence", { evidenceId: receipt!.id }, { companyId: "company", projectId: "project" })).error).toContain("disabled");
  }, 60_000);

  it("rejects caller paths, missing or foreign host identity, run actions and disabled profiles", async () => {
    const input = await fixture(); const h = await harness(input);
    const params = { entityType: "project", entityId: "project" };
    await expect(h.performAction("inspect-architecture", params)).rejects.toThrow("Company context");
    await expect(h.performAction("inspect-architecture", { ...params, entityType: "run" }, { companyId: "company" })).rejects.toThrow();
    expect((await h.executeTool("inspect-architecture", { path: input.cwd }, { companyId: "company", projectId: "project" })).error).toBeTruthy();
    expect((await h.executeTool("inspect-architecture", { companyId: "company" }, { companyId: "other", projectId: "project" })).error).toBeTruthy();
    expect((await h.executeTool("inspect-architecture", {}, { companyId: "other", projectId: "project" })).error).toBeTruthy();
    const build = await harness(input, "build");
    await expect(build.performAction("inspect-architecture", params, { companyId: "company" })).rejects.toThrow("disabled");
    const review = await harness(input, "review");
    await expect(review.performAction("inspect-architecture", params, { companyId: "company" })).resolves.toMatchObject({ status: "failed" });
  }, 60_000);
});
