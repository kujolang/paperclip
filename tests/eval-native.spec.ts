import type { PluginContext } from "@paperclipai/plugin-sdk";
import { createTestHarness } from "./helpers/harness.js";
import manifest from "../src/manifest.js";
import { createExecutionCoordinator } from "../src/execution/coordinator.js";
import { describe, expect, it } from "vitest";
import { access, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { prepareNativeEval } from "../src/features/eval/native.js";
import { resolveKujo } from "../src/runtime/resolve-kujo.js";
import { parsePluginConfig } from "../src/config/schema.js";
import { executeKujo } from "../src/runtime/execute-kujo.js";
import type { ExecutionPlan } from "../src/execution/contracts.js";
import { evidenceDigest } from "../src/storage/history.js";

const runtime = () => resolveKujo(parsePluginConfig({}), process.cwd());
const file = { path: "answer.json", content: '{"answer":42}\n' };
function plan(prepared: Awaited<ReturnType<typeof prepareNativeEval>>): ExecutionPlan {
  return { ...prepared.binding, operation: "eval.run", suite: prepared.suite, summary: prepared.summary, effects: prepared.effects,
    projectId: "project", workspaceId: "workspace", workspaceDigest: evidenceDigest({ fixture: true }), timeoutMs: 10_000 };
}
async function prepare(tests: unknown[], extra = {}) {
  return prepareNativeEval({ runtime: await runtime(), suite: "eval.json", files: [file,
    { path: "eval.json", content: JSON.stringify({ name: "Paperclip native fixture", ...extra, tests }) }] });
}
async function run(prepared: Awaited<ReturnType<typeof prepare>>) {
  const work = await prepared.materialize(plan(prepared), new AbortController().signal);
  expect(work).not.toBeNull();
  try {
    const result = await executeKujo({ ...work!.invocation, timeoutMs: 10_000, maxStdoutBytes: 500_000, maxStderrBytes: 65_536 });
    return { result, receipt: await work!.collect(result) };
  } finally { await work!.dispose(); await expect(access(work!.invocation.cwd)).rejects.toThrow(); }
}
describe("canonical Eval frozen-input execution", () => {
  it("runs canonical JSON/file checks and binds native results to copied input and component digests", async () => {
    const prepared = await prepare([
      { name: "file", check: "file_exists", params: { path: "answer.json" } },
      { name: "answer", check: "json_value_equals", params: { path: "answer.json", json_path: "answer", expected: 42 } },
    ]);
    const { result, receipt } = await run(prepared);
    expect(result.exitCode).toBe(0);
    expect(receipt).toMatchObject({ sourceKind: "native", executionObserved: true, scope: "frozen-inputs", classification: "passed",
      inputDigest: prepared.binding.inputDigest, definitionDigest: prepared.binding.definitionDigest,
      result: { checks: { passed: 2, failed: 0, skipped: 0 } }, provenance: { component: "eval", commit: "71e66dff780d6930bcbe093c046bf31aa26411df" } });
  });
  it("retains real failure and skipped-check classifications instead of promoting process completion to success", async () => {
    const { result, receipt } = await run(await prepare([
      { name: "missing", check: "file_exists", params: { path: "missing.txt" } },
      { name: "dependent", check: "file_exists", params: { path: "answer.json" }, depends_on: ["missing"] },
    ]));
    expect(result.exitCode).toBe(1);
    expect(receipt).toMatchObject({ classification: "failed", result: { checks: { failed: 1, skipped: 1 } } });
  });
  it("delegates command hooks and network checks to native Eval with all effects declared", async () => {
    const server = createServer((_request, response) => { response.end("fixture response"); });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing test port");
      const prepared = await prepare([
        { name: "command", check: "command_succeeds", params: { command: "echo eval-fixture" } },
        { name: "http", check: "http_status", params: { url: `http://127.0.0.1:${address.port}`, expected: 200 } },
      ], { setup: "echo setup-fixture", teardown: "echo teardown-fixture" });
      expect(prepared.effects).toEqual(["read_workspace", "write_reports", "execute_project", "network"]);
      expect((await run(prepared)).receipt).toMatchObject({ classification: "passed", result: { checks: { passed: 2 } } });
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it("runs canonical snapshot updates within the private input copy", async () => {
    const prepared = await prepare([{ name: "snapshot", check: "snapshot_matches", params: { name: "fixture", content: "approved fixture", update: "true" } }]);
    expect((await run(prepared)).receipt).toMatchObject({ classification: "passed", result: { checks: { passed: 1 } } });
  });
  it("persists canonical failed receipts only after coordinator approval", async () => {
    const prepared = await prepare([{ name: "missing", check: "file_exists", params: { path: "missing.txt" } }]);
    const h = createTestHarness({ manifest });
    h.ctx.issues.get = async (id, companyId) => ({ id, companyId, projectId: "project" } as Awaited<ReturnType<typeof h.ctx.issues.get>>);
    h.ctx.projects.getWorkspaceForIssue = async () => ({ id: "workspace", projectId: "project", path: process.cwd() } as Awaited<ReturnType<typeof h.ctx.projects.getWorkspaceForIssue>>);
    type Card = Awaited<ReturnType<PluginContext["issues"]["requestConfirmation"]>>;
    const cards: Card[] = [];
    h.ctx.issues.requestConfirmation = async (issueId, input, companyId) => {
      const card = { ...input, id: "native-eval-card", issueId, companyId, kind: "request_confirmation", status: "pending", requestedResolverPolicy: "human_only", effectiveResolverPolicy: "human_only" } as Card;
      cards.push(card); return card;
    };
    h.ctx.issues.listInteractions = async () => cards;
    const service = createExecutionCoordinator(h.ctx, { materialize: async (_scope, approved, signal) => prepared.materialize(approved, signal) });
    const scope = { companyId: "company", issueId: "issue" };
    try {
      const request = await service.prepare(scope, "native-eval", { requester: { kind: "human", id: "human" }, plan: plan(prepared) });
      await expect(service.start(scope, request.id)).rejects.toThrow(/human approval/);
      const card = cards[0]!; card.status = "accepted"; card.result = { version: 1, outcome: "accepted" }; card.resolvedByUserId = "human"; card.resolvedAt = new Date().toISOString();
      const result = await service.start(scope, request.id);
      expect(result).toMatchObject({ state: "failed", approvedBy: "human", result: { sourceKind: "native", classification: "failed", inputDigest: prepared.binding.inputDigest } });
      expect(await service.start(scope, request.id)).toEqual(result);
    } finally { await service.shutdown(); }
  });
  it("rejects missing effects, changed bindings and pre-cancelled materialization", async () => {
    const prepared = await prepare([{ name: "file", check: "file_exists", params: { path: "answer.json" } }]);
    expect(await prepared.materialize({ ...plan(prepared), effects: ["read_workspace"] }, new AbortController().signal)).toBeNull();
    expect(await prepared.materialize({ ...plan(prepared), inputDigest: "0".repeat(64) }, new AbortController().signal)).toBeNull();
    const signal = AbortSignal.abort(); expect(await prepared.materialize(plan(prepared), signal)).toBeNull();
  });
  it("captures caller bytes before awaits and rejects invalid, sensitive and ambiguous snapshots", async () => {
    const selectedRuntime = await runtime();
    const files = [{ path: "eval.json", content: JSON.stringify({ name: "frozen", tests: [{ name: "present", check: "file_exists", params: { path: "answer.json" } }] }) }, { ...file }];
    const task = prepareNativeEval({ runtime: selectedRuntime, suite: "eval.json", files });
    files[1]!.content = "changed by caller";
    const prepared = await task; const work = await prepared.materialize(plan(prepared), new AbortController().signal);
    try { expect(await readFile(join(work!.invocation.cwd, "answer.json"), "utf8")).toBe(file.content); }
    finally { await work!.dispose(); }
    for (const invalid of [
      [{ path: "eval.json", content: "{}" }],
      [{ path: "../eval.json", content: "{}" }],
      [...files, { path: ".env", content: "secret" }],
      [...files, { path: "ANSWER.json", content: "ambiguous" }],
      [...files, { path: "NUL.txt", content: "reserved" }],
      [...files, { path: ".GIT/config", content: "reserved" }],
      [...files, { path: "answer.json ", content: "ambiguous" }],
      [...files, { path: "big.txt", content: "x".repeat(65_537) }],
    ]) await expect(prepareNativeEval({ runtime: selectedRuntime, suite: "eval.json", files: invalid })).rejects.toThrow();
  });
  it("refuses mismatched subject and oversized canonical artifacts", async () => {
    const prepared = await prepare([{ name: "file", check: "file_exists", params: { path: "answer.json" } }]);
    const work = (await prepared.materialize(plan(prepared), new AbortController().signal))!;
    try {
      const result = await executeKujo({ ...work.invocation, timeoutMs: 10_000, maxStdoutBytes: 500_000, maxStderrBytes: 65_536 });
      const output = work.invocation.args[work.invocation.args.indexOf("--output-dir") + 1]!;
      const filename = join(output, "evaluation-result.json");
      const record = JSON.parse(await readFile(filename, "utf8")); record.subject.run_id = "forged-other-run";
      await writeFile(filename, JSON.stringify(record)); await expect(work.collect(result)).rejects.toThrow(/contradicts/);
      await writeFile(filename, "x".repeat(65_537)); await expect(work.collect(result)).rejects.toThrow(/bounded/);
      if (process.platform !== "win32") {
        await rm(filename); await symlink(join(work.invocation.cwd, "answer.json"), filename);
        await expect(work.collect(result)).rejects.toThrow(/redirected/);
      }
    } finally { await work.dispose(); }
  });
});
