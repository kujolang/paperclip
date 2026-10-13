import { readDecisionObservation } from "./decision-observation.js";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import type { ExecutionPlan, ExecutionRequest, ExecutionScope, ExecutionStarter } from "../../execution/contracts.js";
import { createExecutionCoordinator } from "../../execution/coordinator.js";
import { executionLedger } from "../../execution/ledger.js";
import { parsePluginConfig } from "../../config/schema.js";
import { toolEnabled } from "../../abilities/catalog.js";
import { projections, workflowTool } from "../../abilities/generated.js";
import { evidenceDigest } from "../../storage/history.js";
import { resolveKujo } from "../../runtime/resolve-kujo.js";
import { executeSupervisedKujo } from "../../runtime/supervised-kujo.js";
import { redactWorkflowValue } from "./public.js";
import { bindDispatchLegacyDecision, readDispatchControlView } from "./control.js";
import { describeDispatchInvocation, dispatchCommandSchema, prepareDispatchInvocation, type DispatchCommand } from "./native.js";
import { discoverOwnedRun, resolveWorkflowStorage } from "./storage.js";

export const workflowTemplate = z.enum(["research-report", "crud-reliability", "approval-handoff"]);
export const workflowStartInput = z.object({ template: workflowTemplate, topic: z.string().trim().min(1).max(500) }).strict();
const active = new Set(["preparing", "pending", "running", "cancel_requested"]);

export function createWorkflowService(ctx: PluginContext) {
  const ledger = executionLedger(ctx);
  async function admission(scope: ExecutionScope) {
    const issue = await ctx.issues.get(scope.issueId, scope.companyId);
    if (!issue || issue.id !== scope.issueId || issue.companyId !== scope.companyId) throw new Error("Workflow issue is unavailable in this company");
    const config = parsePluginConfig(await ctx.config.get(scope.companyId));
    if (!toolEnabled(config, workflowTool)) throw new Error("Kujo workflows are disabled by company settings or capability profile");
    const storage = await resolveWorkflowStorage(ctx, scope);
    const runtime = await resolveKujo(config, storage.root);
    return { config, storage, runtime };
  }
  async function parent(scope: ExecutionScope, id: string) {
    const record = await ledger.read(scope, id);
    if (!record || record.request.plan.operation !== "dispatch.start" || record.request.plan.workflow?.parentId !== id) throw new Error("Workflow was not found in this company and issue");
    return record;
  }
  async function retained(scope: ExecutionScope, id: string, admitted: Awaited<ReturnType<typeof admission>>) {
    const record = await parent(scope, id);
    if (record.request.plan.workflow!.storageDigest !== admitted.storage.storageDigest) throw new Error("Workflow storage configuration changed; restore its original folder before inspection");
    const binding = { ...scope, installationId: admitted.storage.installationId, executionId: id, requestDigest: record.requestDigest };
    return { record, binding };
  }
  async function observe(scope: ExecutionScope, id: string) {
    const admitted = await admission(scope);
    const selected = await coordinator.status(scope, id);
    if (selected.request.plan.operation === "dispatch.decide") {
      if (active.has(selected.state)) return { status: "operation-active" as const, control: null };
      const command = selected.request.plan.workflow!.command;
      if (command.operation !== "decide-approval") throw new Error("Unsupported checkpoint observation");
      const { binding } = await retained(scope, selected.request.plan.workflow!.parentId, admitted);
      const prepared = await prepareDispatchInvocation({ command: { operation: "inspect-approval", decision: command.decision }, runtime: admitted.runtime, storageRoot: admitted.storage.root, storageBinding: binding });
      try {
        const output = await executeSupervisedKujo({ ...prepared.invocation, timeoutMs: 22000 });
        return { status: "decision-observed" as const, control: null, decisionReceipt: readDecisionObservation(output, command.decision) };
      } catch { throw new Error("Native checkpoint receipt is unavailable; retain the original operation outcome and do not replay"); }
      finally { await prepared.dispose(); }
    }
    const { record, binding } = await retained(scope, id, admitted);
    if (active.has(record.state)) return { status: "operation-active" as const, control: null };
    if (!record.ownerId) return { status: "not-started" as const, control: null };
    let prepared;
    try {
      const { nativeRoot } = await admitted.storage.store.recover(binding);
      const runId = await discoverOwnedRun(nativeRoot);
      if (!runId) return { status: "not-observed" as const, control: null };
      prepared = await prepareDispatchInvocation({ command: { operation: "inspect", runId }, runtime: admitted.runtime, storageRoot: admitted.storage.root, storageBinding: binding });
      const output = await executeSupervisedKujo({ ...prepared.invocation, timeoutMs: 22000 });
      return { status: "observed" as const, control: readDispatchControlView(output, runId) };
    } catch { throw new Error("Native workflow inspection is unavailable; verify retained storage and refresh operation status"); }
    finally { await prepared?.dispose(); }
  }
  async function capture(scope: ExecutionScope, parentId: string, raw: DispatchCommand) {
    const command = dispatchCommandSchema.parse(raw);
    if (command.operation !== "start-fixture" && command.operation !== "decide-approval") throw new Error("Unsupported workflow effect");
    const admitted = await admission(scope);
    if (command.operation === "decide-approval") await retained(scope, parentId, admitted);
    const described = await describeDispatchInvocation(command, admitted.runtime, "workflow-job");
    const projection = projections.find(item => item.id === "kujo.paperclip.workflow.manage")!;
    const plan: ExecutionPlan = {
      abilityReceipt: { serializerVersion: 1, abilityId: projection.id, abilityVersion: projection.definition.version, definitionDigest: projection.definitionDigest, handlerVersion: "1.0.0" },
      operation: command.operation === "start-fixture" ? "dispatch.start" : "dispatch.decide",
      projectId: null, workspaceId: null, suite: command.operation === "start-fixture" ? command.template : command.decision.decision,
      workflow: { parentId, storageDigest: admitted.storage.storageDigest, command },
      summary: "Run this exact offline Dispatch workflow operation once in retained operator-configured storage. No live providers or project code. The workflow may pause for another human checkpoint. Interrupted effects are not rolled back or automatically replayed.",
      preview: JSON.stringify(redactWorkflowValue({ command, source: { commit: described.component.gitCommit, version: described.component.version }, storage: "company workflow-state folder", budgetSeconds: 120 }), null, 2),
      effects: ["write_files", "write_reports"], inputDigest: described.binding.commandDigest,
      workspaceDigest: admitted.storage.storageDigest, definitionDigest: projection.definitionDigest,
      componentDigest: described.binding.componentDigest, runtimeDigest: described.binding.runtimeDigest,
      policyDigest: evidenceDigest({ native: described.binding.policyDigest, storage: admitted.storage.storageDigest, profile: admitted.config.capabilityProfile, enabled: admitted.config.features.workflows, runtime: admitted.config.runtime }),
      timeoutMs: 120000, maxStdoutBytes: 500000, maxStderrBytes: 64000,
    };
    return { plan, admitted, described };
  }
  const coordinator = createExecutionCoordinator(ctx, { async materialize(scope, plan, signal) {
    if (!plan.workflow) return null;
    const captured = await capture(scope, plan.workflow.parentId, plan.workflow.command);
    if (signal.aborted || evidenceDigest(captured.plan) !== evidenceDigest(plan)) return null;
    const { binding } = await retained(scope, plan.workflow.parentId, captured.admitted);
    if (plan.operation === "dispatch.decide") {
      const observed = await observe(scope, plan.workflow.parentId);
      const command = plan.workflow.command;
      if (!observed.control || command.operation !== "decide-approval") return null;
      const decision = command.decision;
      const rebound = bindDispatchLegacyDecision(observed.control, { decision: decision.decision, actor: decision.actor, response: decision.response, decidedAt: decision.decided_at });
      if (evidenceDigest(rebound) !== evidenceDigest(decision)) return null;
    }
    if (signal.aborted) return null;
    if (plan.operation === "dispatch.start") await captured.admitted.storage.store.reserve(binding);
    const prepared = await prepareDispatchInvocation({ command: plan.workflow.command, runtime: captured.admitted.runtime, storageRoot: captured.admitted.storage.root, storageBinding: binding, executionBudget: "workflow-job" });
    if (signal.aborted || prepared.binding.commandDigest !== plan.inputDigest || prepared.binding.componentDigest !== plan.componentDigest || prepared.binding.runtimeDigest !== plan.runtimeDigest) { await prepared.dispose(); return null; }
    return { invocation: prepared.invocation, collect: async output => ({ classification: output.exitCode === 0 ? "operation-completed" : "operation-failed", exitCode: output.exitCode,
      stdout: output.stdout.replaceAll(captured.admitted.storage.root, "<workflow-storage>"), stderr: output.stderr.replaceAll(captured.admitted.storage.root, "<workflow-storage>"), notice: "Command outcome only. Refresh native status to inspect whether the workflow completed or paused. Lost or interrupted operations never authorize automatic replay." }), dispose: prepared.dispose };
  } }, ["dispatch.start", "dispatch.decide"]);
  async function existing(scope: ExecutionScope, id: string, requester: ExecutionRequest["requester"]) {
    const record = await ledger.read(scope, id);
    if (record && (!record.request.plan.operation.startsWith("dispatch.") || evidenceDigest(record.request.requester) !== evidenceDigest(requester))) throw new Error("Submission identity conflicts with another request");
    return record;
  }
  return {
    async inspect(scope: ExecutionScope, input: unknown) {
      const selected = workflowStartInput.parse(input);
      const captured = await capture(scope, "preview", { operation: "start-fixture", ...selected });
      return { plan: captured.plan };
    },
    async prepare(scope: ExecutionScope, input: unknown, submissionId: string, requester: ExecutionRequest["requester"]) {
      const selected = workflowStartInput.parse(input), key = `workflow:${evidenceDigest(submissionId)}`;
      const id = `execution_${evidenceDigest({ ...scope, submissionId: key })}`;
      const prior = await existing(scope, id, requester);
      const command: DispatchCommand = { operation: "start-fixture", ...selected };
      if (prior) {
        if (evidenceDigest(prior.request.plan.workflow?.command) !== evidenceDigest(command)) throw new Error("Submission identity conflicts with changed workflow inputs");
        return coordinator.status(scope, id);
      }
      const captured = await capture(scope, id, command);
      return coordinator.prepare(scope, key, { plan: captured.plan, requester });
    },
    async decide(scope: ExecutionScope, parentId: string, decision: "approve" | "reject", response: string, submissionId: string, requester: ExecutionRequest["requester"]) {
      if (requester.kind !== "human") throw new Error("A human must review and request this native checkpoint decision in the Kujo issue panel");
      const key = `workflow-decision:${evidenceDigest(submissionId)}`, id = `execution_${evidenceDigest({ ...scope, submissionId: key })}`;
      const prior = await existing(scope, id, requester);
      if (prior) {
        const command = prior.request.plan.workflow?.command;
        if (prior.request.plan.workflow?.parentId !== parentId || command?.operation !== "decide-approval" || command.decision.decision !== decision || command.decision.response !== response) throw new Error("Decision submission conflicts with changed inputs");
        return coordinator.status(scope, id);
      }
      const observed = await observe(scope, parentId);
      if (!observed.control) throw new Error("No authoritative checkpoint is available for approval");
      const native = bindDispatchLegacyDecision(observed.control, { decision, response, decidedAt: new Date().toISOString(), actor: { id: requester.id, type: "human", authenticated_by: "paperclip.user-action", authorization: "paperclip.human-only-confirmation-required" } });
      const captured = await capture(scope, parentId, { operation: "decide-approval", decision: native });
      return coordinator.prepare(scope, key, { plan: captured.plan, requester });
    },
    async start(scope: ExecutionScope, id: string, starter: ExecutionStarter) { await admission(scope); return coordinator.enqueue(scope, id, starter); },
    observe, status: coordinator.status, list: coordinator.list, cancel: coordinator.cancel,
    drainQueued: coordinator.drainQueued, shutdown: coordinator.shutdown,
  };
}
