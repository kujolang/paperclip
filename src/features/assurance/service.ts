import { toolEnabled } from "../../abilities/catalog.js";
import { assuranceTool } from "../../abilities/generated.js";
import { nativeVerdict } from "./verdict.js";
import { executionLedger } from "../../execution/ledger.js";
import { resolveWorkflowStorage } from "../dispatch/storage.js";
import { cleanupWorkcell } from "./native.js";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { parsePluginConfig } from "../../config/schema.js";
import { createExecutionCoordinator } from "../../execution/coordinator.js";
import type { ExecutionPlan, ExecutionRequest, ExecutionScope, ExecutionStarter } from "../../execution/contracts.js";
import { resolveWorkspace } from "../../paperclip/workspace.js";
import { captureWorkspaceSnapshot, isSnapshotCurrent } from "../../paperclip/git.js";
import { resolveKujo } from "../../runtime/resolve-kujo.js";
import { removeTree } from "../../runtime/files.js";
import { evidenceDigest } from "../../storage/history.js";
import { copyWorkspaceSnapshot, discoverWorkspaceInventory } from "../verification/snapshot.js";
import { redactText } from "../failure/redact.js";
import { assuranceSelection, nativeAssurance, type Selection } from "./native.js";

export function createAssuranceService(ctx: PluginContext) {
  let captures = 0;
  async function admission(scope: ExecutionScope, kind: Selection["kind"]) {
    const config = parsePluginConfig(await ctx.config.get(scope.companyId));
    if (!toolEnabled(config, assuranceTool) || !config.assurance[kind]) throw new Error(`${kind} is disabled in company assurance settings`);
    const issue = await ctx.issues.get(scope.issueId, scope.companyId);
    if (!issue || issue.companyId !== scope.companyId || !issue.projectId) throw new Error("An issue with a project workspace is required");
    const workspace = await resolveWorkspace(ctx, { ...scope, entityType: "issue", entityId: scope.issueId });
    if (workspace.projectId !== issue.projectId) throw new Error("Issue workspace mismatch");
    return { config, workspace };
  }
  async function capture(scope: ExecutionScope, raw: Selection, executionId: string, signal?: AbortSignal, retainedDirectory?: string) {
    const selection = assuranceSelection.parse(raw), { config, workspace } = await admission(scope, selection.kind);
    if (selection.kind === "muzzle" && selection.target && !config.assurance.workcell) throw new Error("Contained Muzzle requires Workcell enabled");
    const storage = await resolveWorkflowStorage(ctx, scope);
    if (captures >= 2) throw new Error("Assurance preparation is busy; retry after current preparations finish");
    captures++;
    let directory = retainedDirectory ?? "";
    try {
      if (!directory) directory = await mkdtemp(join(tmpdir(), "kujo-assurance-"));
      const before = await captureWorkspaceSnapshot(workspace.path);
      const runtime = await resolveKujo(config, directory);
      const inventory = await discoverWorkspaceInventory(workspace.path);
      const copied = await copyWorkspaceSnapshot({ cwd: workspace.path, directory, runtime, config, catalog: inventory });
      if (inventory.truncated || inventory.rejected || copied.files.some(f => f.status !== "copied")) throw new Error("Assurance requires a complete admitted text snapshot; oversized, binary or unreadable input found");
      const native = await nativeAssurance({ selection, directory, workspace: copied.workspace, runtime, dockerHost: config.assurance.dockerHost });
      const preview = redactText(JSON.stringify(native.preview, null, 2)).text;
      if (preview.length > 12000) throw new Error("Review preview exceeds 12 KiB; narrow the workflow or pack");
      const current = await admission(scope, selection.kind);
      if (signal?.aborted || current.workspace.id !== workspace.id || current.workspace.path !== workspace.path || evidenceDigest(current.config) !== evidenceDigest(config) || !await isSnapshotCurrent(workspace.path, before)) throw new Error("Assurance inputs changed during preparation");
      const plan: ExecutionPlan = { sourceSnapshot: { head: before.head, fingerprint: before.fingerprint }, operation: "assurance.run", assurance: { ...selection, executionId, storageDigest: storage.storageDigest, endpointDigest: evidenceDigest(config.assurance.dockerHost) }, projectId: workspace.projectId, workspaceId: workspace.id, suite: `${selection.kind}:${selection.path}`,
        summary: selection.kind === "workcell" ? "Run the reviewed workflow in a local Docker container: no network or secrets, bounded CPU/memory/process/time, disposable input snapshot. Container isolation is not a VM security guarantee."
          : selection.kind === "muzzle" && selection.target ? "Run the selected Muzzle bash workflow through the reviewed Workcell definition, with no network or secrets and bounded resources."
          : selection.kind === "muzzle" ? "Execute this named Muzzle workflow on a frozen input copy. Trusted host code: copying is not isolation; commands can affect host files and network."
          : selection.kind === "lens" ? "Run native Lens on the reviewed loopback preview with fresh browser state. Retain reports and screenshots; no authentication supplied."
          : "Validate and retain the execution pack using native PackWrite. Planning instructions are data, never execution authorization.",
        preview, effects: selection.kind === "packwrite" ? ["read_workspace", "write_reports"] : ["read_workspace", "write_reports", "execute_project", "network"],
        inputDigest: copied.digest, workspaceDigest: evidenceDigest({ id: workspace.id, path: workspace.path, projectId: workspace.projectId }),
        definitionDigest: evidenceDigest({ selection, preview }), componentDigest: evidenceDigest(native.component), runtimeDigest: createHash("sha256").update(await readFile(runtime.executable)).digest("hex"),
        policyDigest: evidenceDigest({ config, adapter: "assurance/v1", scope }), timeoutMs: 27000, maxStdoutBytes: 500000, maxStderrBytes: 64000 };
      return { plan, invocation: native.invocation, collect: async (output: { stdout: string; stderr: string; exitCode: number; durationMs: number }) => {
        await native.cleanup();
        const retained = await native.collect();
        return { schemaVersion: 1, kind: selection.kind, sourceKind: "observed", executionObserved: true, classification: selection.kind === "muzzle" && selection.target && !retained.some(a=>a.path.startsWith("workcell/") && a.path.endsWith("/receipt.json")) ? "incomplete" : nativeVerdict(selection.kind, output.exitCode, output.stdout, retained), exitCode: output.exitCode, durationMs: output.durationMs,
          stdout: redactText(output.stdout.replaceAll(directory, "<private-inputs>")).text, stderr: redactText(output.stderr.replaceAll(directory, "<private-inputs>")).text, artifacts: retained,
          notice: "Native process outcome with retained artifacts. Exit zero is not acceptance of the issue. Snapshot covers admitted Git-visible text only; ignored dependencies and secrets are excluded." };
      }, collectInterrupted: async () => { await native.cleanup(); return { schemaVersion: 1, kind: selection.kind, classification: "incomplete", artifacts: await native.collect(), notice: "Interrupted operation; retained artifacts do not establish completion." }; }, dispose: async () => { await native.cleanup(); if (!retainedDirectory) await removeTree(directory); } };
    } catch (error) { if (directory && !retainedDirectory) await removeTree(directory); throw error; } finally { captures--; }
  }
  const coordinator = createExecutionCoordinator(ctx, { async materialize(scope, plan, signal) {
    if (!plan.assurance) return null;
    const { executionId, storageDigest, endpointDigest: _endpointDigest, ...selection } = plan.assurance;
    const storage = await resolveWorkflowStorage(ctx, scope);
    if (storage.storageDigest !== storageDigest) return null;
    const record = await executionLedger(ctx).read(scope, executionId);
    if (!record) return null;
    const { nativeRoot } = await storage.store.reserve({ ...scope, installationId: storage.installationId, executionId, requestDigest: record.requestDigest });
    const result = await capture(scope, selection, executionId, signal, nativeRoot);
    if (evidenceDigest(result.plan) !== evidenceDigest(plan)) { await result.dispose(); return null; }
    return result;
  } }, ["assurance.run"]);
  return {
    async discover(scope: ExecutionScope) {
      const config = parsePluginConfig(await ctx.config.get(scope.companyId));
      if (!toolEnabled(config, assuranceTool)) throw new Error("Assurance is disabled by company profile");
      const workspace = await resolveWorkspace(ctx, { ...scope, entityType: "issue", entityId: scope.issueId });
      const inventory = await discoverWorkspaceInventory(workspace.path);
      return { enabled: { lens: config.assurance.lens, muzzle: config.assurance.muzzle, workcell: config.assurance.workcell, packwrite: config.assurance.packwrite },
        workflows: inventory.paths.filter(p => /^\.muzzle\/manifests\/[a-z][a-z0-9_-]{0,63}\.json$/.test(p)).map(p => p.split("/").pop()!.slice(0,-5)),
        browserDefinitions: inventory.paths.filter(p => p === "browser.json" || /(?:lens|browser|flow).*\.json$/.test(p)).slice(0,50),
        workcellDefinitions: inventory.paths.filter(p => /(?:^|\/)workcell[^/]*\.json$/.test(p)).slice(0,50),
        packFiles: inventory.paths.filter(p => p.startsWith("agent/")).slice(0,50), truncated: inventory.truncated,
        notice: "Names only; discovery does not execute workflows or establish validity, browser availability, Docker reachability or approval." };
    },
    async inspect(scope: ExecutionScope, selection: Selection) { const value = await capture(scope, selection, "preview"); try { return { plan: value.plan }; } finally { await value.dispose(); } },
    async prepare(scope: ExecutionScope, selection: Selection, submissionId: string, requester: ExecutionRequest["requester"]) {
      const key = `assurance:${evidenceDigest(submissionId)}`, id = `execution_${evidenceDigest({ ...scope, submissionId: key })}`;
      const value = await capture(scope, selection, id); try { return await coordinator.prepare(scope, key, { plan: value.plan, requester }); } finally { await value.dispose(); }
    },
    async start(scope: ExecutionScope, id: string, starter: ExecutionStarter) { return coordinator.enqueue(scope, id, starter); },
    async recover(scope: ExecutionScope, id: string) {
      const record = await coordinator.status(scope, id);
      if (["preparing", "pending", "running", "cancel_requested"].includes(record.state) || !record.request.plan.assurance) throw new Error("Only terminal assurance operations may recover owned resources");
      const storage = await resolveWorkflowStorage(ctx, scope);
      if (storage.storageDigest !== record.request.plan.assurance.storageDigest) throw new Error("Restore original storage before recovery");
      const { nativeRoot } = await storage.store.recover({ ...scope, installationId: storage.installationId, executionId: id, requestDigest: record.requestDigest });
      const config = parsePluginConfig(await ctx.config.get(scope.companyId));
      if (record.request.plan.assurance.kind === "workcell" || (record.request.plan.assurance.kind === "muzzle" && record.request.plan.assurance.target)) {
        if (!config.assurance.dockerHost || evidenceDigest(config.assurance.dockerHost) !== record.request.plan.assurance.endpointDigest) throw new Error("Restore Docker endpoint before recovery");
        await cleanupWorkcell(record.request.plan.assurance.kind === "muzzle" ? join(nativeRoot,"contained-workcell") : nativeRoot, config.assurance.dockerHost, await resolveKujo(config, nativeRoot));
      }
      return { id, state: record.state, cleanup: "owned-containers-removed", notice: "Original outcome remains immutable. Retained files are available in the operator-owned reservation. No execution was replayed." };
    },
    status: coordinator.status, list: coordinator.list, cancel: coordinator.cancel, shutdown: coordinator.shutdown, drainQueued: coordinator.drainQueued,
  };
}
