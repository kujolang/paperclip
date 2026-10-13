import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { PluginConfig } from "../../config/schema.js";
import { executeKujo } from "../../runtime/execute-kujo.js";
import { resolveKujo } from "../../runtime/resolve-kujo.js";
import { removeTree } from "../../runtime/files.js";
import { KujoPluginError } from "../../runtime/errors.js";
import { captureWorkspaceSnapshot, isSnapshotCurrent } from "../../paperclip/git.js";
import { redactText } from "../failure/redact.js";
import { discoverSources, readSource, sourcePathSchema } from "./source.js";
import { languageReportSchema, type Diagnostic, type FormatPreview } from "./schema.js";

type Input = { cwd: string; path: string; projectId: string; workspaceId: string; config: PluginConfig };

const lintOutput = z.array(z.object({ rule_id: z.string().max(200), severity: z.enum(["error", "warning"]),
  message: z.string().max(4000), line: z.number().int().positive(), column: z.number().int().positive() })).max(200);

export function parseCheckDiagnostics(stderr: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const line of stderr.split(/\r?\n/)) {
    const header = /^\[([A-Z0-9_]+)\] \[[a-z_-]+\] (error|warning|info): (.*)$/.exec(line);
    if (header) diagnostics.push({ tool: "check", code: header[1]!, severity: header[2] as Diagnostic["severity"], message: redactText(header[3]!).text.slice(0, 4000) });
    else {
      const location = /^\s*--> .*:(\d+):(\d+)\s*$/.exec(line);
      const last = diagnostics.at(-1);
      if (location && last) { last.line = Number(location[1]); last.column = Number(location[2]); }
    }
  }
  if (!diagnostics.length) throw new KujoPluginError("KUJO_COMPONENT_SCHEMA_INVALID", "Kujo check returned an unrecognized diagnostic format");
  return z.array(z.object({ tool: z.literal("check"), code: z.string(), severity: z.enum(["error", "warning", "info"]), message: z.string(),
    line: z.number().int().positive().optional(), column: z.number().int().positive().optional() })).max(200).parse(diagnostics);
}

async function withSource<T>(input: Input, operation: (context: {
  source: string; digest: string; runtimeVersion: string; invoke: (args: string[]) => ReturnType<typeof executeKujo>;
  stale: () => Promise<boolean>; snapshot: Awaited<ReturnType<typeof captureWorkspaceSnapshot>>;
}) => Promise<T>): Promise<T> {
  if (!input.config.features.language) throw new Error("Kujo language tools are disabled by configuration");
  sourcePathSchema.parse(input.path);
  const catalog = await discoverSources(input.cwd);
  if (!catalog.files.includes(input.path)) throw new KujoPluginError("KUJO_WORKSPACE_OUTSIDE_ALLOWED_ROOT", "Source was not found in the bounded Git-visible source catalog");
  const snapshot = await captureWorkspaceSnapshot(input.cwd);
  const directory = await mkdtemp(join(tmpdir(), "kujo-paperclip-language-"));
  try {
    const runtime = await resolveKujo(input.config, directory);
    const read = () => readSource({ ...input, directory, runtime });
    const { source, digest } = await read();
    // Fixed safe filename. Neither compilation nor formatting can open arbitrary
    // caller paths or write source back to the workspace.
    await writeFile(join(directory, "source.kujo"), source, { mode: 0o600 });
    const invoke = (args: string[]) => executeKujo({ executable: runtime.executable, cwd: directory,
      args: [...args, "source.kujo"], timeoutMs: Math.min(input.config.limits.timeoutMs, 5_000),
      maxStdoutBytes: Math.min(input.config.limits.maxStdoutBytes, 512_000), maxStderrBytes: Math.min(input.config.limits.maxStderrBytes, 32_000) });
    const stale = async () => (await read().catch(() => null))?.digest !== digest || !(await isSnapshotCurrent(input.cwd, snapshot));
    return await operation({ source, digest, runtimeVersion: runtime.runtimeVersion, invoke, stale, snapshot });
  } finally { await removeTree(directory); }
}

export async function analyzeSource(input: Input) {
  return await withSource(input, async ({ digest, runtimeVersion, invoke, stale, snapshot }) => {
    const [checked, linted] = await Promise.all([invoke(["check", "--json"]), invoke(["lint", "--json"])]);
    if (![0, 3, 4].includes(checked.exitCode) || ![0, 4].includes(linted.exitCode)) throw new KujoPluginError("KUJO_RUNTIME_EXEC_FAILED", "Kujo language inspection failed before producing valid evidence");
    let diagnostics: Diagnostic[] = [];
    if (checked.exitCode === 0) z.object({ command: z.literal("check"), status: z.literal("ok") }).parse(JSON.parse(checked.stdout));
    else diagnostics = parseCheckDiagnostics(checked.stderr);
    const issues = lintOutput.parse(JSON.parse(linted.stdout));
    const lintFailed = issues.some((item) => item.severity === "error");
    if ((linted.exitCode === 4) !== lintFailed) throw new KujoPluginError("KUJO_COMPONENT_SCHEMA_INVALID", "Lint exit status does not match its diagnostics");
    diagnostics.push(...issues.map((item) => ({ tool: "lint" as const, code: item.rule_id, severity: item.severity,
      message: redactText(item.message).text, line: item.line, column: item.column })));
    return languageReportSchema.parse({ schemaVersion: 1, id: `language_${randomUUID()}`, generatedAt: new Date().toISOString(),
      projectId: input.projectId, workspaceId: input.workspaceId, path: input.path, sourceDigest: digest, runtimeVersion,
      check: checked.exitCode === 0 ? "passed" : "failed", lint: lintFailed ? "failed" : issues.length ? "warnings" : "passed",
      diagnostics, snapshot, stale: await stale(),
      scope: "Single-file lex/parse/compile and lint; project tests, imports and runtime behavior are not verified.",
    });
  });
}

export async function previewFormat(input: Input): Promise<FormatPreview> {
  return await withSource(input, async ({ source, digest, runtimeVersion, invoke, stale }) => {
    const result = await invoke(["format", "--json"]);
    if (result.exitCode !== 0) throw new KujoPluginError("KUJO_RUNTIME_EXEC_FAILED", "Formatting preview failed");
    const output = z.object({ command: z.literal("format"), status: z.literal("preview"), changed: z.boolean(), formatted_source: z.string().max(262144),
      options: z.object({ write: z.literal(false) }) }).parse(JSON.parse(result.stdout));
    const original = redactText(source), formatted = redactText(output.formatted_source);
    return { path: input.path, sourceDigest: digest, runtimeVersion, changed: output.changed,
      source: original.text, formatted: formatted.text, redactedCount: original.count + formatted.count, stale: await stale() };
  });
}
