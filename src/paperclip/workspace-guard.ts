import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { PluginConfig } from "../config/schema.js";
import { workspaceTextPathSchema } from "../features/language/source.js";
import { KujoPluginError } from "../runtime/errors.js";
import { executeKujo, safeChildEnv } from "../runtime/execute-kujo.js";
import { removeTree } from "../runtime/files.js";
import { resolveKujo } from "../runtime/resolve-kujo.js";

const execFileAsync = promisify(execFile);
const MAX_FILES = 100_000;
const MAX_FILE_BYTES = 25_000_000;
const MAX_CONTEXT_CANDIDATES = 4;
const CONTEXT_COPY_BYTES = 100_000;

async function gitVisiblePaths(cwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    encoding: "buffer",
    env: safeChildEnv(),
    maxBuffer: 20_000_000,
    timeout: 10_000,
    windowsHide: true,
  });
  return stdout.toString("utf8").split("\0").filter(Boolean).sort();
}

export async function assertBoundedWorkspaceInputs(cwd: string): Promise<string[]> {
  const paths = await gitVisiblePaths(cwd);
  if (paths.length > MAX_FILES) {
    throw new KujoPluginError("KUJO_OUTPUT_LIMIT", `Workspace has more than ${MAX_FILES} Git-visible files`);
  }
  for (let offset = 0; offset < paths.length; offset += 128) {
    await Promise.all(paths.slice(offset, offset + 128).map(async (relative) => {
      const info = await lstat(join(cwd, relative)).catch(() => null);
      if (info?.isFile() && info.size > MAX_FILE_BYTES) {
        throw new KujoPluginError("KUJO_OUTPUT_LIMIT", "Workspace file exceeds the safe component input limit", {
          path: relative,
          sizeBytes: info.size,
          maxBytes: MAX_FILE_BYTES,
        });
      }
    }));
  }
  return paths;
}

// The helper receives a worker-owned manifest. Native rooted reads pin the
// workspace and reject symlinks and nonregular files at every component.
const COPY_PREFIXES = String.raw`params := args()
manifest := parse_json(read_file(params[0]))
mut files = []
mut index = 0
while index < len(manifest["paths"]) {
    let path = manifest["paths"][index]
    try {
        mut bytes = null
        if manifest["prefix"] {
            bytes = read_binary_prefix_beneath(manifest["root"], path, manifest["cap"])
        } else {
            bytes = read_binary_file_beneath(manifest["root"], path, manifest["cap"])
        }
        write_binary_file(manifest["destination"] + "/" + path, bytes)
        files = push(files, path)
    } except error { }
    index = index + 1
}
print(to_json(files))
`;

function rankContextCandidates(paths: string[], task: string): string[] {
  const terms = task.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 3);
  const ranked: { path: string; score: number }[] = [];
  let previous = "";
  for (const path of paths) {
    if (path === previous) continue;
    previous = path;
    const lower = path.toLowerCase();
    let score = terms.reduce((total, term) => total + (lower.includes(term) ? 100 : 0), 0);
    if (/^(agents|readme|contributing)\.md$/i.test(path)) score += 60;
    if (lower.startsWith("src/")) score += 30;
    if (lower.startsWith("tests/")) score += 25;
    if (lower.startsWith("docs/")) score += 20;
    if (/^(package\.json|tsconfig\.json|vitest\.config\.)/i.test(path)) score += 15;
    const index = ranked.findIndex((entry) => score > entry.score || (score === entry.score && path.localeCompare(entry.path) < 0));
    if (index < 0 && ranked.length >= MAX_CONTEXT_CANDIDATES) continue;
    if (!workspaceTextPathSchema.safeParse(path).success || path.split("/").includes(".git")) continue;
    if (index >= 0) ranked.splice(index, 0, { path, score });
    else ranked.push({ path, score });
    if (ranked.length > MAX_CONTEXT_CANDIDATES) ranked.pop();
  }
  return ranked.map((entry) => entry.path);
}

export async function copyContextFiles(input: { cwd: string; paths: string[]; config: PluginConfig; cap: number; prefix: boolean }): Promise<{
  path: string; selectedPaths: string[]; cleanup: () => Promise<void>;
}> {
  const root = await realpath(resolve(input.cwd));
  const paths = [...new Set(input.paths.filter((path) => workspaceTextPathSchema.safeParse(path).success && !path.split("/").includes(".git")))];
  const temporaryRoot = await mkdtemp(join(tmpdir(), "kujo-paperclip-workspace-"));
  const mirror = join(temporaryRoot, "workspace");
  try {
    await mkdir(mirror, { mode: 0o700 });
    let selectedPaths: string[] = [];
    if (paths.length > 0) {
      for (const path of paths) await mkdir(dirname(join(mirror, path)), { recursive: true, mode: 0o700 });
      const helper = join(temporaryRoot, "copy-context.kujo");
      const manifest = join(temporaryRoot, "context.json");
      await writeFile(helper, COPY_PREFIXES, { mode: 0o600 });
      await writeFile(manifest, JSON.stringify({ root, destination: mirror, paths, cap: input.cap, prefix: input.prefix }), { mode: 0o600 });
      const runtime = await resolveKujo(input.config, temporaryRoot);
      const result = await executeKujo({ executable: runtime.executable, cwd: temporaryRoot,
        args: ["run", "--isolated-imports", helper, "--", manifest], timeoutMs: Math.min(input.config.limits.timeoutMs, 5000),
        maxStdoutBytes: Math.min(input.config.limits.maxStdoutBytes, 16_384), maxStderrBytes: Math.min(input.config.limits.maxStderrBytes, 4096) });
      if (result.exitCode !== 0) throw new KujoPluginError("KUJO_RUNTIME_EXEC_FAILED", "Bounded context workspace could not be prepared");
      let copied: unknown;
      try { copied = JSON.parse(result.stdout); }
      catch { throw new KujoPluginError("KUJO_COMPONENT_SCHEMA_INVALID", "Context inventory is not valid JSON"); }
      if (!Array.isArray(copied) || copied.length > paths.length || !copied.every((path) => typeof path === "string" && paths.includes(path)) || new Set(copied).size !== copied.length) {
        throw new KujoPluginError("KUJO_COMPONENT_SCHEMA_INVALID", "Context inventory does not match its admitted paths");
      }
      selectedPaths = paths.filter((path) => copied.includes(path));
    }
    return { path: mirror, selectedPaths, cleanup: async () => await removeTree(temporaryRoot) };
  } catch (error) {
    await removeTree(temporaryRoot);
    throw error;
  }
}

export async function prepareContextWorkspace(cwd: string, task: string, config: PluginConfig, visiblePaths?: string[]): Promise<{
  path: string; selectedPaths: string[]; cleanup: () => Promise<void>;
}> {
  const paths = rankContextCandidates(visiblePaths ?? await gitVisiblePaths(cwd), task);
  const workspace = await copyContextFiles({ cwd, paths, config, cap: CONTEXT_COPY_BYTES, prefix: true });
  try {
    await execFileAsync("git", ["init", "--quiet", workspace.path], {
      encoding: "utf8",
      env: safeChildEnv(),
      maxBuffer: 100_000,
      timeout: 10_000,
      windowsHide: true,
    });
    return workspace;
  } catch (error) {
    await workspace.cleanup();
    throw error;
  }
}
