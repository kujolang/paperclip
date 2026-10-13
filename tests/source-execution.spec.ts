import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness } from "./helpers/harness.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { safeChildEnv } from "../src/runtime/execute-kujo.js";
import { removeTree } from "../src/runtime/files.js";
import { sourceExecutionEnabled } from "../src/features/source-execution/host.js";
import { parsePluginConfig } from "../src/config/schema.js";
import { validateAbilityReceipt } from "../bundled/ability-contract/index.js";
import { executionLedger } from "../src/execution/ledger.js";
import type { sourceExecutionView } from "../src/features/source-execution/bridge.js";

type View = ReturnType<typeof sourceExecutionView> & { history: { status: string; outcomeId: string; planId: string } };
const roots: string[] = [];
afterEach(async () => { await plugin.definition.onShutdown?.(); await Promise.all(roots.splice(0).map(removeTree)); });
const scope = { companyId: "company", issueId: "issue" }, run = { companyId: "company", projectId: "project", agentId: "agent", runId: "run" };
const human = { companyId: "company", actor: { type: "user" as const, userId: "board", companyId: "company" } };
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "kujo-source-public-")); roots.push(cwd);
  execFileSync("git", ["init", "--quiet", cwd], { env: safeChildEnv() });
  await writeFile(join(cwd, "main.kujo"), 'print("approved source")\nwrite_file("created.txt", "private output")\n');
  await writeFile(join(cwd, "checks.kujo"), 'test "arithmetic" { assert(2 + 2 == 4, "four") }\n');
  await mkdir(join(cwd, "tests"));
  await writeFile(join(cwd, "tests/fixture.kujo"), 'print("fixture result")\n');
  await writeFile(join(cwd, "tests/fixture.out"), 'fixture result\n');
  await writeFile(join(cwd, "eval.json"), JSON.stringify({ name: "Separate Eval", tests: [{ name: "text", check: "file_exists", params: { path: "main.kujo" } }] }));
  const h = createTestHarness({ manifest, config: { features: { sourceExecution: true, execution: true } } });
  h.ctx.issues.get = async (id, companyId) => ({ id, companyId, projectId: "project", assigneeAgentId: "agent", checkoutRunId: "run" } as Awaited<ReturnType<PluginContext["issues"]["get"]>>);
  h.ctx.projects.getWorkspaceForIssue = async () => ({ id: "workspace", projectId: "project", path: cwd } as Awaited<ReturnType<PluginContext["projects"]["getWorkspaceForIssue"]>>);
  type Card = Awaited<ReturnType<PluginContext["issues"]["requestConfirmation"]>>;
  const cards: Card[] = [];
  h.ctx.issues.requestConfirmation = async (issueId, input, companyId) => { const card = { ...input, id: `card-${cards.length}`, issueId, companyId, kind: "request_confirmation", status: "pending", requestedResolverPolicy: "human_only", effectiveResolverPolicy: "human_only" } as Card; cards.push(card); return card; };
  h.ctx.issues.listInteractions = async () => cards;
  await plugin.definition.setup(h.ctx);
  const action = (input: Record<string, unknown>) => h.performAction<View>("manage-kujo-execution", { issueId: "issue", ...input }, human);
  const approve = (id: string) => { const card = cards.find(c => c.id === id)!; card.status = "accepted"; card.result = { version: 1, outcome: "accepted" }; card.resolvedByUserId = "board"; card.resolvedAt = new Date().toISOString(); };
  return { cwd, h, cards, action, approve, prepare: (submissionId = "source", mode = "run", path: string | undefined = "main.kujo") => action({ operation: "prepare", mode, ...(mode === "fixtures" ? {} : { path }), submissionId }),
    tool: (input: Record<string, unknown>, context = run) => h.executeTool("manage-kujo-execution", { issueId: "issue", ...input }, context) };
}
describe("approved Kujo run/test", () => {
  it("has a separate opt-in and selects only Installed/Build/Full", () => {
    expect(sourceExecutionEnabled(parsePluginConfig({ features: { execution: true } }))).toBe(false);
    for (const capabilityProfile of ["installed", "build", "full"] as const) expect(sourceExecutionEnabled(parsePluginConfig({ capabilityProfile, features: { sourceExecution: true } }))).toBe(true);
    for (const capabilityProfile of ["review", "ship", "essentials"] as const) expect(sourceExecutionEnabled(parsePluginConfig({ capabilityProfile, features: { sourceExecution: true } }))).toBe(false);
  });
  // Multiple native preparations, approval checks and retained-history reads
  // need a whole-test budget beyond 5s on Intel CI; process limits stay unchanged.
  it("runs reviewed bytes only after human approval and retains a parent-linked portable host receipt", async () => {
    const f = await fixture(), prepared = await f.prepare();
    expect(prepared).toMatchObject({ state: "pending", plan: { operation: "source.run", effects: ["read_workspace", "write_files", "execute_project", "network"] } });
    expect(prepared.plan.preview).toContain('approved source'); expect(prepared).not.toHaveProperty("ownerId");
    expect(await f.prepare()).toMatchObject({ id: prepared.id }); expect(f.cards).toHaveLength(1);
    await expect(f.action({ operation: "start", id: prepared.id })).rejects.toThrow(/human approval/);
    f.approve(prepared.interactionId!);
    const result = await f.action({ operation: "start", id: prepared.id });
    expect(result).toMatchObject({ state: "succeeded", result: { classification: "process-completed", stdout: "approved source\n" }, history: { status: "retained" } });
    expect(validateAbilityReceipt(result.abilityReceipt).ok).toBe(true);
    expect(result.abilityReceipt).toMatchObject({ ability_id: "kujo.paperclip.source.execute", handler_id: "kujo.paperclip.source.host" });
    expect(await stat(join(f.cwd, "created.txt")).catch(() => null)).toBeNull();
    const exported = await f.h.executeTool("get-evidence", { scope: "issue", issueId: "issue", evidenceId: result.history.outcomeId }, run);
    expect(exported.data).toMatchObject({ receipt: { kind: "source-execution-result" }, parent: { status: "retained" }, payload: { native: { exitCode: 0 } } });
    expect(await f.action({ operation: "start", id: prepared.id })).toEqual(result);
  }, 20000);
  it("retains safe preparation diagnostics and never replays missing-source failures", async () => {
    const f = await fixture(), prepared = await f.prepare(); f.approve(prepared.interactionId!);
    await unlink(join(f.cwd, "main.kujo"));
    const result = await f.action({ operation: "start", id: prepared.id });
    expect(result).toMatchObject({ state: "failed", diagnostic: "source_preparation:select_source:source_missing", result: null, history: { status: "retained" } });
    expect(result.abilityReceipt).toMatchObject({ result: null, error: { details: { diagnostic: result.diagnostic } } });
    const exported = await f.h.executeTool("get-evidence", { scope: "issue", issueId: "issue", evidenceId: result.history.outcomeId }, run);
    expect(exported.data).toMatchObject({ payload: { diagnostic: result.diagnostic, native: null, classification: "not-run" } });
    await writeFile(join(f.cwd, "main.kujo"), 'print("restored source")\n');
    expect(await f.action({ operation: "start", id: prepared.id })).toEqual(result);
    expect(await stat(join(f.cwd, "created.txt")).catch(() => null)).toBeNull();
  }, 20000);
  it("runs native test-file and fixture commands with actual success/failure output", async () => {
    const f = await fixture();
    for (const [mode, path] of [["test", "checks.kujo"], ["fixtures", undefined]] as const) {
      const request = await f.prepare(mode, mode, path); f.approve(request.interactionId!);
      const result = await f.action({ operation: "start", id: request.id });
      expect(result.state, JSON.stringify(result)).toBe("succeeded"); expect(result.result?.exitCode).toBe(0);
      expect(result.result?.stdout).toMatch(/passed|PASS|Passed/);
    }
    await writeFile(join(f.cwd, "checks.kujo"), 'test "failure" { assert(false, "expected failure") }\n');
    const failed = await f.prepare("failed-test", "test", "checks.kujo"); f.approve(failed.interactionId!);
    expect(await f.action({ operation: "start", id: failed.id })).toMatchObject({ state: "failed", result: { classification: "process-failed" } });
    await writeFile(join(f.cwd, "empty.kujo"), 'print("No assertions")\n');
    const empty = await f.prepare("empty-test", "test", "empty.kujo"); f.approve(empty.interactionId!);
    const emptyResult = await f.action({ operation: "start", id: empty.id });
    expect(emptyResult.result?.classification).not.toBe("passed");
    expect(emptyResult.result?.notice).toContain("no independent test count");
  }, 30000);
  it("separates Eval and source operations in the shared ledger and history", async () => {
    const f = await fixture();
    const evaluation = await f.h.performAction<View>("manage-evaluation", { issueId: "issue", operation: "prepare", suite: "eval.json", submissionId: "eval" }, human);
    const source = await f.prepare();
    await expect(f.action({ operation: "cancel", id: evaluation.id })).rejects.toThrow(/operation/);
    await expect(f.h.performAction("manage-evaluation", { issueId: "issue", operation: "start", id: source.id }, human)).rejects.toThrow(/operation/);
    expect((await f.action({ operation: "list" }) as unknown as { requests: unknown[] }).requests).toHaveLength(1);
    f.approve(source.interactionId!); await f.action({ operation: "start", id: source.id });
    const evalList = await f.h.performAction<{ requests: unknown[]; history: { pending: boolean } }>("manage-evaluation", { issueId: "issue", operation: "list" }, human);
    expect(evalList.requests).toHaveLength(1); expect(evalList.history.pending).toBe(false);
  });
  it("rejects authority injection, caller flags, unsafe paths and foreign requests", async () => {
    const f = await fixture();
    await expect(f.h.performAction("manage-kujo-execution", { issueId: "issue", operation: "list" })).rejects.toThrow(/human/);
    for (const extra of [{ command: "sh" }, { args: ["--update"] }, { requester: { kind: "human", id: "forged" } }, { approvalId: "forged" }]) await expect(f.action({ operation: "prepare", mode: "run", path: "main.kujo", submissionId: "bad", ...extra })).rejects.toThrow();
    for (const path of ["../escape.kujo", "/absolute.kujo", "C:/escape.kujo", "main.json"]) await expect(f.prepare("bad", "run", path)).rejects.toThrow();
    await expect(f.action({ operation: "inspect", mode: "fixtures", path: "elsewhere" })).rejects.toThrow(/omit path/);
    const request = await f.prepare();
    await expect(f.h.performAction("manage-kujo-execution", { operation: "status", issueId: "issue", id: request.id }, { companyId: "other", actor: { type: "user", companyId: "other", userId: "board" } })).rejects.toThrow(/operation/);
    expect(f.cards).toHaveLength(1);
  });
  it("invalidates changed source, policy and native-operation bindings before execution", async () => {
    const f = await fixture(), request = await f.prepare(); f.approve(request.interactionId!);
    await writeFile(join(f.cwd, "main.kujo"), 'print("changed")\n');
    expect(await f.action({ operation: "start", id: request.id })).toMatchObject({ state: "stale" });
    const policy = await f.prepare("policy"); f.approve(policy.interactionId!);
    f.h.ctx.config.get = async () => ({ features: { sourceExecution: true }, limits: { maxStdoutBytes: 1024 } });
    expect(await f.action({ operation: "start", id: policy.id })).toMatchObject({ state: "stale" });
  }, 20000);
  it("keeps omitted inputs explicit and never executes during inspection", async () => {
    const f = await fixture();
    await writeFile(join(f.cwd, ".env"), "FIXTURE_TOKEN=not-a-real-credential\n");
    await writeFile(join(f.cwd, "opaque.bin"), Buffer.from([0, 255]));
    const inspected = await f.action({ operation: "inspect", mode: "run", path: "main.kujo" });
    expect(inspected).toMatchObject({ coverage: { complete: false, excludedSensitive: 1, omittedFiles: 1 } });
    expect(JSON.stringify(inspected)).not.toContain("not-a-real-credential");
    expect(await stat(join(f.cwd, "created.txt")).catch(() => null)).toBeNull(); expect(f.cards).toHaveLength(0);
  });
  it("binds agents to their current assigned issue and preserves disabled cancellation", async () => {
    const f = await fixture();
    expect((await f.tool({ operation: "list" }, { ...run, runId: "old" })).error).toContain("assigned issue");
    const humanRequest = await f.prepare();
    expect((await f.tool({ operation: "cancel", id: humanRequest.id })).error).toContain("requesting agent run");
    const prepared = (await f.tool({ operation: "prepare", mode: "run", path: "main.kujo", submissionId: "agent" })).data as View;
    expect((await f.tool({ operation: "start", id: prepared.id })).error).toContain("human approval");
    f.approve(prepared.interactionId!);
    expect((await f.tool({ operation: "start", id: prepared.id })).data).toMatchObject({ state: "succeeded" });
    f.h.ctx.config.get = async () => ({ features: { sourceExecution: false } });
    await expect(f.action({ operation: "status", id: prepared.id })).rejects.toThrow(/disabled/);
    expect(await f.action({ operation: "cancel", id: humanRequest.id })).toMatchObject({ state: "cancelled" });
    const listed = await f.action({ operation: "list" }) as unknown as { requests: unknown[] };
    expect(listed.requests).toHaveLength(2); expect(listed.requests[0]).not.toHaveProperty("plan");
  });
  it("cancels an owned command through persisted ownership and times out bounded runs", async () => {
    const f = await fixture(); await writeFile(join(f.cwd, "loop.kujo"), 'while true {}\n');
    const request = await f.prepare("cancel", "run", "loop.kujo"); f.approve(request.interactionId!);
    const running = f.action({ operation: "start", id: request.id });
    await expect.poll(async () => (await executionLedger(f.h.ctx).read(scope, request.id))?.state).toBe("running");
    expect(await f.action({ operation: "cancel", id: request.id })).toMatchObject({ state: "cancelled" });
    expect(await running).toMatchObject({ state: "cancelled" });
    f.h.ctx.config.get = async () => ({ features: { sourceExecution: true }, limits: { timeoutMs: 1000 } });
    const timeout = await f.prepare("timeout", "run", "loop.kujo"); f.approve(timeout.interactionId!);
    expect(await f.action({ operation: "start", id: timeout.id })).toMatchObject({ state: "failed", diagnostic: "KUJO_EXEC_TIMEOUT", abilityReceipt: { status: "timed_out" } });
  }, 20000);
});
