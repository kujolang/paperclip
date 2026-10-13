import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePluginConfig } from "../src/config/schema.js";
import { discoverSpecs, inspectSpec, specPathSchema } from "../src/features/spec/inspect.js";
import type { SpecReport } from "../src/features/spec/inspect.js";
import type { PluginWorkspace } from "@paperclipai/plugin-sdk";
import { createTestHarness } from "./helpers/harness.js";
import { getEvidence, listEvidence } from "../src/storage/history.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function fixture(source: string, extension = "json") {
  const cwd = await mkdtemp(join(tmpdir(), "kujo-spec-contract-test-")); roots.push(cwd);
  execFileSync("git", ["init", "--quiet", cwd]);
  const path = `task.spec.${extension}`;
  await writeFile(join(cwd, path), source);
  return { cwd, path, projectId: "project", workspaceId: "workspace", config: parsePluginConfig({ features: { verification: true } }) };
}

describe("native Spec contract inspection", () => {
  it.each([
    ["json", '{"name":"Task","goal":"Review the contract","acceptance_criteria":["Users can review criteria"]}'],
    ["yml", 'name: Task\ngoal: Review the contract\nacceptance_criteria:\n  - Users can review criteria\n'],
    ["yaml", 'name: Task\ngoal: Review the contract\nacceptance_criteria:\n  - Users can review criteria\n'],
    ["toml", 'name = "Task"\ngoal = "Review the contract"\nacceptance_criteria = ["Users can review criteria"]\n'],
  ])("validates %s through canonical native sources without changing the workspace", async (extension, source) => {
    const input = await fixture(source, extension);
    const report = await inspectSpec(input);
    expect(report.validation).toMatchObject({ status: "passed", native: true, errors: [] });
    expect(report.provenance).toMatchObject({ component: "spec", commit: "1211f37a09314be7150734bf15a55e9b2ea6504d" });
    expect(report.contract?.criteria).toEqual([{ text: "Users can review criteria", status: "not-run" }]);
    expect(report.stale).toBe(false);
    expect(await readFile(join(input.cwd, input.path), "utf8")).toBe(source);
    expect(execFileSync("git", ["-C", input.cwd, "ls-files", "--others", "--exclude-standard"], { encoding: "utf8" }).trim()).toBe(input.path);
  }, 60_000);

  it("distinguishes canonical warnings and strict rejection from completed acceptance", async () => {
    const input = await fixture('{"name":"Task","goal":"Review","surprise":true}');
    const report = await inspectSpec(input);
    expect(report.validation.status).toBe("warnings");
    expect(report.validation.warnings.length).toBeGreaterThan(0);
    const strict = await inspectSpec({ ...input, strict: true });
    expect(strict.validation).toMatchObject({ status: "failed", native: true, strict: true });
    expect(strict.contract?.checks).toEqual([]);
  }, 60_000);

  it("reports malformed input and invalid field types without claiming native validation", async () => {
    const input = await fixture('{"name":');
    expect((await inspectSpec(input)).validation).toMatchObject({ status: "failed", native: false });
    await writeFile(join(input.cwd, input.path), '{"name":42,"goal":"Review"}');
    expect((await inspectSpec(input)).validation).toMatchObject({ status: "failed", native: false });
    await writeFile(join(input.cwd, input.path), '{"name":"Task"}');
    const missing = await inspectSpec(input);
    expect(missing.validation).toMatchObject({ status: "failed", native: true });
    expect(missing.contract).toBeNull();
  }, 60_000);

  it("never executes declared checks or workspace modules and discards parameters and extra content", async () => {
    const input = await fixture("{}");
    const marker = join(input.cwd, "executed.txt");
    await mkdir(join(input.cwd, "src"));
    await writeFile(join(input.cwd, "src", "common.kujo"), `write_file(${JSON.stringify(marker)}, "shadow module executed")\n`);
    const contract = { name: "Task", goal: "Review", acceptance_criteria: ["api_key=fixtureSecret123"],
      human_approval_points: ["Human reviews the result"],
      metadata: { hidden: "do-not-retain-metadata" },
      eval_requirements: [{ description: "Declared check", check_type: "command_succeeds", params: { command: `node -e 'require("fs").writeFileSync(${JSON.stringify(marker)},"executed")'`, extra: "do-not-retain-params" } }] };
    await writeFile(join(input.cwd, input.path), JSON.stringify(contract));
    const report = await inspectSpec(input);
    expect(report.validation.status).toBe("passed");
    expect(report.contract?.checks).toEqual([{ description: "Declared check", checkType: "command_succeeds", status: "not-run" }]);
    expect(report.contract?.approvalPoints).toEqual(["Human reviews the result"]);
    expect(report.redactedCount).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toMatch(/fixtureSecret123|do-not-retain|writeFileSync/);
    await expect(access(marker)).rejects.toThrow();
  }, 60_000);

  it("bounds discovery, rejects ignored/sensitive paths, and enforces feature disablement", async () => {
    const input = await fixture('{"name":"Task","goal":"Review"}');
    await writeFile(join(input.cwd, ".gitignore"), "hidden.spec.json\n");
    await writeFile(join(input.cwd, "hidden.spec.json"), "{}");
    await writeFile(join(input.cwd, ".env.spec.json"), "{}");
    expect((await discoverSpecs(input.cwd)).files).toEqual([input.path]);
    for (const path of ["../task.spec.json", "/tmp/task.spec.json", "C:/task.spec.json", "src\\task.spec.json", ".env.spec.json", "task.json", "main.kujo"]) expect(specPathSchema.safeParse(path).success).toBe(false);
    await expect(inspectSpec({ ...input, path: "hidden.spec.json" })).rejects.toMatchObject({ code: "KUJO_WORKSPACE_OUTSIDE_ALLOWED_ROOT" });
    await expect(inspectSpec({ ...input, config: parsePluginConfig({}) })).rejects.toThrow("disabled");
  });

  it("rejects oversized or binary contracts and nested input beyond the adapter bound", async () => {
    const input = await fixture(" ".repeat(65537));
    await expect(inspectSpec(input)).rejects.toMatchObject({ code: "KUJO_OUTPUT_LIMIT" });
    await writeFile(join(input.cwd, input.path), Buffer.from([0, 1, 2]));
    await expect(inspectSpec(input)).rejects.toMatchObject({ code: "KUJO_INVALID_CONFIG" });
    const nested = JSON.parse('{"child":'.repeat(34) + '{}' + '}'.repeat(34));
    await writeFile(join(input.cwd, input.path), JSON.stringify(nested));
    expect((await inspectSpec(input)).validation).toMatchObject({ status: "failed", native: false, errors: ["Contract exceeds the maximum nesting depth of 32."] });
  }, 60_000);
});

describe("scoped Spec bridge", () => {
  async function harness(input: Awaited<ReturnType<typeof fixture>>, profile = "installed") {
    const h = createTestHarness({ manifest, config: { features: { verification: true }, capabilityProfile: profile } });
    const workspace: PluginWorkspace = { id: input.workspaceId, projectId: input.projectId, path: input.cwd, name: "Fixture", repoUrl: null, repoRef: null, defaultRef: null, isPrimary: true, createdAt: "", updatedAt: "" };
    vi.spyOn(h.ctx.projects, "getPrimaryWorkspace").mockImplementation(async (_id, companyId) => companyId === "company" ? workspace : null);
    await plugin.definition.setup(h.ctx);
    return h;
  }
  it("persists scoped contract receipts across worker contexts without passing declared checks", async () => {
    const input = await fixture('{"name":"Task","goal":"Review","acceptance_criteria":["A declared outcome"]}');
    const h = await harness(input);
    const target = { entityType: "project" as const, entityId: "project", companyId: "company" };
    const result = await h.executeTool("inspect-task-contract", { path: input.path }, { companyId: "company", projectId: "project" });
    expect(result.error).toBeUndefined(); expect(result.data).not.toHaveProperty("snapshot");
    const restarted = await harness(input);
    const [receipt] = await listEvidence(restarted.ctx, target);
    expect(receipt).toMatchObject({ kind: "spec-latest", sourceKind: "observed", result: "contract passed" });
    const stored = await getEvidence(restarted.ctx, target, receipt!.id);
    expect(stored?.payload.kujoProjection).toMatchObject({ id: "kujo.paperclip.spec.inspect", canonical: [expect.objectContaining({ id: "kujo.spec.contract.validate" })] });
    expect((stored?.payload.contract as SpecReport["contract"])?.criteria[0]?.status).toBe("not-run");
    expect(await listEvidence(restarted.ctx, { ...target, companyId: "other" })).toEqual([]);
    const detail = await restarted.getData<{ spec: SpecReport }>("detail", target);
    expect(detail.spec.stale).toBe(false);
    await writeFile(join(input.cwd, input.path), '{"name":"Changed","goal":"Review"}');
    expect((await restarted.getData<{ spec: SpecReport }>("detail", target)).spec.stale).toBe(true);
    expect((await getEvidence(restarted.ctx, target, receipt!.id))?.payload.stale).toBe(false);
  }, 60_000);

  it("enforces host company, exact arguments, target kinds and profile admission", async () => {
    const input = await fixture('{"name":"Task","goal":"Review"}');
    const h = await harness(input);
    const params = { entityType: "project", entityId: "project", path: input.path };
    await expect(h.performAction("inspect-task-contract", params)).rejects.toThrow("Company context");
    await expect(h.performAction("inspect-task-contract", { ...params, entityType: "run" }, { companyId: "company" })).rejects.toThrow();
    expect((await h.executeTool("inspect-task-contract", { path: input.path, companyId: "company" }, { companyId: "other", projectId: "project" })).error).toBeTruthy();
    expect((await h.executeTool("inspect-task-contract", { path: input.path }, { companyId: "other", projectId: "project" })).error).toBeTruthy();
    const build = await harness(input, "build");
    await expect(build.performAction("inspect-task-contract", params, { companyId: "company" })).rejects.toThrow("disabled");
    const review = await harness(input, "review");
    await expect(review.performAction("inspect-task-contract", params, { companyId: "company" })).resolves.toMatchObject({ status: "passed" });
  }, 60_000);
});
