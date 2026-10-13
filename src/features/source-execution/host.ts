import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { projections, sourceExecutionTool } from "../../abilities/generated.js";
import { toolEnabled } from "../../abilities/catalog.js";
import { parsePluginConfig, type PluginConfig } from "../../config/schema.js";
import { createExecutionCoordinator } from "../../execution/coordinator.js";
import type { ExecutionPlan, ExecutionRequest, ExecutionScope } from "../../execution/contracts.js";
import { resolveWorkspace } from "../../paperclip/workspace.js";
import { captureWorkspaceSnapshot, isSnapshotCurrent } from "../../paperclip/git.js";
import { resolveKujo } from "../../runtime/resolve-kujo.js";
import { removeTree } from "../../runtime/files.js";
import { evidenceDigest } from "../../storage/history.js";
import { sourcePathSchema } from "../language/source.js";
import { copyWorkspaceSnapshot, discoverWorkspaceInventory } from "../verification/snapshot.js";
import { redactText } from "../failure/redact.js";

export const sourceMode = z.enum(["run", "test", "fixtures"]);
export type SourceMode = z.infer<typeof sourceMode>;
const operations = ["source.run", "source.test", "source.fixtures"] as const;
const policy = (config: PluginConfig) => ({ enabled: config.features.sourceExecution, profile: config.capabilityProfile, runtime: config.runtime, limits: config.limits });
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export function sourceExecutionEnabled(config: PluginConfig) { return toolEnabled(config, sourceExecutionTool); }

/** Only host-resolved issue workspaces and fixed native CLI operations. Frozen
 * input copies bind approval to bytes; they are not a security sandbox. */
export function createSourceExecutionService(ctx: PluginContext) {
  let captures = 0, starts = 0;
  async function admission(scope: ExecutionScope) {
    const config = parsePluginConfig(await ctx.config.get(scope.companyId));
    if (!sourceExecutionEnabled(config)) throw new Error("Kujo run/test is disabled by company settings or capability profile");
    const issue = await ctx.issues.get(scope.issueId, scope.companyId);
    if (!issue || issue.id !== scope.issueId || issue.companyId !== scope.companyId || !issue.projectId) throw new Error("Execution issue is unavailable in this company");
    const workspace = await resolveWorkspace(ctx, { ...scope, entityType: "issue", entityId: scope.issueId });
    if (workspace.projectId !== issue.projectId) throw new Error("Issue and workspace must belong to the same project");
    return { config, workspace };
  }
  async function capture(scope: ExecutionScope, rawMode: SourceMode, rawPath?: string, signal?: AbortSignal) {
    const mode = sourceMode.parse(rawMode);
    if (mode === "fixtures" && rawPath !== undefined) throw new Error("Fixture mode selects the project's tests directory; omit path");
    const path = mode === "fixtures" ? "tests/" : sourcePathSchema.parse(rawPath);
    const { config, workspace } = await admission(scope);
    if (captures >= 2) throw new Error("Source execution preparation is busy; retry after current preparations finish");
    if (signal?.aborted) throw new Error("Source preparation cancelled");
    captures++;
    let directory: string | undefined;
    try {
      directory = await mkdtemp(join(tmpdir(), "kujo-source-execution-"));
      const before = await captureWorkspaceSnapshot(workspace.path);
      const runtime = await resolveKujo(config, directory);
      const inventory = await discoverWorkspaceInventory(workspace.path, item => item === path || (mode === "fixtures" && item.startsWith("tests/")) ? -1 : 0);
      const names = new Set<string>();
      for (const name of inventory.paths) {
        if (names.has(name.toLowerCase()) || name.split("/").some(part => /[ .]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error("Execution inputs contain ambiguous or platform-reserved paths");
        names.add(name.toLowerCase());
      }
      const copied = await copyWorkspaceSnapshot({ cwd: workspace.path, directory, runtime, config, catalog: inventory });
      const selected = copied.files.filter(file => file.status === "copied" && (mode === "fixtures" ? file.path.startsWith("tests/") && file.path.endsWith(".kujo") : file.path === path));
      if (!selected.length) throw new Error("Choose admitted Git-visible Kujo source; fixture mode requires tests/*.kujo files");
      const coverage = { scope: "git-visible-text", complete: !inventory.truncated && !inventory.rejected && !inventory.excludedSensitive && copied.files.every(file => file.status === "copied"),
        gitVisible: inventory.visible, copied: copied.files.filter(file => file.status === "copied").length, copiedBytes: copied.copiedBytes,
        truncated: inventory.truncated, rejectedNames: inventory.rejected, excludedSensitive: inventory.excludedSensitive,
        omittedFiles: copied.files.filter(file => file.status !== "copied").length,
        notice: "Only admitted Git-visible text is copied. Ignored dependencies, binary resources, credentials and external services are not supplied or frozen. Relative output is temporary and removed; trusted code can still affect the host or network." };
      const current = await admission(scope);
      if (current.workspace.id !== workspace.id || current.workspace.path !== workspace.path || evidenceDigest(policy(config)) !== evidenceDigest(policy(current.config)) || !(await isSnapshotCurrent(workspace.path, before))) throw new Error("Workspace or settings changed during preparation; refresh before requesting approval");
      const projection = projections.find(item => item.id === "kujo.paperclip.source.execute")!;
      const args = mode === "fixtures" ? ["test", "--runtime", "interpreter"] : mode === "test" ? ["test-run", `./${path}`] : ["run", "--interpreter", ...(runtime.platform === "win32" ? ["--kill-children-on-exit"] : []), `./${path}`];
      const source = mode === "fixtures" ? undefined : await readFile(join(copied.workspace, path), "utf8");
      const preview = redactText(JSON.stringify({ command: ["kujo", ...args], selectedFiles: selected.map(file => file.path), source, inputCoverage: coverage }, null, 2)).text;
      if (preview.length > 12000) throw new Error("Source/test preview exceeds the approval size limit; select a smaller entry file or test group");
      const plan: ExecutionPlan = {
        operation: `source.${mode}`, projectId: workspace.projectId, workspaceId: workspace.id, suite: path,
        abilityReceipt: { serializerVersion: 1, abilityId: "kujo.paperclip.source.execute", abilityVersion: projection.definition.version, definitionDigest: projection.definitionDigest, handlerVersion: "1.0.0" },
        summary: "Run a fixed Kujo command once on a bounded frozen input copy. Code may read/write/delete host files, launch processes and access the network. No sandbox, dependency installation, persistent service or automatic retry. Inspect native output for actual test coverage; exit zero alone is not proof that tests ran.",
        preview, effects: ["read_workspace", "write_files", "execute_project", "network"], inputDigest: copied.digest,
        workspaceDigest: evidenceDigest({ id: workspace.id, projectId: workspace.projectId, path: workspace.path }),
        definitionDigest: evidenceDigest({ mode, path, selected, args }), componentDigest: evidenceDigest({ adapter: "native-source-execution/v1", args }),
        runtimeDigest: sha(await readFile(runtime.executable)), policyDigest: evidenceDigest({ adapter: "source-host-admission/v1", scope, config: policy(config), definition: projection.definitionDigest }),
        timeoutMs: config.limits.timeoutMs, maxStdoutBytes: Math.min(config.limits.maxStdoutBytes, 500000), maxStderrBytes: Math.min(config.limits.maxStderrBytes, 64000),
      };
      if (signal?.aborted) throw new Error("Source preparation cancelled");
      const root = directory;
      return { plan, coverage, invocation: { executable: runtime.executable, cwd: copied.workspace, args },
        collect: async (output: { stdout: string; stderr: string; exitCode: number; durationMs: number }) => ({ schemaVersion: 1, sourceKind: "native", executionObserved: true,
          classification: output.exitCode === 0 ? "process-completed" : "process-failed", mode, path, exitCode: output.exitCode, durationMs: output.durationMs,
          stdout: redactText(output.stdout.replaceAll(root, "<temporary-inputs>")).text, stderr: redactText(output.stderr.replaceAll(root, "<temporary-inputs>")).text,
          coverage, inputDigest: plan.inputDigest, runtimeVersion: runtime.runtimeVersion,
          notice: "Native command exit and bounded output observed on frozen inputs. Output is program-supplied; no independent test count or project-wide success is inferred. Temporary relative output is removed. Host/network effects are not rolled back." }),
        dispose: async () => { await removeTree(root); } };
    } catch (error) { if (directory) await removeTree(directory); throw error; }
    finally { captures--; }
  }
  const coordinator = createExecutionCoordinator(ctx, {
    async materialize(scope, plan, signal) {
      const mode = sourceMode.parse(plan.operation.replace("source.", ""));
      const captured = await capture(scope, mode, mode === "fixtures" ? undefined : plan.suite, signal);
      if (evidenceDigest(plan) !== evidenceDigest(captured.plan)) { await captured.dispose(); return null; }
      return captured;
    },
  }, operations);
  return {
    async inspect(scope: ExecutionScope, mode: SourceMode, path?: string) {
      const captured = await capture(scope, mode, path);
      try { return { plan: captured.plan, coverage: captured.coverage }; } finally { await captured.dispose(); }
    },
    async prepare(scope: ExecutionScope, mode: SourceMode, path: string | undefined, submissionId: string, requester: ExecutionRequest["requester"]) {
      const captured = await capture(scope, mode, path);
      try { return await coordinator.prepare(scope, submissionId, { plan: captured.plan, requester }); } finally { await captured.dispose(); }
    },
    async start(scope: ExecutionScope, id: string) {
      await admission(scope);
      if (starts >= 2) throw new Error("Source execution is busy on this worker; retry after current runs finish");
      starts++; try { return await coordinator.start(scope, id); } finally { starts--; }
    },
    async status(scope: ExecutionScope, id: string) { await admission(scope); return await coordinator.status(scope, id); },
    recoveryList: coordinator.list, cancel: coordinator.cancel, shutdown: coordinator.shutdown,
  };
}
