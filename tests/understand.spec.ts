import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import type { PluginWorkspace } from "@paperclipai/plugin-sdk";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { parsePluginConfig } from "../src/config/schema.js";
import { understandRepository } from "../src/features/understand/generate.js";
import { scoutIntelligenceSchema, type Understanding } from "../src/features/understand/schema.js";

const roots: string[] = [];
const config = parsePluginConfig({});
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "kujo-understand-test-")); roots.push(cwd);
  execFileSync("git", ["init", "--quiet", cwd]);
  await mkdir(join(cwd, "src"));
  await writeFile(join(cwd, "src", "api.js"), "import express from 'express';\nconst app = express();\napp.get('/health', (req, res) => res.send('ok'));\n");
  return { cwd, projectId: "project", workspaceId: "workspace", config };
}

describe("Scout repository understanding", () => {
  it("maps a real repository without inheriting config or changing project files", async () => {
    const input = await fixture();
    await writeFile(join(input.cwd, "config.json"), '{"scan":{"max_entries":0}}');
    const before = execFileSync("git", ["-C", input.cwd, "status", "--porcelain", "-z"]);
    const pack = await understandRepository(input);
    expect(pack.status).toBe("complete");
    expect(pack.intelligence.metrics.total_files).toBe(2);
    expect(pack.intelligence.dependencies).toContainEqual(expect.objectContaining({ module: "express", source: "src/api.js" }));
    expect(pack.intelligence.routes).toContainEqual(expect.objectContaining({ path: "/health" }));
    expect(pack.fileTree).toContain("api.js");
    expect(pack.fileTree).not.toContain(input.cwd);
    expect(pack.provenance.componentVersion).toBe("1.1.0");
    expect(execFileSync("git", ["-C", input.cwd, "status", "--porcelain", "-z"])).toEqual(before);
    expect(await readFile(join(input.cwd, "config.json"), "utf8")).toContain('"max_entries":0');
  }, 60_000);

  it("preserves partial diagnostics and never returns source snippets", async () => {
    const input = await fixture();
    await writeFile(join(input.cwd, "src", "large.js"), "// " + "x".repeat(110000));
    await writeFile(join(input.cwd, "src", "secret.js"), 'const token = "ghp_abcdefgh123456789";\neval(input);\n');
    const pack = await understandRepository(input);
    expect(pack.status).toBe("partial");
    expect(pack.intelligence.parse_errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(pack.intelligence)).not.toContain("ghp_abcdefgh123456789");
    expect(JSON.stringify(pack.intelligence)).not.toContain("snippet");
  }, 60_000);

  it("does not follow outside symlinks and excludes sensitive filename patterns", async () => {
    const input = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "kujo-scout-outside-")); roots.push(outside);
    await writeFile(join(outside, "leak.js"), "import outsideSecret from 'outside-secret';\n");
    await symlink(outside, join(input.cwd, "escape"), process.platform === "win32" ? "junction" : "dir");
    await writeFile(join(input.cwd, ".env.js"), "import secret from 'secret-module';\n");
    const pack = await understandRepository(input);
    expect(JSON.stringify(pack.intelligence)).not.toContain("outside-secret");
    expect(JSON.stringify(pack.intelligence)).not.toContain("secret-module");
    expect(pack.fileTree).not.toContain(".env.js");
  }, 60_000);

  it("supports an empty Git repository", async () => {
    const input = await fixture(); await rm(join(input.cwd, "src"), { recursive: true });
    const pack = await understandRepository(input);
    expect(pack.intelligence.metrics.total_files).toBe(0);
    expect(pack.status).toBe("complete");
  }, 60_000);

  it("persists company-scoped evidence and rejects caller paths or disabled features", async () => {
    const input = await fixture();
    const harness = createTestHarness({ manifest });
    const workspace: PluginWorkspace = { id: input.workspaceId, projectId: input.projectId, path: input.cwd, name: "Fixture",
      repoUrl: null, repoRef: null, defaultRef: null, isPrimary: true, createdAt: "", updatedAt: "" };
    vi.spyOn(harness.ctx.projects, "getPrimaryWorkspace").mockResolvedValue(workspace);
    await plugin.definition.setup(harness.ctx);
    const target = { entityType: "project", entityId: "project" };
    await expect(harness.performAction("understand-repository", target)).rejects.toThrow("Company context");
    await expect(harness.performAction("understand-repository", { ...target, path: "/tmp" }, { companyId: "company" })).rejects.toThrow();
    await harness.performAction("understand-repository", target, { companyId: "company" });
    const tool = await harness.executeTool("understand-repository", {}, { companyId: "company", projectId: "project" });
    expect(tool.error).toBeUndefined();
    expect(tool.data).not.toHaveProperty("snapshot");
    expect(JSON.stringify(tool.data)).not.toContain(input.cwd);
    const rejected = await harness.executeTool("understand-repository", { path: "/tmp" }, { companyId: "company", projectId: "project" });
    expect(rejected.error).toBeDefined();
    const own = await harness.getData<{ understanding: Understanding }>("detail", { ...target, companyId: "company" });
    expect(own.understanding.projectId).toBe("project");
    await writeFile(join(input.cwd, "src", "api.js"), "export const changed = true;\n");
    const changed = await harness.getData<{ understanding: Understanding }>("detail", { ...target, companyId: "company" });
    expect(changed.understanding.stale).toBe(true);
    const other = await harness.getData<{ understanding: null }>("detail", { ...target, companyId: "other" });
    expect(other.understanding).toBeNull();
    await harness.performAction("clear-artifacts", target, { companyId: "company" });
    expect((await harness.getData<{ understanding: null }>("detail", { ...target, companyId: "company" })).understanding).toBeNull();
    await expect(understandRepository({ ...input, config: parsePluginConfig({ features: { understand: false } }) })).rejects.toThrow("disabled");
  }, 60_000);

  it("rejects malformed component contracts and strips raw content", () => {
    expect(() => scoutIntelligenceSchema.parse({ metrics: { total_files: -1 } })).toThrow();
    const parsed = scoutIntelligenceSchema.parse({ tool: { name: "scout", version: "1.1.0" }, metrics: { total_files: 0, total_lines: 0, total_size: 0, languages: {}, largest_files: [] },
      dependencies: [], routes: [], security_findings: [], parse_errors: [], target: "/private", rawSource: "secret" });
    expect(parsed).not.toHaveProperty("target"); expect(parsed).not.toHaveProperty("rawSource");
  }, 60_000);
});
