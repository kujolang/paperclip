import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { PluginConfig } from "../../config/schema.js";
import { resolveComponent } from "../../components/registry.js";
import { executeKujo } from "../../runtime/execute-kujo.js";
import { resolveKujo } from "../../runtime/resolve-kujo.js";
import { removeTree } from "../../runtime/files.js";
import { captureWorkspaceSnapshot, isSnapshotCurrent } from "../../paperclip/git.js";
import { redactText } from "../failure/redact.js";
import { discoverWorkspaceText, readWorkspaceText, workspaceTextPathSchema } from "../language/source.js";
import { languageReportSchema } from "../language/schema.js";
import { PACKAGE_BRIDGE } from "./bridge.js";
export const PACKAGE_SCOPE = "Canonical Kennel manifest validation and lockfile parsing only. Dependencies, installed bytes, digests and source availability are not verified. No resolution, install, network access or project code execution.";
export const packagePathSchema = workspaceTextPathSchema.refine(path => path === "kennel.toml" || path.endsWith("/kennel.toml"), "Choose a kennel.toml manifest");
export const packageInputSchema = z.object({ path: packagePathSchema.default("kennel.toml") }).strict();
const text = z.string().max(65536);
const bridgeSchema = z.object({
  manifest: z.object({ name: text, version: text, entry: text }).nullable(),
  validation: z.object({ ok: z.boolean(), errors: z.array(text).max(5000), warnings: z.array(text).max(5000) }),
  dependencies: z.array(z.object({ name: text, valid: z.boolean(), kind: text, requested: text, source: text, diagnostic: text })).max(200),
  dependencyCount: z.number().int().nonnegative(),
  lock: z.object({ status: z.enum(["not-read", "missing", "parsed", "invalid-shape", "unsupported-version", "invalid-toml"]), version: text,
    entries: z.array(z.object({ name: text, source: text, resolvedRef: text, resolvedCommit: text, version: text })).max(200), count: z.number().int().nonnegative() }),
});
export const packageReportSchema = bridgeSchema.extend({
  schemaVersion: z.literal(1), id: z.string(), generatedAt: z.string(), projectId: z.string(), workspaceId: z.string(), path: packagePathSchema,
  status: z.enum(["passed", "warnings", "failed"]), sourceDigest: z.string(), lockDigest: z.string().nullable(), lockAdmission: z.enum(["copied", "not-git-visible", "unreadable"]),
  truncated: z.boolean(), stale: z.boolean(), snapshot: languageReportSchema.shape.snapshot, redactedCount: z.number().int().nonnegative(),
  runtimeVersion: z.string(), provenance: z.object({ component: z.literal("kennel"), version: z.string(), commit: z.string() }), scope: z.literal(PACKAGE_SCOPE),
});
export type PackageReport = z.infer<typeof packageReportSchema>;
export const discoverPackages = (cwd: string) => discoverWorkspaceText(cwd, path => packagePathSchema.safeParse(path).success);
export async function inspectPackages(input: { cwd: string; path: string; projectId: string; workspaceId: string; config: PluginConfig }): Promise<PackageReport> {
  if (!input.config.features.language) throw new Error("Language tooling is disabled");
  const path = packagePathSchema.parse(input.path);
  if (!(await discoverPackages(input.cwd)).files.includes(path)) throw new Error("Manifest is not in the bounded Git-visible package catalog");
  const lockPath = path.slice(0, -"kennel.toml".length) + "kennel.lock";
  const directory = await mkdtemp(join(tmpdir(), "kujo-paperclip-packages-"));
  try {
    const [runtime, component, snapshot] = await Promise.all([resolveKujo(input.config, directory), resolveComponent("kennel"), captureWorkspaceSnapshot(input.cwd)]);
    const read = (relative: string) => readWorkspaceText({ ...input, path: relative, directory, runtime });
    const source = await read(path);
    const visible = async () => (await discoverWorkspaceText(input.cwd, candidate => candidate === lockPath)).files.includes(lockPath);
    const lockVisible = await visible();
    const lock = lockVisible ? await read(lockPath).catch(() => null) : null;
    const workspace = join(directory, "workspace"), code = join(directory, "code");
    await mkdir(workspace, { mode: 0o700 });
    await writeFile(join(workspace, "kennel.toml"), source.source, { mode: 0o600 });
    if (lock) await writeFile(join(workspace, "kennel.lock"), lock.source, { mode: 0o600 });
    for (const relative of component.files) {
      const bytes = await readFile(join(component.root, relative));
      if (createHash("sha256").update(bytes).digest("hex") !== component.checksums[relative]) throw new Error("Kennel component changed during staging");
      await mkdir(dirname(join(code, relative)), { recursive: true, mode: 0o700 });
      await writeFile(join(code, relative), bytes, { mode: 0o600 });
    }
    const entry = join(code, "inspect-package.kujo"); await writeFile(entry, PACKAGE_BRIDGE, { mode: 0o600 });
    const output = await executeKujo({ executable: runtime.executable, cwd: workspace, args: ["run", "--isolated-imports", entry, "--interpreter"],
      timeoutMs: Math.min(input.config.limits.timeoutMs, 5000), maxStdoutBytes: Math.min(input.config.limits.maxStdoutBytes, 500000), maxStderrBytes: Math.min(input.config.limits.maxStderrBytes, 4096) });
    if (output.exitCode !== 0) throw new Error("Canonical Kennel inspection could not complete; check manifest shape and runtime limits");
    let redactedCount = 0;
    const clean = (value: unknown): unknown => {
      if (typeof value === "string") {
        const urls = value.replace(/:\/\/[^\s/@]+@/g, () => { redactedCount++; return "://[REDACTED]@"; });
        const redacted = redactText(urls); redactedCount += redacted.count; return redacted.text;
      }
      if (Array.isArray(value)) return value.map(clean);
      return value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clean(entry)])) : value;
    };
    const report = bridgeSchema.parse(clean(JSON.parse(output.stdout)));
    const truncated = report.dependencyCount > report.dependencies.length || report.lock.count > report.lock.entries.length;
    const lockAdmission = lock ? "copied" : lockVisible ? "unreadable" : "not-git-visible";
    const failed = !report.validation.ok || ["invalid-shape", "invalid-toml", "unsupported-version"].includes(report.lock.status);
    const warnings = report.validation.warnings.length > 0 || truncated || lockAdmission === "unreadable" || (report.dependencyCount > 0 && report.lock.status !== "parsed");
    const currentVisible = await visible();
    const currentSource = await read(path).catch(() => null), currentLock = currentVisible ? await read(lockPath).catch(() => null) : null;
    return packageReportSchema.parse({ ...report, schemaVersion: 1, id: `packages_${randomUUID()}`, generatedAt: new Date().toISOString(),
      projectId: input.projectId, workspaceId: input.workspaceId, path, status: failed ? "failed" : warnings ? "warnings" : "passed", sourceDigest: source.digest,
      lockDigest: lock?.digest ?? null, lockAdmission, truncated, stale: currentSource?.digest !== source.digest || (lock?.digest ?? null) !== (currentLock?.digest ?? null) || lockVisible !== currentVisible || !(await isSnapshotCurrent(input.cwd, snapshot)), snapshot, redactedCount,
      runtimeVersion: runtime.runtimeVersion, provenance: { component: "kennel", version: component.version, commit: component.gitCommit }, scope: PACKAGE_SCOPE });
  } finally { await removeTree(directory); }
}
