import { SourcePreparationError } from "./preparation-error.js";
import { randomUUID } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { canonicalJson, evidenceDigest } from "../storage/history.js";
import { executeSupervisedKujo } from "../runtime/supervised-kujo.js";
import { KujoPluginError } from "../runtime/errors.js";
import { redactText } from "../features/failure/redact.js";
import { executionLedger } from "./ledger.js";
import { executionRequestSchema, executionScopeSchema, type ExecutionAdapter, type ExecutionRecord, type ExecutionRequest, type ExecutionScope } from "./contracts.js";

const activeStates = new Set(["preparing", "pending", "running", "cancel_requested"]);
type RequestConfirmationInteraction = Awaited<ReturnType<PluginContext["issues"]["requestConfirmation"]>>;
const key = (scope: ExecutionScope, id: string) => canonicalJson({ ...scope, id });

function approvalPreview(request: ExecutionRequest) {
  const plan = request.plan;
  return JSON.stringify({ operation: plan.operation, suite: plan.suite, project: plan.projectId, workspace: plan.workspaceId,
    requester: request.requester, effects: plan.effects, timeoutMs: plan.timeoutMs, summary: plan.summary,
    preview: plan.preview, maxStdoutBytes: plan.maxStdoutBytes, maxStderrBytes: plan.maxStderrBytes }, null, 2).replaceAll("`", "\\u0060");
}

export function confirmationFor(record: ExecutionRecord) {
  const preview = approvalPreview(record.request);
  const evaluation = record.request.plan.operation === "eval.run";
  const creation = record.request.plan.operation === "starter.create";
  return {
    idempotencyKey: `kujo.execution:${record.id}`,
    title: evaluation ? "Run Kujo evaluation" : creation ? "Create Kujo starter files" : "Run Kujo source or tests",
    continuationPolicy: "none" as const,
    resolverPolicy: "human_only" as const,
    payload: {
      version: 1 as const,
      prompt: evaluation ? "Allow this Kujo evaluation to run once?" : creation ? "Allow these Kujo starter files to be created once?" : "Allow this Kujo source/test command to run once?",
      acceptLabel: creation ? "Allow file creation" : "Allow this run",
      rejectLabel: creation ? "Do not create files" : "Do not run",
      allowDeclineReason: true,
      supersedeOnUserComment: true,
      detailsMarkdown: `${evaluation ? "Review the suite and its effects." : creation ? "Review the starter inventory and file creation effects." : "Review the source/test operation and its effects."} Approval applies only to this request and its exact inputs. ${creation ? "File creation is not an atomic directory transaction and cannot be rolled back automatically." : "Kujo execution is not a sandbox."}\n\n\`\`\`json\n${preview}\n\`\`\`\n\nApproval expires at ${new Date(record.expiresAt).toISOString()}.`,
      target: { type: "custom" as const, key: record.id, revisionId: record.requestDigest, label: "Kujo execution request" },
    },
  };
}

function matches(record: ExecutionRecord, scope: ExecutionScope, interaction: RequestConfirmationInteraction) {
  const expected = confirmationFor(record);
  // Compare every field we sent, permitting host-added defaults only. Payload
  // identity includes all effect/input bindings through the immutable digest.
  const payload: Record<string, unknown> = Object.fromEntries(Object.keys(expected.payload).map((name) => [name, interaction.payload[name as keyof typeof interaction.payload]]));
  const target = interaction.payload.target;
  if (target?.type === "custom") payload.target = { type: target.type, key: target.key, revisionId: target.revisionId, label: target.label };
  if (Object.entries(interaction.payload).some(([name, value]) => !(name in expected.payload) && value != null)) return false;
  if (target && Object.entries(target).some(([name, value]) => !(name in expected.payload.target) && value != null)) return false;
  return interaction.companyId === scope.companyId && interaction.issueId === scope.issueId
    && interaction.idempotencyKey === expected.idempotencyKey && interaction.title === expected.title
    && interaction.continuationPolicy === "none" && interaction.requestedResolverPolicy === "human_only"
    && interaction.effectiveResolverPolicy === "human_only" && !interaction.addresseeAgentId
    && canonicalJson(payload) === canonicalJson(expected.payload);
}

function redactedResult(value: Record<string, unknown>) {
  const clean = (item: unknown): unknown => {
    if (typeof item === "string") return redactText(item).text;
    if (Array.isArray(item)) return item.map(clean);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([name, entry]) => [redactText(name).text, clean(entry)]));
    return item;
  };
  const result = z.record(z.string(), z.unknown()).parse(clean(value));
  // PostgreSQL jsonb's rendered spacing can be larger than compact JSON.
  if (Buffer.byteLength(JSON.stringify(result, null, 2)) > 900_000) throw new Error("Execution receipt exceeds its byte limit");
  return result;
}

async function materializeBounded(adapter: ExecutionAdapter, scope: ExecutionScope, plan: ExecutionRequest["plan"], controller: AbortController) {
  if (controller.signal.aborted) throw new KujoPluginError("KUJO_EXEC_CANCELLED", "Execution cancelled before preparation");
  let abandoned = false;
  let timedOut = false;
  let onAbort!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      abandoned = true;
      reject(new KujoPluginError(timedOut ? "KUJO_EXEC_TIMEOUT" : "KUJO_EXEC_CANCELLED", "Execution preparation stopped"));
    };
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 5_000);
  timer.unref();
  const work = Promise.resolve().then(() => {
    if (controller.signal.aborted) throw new KujoPluginError("KUJO_EXEC_CANCELLED", "Execution cancelled before preparation");
    return adapter.materialize(scope, plan, controller.signal);
  });
  // A slow filesystem operation may finish after cancellation. It must never
  // spawn work; dispose its private snapshot once that result arrives.
  void work.then(async (value) => { if (abandoned) await value?.dispose(); }).catch(() => {});
  try { return await Promise.race([work, aborted]); }
  finally { clearTimeout(timer); controller.signal.removeEventListener("abort", onAbort); }
}

/** Internal foundation; no public tools/actions or arbitrary command inputs. */
export function createExecutionCoordinator(ctx: PluginContext, adapter: ExecutionAdapter, operations: readonly ExecutionRequest["plan"]["operation"][] = ["eval.run"]) {
  const ledger = executionLedger(ctx);
  const ownerId = randomUUID();
  const active = new Map<string, { controller: AbortController; done: Promise<void> }>();
  let closing = false;

  const requireScope = async (raw: ExecutionScope, plan?: ExecutionRequest["plan"]) => {
    const scope = executionScopeSchema.parse(raw);
    const issue = await ctx.issues.get(scope.issueId, scope.companyId);
    if (!issue || issue.companyId !== scope.companyId || issue.id !== scope.issueId) throw new Error("Execution issue is unavailable in this company");
    if (plan) {
      const workspace = await ctx.projects.getWorkspaceForIssue(scope.issueId, scope.companyId);
      if (issue.projectId !== plan.projectId || !workspace || workspace.id !== plan.workspaceId || workspace.projectId !== plan.projectId) throw new Error("Execution workspace no longer matches the request");
    }
    return scope;
  };
  const current = async (scope: ExecutionScope, id: string) => {
    await ledger.expire(scope, id);
    const record = await ledger.read(scope, id);
    if (!record || !operations.includes(record.request.plan.operation)) throw new Error("Execution request was not found for this operation in this company and issue");
    return record;
  };
  const reconcile = async (scope: ExecutionScope, id: string) => {
    let record = await current(scope, id);
    if (record.state !== "preparing" && record.state !== "pending") return record;
    // Do not recreate a card after a lost create response. Inspect the host's
    // persisted identity instead; ambiguity never grants execution authority.
    const interactions = await ctx.issues.listInteractions(scope.issueId, scope.companyId);
    const candidates = interactions.filter((item) => record.interactionId ? item.id === record.interactionId : item.idempotencyKey === confirmationFor(record).idempotencyKey);
    if (candidates.length === 0) {
      if (record.interactionId) await ledger.finishPending(scope, id, "uncertain", "confirmation_missing");
      return await current(scope, id);
    }
    const card = candidates[0]!;
    if (candidates.length !== 1 || card.kind !== "request_confirmation" || !matches(record, scope, card)) {
      await ledger.finishPending(scope, id, "uncertain", "confirmation_mismatch");
    } else {
      if (record.state === "preparing") await ledger.bind(scope, id, card.id);
      if (card.status !== "pending" && card.status !== "accepted") await ledger.finishPending(scope, id, "rejected", "confirmation_not_accepted");
    }
    record = await current(scope, id);
    return record;
  };

  return {
    async prepare(rawScope: ExecutionScope, submissionId: string, rawRequest: ExecutionRequest) {
      if (closing) throw new Error("Execution coordinator is shutting down");
      const request = executionRequestSchema.parse(rawRequest);
      if (!operations.includes(request.plan.operation)) throw new Error("Execution operation is not supported by this adapter");
      const scope = await requireScope(rawScope, request.plan);
      z.string().min(1).max(200).parse(submissionId);
      if (Buffer.byteLength(canonicalJson(request)) > 60_000) throw new Error("Execution request exceeds its byte limit");
      if (approvalPreview(request).length > 18000) throw new Error("Suite review exceeds the host confirmation limit; split the suite or shorten its annotations");
      const id = `execution_${evidenceDigest({ ...scope, submissionId })}`;
      const inserted = await ledger.insert(scope, id, request);
      const record = await current(scope, id);
      if (record.requestDigest !== evidenceDigest(request)) throw new Error("Submission identity conflicts with different inputs or requester");
      if (!inserted || record.state !== "preparing") return await reconcile(scope, id);
      try {
        const card = await ctx.issues.requestConfirmation(scope.issueId, confirmationFor(record), scope.companyId);
        if (!matches(record, scope, card)) throw new Error("Host confirmation does not match the request");
        await ledger.bind(scope, id, card.id);
      } catch {
        // Failure may occur after host persistence. Keep the request durable;
        // status/start can reconcile it without resubmitting the side effect.
      }
      return await reconcile(scope, id);
    },
    async list(rawScope: ExecutionScope) {
      return (await ledger.list(await requireScope(rawScope))).filter(record => operations.includes(record.request.plan.operation));
    },
    async status(rawScope: ExecutionScope, id: string) {
      const scope = await requireScope(rawScope);
      return await reconcile(scope, id);
    },
    async start(rawScope: ExecutionScope, id: string) {
      if (closing) throw new Error("Execution coordinator is shutting down");
      const scope = await requireScope(rawScope);
      const record = await reconcile(scope, id);
      if (record.state !== "pending") return record;
      await requireScope(scope, record.request.plan);
      const cards = await ctx.issues.listInteractions(scope.issueId, scope.companyId);
      const matching = cards.filter((card) => card.id === record.interactionId);
      const card = matching[0];
      if (matching.length !== 1 || !card || card.kind !== "request_confirmation" || !matches(record, scope, card)) throw new Error("Confirmation is unavailable or changed");
      if (card.status !== "accepted" || card.result?.outcome !== "accepted" || !card.resolvedByUserId || card.resolvedByAgentId || card.resolvedByRunId || card.acceptanceBlocker) throw new Error("A current human approval is required");
      const resolvedAt = new Date(card.resolvedAt ?? "").getTime();
      if (!Number.isFinite(resolvedAt) || resolvedAt < new Date(record.createdAt).getTime() || resolvedAt >= new Date(record.expiresAt).getTime()) throw new Error("Approval time is outside the request lifetime");
      const claimId = randomUUID();
      if (!await ledger.claim(scope, id, card.id, card.resolvedByUserId, ownerId, claimId, new Date(resolvedAt).toISOString())) return await current(scope, id);
      if (closing) {
        await ledger.finish(scope, id, ownerId, claimId, "cancelled", null, "worker_shutting_down");
        return await current(scope, id);
      }
      // Only the one successful SQL claim may create an owned process. A lost
      // claim response cannot start a process and is never blindly retried.
      const controller = new AbortController();
      let materialized: Awaited<ReturnType<ExecutionAdapter["materialize"]>> = null;
      let enteredProcess = false;
      let lostObservation = false;
      let monitoring: Promise<void> | undefined;
      const monitor = () => {
        monitoring ??= (async () => {
          try {
            if (!await ledger.heartbeat(scope, id, ownerId, claimId)) controller.abort();
          } catch { lostObservation = true; controller.abort(); }
        })().finally(() => { monitoring = undefined; });
        return monitoring;
      };
      const timer = setInterval(() => { void monitor(); }, 250);
      timer.unref();
      let release!: () => void;
      const done = new Promise<void>((resolve) => { release = resolve; });
      active.set(key(scope, id), { controller, done });
      try {
        materialized = await materializeBounded(adapter, scope, record.request.plan, controller);
        if (!materialized) {
          await ledger.finish(scope, id, ownerId, claimId, "stale", null, "approved_inputs_changed");
        } else {
          // Recheck persistent cancellation and owner lease immediately before
          // spawn; aborting before spawn must never launch a child.
          await monitor();
          if (controller.signal.aborted) throw new KujoPluginError("KUJO_EXEC_CANCELLED", "Execution cancelled before process start");
          const admission = await ledger.spawnAdmission(scope, id, ownerId, claimId);
          if (admission !== "ready") {
            const state = admission === "expired" ? "expired" : admission === "cancelled" ? "cancelled" : "uncertain";
            await ledger.finish(scope, id, ownerId, claimId, state, null, "admission_lost_before_process_start");
            return await current(scope, id);
          }
          enteredProcess = true;
          const output = await executeSupervisedKujo({ ...materialized.invocation, signal: controller.signal, timeoutMs: record.request.plan.timeoutMs, maxStdoutBytes: record.request.plan.maxStdoutBytes ?? 500_000, maxStderrBytes: record.request.plan.maxStderrBytes ?? 64_000 });
          const result = redactedResult(await materialized.collect(output));
          await ledger.finish(scope, id, ownerId, claimId, output.exitCode === 0 ? "succeeded" : "failed", result, null);
        }
      } catch (error) {
        const cancelled = error instanceof KujoPluginError && error.code === "KUJO_EXEC_CANCELLED";
        const uncertain = lostObservation || (enteredProcess && !(error instanceof KujoPluginError));
        await ledger.finish(scope, id, ownerId, claimId, uncertain ? "uncertain" : cancelled ? "cancelled" : "failed", null,
          uncertain ? "execution_outcome_unconfirmed" : error instanceof KujoPluginError ? error.code : error instanceof SourcePreparationError ? error.diagnostic : "materialization_failed");
      } finally {
        clearInterval(timer);
        // Disposal cannot erase an already committed execution outcome.
        try { await materialized?.dispose(); } finally { active.delete(key(scope, id)); release(); }
      }
      return await current(scope, id);
    },
    async cancel(rawScope: ExecutionScope, id: string) {
      const scope = await requireScope(rawScope);
      const record = await current(scope, id);
      if (!activeStates.has(record.state)) return record;
      await ledger.cancel(scope, id);
      const owned = active.get(key(scope, id));
      if (owned) { owned.controller.abort(); await owned.done; }
      // A different worker observes the persisted request through its heartbeat.
      // Until it confirms process-tree termination, report cancel_requested.
      return await current(scope, id);
    },
    async shutdown() {
      closing = true;
      const owned = [...active.values()];
      for (const item of owned) item.controller.abort();
      await Promise.all(owned.map((item) => item.done));
    },
  };
}
