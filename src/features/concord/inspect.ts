import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { PluginConfig } from "../../config/schema.js";
import { resolveComponent } from "../../components/registry.js";
import { resolveKujo } from "../../runtime/resolve-kujo.js";
import { executeKujo } from "../../runtime/execute-kujo.js";
import { removeTree } from "../../runtime/files.js";
import { KujoPluginError } from "../../runtime/errors.js";
import { captureWorkspaceSnapshot, isSnapshotCurrent } from "../../paperclip/git.js";
import { redactText } from "../failure/redact.js";
import { copyWorkspaceSnapshot, discoverWorkspaceInventory } from "../verification/snapshot.js";
import { CONCORD_BRIDGE } from "./bridge.js";
import { CONCORD_SCOPE, concordBridgeSchema, concordReportSchema, type ConcordReport } from "./schema.js";

// This controls admission order, not Concord's artifact selection semantics.
const priority = (path: string) => !path.includes("/") ? 0 : /^(?:docs|tests|eval_results|examples)\//.test(path) ? 1 : 2;
export const discoverConcordInventory = (cwd: string) => discoverWorkspaceInventory(cwd, priority);

export async function inspectConcord(input: { cwd: string; projectId: string; workspaceId: string; config: PluginConfig }): Promise<ConcordReport> {
  if (!input.config.features.verification) throw new Error("Verification is disabled by configuration or profile");
  const snapshot = await captureWorkspaceSnapshot(input.cwd);
  const directory = await mkdtemp(join(tmpdir(), "kujo-paperclip-concord-"));
  try {
    const [runtime, component, catalog] = await Promise.all([resolveKujo(input.config, directory), resolveComponent("concord"), discoverConcordInventory(input.cwd)]);
    const before = join(directory, "before"); await mkdir(before, { mode: 0o700 });
    const source = await copyWorkspaceSnapshot({ ...input, directory: before, runtime, catalog });
    const code = join(directory, "code");
    for (const relative of component.files) {
      await mkdir(dirname(join(code, relative)), { recursive: true, mode: 0o700 });
      await cp(join(component.root, relative), join(code, relative));
    }
    const entrypoint = join(code, "inspect-snapshot.kujo");
    await writeFile(entrypoint, CONCORD_BRIDGE, { mode: 0o600 });
    const result = await executeKujo({ executable: runtime.executable, cwd: source.workspace,
      args: ["run", "--isolated-imports", entrypoint], timeoutMs: Math.min(input.config.limits.timeoutMs, 10_000),
      maxStdoutBytes: Math.min(input.config.limits.maxStdoutBytes, 2_000_000), maxStderrBytes: Math.min(input.config.limits.maxStderrBytes, 4096) });
    if (result.exitCode !== 0) throw new KujoPluginError("KUJO_RUNTIME_EXEC_FAILED", "Canonical Concord inspection did not complete");
    const checked = concordBridgeSchema.parse(JSON.parse(result.stdout));
    const report = checked.report;
    const ranks = ["none", "low", "medium", "high", "critical"];
    const highest = report?.findings.reduce((rank, finding) => Math.max(rank, ranks.indexOf(finding.severity)), 0) ?? 0;
    if ((checked.phase === "analyzed") !== (report !== null) || (report && (report.summary.total_findings !== report.findings.length || report.summary.highest_severity !== ranks[highest]))) {
      throw new KujoPluginError("KUJO_COMPONENT_SCHEMA_INVALID", "Concord report contradicts its findings");
    }
    const byPath = new Map(source.files.map((file) => [file.path, file]));
    const omitted = catalog.candidates.filter((path) => byPath.get(path)?.status !== "copied").map((path) => ({ path, reason: byPath.get(path)?.status ?? "sensitive" }));
    const incomplete = catalog.truncated || catalog.rejected > 0 || omitted.length > 0 || !!report?.findings.some((finding) => finding.id.endsWith("-discovery-truncated") || finding.id.includes("-artifact-too-large-"));
    const status: ConcordReport["status"] = checked.phase === "blocked" ? "blocked" : incomplete ? "partial" : checked.phase === "empty" ? "not-run" : highest >= 3 ? "failed" : highest > 0 ? "warnings" : "passed";
    const message = checked.phase === "blocked" ? "Artifact references escape the private snapshot; native checks were not run."
      : checked.phase === "empty" ? "No recognizable Concord artifacts were admitted." : incomplete ? "Coverage is incomplete; review omissions and native discovery limits before using these findings." : "";
    let redactedCount = 0;
    const redact = (value: unknown): unknown => {
      if (typeof value === "string") {
        const clean = redactText(value.split(input.cwd).join("[workspace]").split(directory).join("[private]"));
        redactedCount += clean.count; return clean.text;
      }
      if (Array.isArray(value)) return value.map(redact);
      if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redact(child)]));
      return value;
    };
    const fields = redact({ message, issues: checked.issues, report, omitted }) as { message: string; issues: typeof checked.issues; report: typeof report; omitted: typeof omitted };
    let stale = true;
    try {
      const after = join(directory, "after"); await mkdir(after, { mode: 0o700 });
      const refreshed = await copyWorkspaceSnapshot({ ...input, directory: after, runtime, catalog: await discoverConcordInventory(input.cwd) });
      stale = source.digest !== refreshed.digest || !(await isSnapshotCurrent(input.cwd, snapshot));
    } catch { /* Failure to reread cannot confirm freshness. */ }
    return concordReportSchema.parse({ schemaVersion: 1, id: `concord_${randomUUID()}`, generatedAt: new Date().toISOString(), projectId: input.projectId, workspaceId: input.workspaceId,
      status, message: fields.message, issues: fields.issues, report: fields.report,
      coverage: { gitVisible: catalog.visible, admittedNames: catalog.candidates.length, copied: source.files.filter((file) => file.status === "copied").length,
        copiedBytes: source.copiedBytes, truncated: catalog.truncated, rejectedNames: catalog.rejected, excludedSensitive: catalog.excludedSensitive, omitted: fields.omitted },
      inputDigest: source.digest, runtimeVersion: runtime.runtimeVersion, provenance: { component: "concord", version: component.version, commit: component.gitCommit },
      snapshot, stale, redactedCount, scope: CONCORD_SCOPE });
  } finally { await removeTree(directory); }
}
