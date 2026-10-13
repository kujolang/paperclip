import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectPackages, packageReportSchema } from "../src/features/packages/inspect.js";
import { parsePluginConfig } from "../src/config/schema.js";
import { removeTree } from "../src/runtime/files.js";
import { safeChildEnv } from "../src/runtime/execute-kujo.js";
import { createTestHarness } from "./helpers/harness.js";
import { compareEvidence } from "../src/storage/history.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

const roots: string[] = [];
afterEach(async () => { await plugin.definition.onShutdown?.(); await Promise.all(roots.splice(0).map(removeTree)); });
const valid = '[package]\nname="demo"\nversion="1.0.0"\n[kujo]\nentry="main.kujo"\n[dependencies.local]\npath="../outside"\n[dependencies.remote]\nsource="github:kujolang/eval@v1.0.0"\n';
async function fixture(content = valid) {
  const cwd = await mkdtemp(join(tmpdir(), "kujo-package-test-")); roots.push(cwd);
  execFileSync("git", ["init", "--quiet", cwd], { env: safeChildEnv() });
  await writeFile(join(cwd, "kennel.toml"), content);
  const input = { cwd, path: "kennel.toml", projectId: "project", workspaceId: "workspace", config: parsePluginConfig({}) };
  return { cwd, input, inspect: () => inspectPackages(input) };
}
describe("canonical offline package inspection", () => {
  it("validates copied manifests, parses lock declarations and never resolves or runs project modules", async () => {
    const f = await fixture();
    const lock = 'version=1\n[[package]]\nname="remote"\nsource="https://user:private-password@example.invalid/repo"\nresolved_ref="v1.0.0"\nresolved_commit="declared-not-verified"\n';
    await writeFile(join(f.cwd, "kennel.lock"), lock);
    await mkdir(join(f.cwd, "src"));
    await writeFile(join(f.cwd, "src/manifest.kujo"), 'write_file("MUST_NOT_RUN", "unsafe")');
    await writeFile(join(f.cwd, "main.kujo"), 'throw("project code must not run")');
    const before = execFileSync("git", ["-C", f.cwd, "status", "--porcelain"], { encoding: "utf8", env: safeChildEnv() });
    const report = await f.inspect();
    expect(report).toMatchObject({ status: "passed", manifest: { name: "demo", version: "1.0.0", entry: "main.kujo" }, validation: { ok: true }, dependencyCount: 2, stale: false, lockAdmission: "copied", lock: { status: "parsed", count: 1 } });
    expect(report.dependencies.find(dep => dep.name === "local")).toMatchObject({ kind: "path", source: "file:../outside" });
    expect(report.lock.entries[0]!.resolvedCommit).toBe("declared-not-verified");
    expect(report.lock.entries[0]!.source).not.toContain("private-password"); expect(report.redactedCount).toBeGreaterThan(0);
    expect(report.scope).toContain("not verified");
    expect(await readFile(join(f.cwd, "kennel.toml"), "utf8")).toBe(valid);
    expect(await readFile(join(f.cwd, "kennel.lock"), "utf8")).toBe(lock);
    expect(execFileSync("git", ["-C", f.cwd, "status", "--porcelain"], { encoding: "utf8", env: safeChildEnv() })).toBe(before);
  });
  it("preserves canonical validation errors and explicit lock parse limits", async () => {
    const f = await fixture('[package]\nname=""\nversion=""\n[dependencies.bad]\nsource="unsupported:value"\n');
    expect(await f.inspect()).toMatchObject({ status: "failed", validation: { ok: false, errors: expect.arrayContaining(["[package].name is required", "[package].version is required"]) } });
    await writeFile(join(f.cwd, "kennel.toml"), valid);
    for (const [content, status] of [['bad = [', 'invalid-toml'], ['version=99', 'unsupported-version'], ['version=1\npackage="invalid"', 'invalid-shape']]) {
      await writeFile(join(f.cwd, "kennel.lock"), content!);
      expect(await f.inspect()).toMatchObject({ status: "failed", lock: { status } });
    }
    await writeFile(join(f.cwd, "kennel.toml"), 'broken=[');
    expect(await f.inspect()).toMatchObject({ status: "failed", manifest: null, lock: { status: "not-read" } });
  }, 20_000);
  it("preserves file source declarations without resolving or double-prefixing them", async () => {
    const f = await fixture('[package]\nname="file-source"\nversion="1.0.0"\n[dependencies.local]\nsource="file:../outside"\n');
    expect((await f.inspect()).dependencies[0]).toMatchObject({ kind: "path", source: "file:../outside", valid: true });
  });
  it("reports missing/ignored lockfiles and does not read ignored inputs", async () => {
    const f = await fixture();
    expect(await f.inspect()).toMatchObject({ status: "warnings", lockAdmission: "not-git-visible", lock: { status: "missing" } });
    await writeFile(join(f.cwd, ".gitignore"), "kennel.lock\n");
    await writeFile(join(f.cwd, "kennel.lock"), "DO_NOT_READ_IGNORED_LOCK");
    const report = await f.inspect(); expect(JSON.stringify(report)).not.toContain("DO_NOT_READ"); expect(report.stale).toBe(false);
  });
  it("bounds dependency previews and labels truncated output", async () => {
    const f = await fixture('[package]\nname="many"\nversion="1.0.0"\n' + Array.from({ length: 201 }, (_, i) => `[dependencies.dep${i}]\npath="../dep${i}"\n`).join(''));
    expect(await f.inspect()).toMatchObject({ status: "warnings", dependencyCount: 201, truncated: true, dependencies: expect.any(Array) });
    expect((await f.inspect()).dependencies).toHaveLength(200);
  });
  it("rejects unsafe, oversize, unlisted and disabled reads", async () => {
    const f = await fixture();
    for (const path of ["../kennel.toml", "/kennel.toml", ".env/kennel.toml", "missing/kennel.toml"]) await expect(inspectPackages({ ...f.input, path })).rejects.toThrow();
    await expect(inspectPackages({ ...f.input, config: parsePluginConfig({ features: { language: false } }) })).rejects.toThrow(/disabled/);
    await writeFile(join(f.cwd, "kennel.toml"), '#'.repeat(65537));
    await expect(f.inspect()).rejects.toThrow(/64 KiB/);
  });
  it.skipIf(process.platform === "win32")("does not follow manifest or lockfile symlinks", async () => {
    const f = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "kujo-package-outside-")); roots.push(outside);
    await writeFile(join(outside, "lock"), 'version=1\n');
    await symlink(join(outside, "lock"), join(f.cwd, "kennel.lock"));
    expect(await f.inspect()).toMatchObject({ status: "warnings", lockAdmission: "unreadable", lockDigest: null });
    await mkdir(join(f.cwd, "linked")); await symlink(join(outside, "lock"), join(f.cwd, "linked/kennel.toml"));
    await expect(inspectPackages({ ...f.input, path: "linked/kennel.toml" })).rejects.toThrow(/safe readable/);
  });
  it("exposes scoped host tools and history, preserves profile gates and rejects run mutation", async () => {
    const f = await fixture(); const h = createTestHarness({ manifest });
    h.ctx.projects.getPrimaryWorkspace = async (_project, company) => company === "company" ? ({ id: "workspace", projectId: "project", path: f.cwd } as Awaited<ReturnType<typeof h.ctx.projects.getPrimaryWorkspace>>) : null;
    await plugin.definition.setup(h.ctx);
    const result = await h.executeTool("inspect-kujo-packages", {}, { companyId: "company", projectId: "project" });
    expect(result.error).toBeUndefined(); expect(packageReportSchema.omit({ snapshot: true }).parse(result.data).manifest?.name).toBe("demo");
    const listed = await h.executeTool("list-evidence", {}, { companyId: "company", projectId: "project" });
    expect(listed.data).toMatchObject({ records: expect.arrayContaining([expect.objectContaining({ kind: "packages-latest" })]) });
    const recordId = (listed.data as { records: { id: string; kind: string }[] }).records.find(row => row.kind === "packages-latest")!.id;
    const exported = await h.executeTool("get-evidence", { evidenceId: recordId }, { companyId: "company", projectId: "project" });
    expect(exported.error).toBeUndefined();
    const retained = exported.data as Parameters<typeof compareEvidence>[0];
    expect(compareEvidence(retained, retained)).toMatchObject({ samePayload: true, left: { summary: { declaredDependencies: 2, lockStatus: "missing", lockRecords: 0 } } });
    expect((await h.executeTool("inspect-kujo-packages", {}, { companyId: "other", projectId: "project" })).error).toBeDefined();
    await expect(h.performAction("inspect-kujo-packages", { entityType: "run", entityId: "run" }, { companyId: "company" })).rejects.toThrow();
    h.ctx.config.get = async () => ({ capabilityProfile: "review" });
    expect((await h.executeTool("inspect-kujo-packages", {}, { companyId: "company", projectId: "project" })).error).toBeDefined();
  });
});
