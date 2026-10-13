// Development-only worker for isolated, authenticated host acceptance.
// Never published by package.json's files list or enabled in src/worker.ts.
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { createExecutionCoordinator } from "../../src/execution/coordinator.js";
import { evidenceDigest } from "../../src/storage/history.js";
import { resolveWorkspace } from "../../src/paperclip/workspace.js";
import { resolveKujo } from "../../src/runtime/resolve-kujo.js";
import { parsePluginConfig } from "../../src/config/schema.js";
import { removeTree } from "../../src/runtime/files.js";

const programs = {
  complete: 'print("authenticated host fixture completed")\n',
  slow: "mut i = 0\nwhile true { i = i + 1 }\n",
} as const;
const fixtureDigest = (mode: keyof typeof programs) => evidenceDigest({ fixture: programs[mode], version: 1 });
const runtimeDigest = async (executable: string) => createHash("sha256").update(await readFile(executable)).digest("hex");
let shutdown: (() => Promise<void>) | undefined;
const plugin = definePlugin({
  async setup(ctx) {
    const config = parsePluginConfig({});
    const service = createExecutionCoordinator(ctx, {
      async materialize(scope, plan) {
        const workspace = await resolveWorkspace(ctx, { entityType: "issue", entityId: scope.issueId, companyId: scope.companyId });
        const mode = plan.suite === "slow" ? "slow" : "complete";
        if (workspace.id !== plan.workspaceId || workspace.projectId !== plan.projectId || plan.inputDigest !== fixtureDigest(mode) || plan.workspaceDigest !== evidenceDigest({ id: workspace.id, path: workspace.path })) return null;
        const directory = await mkdtemp(join(tmpdir(), "kujo-live-approval-"));
        try {
          const runtime = await resolveKujo(config, directory);
          if (await runtimeDigest(runtime.executable) !== plan.runtimeDigest) { await removeTree(directory); return null; }
          await writeFile(join(directory, "fixture.kujo"), programs[mode], { mode: 0o600 });
          return { invocation: { executable: runtime.executable, cwd: directory, args: ["run", "--isolated-imports", join(directory, "fixture.kujo")] },
            collect: async (result) => ({ exitCode: result.exitCode, stdout: result.stdout }), dispose: async () => { await removeTree(directory); } };
        } catch (error) { await removeTree(directory); throw error; }
      },
    });
    shutdown = () => service.shutdown();
    ctx.actions.register("prepare-fixture", async (raw, actor) => {
      if (!actor.companyId || actor.actor.type !== "user" || !actor.actor.userId || actor.actor.companyId !== actor.companyId) throw new Error("Authenticated board user required for acceptance setup");
      const { companyId: _companyId, renderEnvironment: _renderEnvironment, ...input } = raw;
      const value = z.object({ issueId: z.string(), submissionId: z.string(), mode: z.enum(["complete", "slow"]).default("complete") }).strict().parse(input);
      const workspace = await resolveWorkspace(ctx, { entityType: "issue", entityId: value.issueId, companyId: actor.companyId });
      const planDigest = fixtureDigest(value.mode);
      const runtime = await resolveKujo(config, workspace.path);
      return await service.prepare({ companyId: actor.companyId, issueId: value.issueId }, value.submissionId, {
        requester: { kind: "human", id: actor.actor.userId },
        plan: { operation: "eval.run", suite: value.mode, summary: "Acceptance fixture only: execute a fixed bundled Kujo program and retain its output. No project code is executed.",
          projectId: workspace.projectId, workspaceId: workspace.id, effects: ["write_reports"], inputDigest: planDigest,
          workspaceDigest: evidenceDigest({ id: workspace.id, path: workspace.path }), definitionDigest: planDigest, componentDigest: planDigest, runtimeDigest: await runtimeDigest(runtime.executable), policyDigest: planDigest, timeoutMs: value.mode === "slow" ? 15000 : 5000 },
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
