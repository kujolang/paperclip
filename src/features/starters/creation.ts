import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { executionLedger } from "../../execution/ledger.js";
import { createExecutionCoordinator } from "../../execution/coordinator.js";
import type { ExecutionPlan, ExecutionRequest, ExecutionScope } from "../../execution/contracts.js";
import { parsePluginConfig } from "../../config/schema.js";
import { toolEnabled } from "../../abilities/catalog.js";
import { projections, starterCreationTool } from "../../abilities/generated.js";
import { resolveWorkspace } from "../../paperclip/workspace.js";
import { resolveKujo } from "../../runtime/resolve-kujo.js";
import { evidenceDigest } from "../../storage/history.js";
import { previewStarter, starterInputSchema } from "./preview.js";
import { prepareStarterPublication, requireAbsentStarter, STARTER_PUBLISHER, starterMarker } from "./publication.js";

export function createStarterCreationService(ctx: PluginContext) {
  let captures = 0;
  async function admission(scope: ExecutionScope) {
    const config = parsePluginConfig(await ctx.config.get(scope.companyId));
    if (!toolEnabled(config, starterCreationTool)) throw new Error("Kujo project creation is disabled by company settings or capability profile");
    const issue = await ctx.issues.get(scope.issueId, scope.companyId);
    if (!issue || issue.id !== scope.issueId || issue.companyId !== scope.companyId || !issue.projectId) throw new Error("Creation issue is unavailable in this company");
    const workspace = await resolveWorkspace(ctx, { ...scope, entityType: "issue", entityId: scope.issueId });
    if (workspace.projectId !== issue.projectId) throw new Error("Creation issue and workspace must belong to the same project");
    const identity = await stat(workspace.path);
    return { config, workspace, rootIdentity: { device: identity.dev, inode: identity.ino } };
  }
  const policy = (value: Awaited<ReturnType<typeof admission>>) => ({ profile: value.config.capabilityProfile, enabled: value.config.features.projectCreation, runtime: value.config.runtime, limits: value.config.limits });
  async function capture(scope: ExecutionScope, input: unknown) {
    if (captures >= 2) throw new Error("Starter preparation is busy; retry after current previews finish");
    captures++;
    try {
      const selected = starterInputSchema.parse(input), admitted = await admission(scope);
      await requireAbsentStarter(admitted.workspace.path, selected.name);
      // Creation is independently opted in; the fixed-example/read-only-preview
      // switch does not silently grant or revoke this separate write authority.
      const preview = await previewStarter(selected, { ...admitted.config, features: { ...admitted.config.features, examples: true } });
      const runtime = await resolveKujo(admitted.config, admitted.workspace.path);
      const current = await admission(scope);
      if (evidenceDigest({ workspace: admitted.workspace, root: admitted.rootIdentity, policy: policy(admitted) }) !== evidenceDigest({ workspace: current.workspace, root: current.rootIdentity, policy: policy(current) })) throw new Error("Workspace or creation policy changed during preview");
      await requireAbsentStarter(current.workspace.path, selected.name);
      const projection = projections.find(item => item.id === "kujo.paperclip.starter.create")!;
      const marker = starterMarker(preview);
      const plan: ExecutionPlan = {
        operation: "starter.create", starter: { ...selected, digest: preview.digest }, suite: selected.name,
        projectId: admitted.workspace.projectId, workspaceId: admitted.workspace.id,
        abilityReceipt: { serializerVersion: 1, abilityId: projection.id, abilityVersion: projection.definition.version, definitionDigest: projection.definitionDigest, handlerVersion: "1.0.0" },
        summary: "Create the reviewed starter files in a new named directory under this issue's host-owned workspace. Native per-file publication never overwrites files or follows relative symlinks. Not an atomic directory transaction: interruption/conflict may leave files, including a failed path. No rollback, automatic retry, generated-program execution, dependency installation, server start or client registration. Keep the host workspace root stable during creation.",
        preview: JSON.stringify({ kind: selected.kind, destination: selected.name, starterDigest: preview.digest, provenance: preview.provenance ?? { runtime: preview.runtimeVersion },
          files: preview.files.map(({ path, sha256, content }) => ({ path, sha256, bytes: Buffer.byteLength(content) })),
          marker: { path: marker.path, sha256: marker.sha256, bytes: marker.bytes }, totalBytes: preview.totalBytes, entrypoint: preview.entrypoint }, null, 2),
        effects: ["write_files", "write_reports"], inputDigest: evidenceDigest({ starter: preview.digest, marker: marker.sha256 }),
        workspaceDigest: evidenceDigest({ id: admitted.workspace.id, projectId: admitted.workspace.projectId, path: admitted.workspace.path, root: admitted.rootIdentity }),
        definitionDigest: projection.definitionDigest, componentDigest: evidenceDigest({ provenance: preview.provenance ?? null, helper: STARTER_PUBLISHER }),
        runtimeDigest: createHash("sha256").update(await readFile(runtime.executable)).digest("hex"), policyDigest: evidenceDigest(policy(admitted)),
        timeoutMs: admitted.config.limits.timeoutMs, maxStdoutBytes: Math.min(admitted.config.limits.maxStdoutBytes, 64000), maxStderrBytes: Math.min(admitted.config.limits.maxStderrBytes, 4096),
      };
      if (plan.preview!.length > 12000) throw new Error("Starter file inventory exceeds the approval preview limit");
      return { plan, preview, runtime, root: admitted.workspace.path };
    } finally { captures--; }
  }
  const coordinator = createExecutionCoordinator(ctx, { async materialize(scope, plan, signal) {
    if (!plan.starter) return null;
    let captured;
    try { captured = await capture(scope, { kind: plan.starter.kind, name: plan.starter.name }); }
    catch (error) { if (error instanceof Error && /destination already exists/.test(error.message)) return null; throw error; }
    if (signal.aborted || evidenceDigest(captured.plan) !== evidenceDigest(plan)) return null;
    return prepareStarterPublication(captured.preview, captured.root, captured.runtime);
  } }, ["starter.create"]);
  return {
    async inspect(scope: ExecutionScope, input: unknown) { const value = await capture(scope, input); return { plan: value.plan, preview: value.preview }; },
    async prepare(scope: ExecutionScope, input: unknown, submissionId: string, requester: ExecutionRequest["requester"]) {
      await admission(scope);
      const selected = starterInputSchema.parse(input);
      const id = `execution_${evidenceDigest({ ...scope, submissionId })}`;
      const existing = await executionLedger(ctx).read(scope, id);
      if (existing) {
        if (existing.request.plan.operation !== "starter.create" || existing.request.plan.starter?.kind !== selected.kind || existing.request.plan.starter.name !== selected.name || evidenceDigest(existing.request.requester) !== evidenceDigest(requester)) throw new Error("Submission identity conflicts with different inputs or requester");
        return coordinator.status(scope, id);
      }
      const value = await capture(scope, selected);
      return coordinator.prepare(scope, submissionId, { plan: value.plan, requester });
    },
    async start(scope: ExecutionScope, id: string) { await admission(scope); return coordinator.start(scope, id); },
    async status(scope: ExecutionScope, id: string) { await admission(scope); return coordinator.status(scope, id); },
    recoveryList: coordinator.list, cancel: coordinator.cancel, shutdown: coordinator.shutdown,
  };
}
