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
import { FENCE_BRIDGE } from "./bridge.js";
import { copyFenceSnapshot, discoverFenceInventory } from "./snapshot.js";
import { FENCE_SCOPE, fenceBridgeSchema, fenceReportSchema, type FenceReport } from "./schema.js";

export async function inspectFence(input: { cwd: string; projectId: string; workspaceId: string; config: PluginConfig }): Promise<FenceReport> {
  if (!input.config.features.verification) throw new Error("Verification is disabled by configuration or profile");
  const snapshot = await captureWorkspaceSnapshot(input.cwd);
  const directory = await mkdtemp(join(tmpdir(), "kujo-paperclip-fence-"));
  try {
    const [runtime, component, catalog] = await Promise.all([resolveKujo(input.config, directory), resolveComponent("fence"), discoverFenceInventory(input.cwd)]);
    const before = join(directory, "before"); await mkdir(before, { mode: 0o700 });
    const source = await copyFenceSnapshot({ ...input, directory: before, runtime, catalog });
    const code = join(directory, "code");
    for (const relative of component.files) {
      await mkdir(dirname(join(code, relative)), { recursive: true, mode: 0o700 });
      await cp(join(component.root, relative), join(code, relative));
    }
    const entrypoint = join(code, "inspect-snapshot.kujo"), manifest = join(directory, "inventory.json");
    await writeFile(entrypoint, FENCE_BRIDGE, { mode: 0o600 });
    await writeFile(manifest, JSON.stringify({ candidates: Object.fromEntries(catalog.candidates.map((path) => [path, true])),
      regular: Object.fromEntries(source.files.filter((file) => file.regular).map((file) => [file.path, true])),
      copied: Object.fromEntries(source.files.filter((file) => file.status === "copied").map((file) => [file.path, true])) }), { mode: 0o600 });
    const result = await executeKujo({ executable: runtime.executable, cwd: source.workspace,
      args: ["run", "--isolated-imports", entrypoint, "--", manifest], timeoutMs: Math.min(input.config.limits.timeoutMs, 10_000),
      maxStdoutBytes: Math.min(input.config.limits.maxStdoutBytes, 2_000_000), maxStderrBytes: Math.min(input.config.limits.maxStderrBytes, 4096) });
    if (result.exitCode !== 0) throw new KujoPluginError("KUJO_RUNTIME_EXEC_FAILED", "Canonical Fence inspection did not complete");
    const checked = fenceBridgeSchema.parse(JSON.parse(result.stdout));
    const byPath = new Map(source.files.map((file) => [file.path, file]));
    if (new Set(checked.selected).size !== checked.selected.length || checked.selected.some((path) => !catalog.candidates.includes(path))) {
      throw new KujoPluginError("KUJO_COMPONENT_SCHEMA_INVALID", "Fence selected a source outside the snapshot");
    }
    const omitted = checked.selected.filter((path) => byPath.get(path)?.status !== "copied").map((path) => ({ path, reason: byPath.get(path)?.status ?? "sensitive" }));
    const report = checked.report;
    if ((checked.phase === "analyzed") !== (report !== null) || (report && (report.summary.files_scanned !== checked.selected.length - omitted.length
      || report.summary.violations !== report.violations.length || report.summary.skipped_files !== report.skipped_files.length || report.summary.ignored_violations !== report.ignored_violations.length))) {
      throw new KujoPluginError("KUJO_COMPONENT_SCHEMA_INVALID", "Fence report contradicts its coverage or diagnostics");
    }
    const incomplete = catalog.truncated || catalog.rejected > 0 || omitted.length > 0 || (report?.skipped_files.length ?? 0) > 0;
    // An omitted root configuration is blocked, not an invitation to use the
    // JSON fallback or claim the project has no policy.
    const configured = catalog.candidates.filter((path) => path === "fence.toml" || path === "fence.json");
    const missingConfig = configured.some((path) => byPath.get(path)?.status !== "copied");
    const status: FenceReport["status"] = missingConfig || checked.phase === "blocked" ? "blocked"
      : checked.phase === "not-configured" || checked.phase === "empty" ? incomplete ? "partial" : "not-run"
      : incomplete ? "partial" : report!.status;
    const message = missingConfig ? "A Fence configuration file could not be admitted safely; no configuration fallback is accepted." : checked.message;
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
    const publicFields = redact({ message, diagnostics: checked.diagnostics, report: missingConfig ? null : report, omitted }) as { message: string; diagnostics: typeof checked.diagnostics; report: typeof report; omitted: typeof omitted };
    let stale = true;
    try {
      const after = join(directory, "after"); await mkdir(after, { mode: 0o700 });
      const refreshed = await copyFenceSnapshot({ ...input, directory: after, runtime, catalog: await discoverFenceInventory(input.cwd) });
      stale = source.digest !== refreshed.digest || !(await isSnapshotCurrent(input.cwd, snapshot));
    } catch { /* A failed freshness read can never confirm that evidence is current. */ }
    return fenceReportSchema.parse({ schemaVersion: 1, id: `fence_${randomUUID()}`, generatedAt: new Date().toISOString(), projectId: input.projectId, workspaceId: input.workspaceId,
      status, message: publicFields.message, threshold: missingConfig ? null : checked.threshold || null, thresholdStatus: missingConfig ? null : report?.status ?? null,
      diagnostics: publicFields.diagnostics, report: publicFields.report,
      coverage: { gitVisible: catalog.visible, admittedNames: catalog.candidates.length, selected: checked.selected.length, inspected: missingConfig ? 0 : report?.summary.files_scanned ?? 0,
        copiedBytes: source.copiedBytes, truncated: catalog.truncated, rejectedNames: catalog.rejected, excludedSensitive: catalog.excludedSensitive, omitted: publicFields.omitted },
      inputDigest: source.digest, runtimeVersion: runtime.runtimeVersion, provenance: { component: "fence", version: component.version, commit: component.gitCommit },
      snapshot, stale, redactedCount, scope: FENCE_SCOPE });
  } finally { await removeTree(directory); }
}
