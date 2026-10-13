// Development-only worker for isolated, authenticated host acceptance.
// Never published by package.json's files list or enabled in src/worker.ts.
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { createExecutionCoordinator } from "../../src/execution/coordinator.js";
import { evidenceDigest } from "../../src/storage/history.js";
import { resolveWorkspace } from "../../src/paperclip/workspace.js";
import { resolveKujo } from "../../src/runtime/resolve-kujo.js";
import { parsePluginConfig } from "../../src/config/schema.js";
import { createEvalHostService } from "../../src/features/eval/host.js";
import { prepareNativeEval } from "../../src/features/eval/native.js";
import type { ResolvedRuntime } from "../../src/runtime/types.js";
import { removeTree } from "../../src/runtime/files.js";

const programs = {
  complete: 'print("authenticated host fixture completed")\n',
  slow: "mut i = 0\nwhile true { i = i + 1 }\n",
  supervised: 'mut i = 0\nwhile true {\nwrite_file("supervisor-heartbeat", to_string(i), true)\nsleep(50)\ni = i + 1\n}\n',
} as const;
const fixtureDigest = (mode: keyof typeof programs) => evidenceDigest({ fixture: programs[mode], version: 1 });
const runtimeDigest = async (executable: string) => createHash("sha256").update(await readFile(executable)).digest("hex");
const evalFixture = (runtime: ResolvedRuntime, fail: boolean) => prepareNativeEval({ runtime, suite: fail ? "eval-fail.json" : "eval.json", files: [
  { path: "answer.json", content: '{"answer":42}' },
  { path: fail ? "eval-fail.json" : "eval.json", content: JSON.stringify({ name: "Authenticated canonical Eval fixture", tests: [
    { name: "answer", check: "json_value_equals", params: { path: "answer.json", json_path: "answer", expected: fail ? 41 : 42 } },
  ] }) },
] });
let shutdown: (() => Promise<void>) | undefined;
const plugin = definePlugin({
  async setup(ctx) {
    const config = parsePluginConfig({});
    const service = createExecutionCoordinator(ctx, {
      async materialize(scope, plan, signal) {
        const workspace = await resolveWorkspace(ctx, { entityType: "issue", entityId: scope.issueId, companyId: scope.companyId });
        if (workspace.id !== plan.workspaceId || workspace.projectId !== plan.projectId || plan.workspaceDigest !== evidenceDigest({ id: workspace.id, path: workspace.path })) return null;
        if (plan.suite === "eval.json" || plan.suite === "eval-fail.json") {
          const runtime = await resolveKujo(config, workspace.path);
          return await (await evalFixture(runtime, plan.suite === "eval-fail.json")).materialize(plan, signal);
        }
        const mode = plan.suite === "slow" ? "slow" : plan.suite === "supervised" ? "supervised" : "complete";
        if (workspace.id !== plan.workspaceId || workspace.projectId !== plan.projectId || plan.inputDigest !== fixtureDigest(mode) || plan.workspaceDigest !== evidenceDigest({ id: workspace.id, path: workspace.path })) return null;
        const directory = await mkdtemp(join(workspace.path, ".kujo-approval-fixture-"));
        try {
          const runtime = await resolveKujo(config, directory);
          if (await runtimeDigest(runtime.executable) !== plan.runtimeDigest) { await removeTree(directory); return null; }
          await writeFile(join(directory, "fixture.kujo"), programs[mode], { mode: 0o600 });
          return { invocation: { executable: runtime.executable, cwd: mode === "supervised" ? workspace.path : directory, args: ["run", "--isolated-imports", join(directory, "fixture.kujo")] },
            collect: async (result) => ({ exitCode: result.exitCode, stdout: result.stdout }), dispose: async () => { await removeTree(directory); } };
        } catch (error) { await removeTree(directory); throw error; }
      },
    });
    ctx.jobs.register("queued-execution-fixture", async () => {
      const result = await service.drainQueued();
      if (result.errors) throw new Error("Queued fixture could not verify every submission");
    });
    ctx.actions.register("enqueue-fixture", async (raw, actor) => {
      if (!actor.companyId || actor.actor.type !== "user" || !actor.actor.userId || actor.actor.companyId !== actor.companyId) throw new Error("Authenticated board user required for queued start");
      const { companyId: _companyId, renderEnvironment: _renderEnvironment, ...input } = raw;
      const value = z.object({ issueId: z.string(), id: z.string() }).strict().parse(input);
      return await service.enqueue({ companyId: actor.companyId, issueId: value.issueId }, value.id, { kind: "human", id: actor.actor.userId });
    });
    const hostService = createEvalHostService(ctx);
    shutdown = async () => { await Promise.all([service.shutdown(), hostService.shutdown()]); };
    ctx.actions.register("crash-fixture", async (_raw, actor) => {
      if (!actor.companyId || actor.actor.type !== "user" || !actor.actor.userId || actor.actor.companyId !== actor.companyId) throw new Error("Authenticated board user required for isolated crash fixture");
      setTimeout(() => process.kill(process.pid, "SIGKILL"), 100);
      return { fixture: "worker crash scheduled" };
    });
    ctx.actions.register("list-fixture", async (raw, actor) => {
      if (!actor.companyId) throw new Error("Company required");
      const { companyId: _companyId, renderEnvironment: _renderEnvironment, ...input } = raw;
      const value = z.object({ issueId: z.string() }).strict().parse(input);
      return await service.list({ companyId: actor.companyId, issueId: value.issueId });
    });
    for (const operation of ["prepare", "inspect", "start", "status", "list", "cancel"] as const) ctx.actions.register(`${operation}-host-eval-fixture`, async (raw, actor) => {
      if (!actor.companyId || actor.actor.type !== "user" || !actor.actor.userId || actor.actor.companyId !== actor.companyId) throw new Error("Authenticated board user required for host admission fixture");
      const { companyId: _companyId, renderEnvironment: _renderEnvironment, ...input } = raw;
      const base = z.object({ issueId: z.string() }).strict();
      if (operation === "prepare") {
        const value = base.extend({ suite: z.string(), submissionId: z.string() }).parse(input);
        return await hostService.prepare({ companyId: actor.companyId, issueId: value.issueId }, value.suite, value.submissionId, { kind: "human", id: actor.actor.userId });
      }
      if (operation === "inspect") {
        const value = base.extend({ suite: z.string() }).parse(input);
        return await hostService.inspect({ companyId: actor.companyId, issueId: value.issueId }, value.suite);
      }
      if (operation === "list") {
        const value = base.parse(input); return await hostService.list({ companyId: actor.companyId, issueId: value.issueId });
      }
      const value = base.extend({ id: z.string() }).parse(input);
      return await hostService[operation]({ companyId: actor.companyId, issueId: value.issueId }, value.id);
    });
    ctx.actions.register("prepare-fixture", async (raw, actor) => {
      if (!actor.companyId || actor.actor.type !== "user" || !actor.actor.userId || actor.actor.companyId !== actor.companyId) throw new Error("Authenticated board user required for acceptance setup");
      const { companyId: _companyId, renderEnvironment: _renderEnvironment, ...input } = raw;
      const value = z.object({ issueId: z.string(), submissionId: z.string(), mode: z.enum(["complete", "slow", "supervised", "eval", "eval-fail"]).default("complete") }).strict().parse(input);
      const workspace = await resolveWorkspace(ctx, { entityType: "issue", entityId: value.issueId, companyId: actor.companyId });
      const planDigest = fixtureDigest(value.mode === "slow" ? "slow" : value.mode === "supervised" ? "supervised" : "complete");
      const runtime = await resolveKujo(config, workspace.path);
      const evaluation = value.mode === "eval" || value.mode === "eval-fail" ? await evalFixture(runtime, value.mode === "eval-fail") : null;
      return await service.prepare({ companyId: actor.companyId, issueId: value.issueId }, value.submissionId, {
        requester: { kind: "human", id: actor.actor.userId },
        plan: { operation: "eval.run", suite: evaluation?.suite ?? value.mode, summary: evaluation?.summary ?? "Acceptance fixture only: execute a fixed bundled Kujo program and retain its output. The supervised fixture writes a heartbeat file in the disposable workspace. No project code is executed.",
          projectId: workspace.projectId, workspaceId: workspace.id, effects: evaluation?.effects ?? ["write_reports"], inputDigest: planDigest,
          workspaceDigest: evidenceDigest({ id: workspace.id, path: workspace.path }), definitionDigest: planDigest, componentDigest: planDigest, runtimeDigest: await runtimeDigest(runtime.executable), policyDigest: planDigest, timeoutMs: value.mode === "slow" || value.mode === "supervised" ? 15000 : 5000, ...(evaluation?.binding ?? {}) },
      });
    });
    for (const operation of ["status", "start", "cancel"] as const) ctx.actions.register(`${operation}-fixture`, async (raw, actor) => {
      if (!actor.companyId) throw new Error("Company required");
      const { companyId: _companyId, renderEnvironment: _renderEnvironment, ...input } = raw;
      const value = z.object({ issueId: z.string(), id: z.string() }).strict().parse(input);
      return await service[operation]({ companyId: actor.companyId, issueId: value.issueId }, value.id);
    });
  },
  async onHealth() { return { status: "ok", message: "Isolated approval acceptance fixture" }; },
  async onShutdown() { await shutdown?.(); },
});
export default plugin;
runWorker(plugin, import.meta.url);
