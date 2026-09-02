import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginConfig } from "../../config/schema.js";
import { CONTEXT_BUDGETS, DEFAULT_LIMITS, PLUGIN_VERSION } from "../../config/defaults.js";
import { runComponent } from "../../components/execute-component.js";
import { captureWorkspaceSnapshot, isSnapshotCurrent } from "../../paperclip/git.js";
import { assertBoundedWorkspaceInputs, prepareContextWorkspace } from "../../paperclip/workspace-guard.js";
import type { ContextPack } from "./schema.js";
import { contextPackSchema } from "./schema.js";
import { removeTree } from "../../runtime/files.js";

export type ContextDepth = keyof typeof CONTEXT_BUDGETS;

type ScentFile = { path?: unknown; reason?: unknown; score?: unknown; estimated_tokens?: unknown };
type ScentContext = {
  estimated_tokens?: unknown;
  selected_files?: ScentFile[];
  excluded?: unknown[];
  truncated?: unknown;
  warnings?: unknown[];
};

const MAX_FILES: Record<ContextDepth, number> = { minimal: 2, focused: 3, broad: 4 };
const EXCLUSIONS = [".git", "node_modules", "vendor", "dist", "build", "target", "coverage", ".venv", "__pycache__", "generated"];

export async function generateContextPack(input: {
  cwd: string;
  workspaceId: string;
  projectId: string;
  task: string;
  depth: ContextDepth;
  config: PluginConfig;
}): Promise<ContextPack> {
  await assertBoundedWorkspaceInputs(input.cwd);
  const task = input.task.trim().slice(0, 10_000);
  if (!task) throw new Error("Task is required");
  const snapshot = await captureWorkspaceSnapshot(input.cwd);
  const budget = CONTEXT_BUDGETS[input.depth];
  const temp = await mkdtemp(join(tmpdir(), "kujo-paperclip-context-"));
  const workspace = await prepareContextWorkspace(input.cwd, task);
  try {
    const args = [
      "pack", "--task", task, "--target", "generic", "--budget", String(budget),
      "--max-files", String(MAX_FILES[input.depth]), "--max-file-bytes", String(DEFAULT_LIMITS.maxContextFileBytes),
      "--out", temp, "--format", "json", "--json",
    ];
    // The bounded mirror contains at most four Git-visible files. Scent's
    // current Windows path validator cannot safely compare relative excludes.
    if (process.platform !== "win32") {
      for (const exclusion of EXCLUSIONS) args.push("--exclude", exclusion);
    }
    const result = await runComponent({ component: "context", cwd: workspace.path, args, config: input.config });
    const output = JSON.parse(await readFile(join(temp, "context.json"), "utf8")) as ScentContext;
    const files = (output.selected_files ?? []).flatMap((file) => {
      if (typeof file.path !== "string") return [];
      return [{
        path: file.path,
        reason: typeof file.reason === "string" ? file.reason : "Selected by canonical context scoring",
        ...(typeof file.score === "number" ? { score: file.score } : {}),
        ...(typeof file.estimated_tokens === "number" ? { estimatedTokens: Math.max(0, Math.trunc(file.estimated_tokens)) } : {}),
      }];
    });
    const estimatedTokens = typeof output.estimated_tokens === "number" ? Math.max(0, Math.trunc(output.estimated_tokens)) : 0;
    const truncated = output.truncated === true || estimatedTokens > budget || files.length >= MAX_FILES[input.depth];
    const cacheKey = createHash("sha256")
      .update(`${input.workspaceId}\0${snapshot.fingerprint}\0${task.toLowerCase()}\0${input.depth}\0${result.componentVersion}`)
      .digest("hex");
    return contextPackSchema.parse({
      schemaVersion: 1,
      id: `context_${randomUUID()}`,
      generatedAt: new Date().toISOString(),
      task,
      depth: input.depth,
      budget,
      estimatedTokens: Math.min(estimatedTokens, budget),
      files,
      ignoredFiles: Array.isArray(output.excluded) ? output.excluded.length : 0,
      truncated,
      ...(truncated ? { truncationReason: "Context budget or file limit reached" } : {}),
      exclusions: EXCLUSIONS,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      snapshot,
      stale: !(await isSnapshotCurrent(input.cwd, snapshot)),
      cacheKey,
      provenance: {
        pluginVersion: PLUGIN_VERSION,
        kujoRuntimeVersion: result.runtimeVersion,
        componentId: result.component,
        componentVersion: result.componentVersion,
        componentCommit: result.componentCommit,
      },
    });
  } finally {
    await Promise.all([removeTree(temp), workspace.cleanup()]);
  }
}
