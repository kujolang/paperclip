import { randomUUID } from "node:crypto";
import type { PluginConfig } from "../../config/schema.js";
import { PLUGIN_VERSION } from "../../config/defaults.js";
import { runComponent } from "../../components/execute-component.js";
import { captureWorkspaceSnapshot, isSnapshotCurrent, validateGitRef } from "../../paperclip/git.js";
import { assertBoundedWorkspaceInputs } from "../../paperclip/workspace-guard.js";
import type { ReviewPack } from "./schema.js";
import { reviewPackSchema } from "./schema.js";

type ChangeBucketOutput = {
  base?: string;
  head?: string;
  summary?: Record<string, unknown>;
  categories?: Record<string, string[]>;
  files?: unknown[];
};

export type GenerateReviewInput = {
  cwd: string;
  workspaceId: string;
  projectId: string;
  issueId?: string;
  runId?: string;
  mode?: "working_tree" | "range";
  base?: string;
  head?: string;
  config: PluginConfig;
};

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function signals(categories: Record<string, string[]>, summary: Record<string, unknown>) {
  const result: Array<{ id: string; severity: "attention"; message: string }> = [];
  const values = [
    ["dependency-manifest", "dependency_manifests", "Dependency manifest changed"],
    ["lockfile", "lockfiles", "Lockfile changed"],
    ["generated", "generated", "Generated files changed"],
    ["ci", "ci", "CI configuration changed"],
  ] as const;
  result.push(...values
    .filter(([, category]) => (categories[category]?.length ?? 0) > 0)
    .map(([id, , message]) => ({ id, severity: "attention" as const, message })));
  if (number(summary.files_deleted) > 0) result.push({ id: "deletions", severity: "attention", message: "Files were deleted" });
  return result;
}

function testSuggestions(output: string): Array<{ command: string; reason?: string }> {
  return output.split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter((line) => line.length > 0 && !line.endsWith(":"))
    .slice(0, 25)
    .map((command) => ({ command }));
}

export async function generateReviewPack(input: GenerateReviewInput): Promise<ReviewPack> {
  await assertBoundedWorkspaceInputs(input.cwd);
  const before = await captureWorkspaceSnapshot(input.cwd);
  const base = input.base ? validateGitRef(input.base) : "HEAD";
  const head = input.head ? validateGitRef(input.head) : undefined;
  const changeArgs = ["--json"];
  if (process.platform === "win32") {
    // The bundled ChangeBucket release does not resolve `.` correctly on
    // Windows, but accepts an explicit forward-slash repository path.
    changeArgs.push("--repo", input.cwd.replaceAll("\\", "/"));
  }
  if (input.mode === "range") {
    changeArgs.push("--base", base);
    if (head) changeArgs.push("--head", head);
  }

  const [footprintResult, summaryResult, testsResult, handoffResult] = await Promise.allSettled([
    runComponent<ChangeBucketOutput>({ component: "changebucket", cwd: input.cwd, args: changeArgs, config: input.config }),
    runComponent<Record<string, unknown>>({ component: "patchbrief", cwd: input.cwd, args: ["summarize", "--format", "json", "--pretty"], config: input.config }),
    runComponent({ component: "patchbrief", cwd: input.cwd, args: ["suggest-tests"], config: input.config }),
    runComponent<Record<string, unknown>>({ component: "patchbrief", cwd: input.cwd, args: ["handoff", "--format", "json", "--pretty"], config: input.config }),
  ]);

  if (footprintResult.status === "rejected") throw footprintResult.reason;
  const footprint = footprintResult.value.parsed;
  if (!footprint) throw new Error("ChangeBucket returned no JSON");
  const summary = footprint.summary ?? {};
  const categories = footprint.categories ?? {};
  const runtimeVersion = footprintResult.value.runtimeVersion;
  const components = [footprintResult, summaryResult, testsResult, handoffResult]
    .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof runComponent>>> => result.status === "fulfilled")
    .map((result) => ({ id: result.value.component, version: result.value.componentVersion, commit: result.value.componentCommit }))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);

  return reviewPackSchema.parse({
    schemaVersion: 1,
    id: `review_${randomUUID()}`,
    generatedAt: new Date().toISOString(),
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    ...(input.issueId ? { issueId: input.issueId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    source: { ...before, base },
    footprint: {
      filesChanged: number(summary.files_changed),
      additions: number(summary.lines_added),
      deletions: number(summary.lines_deleted),
      churn: number(summary.total_churn),
      riskLevel: summary.risk_level === "high" || summary.risk_level === "medium" ? summary.risk_level : "low",
      files: (footprint.files ?? []).slice(0, 1_000),
      categories,
      signals: signals(categories, summary),
    },
    ...(summaryResult.status === "fulfilled" ? { summary: summaryResult.value.parsed } : {}),
    suggestedTests: testsResult.status === "fulfilled" ? testSuggestions(testsResult.value.stdout) : [],
    ...(handoffResult.status === "fulfilled" ? { handoff: handoffResult.value.parsed } : {}),
    componentStatus: {
      footprint: "ok",
      summary: summaryResult.status === "fulfilled" ? "ok" : "failed",
      suggestedTests: testsResult.status === "fulfilled" ? "ok" : "failed",
      handoff: handoffResult.status === "fulfilled" ? "ok" : "failed",
    },
    stale: !(await isSnapshotCurrent(input.cwd, before)),
    provenance: { pluginVersion: PLUGIN_VERSION, kujoRuntimeVersion: runtimeVersion, components },
  });
}
