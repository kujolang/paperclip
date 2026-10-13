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
const runId = z.string().regex(/^run-[a-zA-Z0-9-]{1,120}$/);
export const dispatchDecisionSchema = z.object({
  schema: z.literal("kujo.intervention-decision/v2"), run_id: runId,
  decision_id: identity, request_id: identity, boundary_id: identity,
  expected_state_revision: z.number().int().nonnegative(),
  // The first integration consumes retained evidence only. Native retry/amend
  // contracts require additional effect/provider admission before projection.
  action: z.enum(["approve_override", "resume_from_boundary", "abort"]),
  continuation: z.object({}).strict(),
  actor: z.object({ id: identity, type: z.literal("human"), authenticated_by: identity, authorization: identity }).strict(),
  reason: z.string().min(1).max(2000), decided_at: z.iso.datetime({ offset: true }),
}).strict();
export const dispatchCommandSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("templates") }).strict(),
  z.object({ operation: z.literal("start-fixture"), template: z.enum(["research-report", "crud-reliability", "approval-handoff"]), topic: z.string().trim().min(1).max(500).refine(value => !value.startsWith("--") && !value.includes("\0"), "Topic must be text, not a CLI option") }).strict(),
  z.object({ operation: z.literal("runs") }).strict(),
  z.object({ operation: z.literal("inspect"), runId }).strict(),
  z.object({ operation: z.literal("decide"), decision: dispatchDecisionSchema }).strict(),
]);
export type DispatchCommand = z.infer<typeof dispatchCommandSchema>;
const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const policy = { adapter: "dispatch-offline-native/v1", timeoutMs: 27000, stdoutBytes: 500000, stderrBytes: 64000, mode: "offline-fixture" };

/** Internal command materializer, not an approval authority or public tool.
 * The host must bind command/component/runtime/policy digests to approval and
 * persistent ownership before invoking. Decision actor identity must come from
 * authenticated host context, never caller-supplied tool parameters. Never replay start after lost observation.
 * Existing runner state is retained; only the private code snapshot is disposed.
 */
export async function prepareDispatchInvocation(input: {
  command: DispatchCommand; runtime: ResolvedRuntime;
  storageRoot: string; storageBinding: WorkflowStorageBinding;
}) {
  if (process.platform !== "darwin" && process.platform !== "linux") throw new Error("Dispatch requires a supported POSIX platform");
  // Snapshot caller data before asynchronous work; no mutable decision aliases.
  const command = dispatchCommandSchema.parse(input.command);
  const runtime = { ...input.runtime };
  const storageBinding = { ...input.storageBinding };
  const store = await openWorkflowStorage(input.storageRoot);
  const { nativeRoot } = await store.recover(storageBinding);
  const component = await resolveComponent("dispatch");
  const binding = Object.freeze({ commandDigest: evidenceDigest(command), componentDigest: evidenceDigest({ commit: component.gitCommit, checksums: component.checksums }), runtimeDigest: sha(await readFile(runtime.executable)), policyDigest: evidenceDigest(policy) });
  const directory = await realpath(await mkdtemp(join(tmpdir(), "kujo-dispatch-code-")));
  try {
    for (const path of component.files) {
      const bytes = await readFile(join(component.root, path));
      if (sha(bytes) !== component.checksums[path]) throw new Error("Dispatch source changed while copying");
      await mkdir(dirname(join(directory, path)), { recursive: true, mode: 0o700 });
      await writeFile(join(directory, path), bytes, { mode: 0o600, flag: "wx" });
    }
    let args: string[];
    if (command.operation === "templates") args = ["templates", "--json"];
    else if (command.operation === "start-fixture") args = ["demo", command.topic, "--workflow", command.template, "--non-interactive", "--policy-profile", "production", "--output-root", "runs"];
    else if (command.operation === "runs") args = ["runs", "--output-root", "runs", "--json"];
    else if (command.operation === "inspect") args = ["inspect", command.runId, "--output-root", "runs", "--json"];
    else {
      const decision = join(directory, "paperclip-decision.json");
      await writeFile(decision, JSON.stringify(command.decision), { mode: 0o600, flag: "wx" });
      args = ["resume-decision", decision, "--output-root", "runs", "--non-interactive", "--policy-profile", "production"];
    }
    // Both the caller's reservation and executable must still match at return.
    await store.recover(storageBinding);
    if (sha(await readFile(runtime.executable)) !== binding.runtimeDigest) throw new Error("Dispatch runtime changed while preparing");
    const invocation: ExecuteKujoInput = {
      executable: runtime.executable, cwd: nativeRoot,
      args: ["run", "--isolated-imports", join(directory, component.entrypoint), "--", ...args],
      env: { DISPATCH_ROOT: directory, DISPATCH_OFFLINE_FIXTURE: "true", KUJO_BIN: runtime.executable },
      timeoutMs: policy.timeoutMs, maxStdoutBytes: policy.stdoutBytes, maxStderrBytes: policy.stderrBytes,
    };
    return { binding, invocation, provenance: { version: component.version, commit: component.gitCommit, runtimeVersion: runtime.runtimeVersion }, dispose: async () => { await removeTree(directory); } };
  } catch (error) { await removeTree(directory); throw error; }
}
