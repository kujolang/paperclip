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
import { SHIPCHECK_BRIDGE } from "./bridge.js";
import { SHIPCHECK_SCOPE, shipcheckNativeSchema, shipcheckReportSchema, type ShipcheckReport } from "./schema.js";

// This controls admission order, not ShipCheck's artifact selection semantics.
const priority = (path: string) => !path.includes("/") ? 0 : /^(?:docs|tests|test|spec|__tests__|examples|demo|\.github|\.circleci)\//.test(path) ? 1 : 2;
export const discoverShipcheckInventory = (cwd: string) => discoverWorkspaceInventory(cwd, priority);

export async function inspectShipcheck(input: { cwd: string; projectId: string; workspaceId: string; config: PluginConfig }): Promise<ShipcheckReport> {
  if (!input.config.features.verification) throw new Error("Verification is disabled by configuration or profile");
  const snapshot = await captureWorkspaceSnapshot(input.cwd);
  const directory = await mkdtemp(join(tmpdir(), "kujo-paperclip-shipcheck-"));
  try {
    const [runtime, component, catalog] = await Promise.all([resolveKujo(input.config, directory), resolveComponent("shipcheck"), discoverShipcheckInventory(input.cwd)]);
    const before = join(directory, "before"); await mkdir(before, { mode: 0o700 });
    const source = await copyWorkspaceSnapshot({ ...input, directory: before, runtime, catalog });
    const code = join(directory, "code");
    for (const relative of component.files) {
      await mkdir(dirname(join(code, relative)), { recursive: true, mode: 0o700 });
      await cp(join(component.root, relative), join(code, relative));
    }
    const entrypoint = join(code, "inspect-snapshot.kujo");
    await writeFile(entrypoint, SHIPCHECK_BRIDGE, { mode: 0o600 });
    const manifest = join(directory, "host-workspace.json");
    await writeFile(manifest, JSON.stringify({ workspace: input.cwd }), { mode: 0o600 });
    const result = await executeKujo({ executable: runtime.executable, cwd: source.workspace,
      args: ["run", "--isolated-imports", entrypoint, "--", manifest], timeoutMs: Math.min(input.config.limits.timeoutMs, 10_000),
      maxStdoutBytes: Math.min(input.config.limits.maxStdoutBytes, 2_000_000), maxStderrBytes: Math.min(input.config.limits.maxStderrBytes, 4096) });
    if (result.exitCode !== 0) throw new KujoPluginError("KUJO_RUNTIME_EXEC_FAILED", "Canonical ShipCheck inspection did not complete");
    const report = shipcheckNativeSchema.parse(JSON.parse(result.stdout));
    const passed = report.checks.filter((check) => check.passed === 1).length;
    const errors = report.checks.filter((check) => check.passed === 0 && check.severity === "error").length;
    const warnings = report.checks.filter((check) => check.passed === 0 && check.severity === "warning").length;
    if (new Set(report.checks.map((check) => check.name)).size !== 16 || report.summary.passed !== passed || report.summary.failed_errors !== errors || report.summary.warnings !== warnings
      || passed + errors + warnings !== 16 || report.summary.gate_passed !== (errors === 0 ? 1 : 0)) {
      throw new KujoPluginError("KUJO_COMPONENT_SCHEMA_INVALID", "ShipCheck report contradicts its checks or metadata gate");
    }
    const byPath = new Map(source.files.map((file) => [file.path, file]));
    const omitted = catalog.candidates.filter((path) => byPath.get(path)?.status !== "copied").map((path) => ({ path, reason: byPath.get(path)?.status ?? "sensitive" }));
    const incomplete = catalog.truncated || catalog.rejected > 0 || omitted.length > 0;
    const status: ShipcheckReport["status"] = incomplete ? "partial" : errors > 0 ? "failed" : warnings > 0 ? "warnings" : "passed";
    const message = incomplete ? "Coverage is incomplete; review omissions before relying on the metadata gate." : "";
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
    const fields = redact({ message, report, omitted }) as { message: string; report: typeof report; omitted: typeof omitted };
    let stale = true;
    try {
      const after = join(directory, "after"); await mkdir(after, { mode: 0o700 });
      const refreshed = await copyWorkspaceSnapshot({ ...input, directory: after, runtime, catalog: await discoverShipcheckInventory(input.cwd) });
      stale = source.digest !== refreshed.digest || !(await isSnapshotCurrent(input.cwd, snapshot));
    } catch { /* Failure to reread cannot confirm freshness. */ }
    return shipcheckReportSchema.parse({ schemaVersion: 1, id: `shipcheck_${randomUUID()}`, generatedAt: new Date().toISOString(), projectId: input.projectId, workspaceId: input.workspaceId,
      status, message: fields.message, report: fields.report,
      coverage: { gitVisible: catalog.visible, admittedNames: catalog.candidates.length, copied: source.files.filter((file) => file.status === "copied").length,
        copiedBytes: source.copiedBytes, truncated: catalog.truncated, rejectedNames: catalog.rejected, excludedSensitive: catalog.excludedSensitive, omitted: fields.omitted },
      inputDigest: source.digest, runtimeVersion: runtime.runtimeVersion, provenance: { component: "shipcheck", version: component.version, commit: component.gitCommit },
      snapshot, stale, redactedCount, scope: SHIPCHECK_SCOPE });
  } finally { await removeTree(directory); }
}
