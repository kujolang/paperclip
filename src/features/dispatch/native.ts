import { DECISION_OBSERVER } from "./decision-observation.js";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { resolveComponent } from "../../components/registry.js";
import { openWorkflowStorage, type WorkflowStorageBinding } from "../../execution/workflow-storage.js";
import { removeTree } from "../../runtime/files.js";
import type { ExecuteKujoInput, ResolvedRuntime } from "../../runtime/types.js";
import { evidenceDigest } from "../../storage/history.js";

const identity = z.string().min(1).max(200);
export const dispatchRunIdSchema = z.string().regex(/^run-[a-zA-Z0-9-]{1,120}$/);
export const dispatchActorSchema = z.object({ id: identity, type: z.literal("human"), authenticated_by: identity, authorization: identity }).strict();
export const dispatchLegacyDecisionSchema = z.object({
  run_id: dispatchRunIdSchema, step_id: identity, event_id: identity, decision_id: identity,
  expected_state_revision: z.number().int().positive(), decision: z.enum(["approve", "reject"]),
  actor: dispatchActorSchema, response: z.string().min(1).max(2000), decided_at: z.iso.datetime({ offset: true }),
}).strict();
export const dispatchDecisionSchema = z.object({
  schema: z.literal("kujo.intervention-decision/v2"), run_id: dispatchRunIdSchema,
  decision_id: identity, request_id: identity, boundary_id: identity,
  expected_state_revision: z.number().int().nonnegative(),
  // The first integration consumes retained evidence only. Native retry/amend
  // contracts require additional effect/provider admission before projection.
  action: z.enum(["approve_override", "resume_from_boundary", "abort"]),
  continuation: z.object({}).strict(),
  actor: dispatchActorSchema,
  reason: z.string().min(1).max(2000), decided_at: z.iso.datetime({ offset: true }),
}).strict();
export const dispatchCommandSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("templates") }).strict(),
  z.object({ operation: z.literal("start-fixture"), template: z.enum(["research-report", "crud-reliability", "approval-handoff"]), topic: z.string().trim().min(1).max(500).refine(value => !value.startsWith("--") && !value.includes("\0"), "Topic must be text, not a CLI option") }).strict(),
  z.object({ operation: z.literal("runs") }).strict(),
  z.object({ operation: z.literal("inspect"), runId: dispatchRunIdSchema }).strict(),
  z.object({ operation: z.literal("inspect-approval"), decision: dispatchLegacyDecisionSchema }).strict(),
  z.object({ operation: z.literal("decide-approval"), decision: dispatchLegacyDecisionSchema }).strict(),
  z.object({ operation: z.literal("decide"), decision: dispatchDecisionSchema }).strict(),
]);
export type DispatchCommand = z.infer<typeof dispatchCommandSchema>;
const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const basePolicy = { adapter: "dispatch-offline-native/v2", timeoutMs: 27000, stdoutBytes: 500000, stderrBytes: 64000, mode: "offline-fixture" };

/** Describe the exact native policy without reserving storage or starting work. */
export async function describeDispatchInvocation(commandInput: DispatchCommand, runtime: ResolvedRuntime, budget: "short" | "workflow-job" = "short") {
  const command = dispatchCommandSchema.parse(commandInput);
  const executionBudget = z.enum(["short", "workflow-job"]).parse(budget);
  const workflowEffect = ["start-fixture", "decide", "decide-approval"].includes(command.operation);
  const policy = { ...basePolicy, ...(command.operation === "inspect-approval" ? { observerDigest: sha(Buffer.from(DECISION_OBSERVER)) } : {}), executionBudget, timeoutMs: executionBudget === "workflow-job" && workflowEffect ? 120000 : 27000 };
  const component = await resolveComponent("dispatch");
  const binding = Object.freeze({ commandDigest: evidenceDigest(command), componentDigest: evidenceDigest({ id: component.id, version: component.version, entrypoint: component.entrypoint, commit: component.gitCommit, files: component.files, checksums: component.checksums }), runtimeDigest: sha(await readFile(runtime.executable)), policyDigest: evidenceDigest(policy) });
  return { command, policy, component, binding };
}

/** Internal command materializer, not an approval authority or public tool.
 * The host must bind command/component/runtime/policy digests to approval and
 * persistent ownership before invoking. A workflow-job budget requires durable
 * job admission with that exact budget; this helper does not grant it. Decision actor identity must come from
 * authenticated host context, never caller-supplied tool parameters. Never replay start after lost observation.
 * Existing runner state is retained; only the private code snapshot is disposed.
 */
export async function prepareDispatchInvocation(input: {
  command: DispatchCommand; runtime: ResolvedRuntime;
  storageRoot: string; storageBinding: WorkflowStorageBinding;
  /** Explicit internal job budget; never select this for a synchronous public RPC. */
  executionBudget?: "short" | "workflow-job";
}) {
  if (process.platform !== "darwin" && process.platform !== "linux") throw new Error("Dispatch requires a supported POSIX platform");
  // Snapshot caller data before asynchronous work; no mutable decision aliases.
  const command = dispatchCommandSchema.parse(input.command);
  const runtime = { ...input.runtime };
  const storageBinding = { ...input.storageBinding };
  const store = await openWorkflowStorage(input.storageRoot);
  const { nativeRoot } = await store.recover(storageBinding);
  const { component, binding, policy } = await describeDispatchInvocation(command, runtime, input.executionBudget);
  const directory = await realpath(await mkdtemp(join(tmpdir(), "kujo-dispatch-code-")));
  try {
    for (const path of component.files) {
      const bytes = await readFile(join(component.root, path));
      if (sha(bytes) !== component.checksums[path]) throw new Error("Dispatch source changed while copying");
      await mkdir(dirname(join(directory, path)), { recursive: true, mode: 0o700 });
      await writeFile(join(directory, path), bytes, { mode: 0o600, flag: "wx" });
    }
    let args: string[];
    let entrypoint = join(directory, component.entrypoint);
    if (command.operation === "templates") args = ["templates", "--json"];
    else if (command.operation === "start-fixture") args = ["demo", command.topic, "--workflow", command.template, "--non-interactive", "--policy-profile", "production", "--output-root", "runs"];
    else if (command.operation === "runs") args = ["runs", "--output-root", "runs", "--json"];
    else if (command.operation === "inspect") args = ["inspect", command.runId, "--output-root", "runs", "--json"];
    else {
      const decision = join(directory, "paperclip-decision.json");
      await writeFile(decision, JSON.stringify(command.decision), { mode: 0o600, flag: "wx" });
      if (command.operation === "inspect-approval") {
        entrypoint = join(directory, "paperclip-observe-decision.kujo");
        await writeFile(entrypoint, DECISION_OBSERVER, { mode: 0o600, flag: "wx" });
        args = [decision];
      } else args = ["resume-decision", decision, "--output-root", "runs", "--non-interactive", "--policy-profile", "production"];
    }
    // Both the caller's reservation and executable must still match at return.
    await store.recover(storageBinding);
    if (sha(await readFile(runtime.executable)) !== binding.runtimeDigest) throw new Error("Dispatch runtime changed while preparing");
    const invocation: ExecuteKujoInput = {
      executable: runtime.executable, cwd: nativeRoot,
      args: ["run", "--isolated-imports", entrypoint, "--", ...args],
      env: { DISPATCH_ROOT: directory, DISPATCH_OFFLINE_FIXTURE: "true", KUJO_BIN: runtime.executable },
      timeoutMs: policy.timeoutMs, maxStdoutBytes: policy.stdoutBytes, maxStderrBytes: policy.stderrBytes,
    };
    return { binding, invocation, provenance: { version: component.version, commit: component.gitCommit, runtimeVersion: runtime.runtimeVersion }, dispose: async () => { await removeTree(directory); } };
  } catch (error) { await removeTree(directory); throw error; }
}
