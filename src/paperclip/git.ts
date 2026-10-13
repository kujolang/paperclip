import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { KujoPluginError } from "../runtime/errors.js";
import { safeChildEnv } from "../runtime/execute-kujo.js";

const execFileAsync = promisify(execFile);

export type WorkspaceSnapshot = {
  gitRoot: string;
  branch: string;
  head: string;
  dirty: boolean;
  fingerprint: string;
};

export function validateGitRef(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/@{}~^:+-]{0,254}$/.test(value) || value.includes("..") || value.startsWith("-")) {
    throw new KujoPluginError("KUJO_INVALID_CONFIG", "Invalid git ref", { value });
  }
  return value;
}

async function git(cwd: string, args: string[], trim = true): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      maxBuffer: 2_000_000,
      timeout: 10_000,
      windowsHide: true,
      env: safeChildEnv(),
    });
    return trim ? stdout.trim() : stdout;
  } catch (error) {
    throw new KujoPluginError("KUJO_RUNTIME_EXEC_FAILED", "Git workspace inspection failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function captureWorkspaceSnapshot(cwd: string): Promise<WorkspaceSnapshot> {
  const [gitRoot, branch, head, status] = await Promise.all([
    git(cwd, ["rev-parse", "--show-toplevel"]),
    git(cwd, ["branch", "--show-current"]),
    git(cwd, ["rev-parse", "HEAD"]).catch(() => "unborn"),
    git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], false),
  ]);
  // Porcelain status alone is unchanged when an already-dirty file is edited
  // again. Include high-resolution metadata for each status path. This observes
  // workspace changes without reading source content or following symlinks.
  const records = status.split("\0");
  const paths: string[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    paths.push(record.slice(3));
    if (/^[RC]|^.[RC]/.test(record)) { index += 1; if (records[index]) paths.push(records[index]!); }
  }
  const digest = createHash("sha256").update(`${head}\0${status}`);
  for (let offset = 0; offset < paths.length; offset += 128) {
    const metadata = await Promise.all(paths.slice(offset, offset + 128).map(async (path) => {
      const info = await lstat(join(cwd, path), { bigint: true }).catch(() => null);
      return `${path}\0${info ? `${info.size}:${info.mtimeNs}:${info.ctimeNs}:${info.ino}` : "missing"}`;
    }));
    for (const value of metadata) digest.update(value).update("\0");
  }
  return {
    gitRoot,
    branch: branch || "detached",
    head,
    dirty: status.length > 0,
    fingerprint: digest.digest("hex"),
  };
}

export async function isSnapshotCurrent(cwd: string, expected: WorkspaceSnapshot): Promise<boolean> {
  const current = await captureWorkspaceSnapshot(cwd);
  return current.head === expected.head && current.fingerprint === expected.fingerprint;
}
