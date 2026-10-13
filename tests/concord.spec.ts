import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePluginConfig } from "../src/config/schema.js";
import { inspectConcord } from "../src/features/concord/inspect.js";

import type { PluginWorkspace } from "@paperclipai/plugin-sdk";
import type { ConcordReport } from "../src/features/concord/schema.js";
import { createTestHarness } from "./helpers/harness.js";
import { getEvidence, listEvidence } from "../src/storage/history.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture(files: Record<string, string> = { "package.json": '{"name":"demo","version":"1.0.0"}', "README.md": '# demo\n![version](https://img.shields.io/badge/version-9.0.0-black)\n' }) {
  const cwd = await mkdtemp(join(tmpdir(), "kujo-concord-test-")); roots.push(cwd);
  execFileSync("git", ["init", "--quiet", cwd]);
  for (const [path, source] of Object.entries(files)) {
    await mkdir(dirname(join(cwd, path)), { recursive: true }); await writeFile(join(cwd, path), source);
  }
  return { cwd, projectId: "project", workspaceId: "workspace", config: parsePluginConfig({ features: { verification: true } }) };
}

describe("canonical Concord snapshot inspection", () => {
  it("retains real version drift, provenance and unchanged source without executing project code", async () => {
    const input = await fixture(); const marker = join(input.cwd, "executed.txt");
    await writeFile(join(input.cwd, "main.kujo"), `write_file(${JSON.stringify(marker)}, "executed")\n`);
    await mkdir(join(input.cwd, "src"));
    await writeFile(join(input.cwd, "src/scanner.kujo"), `write_file(${JSON.stringify(marker)}, "import executed")\n`);
    const before = execFileSync("git", ["-C", input.cwd, "status", "--porcelain=v1", "-z"], { encoding: "utf8" });
    const report = await inspectConcord(input);
    expect(report).toMatchObject({ status: "failed", stale: false, provenance: { component: "concord", commit: "767b28dec5532639c01259eb47d1b19af995e552" } });
    expect(report.report?.findings).toContainEqual(expect.objectContaining({ id: "version-inconsistency", severity: "high" }));
    expect(report.report?.summary.total_findings).toBe(report.report?.findings.length);
    expect(report.coverage).toMatchObject({ copied: 4, omitted: [], truncated: false });
    expect(execFileSync("git", ["-C", input.cwd, "status", "--porcelain=v1", "-z"], { encoding: "utf8" })).toBe(before);
    await expect(access(marker)).rejects.toThrow();
  }, 60_000);

  it("distinguishes no artifacts and low-confidence warnings from passed checks", async () => {
    const input = await fixture({});
    expect((await inspectConcord(input)).status).toBe("not-run");
    await writeFile(join(input.cwd, "README.md"), "# demo\n");
    const warnings = await inspectConcord(input);
    expect(warnings.status).toBe("warnings");
    expect(warnings.report?.summary.highest_severity).toBe("medium");
    await expect(inspectConcord({ ...input, config: parsePluginConfig({}) })).rejects.toThrow("disabled");
  }, 60_000);

  it("reports no drift only within canonical artifact scope without executing declared tests", async () => {
    const input = await fixture({
      "package.json": '{"name":"demo","version":"1.0.0"}',
      "README.md": '# demo\n```bash\nkujo run main.kujo scan\n```\nSee examples/demo.kujo.\n',
      "main.kujo": 'subcommand := "scan"\nif subcommand == "scan" { print("scan") }\n',
      "demo.spec.yml": 'name: demo\nacceptance_criteria:\n  - Demonstrate a command\n',
      "tests/eval.json": '{"checks":[{"name":"declared only"}]}',
      "examples/demo.kujo": 'print("example")\n',
    });
    const report = await inspectConcord(input);
    expect(report.report?.findings).toEqual([]);
    expect(report.status).toBe("passed");
    expect(report.scope).toContain("No project commands, examples or tests were executed");
  }, 60_000);

  it("blocks manifest traversal and documented external inputs before native checks", async () => {
    const input = await fixture();
    await writeFile(join(input.cwd, "kennel.toml"), 'name = "demo"\nentry = "../ambient.kujo"\n');
    const manifest = await inspectConcord(input);
    expect(manifest).toMatchObject({ status: "blocked", report: null });
    expect(manifest.issues[0]?.field).toBe("entry");
    await rm(join(input.cwd, "kennel.toml"));
    await writeFile(join(input.cwd, "README.md"), '# demo\n```bash\nkujo run main.kujo --file ../secret.json\n```\n');
    const reference = await inspectConcord(input);
    expect(reference).toMatchObject({ status: "blocked", report: null });
    expect(reference.issues[0]?.field).toBe("example input");
    expect(JSON.stringify(reference)).not.toContain("../secret.json");
  }, 60_000);

  it("reports omitted files and native depth limits as partial without overstating coverage", async () => {
    const input = await fixture();
    await writeFile(join(input.cwd, "large.md"), "x".repeat(65537));
    await writeFile(join(input.cwd, "secret.txt"), "api_key=neverRead123");
    const partial = await inspectConcord(input);
    expect(partial.status).toBe("partial");
    expect(partial.coverage.omitted).toEqual(expect.arrayContaining([{ path: "large.md", reason: "oversize" }, { path: "secret.txt", reason: "sensitive" }]));
    expect(JSON.stringify(partial)).not.toContain("neverRead123");
    await rm(join(input.cwd, "large.md")); await rm(join(input.cwd, "secret.txt"));
    await mkdir(join(input.cwd, "docs/a/b/c/d/e"), { recursive: true });
    await writeFile(join(input.cwd, "docs/a/b/c/d/e/deep.md"), "# deep\n");
    const native = await inspectConcord(input);
    expect(native.status).toBe("partial");
    expect(native.report?.findings.some((finding) => finding.id.endsWith("-discovery-truncated"))).toBe(true);
  }, 60_000);

  it("redacts native finding text while retaining the original source", async () => {
    const input = await fixture({ "package.json": '{"name":"api_key=fixtureSecret123","version":"1.0.0"}', "README.md": "# other\n" });
    const report = await inspectConcord(input);
    expect(report.redactedCount).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toContain("fixtureSecret123");
    expect(await readFile(join(input.cwd, "package.json"), "utf8")).toContain("fixtureSecret123");
  }, 60_000);
});

describe("scoped Concord integration", () => {
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
    const result = await h.executeTool("inspect-artifact-drift", {}, { companyId: "company", projectId: "project" });
    expect(result.error).toBeUndefined(); expect(result.data).not.toHaveProperty("snapshot");
    expect(result.data).toMatchObject({ status: "failed", provenance: { commit: "767b28dec5532639c01259eb47d1b19af995e552" } });
    const restarted = await harness(input);
    const [receipt] = await listEvidence(restarted.ctx, target);
    expect(receipt).toMatchObject({ kind: "concord-latest", sourceKind: "observed", result: "artifact drift failed" });
    const stored = await getEvidence(restarted.ctx, target, receipt!.id);
    expect(stored?.payload.kujoProjection).toMatchObject({ id: "kujo.paperclip.concord.inspect", canonical: [expect.objectContaining({ id: "kujo.concord.artifacts.scan" })] });
    expect(await listEvidence(restarted.ctx, { ...target, companyId: "other" })).toEqual([]);
    expect((await restarted.getData<{ concord: ConcordReport }>("detail", target)).concord.stale).toBe(false);
    await writeFile(join(input.cwd, "README.md"), "export const changed = true;\n");
    expect((await restarted.getData<{ concord: ConcordReport }>("detail", target)).concord.stale).toBe(true);
    expect((await getEvidence(restarted.ctx, target, receipt!.id))?.payload.stale).toBe(false);
    const build = await harness(input, "build");
    expect((await build.executeTool("get-evidence", { evidenceId: receipt!.id }, { companyId: "company", projectId: "project" })).error).toContain("disabled");
  }, 60_000);

  it("rejects caller paths, missing or foreign host identity, run actions and disabled profiles", async () => {
    const input = await fixture(); const h = await harness(input);
    const params = { entityType: "project", entityId: "project" };
    await expect(h.performAction("inspect-artifact-drift", params)).rejects.toThrow("Company context");
    await expect(h.performAction("inspect-artifact-drift", { ...params, entityType: "run" }, { companyId: "company" })).rejects.toThrow();
    expect((await h.executeTool("inspect-artifact-drift", { path: input.cwd }, { companyId: "company", projectId: "project" })).error).toBeTruthy();
    expect((await h.executeTool("inspect-artifact-drift", { companyId: "company" }, { companyId: "other", projectId: "project" })).error).toBeTruthy();
    expect((await h.executeTool("inspect-artifact-drift", {}, { companyId: "other", projectId: "project" })).error).toBeTruthy();
    const build = await harness(input, "build");
    await expect(build.performAction("inspect-artifact-drift", params, { companyId: "company" })).rejects.toThrow("disabled");
    const review = await harness(input, "review");
    await expect(review.performAction("inspect-artifact-drift", params, { companyId: "company" })).resolves.toMatchObject({ status: "failed" });
  }, 60_000);
});
