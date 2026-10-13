import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { resolveKujoBinary } from "@kujolang/kujo-runtime";
import { afterEach, describe, expect, it } from "vitest";
import { dispatchCommandSchema, prepareDispatchInvocation, type DispatchCommand } from "../src/features/dispatch/native.js";
import { openWorkflowStorage } from "../src/execution/workflow-storage.js";
import { executeSupervisedKujo } from "../src/runtime/supervised-kujo.js";
import type { ResolvedRuntime } from "../src/runtime/types.js";

const binary = process.env.KUJO_INTEGRATION_BINARY ? resolve(process.env.KUJO_INTEGRATION_BINARY) : resolveKujoBinary();
const runtime: ResolvedRuntime = { executable: binary, runtimeVersion: "1.8.1", source: "bundled", platform: process.platform, arch: process.arch };
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kujo-dispatch-native-test-")); roots.push(root);
  const storageRoot = join(root, "storage"); await mkdir(storageRoot, { mode: 0o700 });
  const storageBinding = { installationId: "fixture", companyId: "company", issueId: "issue", executionId: "execution", requestDigest: "b".repeat(64) };
  const native = await (await openWorkflowStorage(storageRoot)).reserve(storageBinding);
  const input = { runtime, storageRoot, storageBinding };
  const invoke = async (command: DispatchCommand) => {
    const prepared = await prepareDispatchInvocation({ ...input, command });
    try { return await executeSupervisedKujo(prepared.invocation); }
    finally { await prepared.dispose(); }
  };
  return { ...input, ...native, invoke };
}
const posix = process.platform === "darwin" || process.platform === "linux";
describe.skipIf(!posix)("bundled canonical Dispatch", () => {
  it("lists templates and recovers an offline paused run without loading workspace modules", async () => {
    const f = await fixture();
    await mkdir(join(f.nativeRoot, "src/cli"), { recursive: true });
    await writeFile(join(f.nativeRoot, "src/cli/cli_args.kujo"), 'write_file("shadow-executed", "bad")\nthrow("workspace import selected")\n');
    const templates = await f.invoke({ operation: "templates" }); expect(templates.exitCode).toBe(0);
    expect(JSON.parse(templates.stdout).templates.map((t: { template_id: string }) => t.template_id)).toEqual(["research-report", "crud-reliability", "approval-handoff"]);
    const started = await f.invoke({ operation: "start-fixture", template: "approval-handoff", topic: "Bundled Paperclip workflow" }); expect(started.exitCode, started.stderr).toBe(0);
    const runs = await f.invoke({ operation: "runs" }); expect(runs.exitCode, runs.stderr).toBe(0);
    const listed = JSON.parse(runs.stdout);
    const run = listed.runs[0]; expect(run.status).toBe("paused");
    const inspected = await f.invoke({ operation: "inspect", runId: run.run_id }); expect(inspected.exitCode, inspected.stderr).toBe(0);
    const result = JSON.parse(inspected.stdout); expect(result.summary.status).toBe("paused"); expect(result.summary.artifacts.report_json).toBe(false);
    await expect(access(join(f.nativeRoot, "shadow-executed"))).rejects.toThrow();
    // Code disposal after every invocation must preserve the native run directory.
    expect(JSON.parse(await readFile(join(f.nativeRoot, "runs", run.run_id, "state.json"), "utf8")).status).toBe("paused");
  }, 120_000);

  it("applies a revision-bound decision once and preserves the next independent approval", async () => {
    const f = await fixture();
    const prepared = await prepareDispatchInvocation({ ...f, command: { operation: "templates" } });
    try {
      // Unmodified canonical contract fixtures from the same Dispatch pin.
      const code = dirname(prepared.invocation.args[2]!); await mkdir(join(code, "tests"));
      await copyFile("tests/fixtures/dispatch/resume_policy_fixture.kujo", join(code, "resume_policy_fixture.kujo"));
      await copyFile("tests/fixtures/dispatch/control_boundary_fixtures.kujo", join(code, "tests/control_boundary_fixtures.kujo"));
      const paused = await executeSupervisedKujo({ ...prepared.invocation, args: ["run", "--isolated-imports", join(code, "resume_policy_fixture.kujo"), "--", "runs", "v2", "two-gates"] });
      expect(paused.exitCode, paused.stderr).toBe(0);
    } finally { await prepared.dispose(); }
    const original = JSON.parse(await readFile(join(f.nativeRoot, "runs/decision.json"), "utf8"));
    const command = dispatchCommandSchema.parse({ operation: "decide", decision: { ...original, continuation: {} } });
    if (command.operation !== "decide") throw new Error("Expected decision fixture");
    const statePath = join(f.nativeRoot, "runs", command.decision.run_id, "state.json");
    const before = await readFile(statePath, "utf8");
    const stale = await f.invoke({ operation: "decide", decision: { ...command.decision, expected_state_revision: command.decision.expected_state_revision - 1 } });
    expect(stale.exitCode).not.toBe(0); expect(stale.stderr + stale.stdout).toContain("stale_intervention_decision"); expect(await readFile(statePath, "utf8")).toBe(before);
    const applied = await f.invoke(command); expect(applied.exitCode, applied.stderr).toBe(0);
    const after = await readFile(statePath, "utf8"), state = JSON.parse(after);
    expect(state.status).toBe("paused"); expect(state.steps[0].attempts).toBe(1); expect(state.steps[1].status).toBe("paused"); expect(state.steps[2].attempts).toBe(0);
    const repeated = await f.invoke(command); expect(JSON.parse(repeated.stdout).status).toBe("already_applied"); expect(await readFile(statePath, "utf8")).toBe(after);
    const conflict = await f.invoke({ operation: "decide", decision: { ...command.decision, reason: "Changed decision" } });
    expect(conflict.exitCode).not.toBe(0); expect(conflict.stdout + conflict.stderr).toContain("conflicting_intervention_decision"); expect(await readFile(statePath, "utf8")).toBe(after);
  }, 120_000);
});

it("rejects arbitrary command options, traversal and unadmitted decision effects", () => {
  expect(() => dispatchCommandSchema.parse({ operation: "start-fixture", template: "approval-handoff", topic: "x", yes: true })).toThrow();
  expect(() => dispatchCommandSchema.parse({ operation: "inspect", runId: "../../foreign" })).toThrow();
  expect(() => dispatchCommandSchema.parse({ operation: "cleanup" })).toThrow();
  expect(() => dispatchCommandSchema.parse({ operation: "start-fixture", template: "approval-handoff", topic: " --yes " })).toThrow();
  expect(() => dispatchCommandSchema.parse({ operation: "start-fixture", template: "approval-handoff", topic: "bad\0topic" })).toThrow();
  expect(() => dispatchCommandSchema.parse({ operation: "decide", decision: { action: "retry_step" } })).toThrow();
});
it.skipIf(posix)("does not admit Dispatch execution on unsupported platforms", async () => {
  await expect(prepareDispatchInvocation({ command: { operation: "templates" }, runtime, storageRoot: "unused", storageBinding: { installationId: "i", companyId: "c", issueId: "x", executionId: "e", requestDigest: "a".repeat(64) } })).rejects.toThrow("POSIX");
});
