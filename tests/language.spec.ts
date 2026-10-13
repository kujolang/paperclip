import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { access, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestHarness } from "./helpers/harness.js";
import type { PluginWorkspace } from "@paperclipai/plugin-sdk";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { parsePluginConfig } from "../src/config/schema.js";
import { analyzeSource, parseCheckDiagnostics, previewFormat } from "../src/features/language/analyze.js";
import { discoverSources, sourcePathSchema } from "../src/features/language/source.js";
import type { LanguageReport } from "../src/features/language/schema.js";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function fixture(source = "answer:=40+2\nprint(answer)\n") {
  const cwd = await mkdtemp(join(tmpdir(), "kujo-language-test-")); roots.push(cwd);
  execFileSync("git", ["init", "--quiet", cwd]);
  await writeFile(join(cwd, "main.kujo"), source);
  return { cwd, path: "main.kujo", projectId: "project", workspaceId: "workspace", config: parsePluginConfig({}) };
}

describe("Kujo language operations", () => {
  it("checks real source and previews formatting without mutating it", async () => {
    const input = await fixture();
    const before = await readFile(join(input.cwd, input.path), "utf8");
    const report = await analyzeSource(input);
    expect(report).toMatchObject({ check: "passed", lint: "passed", stale: false });
    expect(report.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
    const preview = await previewFormat(input);
    expect(preview).toMatchObject({ changed: true, stale: false, redactedCount: 0 });
    expect(preview.formatted).toContain("answer := 40 + 2");
    expect(await readFile(join(input.cwd, input.path), "utf8")).toBe(before);
  }, 60_000);

  it("returns locations for actual parse errors and distinguishes lint warnings", async () => {
    const input = await fixture("func broken( {\n");
    const report = await analyzeSource(input);
    expect(report.check).toBe("failed");
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ tool: "check", code: "KUJOPARSE001", line: 1, column: 14 }));
    await writeFile(join(input.cwd, input.path), "let unused = 42\n");
    const linted = await analyzeSource(input);
    expect(linted.check).toBe("passed");
    expect(linted.lint).toBe("warnings");
    expect(linted.diagnostics).toContainEqual(expect.objectContaining({ tool: "lint", severity: "warning", line: 1 }));
  }, 60_000);

  it("never executes supplied source and redacts preview secrets", async () => {
    const input = await fixture();
    const marker = join(input.cwd, "executed.txt").replaceAll("\\", "/");
    await writeFile(join(input.cwd, input.path), `write_file("${marker}", "executed")\napi_key := "ghp_abcdefgh123456789"\n`);
    await analyzeSource(input);
    const preview = await previewFormat(input);
    expect(preview.redactedCount).toBeGreaterThan(0);
    expect(JSON.stringify(preview)).not.toContain("ghp_abcdefgh123456789");
    await expect(access(marker)).rejects.toThrow();
  }, 60_000);

  it("excludes ignored/sensitive files and rejects path traversal and absolute paths", async () => {
    const input = await fixture();
    await writeFile(join(input.cwd, ".gitignore"), "ignored.kujo\n");
    await writeFile(join(input.cwd, "ignored.kujo"), "print(1)\n");
    await writeFile(join(input.cwd, ".env.kujo"), "print(1)\n");
    expect((await discoverSources(input.cwd)).files).toEqual(["main.kujo"]);
    for (const path of ["../main.kujo", "/tmp/main.kujo", "C:/main.kujo", "src\\main.kujo", ".env.kujo", "secret/main.kujo", "main.ts"]) expect(sourcePathSchema.safeParse(path).success).toBe(false);
    await expect(analyzeSource({ ...input, path: "ignored.kujo" })).rejects.toMatchObject({ code: "KUJO_WORKSPACE_OUTSIDE_ALLOWED_ROOT" });
  }, 60_000);

  it("uses the native beneath-root reader to deny outside directory symlinks", async () => {
    const input = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "kujo-language-outside-")); roots.push(outside);
    await writeFile(join(outside, "external.kujo"), "print('outside')\n");
    await symlink(outside, join(input.cwd, "escape"), process.platform === "win32" ? "junction" : "dir");
    // Catalog admission alone can never authorize a native reader escape.
    const { readSource } = await import("../src/features/language/source.js");
    const { resolveKujo } = await import("../src/runtime/resolve-kujo.js");
    const runtime = await resolveKujo(input.config, tmpdir());
    const directory = await mkdtemp(join(tmpdir(), "kujo-language-reader-test-")); roots.push(directory);
    await expect(readSource({ ...input, path: "escape/external.kujo", runtime, directory })).rejects.toMatchObject({ code: "KUJO_WORKSPACE_OUTSIDE_ALLOWED_ROOT" });
  }, 60_000);

  it("rejects oversized and binary inputs instead of checking a truncated file", async () => {
    const input = await fixture("// " + "x".repeat(65536));
    await expect(analyzeSource(input)).rejects.toMatchObject({ code: "KUJO_OUTPUT_LIMIT" });
    await writeFile(join(input.cwd, input.path), Buffer.from([0, 1, 2]));
    await expect(analyzeSource(input)).rejects.toMatchObject({ code: "KUJO_INVALID_CONFIG" });
  }, 60_000);

  it("stores diagnostics within the company and keeps formatting previews transient", async () => {
    const input = await fixture();
    const harness = createTestHarness({ manifest });
    const workspace: PluginWorkspace = { id: input.workspaceId, projectId: input.projectId, path: input.cwd, name: "Fixture",
      repoUrl: null, repoRef: null, defaultRef: null, isPrimary: true, createdAt: "", updatedAt: "" };
    vi.spyOn(harness.ctx.projects, "getPrimaryWorkspace").mockResolvedValue(workspace);
    await plugin.definition.setup(harness.ctx);
    const target = { entityType: "project", entityId: "project" };
    await expect(harness.performAction("check-kujo-source", { ...target, path: input.path })).rejects.toThrow("Company context");
    const tool = await harness.executeTool("check-kujo-source", { path: input.path }, { companyId: "company", projectId: "project" });
    expect(tool.error).toBeUndefined(); expect(tool.data).not.toHaveProperty("snapshot");
    const own = await harness.getData<{ language: LanguageReport; history: Array<{ id: string }> }>("detail", { ...target, companyId: "company" });
    expect(own.language.check).toBe("passed");
    const evidenceParams = { ...target, evidenceId: own.history[0]!.id };
    expect(await harness.performAction("inspect-evidence", evidenceParams, { companyId: "company" })).toMatchObject({ currentWorkspace: { freshness: "current" } });
    expect((await harness.getData<{ language: null }>("detail", { ...target, companyId: "other" })).language).toBeNull();
    const preview = await harness.performAction("preview-kujo-format", { ...target, path: input.path }, { companyId: "company" });
    expect(preview).toMatchObject({ changed: true });
    const after = await harness.getData<{ language: LanguageReport }>("detail", { ...target, companyId: "company" });
    expect(after.language.id).toBe(own.language.id);
    expect(after.language).not.toHaveProperty("source");
    await writeFile(join(input.cwd, input.path), "print(43)\n");
    expect(await harness.performAction("inspect-evidence", evidenceParams, { companyId: "company" })).toMatchObject({ currentWorkspace: { freshness: "stale" } });
    expect((await harness.performAction("export-evidence", evidenceParams, { companyId: "company" }) as { payload: LanguageReport }).payload.stale).toBe(false);
    await expect(analyzeSource({ ...input, config: parsePluginConfig({ features: { language: false } }) })).rejects.toThrow("disabled");
  }, 60_000);

  it("parses Windows locations and rejects unknown checker error formats", () => {
    expect(parseCheckDiagnostics("[KUJOPARSE001] [parser] error: Unexpected input\n  --> C:\\repo\\source.kujo:12:3\n")[0]).toMatchObject({ line: 12, column: 3 });
    expect(() => parseCheckDiagnostics("unknown failure")).toThrow("unrecognized diagnostic");
  });
});
