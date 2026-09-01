import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { PluginConfig } from "../../config/schema.js";
import { DEFAULT_LIMITS, PLUGIN_VERSION } from "../../config/defaults.js";
import { runComponent } from "../../components/execute-component.js";
import { failureEvidenceSchema, type FailureEvidence } from "./schema.js";
import { redactText, truncateMiddle } from "./redact.js";

const execFileAsync = promisify(execFile);

export type CaptureFailureInput = {
  companyId: string;
  projectId: string;
  workspaceId?: string;
  issueId?: string;
  runId?: string;
  title: string;
  command?: string;
  exitCode?: number;
  durationMs?: number;
  log?: string;
  notes?: string;
  config: PluginConfig;
};

export async function captureFailure(input: CaptureFailureInput): Promise<FailureEvidence> {
  const safeTitle = redactText(input.title.slice(0, 200));
  const safeCommand = redactText((input.command ?? "").slice(0, 4_000));
  const safeNotes = redactText((input.notes ?? "").slice(0, 10_000));
  const bounded = truncateMiddle((input.log ?? "").slice(0, DEFAULT_LIMITS.maxInputLogBytes * 2), DEFAULT_LIMITS.maxInputLogBytes);
  const safeLog = redactText(bounded.text);
  const redactedCount = safeTitle.count + safeCommand.count + safeNotes.count + safeLog.count;
  const temp = await mkdtemp(join(tmpdir(), "kujo-paperclip-evidence-"));
  try {
    await execFileAsync("git", ["init", "--quiet", temp]);
    const logPath = join(temp, "failure.log");
    await writeFile(logPath, safeLog.text, { mode: 0o600 });
    const result = await runComponent<Record<string, unknown>>({
      component: "failure-evidence",
      cwd: temp,
      args: ["capture", "--from-log", logPath, "--name", "paperclip-failure", "--output-dir", ".evidence", "--format", "json"],
      config: input.config,
      interpreter: true,
    });
    const cases = await readdir(join(temp, ".evidence"));
    const caseDirectory = cases.sort().at(-1);
    const canonical = caseDirectory
      ? JSON.parse(await readFile(join(temp, ".evidence", caseDirectory, "case.json"), "utf8")) as Record<string, unknown>
      : result.parsed;
    const postCanonical = redactText(JSON.stringify(canonical ?? {}));
    const totalRedactions = redactedCount + postCanonical.count;
    return failureEvidenceSchema.parse({
      schemaVersion: 1,
      id: `failure_${randomUUID()}`,
      capturedAt: new Date().toISOString(),
      context: {
        companyId: input.companyId,
        projectId: input.projectId,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.issueId ? { issueId: input.issueId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
      },
      failure: {
        title: safeTitle.text,
        ...(safeCommand.text ? { command: safeCommand.text } : {}),
        ...(input.exitCode === undefined ? {} : { exitCode: input.exitCode }),
        ...(input.durationMs === undefined ? {} : { durationMs: Math.max(0, Math.trunc(input.durationMs)) }),
        ...(safeNotes.text ? { summary: safeNotes.text } : {}),
      },
      environment: [
        { key: "os", value: process.platform, sensitivity: "public" },
        { key: "architecture", value: process.arch, sensitivity: "public" },
        { key: "node", value: process.version, sensitivity: "public" },
      ],
      ...((safeCommand.text || safeNotes.text) ? { reproduction: {
        ...(safeCommand.text ? { command: safeCommand.text } : {}),
        ...(safeNotes.text ? { notes: safeNotes.text } : {}),
      } } : {}),
      evidence: [{
        kind: "log",
        label: "Bounded failure log",
        content: safeLog.text,
        truncated: bounded.truncated,
        originalBytes: bounded.originalBytes,
        storedBytes: Buffer.byteLength(safeLog.text),
      }],
      redaction: { applied: true, rulesVersion: "paperclip-defense-1+casefile-1.0.0", redactedCount: totalRedactions },
      provenance: {
        pluginVersion: PLUGIN_VERSION,
        kujoRuntimeVersion: result.runtimeVersion,
        componentId: result.component,
        componentVersion: result.componentVersion,
        componentCommit: result.componentCommit,
      },
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
