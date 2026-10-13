import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createTestHarness, testDatabase } from "./helpers/harness.js";
import type { PluginWorkspace } from "@paperclipai/plugin-sdk";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { inspectWorkspace } from "../src/paperclip/workspace.js";
import { runBundledExample } from "../src/features/onboarding/example.js";
import { parsePluginConfig } from "../src/config/schema.js";

// PostgreSQL/WASM initialization is fixture setup, not part of the first-use assertion timeout.
beforeAll(async () => { await testDatabase(); }, 30_000);
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const target = { entityType: "project" as const, entityId: "project", companyId: "company" };
async function fixture() {
  const path = await mkdtemp(join(tmpdir(), "kujo-first-use-test-")); roots.push(path);
  const harness = createTestHarness({ manifest });
  const workspace: PluginWorkspace = { id: "workspace", projectId: "project", name: "Fixture", path,
    repoUrl: null, repoRef: null, defaultRef: null, isPrimary: true, createdAt: "", updatedAt: "" };
  vi.spyOn(harness.ctx.projects, "getPrimaryWorkspace").mockResolvedValue(workspace);
  return { path, harness };
}

describe("first use", () => {
  it("returns setup guidance when no workspace is configured", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    const detail = await harness.getData<{ workspace: { state: string }; suggestedTask: string }>("detail", target);
    expect(detail.workspace.state).toBe("missing");
    expect(detail.suggestedTask).toContain("repository");
  });

  it("distinguishes unavailable Git, empty Git and a clean repository", async () => {
    const { path, harness } = await fixture();
    expect((await inspectWorkspace(harness.ctx, target)).readiness.state).toBe("unavailable");
    execFileSync("git", ["init", "--quiet", path]);
    expect((await inspectWorkspace(harness.ctx, target)).readiness.state).toBe("empty");
    await writeFile(join(path, "main.kujo"), "print(36)\n");
    execFileSync("git", ["-C", path, "add", "."]);
    execFileSync("git", ["-C", path, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Fixture"]);
    const inspection = await inspectWorkspace(harness.ctx, target);
    expect(inspection.readiness).toMatchObject({ state: "ready", message: expect.stringContaining("clean") });
    expect(harness.ctx.projects.getPrimaryWorkspace).toHaveBeenCalledWith("project", "company");
  });

  it("takes a bounded task default from the company-scoped issue", async () => {
    const harness = createTestHarness({ manifest });
    const issueRead = vi.spyOn(harness.ctx.issues, "get").mockResolvedValue({ title: "Fix OAuth", description: "x".repeat(20_000) } as never);
    await plugin.definition.setup(harness.ctx);
    const detail = await harness.getData<{ suggestedTask: string }>("detail", { ...target, entityType: "issue", entityId: "issue" });
    expect(issueRead).toHaveBeenCalledWith("issue", "company");
    expect(detail.suggestedTask).toHaveLength(10_000);
    expect(detail.suggestedTask).toMatch(/^Fix OAuth/);
  });

  it("checks and executes the real bundled example with no workspace", async () => {
    const result = await runBundledExample(parsePluginConfig({}));
    expect(result).toMatchObject({ status: "passed", checked: true });
    expect(JSON.parse(result.output)).toEqual({ language: "Kujo", items: 2, total: 36 });
    expect(result.source).toContain("func order_total");
  });

  it("requires company scope, rejects custom code, and honors the example switch", async () => {
    const harness = createTestHarness({ manifest, config: { features: { examples: false } } });
    await plugin.definition.setup(harness.ctx);
    await expect(harness.performAction("run-example", {})).rejects.toThrow("Company context");
    await expect(harness.performAction("run-example", { source: "malicious" }, { companyId: "company" })).rejects.toThrow();
    await expect(harness.performAction("run-example", {}, { companyId: "company" })).rejects.toThrow("disabled");
  });
});
