import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { canonicalDefinitions, canonicalProfiles } from "../../abilities/generated.js";
import { parsePluginConfig, type PluginConfig } from "../../config/schema.js";
import { createExecutionCoordinator } from "../../execution/coordinator.js";
import type { ExecutionPlan, ExecutionRequest, ExecutionScope } from "../../execution/contracts.js";
import { resolveWorkspace } from "../../paperclip/workspace.js";
import { captureWorkspaceSnapshot, isSnapshotCurrent } from "../../paperclip/git.js";
import { resolveKujo } from "../../runtime/resolve-kujo.js";
import { removeTree } from "../../runtime/files.js";
import { evidenceDigest } from "../../storage/history.js";
import { redactText } from "../failure/redact.js";
import { workspaceTextPathSchema } from "../language/source.js";
import { copyWorkspaceSnapshot, discoverWorkspaceInventory } from "../verification/snapshot.js";
import { prepareNativeEval } from "./native.js";

const abilityId = "kujo.eval.suite.run";
export function evalExecutionEnabled(config: PluginConfig) {
  return config.features.execution && (config.capabilityProfile === "installed" || config.capabilityProfile === "full"
    || !!canonicalProfiles.find(profile => profile.id === `kujo.profile.${config.capabilityProfile}`)?.resolvedAbilityIds.some(id => id === abilityId));
}
const policyConfig = (config: PluginConfig) => ({ profile: config.capabilityProfile, enabled: config.features.execution, runtime: config.runtime, limits: config.limits });

/** Host handlers supply authenticated company/issue/requester identities. There
 * are no user-provided root paths, file contents, executable or approval IDs. */
export function createEvalHostService(ctx: PluginContext) {
  let captures = 0;
  let starts = 0;
  async function admission(scope: ExecutionScope) {
    const config = parsePluginConfig(await ctx.config.get(scope.companyId));
    if (!evalExecutionEnabled(config)) throw new Error("Eval execution is disabled by company settings or capability profile");
    const issue = await ctx.issues.get(scope.issueId, scope.companyId);
    if (!issue || issue.id !== scope.issueId || issue.companyId !== scope.companyId || !issue.projectId) throw new Error("Eval issue is unavailable in this company");
    const workspace = await resolveWorkspace(ctx, { companyId: scope.companyId, entityType: "issue", entityId: scope.issueId });
    if (workspace.projectId !== issue.projectId) throw new Error("Eval issue and host workspace do not belong to the same project");
    return { config, workspace };
  }
  async function capture(scope: ExecutionScope, rawSuite: string, signal?: AbortSignal) {
    const suite = workspaceTextPathSchema.parse(rawSuite);
    if (!suite.endsWith(".json")) throw new Error("Choose a JSON Eval suite");
    const { config, workspace } = await admission(scope);
    if (signal?.aborted) throw new Error("Eval preparation cancelled");
    if (captures >= 2) throw new Error("Eval preparation is busy; retry when current preparations finish");
    captures++;
    let directory: string | undefined;
    try {
      directory = await mkdtemp(join(tmpdir(), "kujo-eval-admission-"));
      const before = await captureWorkspaceSnapshot(workspace.path);
      const runtime = await resolveKujo(config, directory);
      const catalog = await discoverWorkspaceInventory(workspace.path, path => path === suite ? -1 : 0);
      if (!catalog.paths.includes(suite)) throw new Error("Eval suite must be an admitted Git-visible workspace file");
      const copied = await copyWorkspaceSnapshot({ cwd: workspace.path, directory, runtime, config, catalog });
      if (!copied.files.some(file => file.path === suite && file.status === "copied")) throw new Error("Eval suite is unreadable or exceeds the snapshot limits");
      const files = [];
      for (const file of copied.files) if (file.status === "copied") files.push({ path: file.path, content: await readFile(join(copied.workspace, file.path), "utf8") });
      const omitted = copied.files.filter(file => file.status !== "copied");
      const coverage = {
        scope: "git-visible-text", complete: !catalog.truncated && catalog.rejected === 0 && catalog.excludedSensitive === 0 && omitted.length === 0,
        gitVisible: catalog.visible, copied: files.length, copiedBytes: copied.copiedBytes, truncated: catalog.truncated,
        rejectedNames: catalog.rejected, excludedSensitive: catalog.excludedSensitive, omittedFiles: omitted.length,
        notice: "Git-ignored paths, dependencies and external resources are not frozen. Suite commands may access resources outside this input copy.",
      };
      const current = await admission(scope);
      if (current.workspace.id !== workspace.id || current.workspace.path !== workspace.path
        || evidenceDigest(policyConfig(current.config)) !== evidenceDigest(policyConfig(config)) || !(await isSnapshotCurrent(workspace.path, before))) {
        throw new Error("Workspace or admission policy changed while preparing Eval; refresh before requesting approval");
      }
      let definition: unknown;
      try { definition = JSON.parse(files.find(file => file.path === suite)!.content); } catch { throw new Error("Eval suite must contain valid JSON"); }
      const preview = redactText(JSON.stringify({ suite: definition, inputCoverage: coverage, reportOutput: "Private plugin directory; suite.output_dir is overridden" }, null, 2)).text;
      if (preview.length > 12000) throw new Error("Suite review exceeds the host confirmation limit; split the suite or shorten its annotations");
      const admitted = await prepareNativeEval({ suite, files, runtime, admissionPolicyDigest: evidenceDigest({
        adapter: "eval-host-admission/v1", scope, config: policyConfig(config), inventory: copied.digest,
        definition: canonicalDefinitions.find(item => item.definition.id === abilityId)?.definitionDigest,
      }) });
      if (signal?.aborted) throw new Error("Eval preparation cancelled");
      const ability = canonicalDefinitions.find(item => item.definition.id === abilityId);
      if (!ability) throw new Error("Canonical Eval Ability definition is unavailable");
      const plan: ExecutionPlan = {
        abilityReceipt: { serializerVersion: 1, abilityId, abilityVersion: ability.definition.version,
          definitionDigest: ability.definitionDigest, handlerVersion: "1.0.0" },
        operation: "eval.run", projectId: workspace.projectId, workspaceId: workspace.id, suite,
        summary: `${admitted.summary} Input coverage: ${coverage.complete ? "all admitted Git-visible text files" : "partial; review exclusions"}. Sensitive values in the suite preview may be redacted.`,
        preview, effects: admitted.effects, ...admitted.binding,
        workspaceDigest: evidenceDigest({ id: workspace.id, projectId: workspace.projectId, path: workspace.path }),
        timeoutMs: config.limits.timeoutMs, maxStdoutBytes: Math.min(config.limits.maxStdoutBytes, 500000), maxStderrBytes: Math.min(config.limits.maxStderrBytes, 64000),
      };
      return { plan, coverage, admitted };
    } finally { try { if (directory) await removeTree(directory); } finally { captures--; } }
  }
  const coordinator = createExecutionCoordinator(ctx, {
    async materialize(scope, plan, signal) {
      const captured = await capture(scope, plan.suite, signal);
      // Compare the complete regenerated host plan, including settings, preview,
      // workspace identity, omitted input inventory and effective output limits.
      if (evidenceDigest(captured.plan) !== evidenceDigest(plan)) return null;
      const work = await captured.admitted.materialize(plan, signal);
      if (!work) return null;
      return { ...work, collect: async result => {
        const receipt = await work.collect(result);
        return { ...receipt, nativeClassification: receipt.classification,
          classification: !captured.coverage.complete && receipt.classification === "passed" ? "partial" : receipt.classification,
          coverage: captured.coverage, workspaceFreshness: "not-rechecked-after-execution" };
      } };
    },
  });
  return {
    async inspect(scope: ExecutionScope, suite: string) {
      const { plan, coverage } = await capture(scope, suite);
      return { plan, coverage };
    },
    async prepare(scope: ExecutionScope, suite: string, submissionId: string, requester: ExecutionRequest["requester"]) {
      const { plan } = await capture(scope, suite);
      return await coordinator.prepare(scope, submissionId, { plan, requester });
    },
    async start(scope: ExecutionScope, id: string) {
      await admission(scope);
      const record = await coordinator.status(scope, id);
      if (record.state !== "pending") return record;
      if (starts >= 2) throw new Error("Eval execution is busy on this worker; retry after current runs finish");
      starts++;
      try { return await coordinator.start(scope, id); } finally { starts--; }
    },
    async status(scope: ExecutionScope, id: string) { await admission(scope); return await coordinator.status(scope, id); },
    async list(scope: ExecutionScope) { await admission(scope); return await coordinator.list(scope); },
    // Disabling execution must not prevent stopping a previously approved run.
    recoveryList: coordinator.list,
    cancel: coordinator.cancel,
    shutdown: coordinator.shutdown,
  };
}
