import { execFile } from "node:child_process";
import { link, lstat, mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { KujoPluginError } from "../runtime/errors.js";
import { safeChildEnv } from "../runtime/execute-kujo.js";
import { isPathInside } from "../runtime/path.js";

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

export async function assertBoundedWorkspaceInputs(cwd: string): Promise<void> {
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
}

export async function prepareContextWorkspace(cwd: string, task: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const root = resolve(cwd);
  const terms = task.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 3);
  const paths = (await gitVisiblePaths(root)).sort((left, right) => {
    const score = (path: string) => {
      const lower = path.toLowerCase();
      let value = terms.reduce((total, term) => total + (lower.includes(term) ? 100 : 0), 0);
      if (/^(agents|readme|contributing)\.md$/i.test(path)) value += 60;
      if (lower.startsWith("src/")) value += 30;
      if (lower.startsWith("tests/")) value += 25;
      if (lower.startsWith("docs/")) value += 20;
      if (/^(package\.json|tsconfig\.json|vitest\.config\.)/i.test(path)) value += 15;
      return value;
    };
    return score(right) - score(left) || left.localeCompare(right);
  }).slice(0, MAX_CONTEXT_CANDIDATES);
  const mirror = await mkdtemp(join(tmpdir(), "kujo-paperclip-workspace-"));
  try {
    for (const relative of paths) {
      const source = resolve(root, relative);
      if (!isPathInside(root, source)) continue;
      const info = await lstat(source).catch(() => null);
      if (!info?.isFile() || info.size > MAX_FILE_BYTES) continue;
      const destination = resolve(mirror, relative);
      if (!isPathInside(mirror, destination)) continue;
      await mkdir(dirname(destination), { recursive: true });
      try {
        await link(source, destination);
      } catch {
        const handle = await open(source, "r");
        try {
          const buffer = Buffer.alloc(Math.min(info.size, CONTEXT_COPY_BYTES));
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          await writeFile(destination, buffer.subarray(0, bytesRead));
        } finally {
          await handle.close();
        }
      }
    }
    await execFileAsync("git", ["init", "--quiet", mirror], {
      encoding: "utf8",
      env: safeChildEnv(),
      maxBuffer: 100_000,
      timeout: 10_000,
      windowsHide: true,
    });
    return { path: mirror, cleanup: async () => await rm(mirror, { recursive: true, force: true }) };
  } catch (error) {
    await rm(mirror, { recursive: true, force: true });
    throw error;
  }
}
