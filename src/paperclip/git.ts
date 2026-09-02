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

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      maxBuffer: 2_000_000,
      timeout: 10_000,
      windowsHide: true,
      env: safeChildEnv(),
    });
    return stdout.trim();
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
    git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
  ]);
  return {
    gitRoot,
    branch: branch || "detached",
    head,
    dirty: status.length > 0,
    fingerprint: createHash("sha256").update(`${head}\0${status}`).digest("hex"),
  };
}

export async function isSnapshotCurrent(cwd: string, expected: WorkspaceSnapshot): Promise<boolean> {
  const current = await captureWorkspaceSnapshot(cwd);
  return current.head === expected.head && current.fingerprint === expected.fingerprint;
}
