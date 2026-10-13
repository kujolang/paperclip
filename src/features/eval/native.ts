import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Ajv } from "ajv";
import { resolveComponent } from "../../components/registry.js";
import type { ExecutionAdapter, ExecutionPlan } from "../../execution/contracts.js";
import { removeTree } from "../../runtime/files.js";
import type { ResolvedRuntime } from "../../runtime/types.js";
import { evidenceDigest } from "../../storage/history.js";
import { workspaceTextPathSchema } from "../language/source.js";
import { importVerification, IMPORT_MAX_BYTES } from "../verification/import.js";
import { SNAPSHOT_LIMITS } from "../verification/snapshot.js";
import suiteSchema from "../../../bundled/components/eval/schema/eval-suite.schema.json" with { type: "json" };

const validateSuite = new Ajv({ strict: false, allErrors: false, ownProperties: true }).compile(suiteSchema);
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const effects: ExecutionPlan["effects"] = ["read_workspace", "write_reports", "execute_project", "network"];
const policyDigest = evidenceDigest({ adapter: "canonical-eval-frozen-inputs/v1", effects, limits: SNAPSHOT_LIMITS, resultBytes: IMPORT_MAX_BYTES });
type Materialized = NonNullable<Awaited<ReturnType<ExecutionAdapter["materialize"]>>>;

async function readResult(directory: string) {
  // No arbitrary evidence URI is followed. Refuse redirected output directories,
  // symlinks, special files, shared hard links and oversized result artifacts.
  if (await realpath(directory) !== directory) throw new Error("Eval output directory was redirected");
  const filename = join(directory, "evaluation-result.json");
  const before = await lstat(filename);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error("Eval result file was redirected");
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.nlink !== 1 || stat.size > IMPORT_MAX_BYTES) throw new Error("Eval result is not a bounded private regular file");
    const buffer = Buffer.alloc(IMPORT_MAX_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > IMPORT_MAX_BYTES) throw new Error("Eval result exceeds its byte limit");
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length));
  } finally { await handle.close(); }
}

/** Internal execution primitive, NOT a public tool or an approval authority.
 * The host adapter must admit/capture these files and bind the resulting digests
 * to an accepted plan before returning materialize() to the coordinator. All
 * canonical check families and suite hooks remain implemented by native Eval.
 * Trusted suites may execute commands, access the network and escape this copy;
 * a private snapshot is reproducible input, not a security sandbox.
 */
export async function prepareNativeEval(input: {
  suite: string; files: ReadonlyArray<{ path: string; content: string }>; runtime: ResolvedRuntime;
}) {
  const suite = workspaceTextPathSchema.parse(input.suite);
  if (!suite.endsWith(".json")) throw new Error("Choose a JSON Eval suite");
  if (input.files.length > SNAPSHOT_LIMITS.files) throw new Error("Eval snapshot exceeds its file count limit");
  // Copy caller-owned data before awaiting; subsequent caller mutation cannot
  // silently change the bytes approved under this binding.
  const files = input.files.map(file => ({ path: workspaceTextPathSchema.parse(file.path), bytes: Buffer.from(file.content, "utf8") }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const names = new Set<string>(); let totalBytes = 0;
  for (const file of files) {
    const name = file.path.toLowerCase();
    if (names.has(name) || name.split("/").includes(".git") || file.path.startsWith("~")
      || file.path.split("/").some(part => /[ .]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error("Eval snapshot has duplicate, ambiguous or reserved paths");
    names.add(name); totalBytes += file.bytes.length;
    if (file.bytes.includes(0) || file.bytes.length > SNAPSHOT_LIMITS.fileBytes || totalBytes > SNAPSHOT_LIMITS.totalBytes) throw new Error("Eval snapshot exceeds its text or byte limits");
  }
  const definition = files.find(file => file.path === suite);
  if (!definition) throw new Error("Eval suite is missing from the frozen inputs");
  const parsed: unknown = JSON.parse(definition.bytes.toString("utf8"));
  if (!validateSuite(parsed)) throw new Error("Eval suite does not match the pinned canonical schema");
  const runtime = { ...input.runtime };
  const component = await resolveComponent("eval");
  const binding = Object.freeze({
    inputDigest: evidenceDigest(files.map(file => ({ path: file.path, sha256: sha(file.bytes) }))),
    definitionDigest: sha(definition.bytes), componentDigest: evidenceDigest({ commit: component.gitCommit, checksums: component.checksums }),
    runtimeDigest: sha(await readFile(runtime.executable)), policyDigest,
  });
  return {
    binding, suite, effects: [...effects], files: files.length, bytes: totalBytes,
    summary: `Run canonical Eval on ${files.length} frozen input files. Suite hooks and checks may execute commands, access the network, read files and write files, reports or snapshots. Trusted code; the input copy is not a sandbox. Results apply to the supplied frozen inputs, not automatically to the full project.`,
    async materialize(plan: ExecutionPlan, signal: AbortSignal): Promise<Materialized | null> {
      if (signal.aborted) return null;
      if (plan.suite !== suite || Object.entries(binding).some(([key, value]) => plan[key as keyof typeof binding] !== value)
        || evidenceDigest(plan.effects) !== evidenceDigest(effects)) return null;
      const current = await resolveComponent("eval");
      if (evidenceDigest({ commit: current.gitCommit, checksums: current.checksums }) !== binding.componentDigest
        || sha(await readFile(runtime.executable)) !== binding.runtimeDigest || signal.aborted) return null;
      const directory = await realpath(await mkdtemp(join(tmpdir(), "kujo-paperclip-eval-")));
      try {
        const workspace = join(directory, "workspace"), code = join(directory, "code"), output = join(directory, "output");
        await mkdir(workspace, { mode: 0o700 }); await mkdir(output, { mode: 0o700 });
        for (const file of files) {
          await mkdir(dirname(join(workspace, file.path)), { recursive: true, mode: 0o700 });
          await writeFile(join(workspace, file.path), file.bytes, { mode: 0o600, flag: "wx" });
        }
        for (const path of current.files) {
          const bytes = await readFile(join(current.root, path));
          if (sha(bytes) !== current.checksums[path]) throw new Error("Eval source changed during materialization");
          await mkdir(dirname(join(code, path)), { recursive: true, mode: 0o700 });
          await writeFile(join(code, path), bytes, { mode: 0o600, flag: "wx" });
        }
        const runId = `eval_${randomUUID()}`;
        const subject = join(directory, "subject.json");
        await writeFile(subject, JSON.stringify({ run_id: runId }), { mode: 0o600 });
        if (signal.aborted) { await removeTree(directory); return null; }
        return {
          invocation: { executable: runtime.executable, cwd: workspace,
            args: ["run", "--isolated-imports", join(code, current.entrypoint), "--", "run", suite, "--output-dir", output, "--subject-context", subject, "--json"] },
          async collect(process) {
            if (process.exitCode !== 0 && process.exitCode !== 1) throw new Error("Eval did not finish with a canonical result status");
            // Reuse pinned contract validation, summary selection, consistency
            // checks and redaction. Do not retain an imported-evidence label.
            const report = importVerification(await readResult(output));
            if (report.result.subject.run_id !== runId || report.result.evaluator.name !== "eval"
              || report.result.evaluator.configuration_sha256 !== binding.definitionDigest
              || (report.result.checks.failed > 0 ? 1 : 0) !== process.exitCode) throw new Error("Eval process outcome contradicts its result artifact");
            return { schemaVersion: 1, sourceKind: "native", executionObserved: true, scope: "frozen-inputs",
              classification: report.classification, result: report.result, artifactDigest: report.sourceDigest,
              inputDigest: binding.inputDigest, definitionDigest: binding.definitionDigest, componentDigest: binding.componentDigest,
              runtimeDigest: binding.runtimeDigest, policyDigest, exitCode: process.exitCode,
              referenceCount: report.referenceCount, referencesResolved: false, redactedCount: report.redactedCount,
              provenance: { component: "eval", version: current.version, commit: current.gitCommit, runtimeVersion: runtime.runtimeVersion },
              notice: "Canonical Eval process observed on frozen inputs. Referenced evidence and project-wide applicability are not inferred. Trusted suite code is not sandboxed." };
          },
          dispose: async () => { await removeTree(directory); },
        };
      } catch (error) { await removeTree(directory); throw error; }
    },
  };
}
