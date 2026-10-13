import { randomUUID } from "node:crypto";
import { mkdtemp, open, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginConfig } from "../../config/schema.js";
import { PLUGIN_VERSION } from "../../config/defaults.js";
import { runComponent } from "../../components/execute-component.js";
import { captureWorkspaceSnapshot, isSnapshotCurrent } from "../../paperclip/git.js";
import { removeTree } from "../../runtime/files.js";
import { KujoPluginError } from "../../runtime/errors.js";
import { redactText } from "../failure/redact.js";
import { scoutIntelligenceSchema, understandingSchema, type Understanding } from "./schema.js";

export const SCOUT_LIMITS = { maxEntries: 2000, maxCodeFiles: 500, maxAnalyzedBytes: 8_000_000, maxFileBytes: 100_000 } as const;
const EXCLUDED = [".env", ".env.*", "**/.env", "**/.env.*", "*.pem", "**/*.pem", "*.key", "**/*.key", "**/credentials*", "credentials*", "**/secrets*", "secrets*", "**/id_rsa", "**/id_ed25519"];

// Report names are fixed and resolved inside a freshly created private directory.
// Open and read a bounded prefix rather than trusting a reported file size.
async function boundedReport(path: string, limit: number): Promise<string> {
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit) throw new KujoPluginError("KUJO_OUTPUT_LIMIT", "Scout report exceeds the integration output limit");
    const buffer = Buffer.alloc(limit + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit) throw new KujoPluginError("KUJO_OUTPUT_LIMIT", "Scout report exceeds the integration output limit");
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead));
  } finally { await handle.close(); }
}

function relativeSource(value: string): boolean {
  return value.length > 0 && !value.startsWith("/") && !value.startsWith("\\") && !/^[a-z]:/i.test(value)
    && !value.split(/[\\/]/).includes("..");
}

export async function understandRepository(input: {
  cwd: string; projectId: string; workspaceId: string; issueId?: string; config: PluginConfig;
}): Promise<Understanding> {
  if (!input.config.features.understand) throw new Error("Repository understanding is disabled by configuration");
  const snapshot = await captureWorkspaceSnapshot(input.cwd);
  const directory = await mkdtemp(join(tmpdir(), "kujo-paperclip-scout-"));
  try {
    const output = join(directory, "reports");
    // Do not inherit a project's config.json or permit caller-selected output paths.
    await writeFile(join(directory, "config.json"), JSON.stringify({
      scan: { default_max_depth: 6, max_entries: SCOUT_LIMITS.maxEntries,
        max_code_files: SCOUT_LIMITS.maxCodeFiles, max_total_analyzed_bytes: SCOUT_LIMITS.maxAnalyzedBytes,
        max_file_size: SCOUT_LIMITS.maxFileBytes, max_analysis_results: 250, max_ignore_rules: 128,
        exclude: EXCLUDED },
      output: { path_mode: "relative" },
    }), { mode: 0o600 });
    const result = await runComponent({ component: "scout", cwd: directory,
      args: [input.cwd, "--output", output, "--path-mode", "relative", "--output-profile", "full", "--strict"],
      config: input.config, acceptExitCodes: [0, 2],
    });
    const directories = await readdir(output, { withFileTypes: true });
    if (directories.length !== 1 || !directories[0]?.isDirectory() || directories[0].isSymbolicLink()) {
      throw new KujoPluginError("KUJO_COMPONENT_SCHEMA_INVALID", "Scout did not produce one complete report directory");
    }
    const reportRoot = join(output, directories[0].name);
    const raw = await boundedReport(join(reportRoot, "intelligence.json"), 2_000_000);
    const intelligence = scoutIntelligenceSchema.parse(JSON.parse(raw));
    // Root/output paths and source snippets never cross the host bridge. Reject
    // absolute or traversal paths in metadata; preserve route URLs as inert text.
    const sources = [...intelligence.metrics.largest_files.map((item) => item.path),
      ...intelligence.dependencies.map((item) => item.source), ...intelligence.routes.map((item) => item.source),
      ...intelligence.security_findings.map((item) => item.file)];
    if (sources.some((path) => !relativeSource(path))) throw new KujoPluginError("KUJO_COMPONENT_SCHEMA_INVALID", "Scout returned an unsafe source path");
    const clean = (value: string) => redactText(value.split(input.cwd).join("[workspace]").split(directory).join("[private report]")).text;
    // Sanitize field values before serializing: redaction must not corrupt JSON.
    const sanitized = JSON.parse(JSON.stringify(intelligence, (_key, value) => typeof value === "string" ? clean(value) : value));
    const tree = clean(await boundedReport(join(reportRoot, "FILE_TREE.md"), 100_000));
    const partial = result.exitCode === 2 || intelligence.parse_errors.length > 0;
    return understandingSchema.parse({ schemaVersion: 1, id: `understand_${randomUUID()}`, generatedAt: new Date().toISOString(),
      projectId: input.projectId, workspaceId: input.workspaceId, ...(input.issueId ? { issueId: input.issueId } : {}),
      status: partial ? "partial" : "complete", snapshot, stale: !(await isSnapshotCurrent(input.cwd, snapshot)),
      intelligence: sanitized, fileTree: tree, limits: SCOUT_LIMITS,
      warnings: ["Scout reports heuristic repository observations, not a security certification or proof that tests passed.",
        "Scan depth is six; common generated directories and sensitive filename patterns are excluded. Repository Scout ignore/baseline rules also apply.",
        ...(partial ? ["Some files were unreadable, truncated, or outside scan limits. Review scan diagnostics before relying on coverage."] : [])],
      provenance: { pluginVersion: PLUGIN_VERSION, kujoRuntimeVersion: result.runtimeVersion,
        componentVersion: result.componentVersion, componentCommit: result.componentCommit },
    });
  } finally { await removeTree(directory); }
}
