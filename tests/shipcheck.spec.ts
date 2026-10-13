import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePluginConfig } from "../src/config/schema.js";
import { inspectShipcheck } from "../src/features/shipcheck/inspect.js";

import type { PluginWorkspace } from "@paperclipai/plugin-sdk";
import type { ShipcheckReport } from "../src/features/shipcheck/schema.js";
import { createTestHarness } from "./helpers/harness.js";
import { getEvidence, listEvidence } from "../src/storage/history.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const complete: Record<string, string> = {
  "kennel.toml": '[package]\nname="demo"\nversion="1.0.0"\ndescription="demo"\nlicense="MIT"\n[kujo]\nentry="main.kujo"\n[scripts]\nlint="kujo lint main.kujo"\nformat="kujo fmt main.kujo"\n',
  "README.md": "# demo\n## Install\n## Usage\n", "LICENSE": "MIT\n", ".gitignore": "dist/\n", "CHANGELOG.md": "# Changelog\n## 1.0.0\n",
  "tests/example.kujo": 'print("test declaration")\n', "docs/index.md": "# Documentation\n", "examples/demo.kujo": 'print("example")\n', ".github/workflows/ci.yml": "name: demo\n",
};
async function fixture(files: Record<string, string> = complete) {
  const cwd = await mkdtemp(join(tmpdir(), "kujo-shipcheck-test-")); roots.push(cwd);
  execFileSync("git", ["init", "--quiet", cwd]);
  for (const [path, source] of Object.entries(files)) {
    await mkdir(dirname(join(cwd, path)), { recursive: true }); await writeFile(join(cwd, path), source);
  }
  return { cwd, projectId: "project", workspaceId: "workspace", config: parsePluginConfig({ features: { verification: true } }) };
}

describe("native ShipCheck metadata inspection", () => {
  it("uses actual workspace Git detection and all sixteen canonical signals without running project code", async () => {
    const input = await fixture(); const marker = join(input.cwd, "executed.txt");
    await writeFile(join(input.cwd, "main.kujo"), `write_file(${JSON.stringify(marker)}, "executed")\n`);
    await mkdir(join(input.cwd, "src"));
    await writeFile(join(input.cwd, "src/checks.kujo"), `write_file(${JSON.stringify(marker)}, "import executed")\n`);
    const before = execFileSync("git", ["-C", input.cwd, "status", "--porcelain=v1", "-z"], { encoding: "utf8" });
    const report = await inspectShipcheck(input);
    expect(report).toMatchObject({ status: "passed", stale: false, provenance: { component: "shipcheck", commit: "0a9f5795e9498f3698d5da6bb66642544251dd37" } });
    expect(report.report.summary).toEqual({ total_checks: 16, passed: 16, failed_errors: 0, warnings: 0, gate_passed: 1 });
    expect(report.report.checks.find((check) => check.name === "git-repo")).toMatchObject({ passed: 1, message: "Git repository detected" });
    expect(report.coverage.omitted).toEqual([]);
    expect(report.scope).toContain("Tests, linters and examples were not executed");
    expect(execFileSync("git", ["-C", input.cwd, "status", "--porcelain=v1", "-z"], { encoding: "utf8" })).toBe(before);
    await expect(access(marker)).rejects.toThrow();
  }, 60_000);

  it("reports missing release signals as failures while preserving warning-only gate semantics", async () => {
    const input = await fixture({});
    const failed = await inspectShipcheck(input);
    expect(failed.status).toBe("failed");
    expect(failed.report.summary.gate_passed).toBe(0);
    expect(failed.report.checks.find((check) => check.name === "git-repo")?.passed).toBe(1);
    for (const [path, source] of Object.entries({ "README.md": "# demo\n", "package.json": '{"version":"1.0.0"}', "CHANGELOG.md": "1.0.0\n", "test_example.kujo": 'print("not run")\n' })) await writeFile(join(input.cwd, path), source);
    const warnings = await inspectShipcheck(input);
    expect(warnings).toMatchObject({ status: "warnings", report: { summary: { gate_passed: 1, failed_errors: 0 } } });
    expect(warnings.report.summary.warnings).toBeGreaterThan(0);
    await expect(inspectShipcheck({ ...input, config: parsePluginConfig({}) })).rejects.toThrow("disabled");
  }, 60_000);

  it("retains canonical declaration-only entry semantics without opening external references", async () => {
    const input = await fixture();
    await writeFile(join(input.cwd, "kennel.toml"), complete["kennel.toml"]!.replace('entry="main.kujo"', 'entry="../never-open.kujo"'));
    const report = await inspectShipcheck(input);
    expect(report.status).toBe("passed");
    expect(report.report.checks.find((check) => check.name === "entry-point")).toMatchObject({ passed: 1, message: "kennel.toml has entry point defined" });
    expect(JSON.stringify(report)).not.toContain("../never-open.kujo");
  }, 60_000);

  it("keeps omissions partial even when the admitted subset meets the metadata gate", async () => {
    const input = await fixture();
    await writeFile(join(input.cwd, "large.md"), "x".repeat(65537));
    await writeFile(join(input.cwd, "secret.txt"), "api_key=neverRead123");
    const partial = await inspectShipcheck(input);
    expect(partial).toMatchObject({ status: "partial", report: { summary: { gate_passed: 1 } } });
    expect(partial.coverage.omitted).toEqual(expect.arrayContaining([{ path: "large.md", reason: "oversize" }, { path: "secret.txt", reason: "sensitive" }]));
    expect(JSON.stringify(partial)).not.toContain("neverRead123");
    await writeFile(join(input.cwd, "README.md"), "x".repeat(65537));
    const missing = await inspectShipcheck(input);
    expect(missing).toMatchObject({ status: "partial", report: { summary: { gate_passed: 0 } } });
  }, 60_000);

  it("rejects malformed metadata signals and redacts retained strings without changing source", async () => {
    const input = await fixture({ "package.json": '{"version":false}', "VERSION": "api_key=fixtureSecret123\n" });
    const report = await inspectShipcheck(input);
    expect(report.redactedCount).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toContain("fixtureSecret123");
    expect(await readFile(join(input.cwd, "VERSION"), "utf8")).toContain("fixtureSecret123");
    await rm(join(input.cwd, "VERSION"));
    expect((await inspectShipcheck(input)).report.checks.find((check) => check.name === "version-metadata")?.passed).toBe(0);
  }, 60_000);
});

describe("scoped Shipcheck integration", () => {
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
    const result = await h.executeTool("inspect-release-readiness", {}, { companyId: "company", projectId: "project" });
    expect(result.error).toBeUndefined(); expect(result.data).not.toHaveProperty("snapshot");
    expect(result.data).toMatchObject({ status: "passed", provenance: { commit: "0a9f5795e9498f3698d5da6bb66642544251dd37" } });
    const restarted = await harness(input);
    const [receipt] = await listEvidence(restarted.ctx, target);
    expect(receipt).toMatchObject({ kind: "shipcheck-latest", sourceKind: "observed", result: "release signals passed" });
    const stored = await getEvidence(restarted.ctx, target, receipt!.id);
    expect(stored?.payload.kujoProjection).toMatchObject({ id: "kujo.paperclip.shipcheck.inspect", canonical: [expect.objectContaining({ id: "kujo.shipcheck.repository.scan" })] });
    expect(await listEvidence(restarted.ctx, { ...target, companyId: "other" })).toEqual([]);
    expect((await restarted.getData<{ shipcheck: ShipcheckReport }>("detail", target)).shipcheck.stale).toBe(false);
    await writeFile(join(input.cwd, "README.md"), "export const changed = true;\n");
    expect((await restarted.getData<{ shipcheck: ShipcheckReport }>("detail", target)).shipcheck.stale).toBe(true);
    expect((await getEvidence(restarted.ctx, target, receipt!.id))?.payload.stale).toBe(false);
    const build = await harness(input, "build");
    expect((await build.executeTool("get-evidence", { evidenceId: receipt!.id }, { companyId: "company", projectId: "project" })).error).toContain("disabled");
  }, 60_000);

  it("rejects caller paths, missing or foreign host identity, run actions and disabled profiles", async () => {
    const input = await fixture(); const h = await harness(input);
    const params = { entityType: "project", entityId: "project" };
    await expect(h.performAction("inspect-release-readiness", params)).rejects.toThrow("Company context");
    await expect(h.performAction("inspect-release-readiness", { ...params, entityType: "run" }, { companyId: "company" })).rejects.toThrow();
    expect((await h.executeTool("inspect-release-readiness", { path: input.cwd }, { companyId: "company", projectId: "project" })).error).toBeTruthy();
    expect((await h.executeTool("inspect-release-readiness", { companyId: "company" }, { companyId: "other", projectId: "project" })).error).toBeTruthy();
    expect((await h.executeTool("inspect-release-readiness", {}, { companyId: "other", projectId: "project" })).error).toBeTruthy();
    const build = await harness(input, "build");
    await expect(build.performAction("inspect-release-readiness", params, { companyId: "company" })).rejects.toThrow("disabled");
    const review = await harness(input, "review");
    await expect(review.performAction("inspect-release-readiness", params, { companyId: "company" })).resolves.toMatchObject({ status: "passed" });
  }, 60_000);

  it("admits only the selected verification tool and its evidence under Essentials", async () => {
    const input = await fixture();
    const wide = await harness(input);
    const scope = { companyId: "company", projectId: "project" };
    expect((await wide.executeTool("inspect-artifact-drift", {}, scope)).error).toBeUndefined();
    const target = { companyId: "company", entityType: "project" as const, entityId: "project" };
    const [foreignKind] = await listEvidence(wide.ctx, target);
    const limited = await harness(input, "essentials");
    expect((await limited.executeTool("inspect-release-readiness", {}, scope)).data).toMatchObject({ status: "passed" });
    for (const [tool, args] of [["inspect-artifact-drift", {}], ["inspect-architecture", {}], ["inspect-task-contract", { path: "demo.spec.yml" }], ["import-verification", { json: "{}" }]] as const) {
      expect((await limited.executeTool(tool, args, scope)).error).toContain("disabled");
    }
    await expect(limited.performAction("inspect-artifact-drift", { entityType: "project", entityId: "project" }, { companyId: "company" })).rejects.toThrow("disabled");
    expect((await limited.executeTool("get-evidence", { evidenceId: foreignKind!.id }, scope)).error).toContain("disabled");
    const listed = await limited.executeTool("list-evidence", {}, scope);
    expect((listed.data as { records: { kind: string }[] }).records.every((record) => record.kind === "shipcheck-latest")).toBe(true);
    const detail = await limited.getData<{ concord: null; spec: null; fence: null; verification: null }>("detail", target);
    expect(detail).toMatchObject({ concord: null, spec: null, fence: null, verification: null });
  }, 60_000);
});
