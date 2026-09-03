import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { safeChildEnv } from "../../runtime/execute-kujo.js";

const execFileAsync = promisify(execFile);

type FileChange = { path: string; status: string; additions: number; deletions: number; binary: boolean };

function category(path: string): string | undefined {
  const lower = path.toLowerCase();
  if (/(^|\/)(package\.json|cargo\.toml|pyproject\.toml|go\.mod)$/.test(lower)) return "dependency_manifests";
  if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|cargo\.lock|go\.sum)$/.test(lower)) return "lockfiles";
  if (/(^|\/)(dist|build|generated)(\/|$)/.test(lower)) return "generated";
  if (/(^|\/)\.github\/workflows\//.test(lower)) return "ci";
  return undefined;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: safeChildEnv(),
    maxBuffer: 20_000_000,
    timeout: 10_000,
    windowsHide: true,
  });
  return stdout;
}

export async function analyzeWithGit(input: {
  cwd: string;
  mode?: "working_tree" | "range";
  base: string;
  head?: string;
}) {
  const spec = input.mode === "range" && input.head ? `${input.base}..${input.head}` : input.base;
  const [numstat, statuses, untracked] = await Promise.all([
    git(input.cwd, ["diff", "--numstat", "--no-renames", "-z", spec]),
    git(input.cwd, ["diff", "--name-status", "--no-renames", "-z", spec]),
    input.mode === "range" ? Promise.resolve("") : git(input.cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const statusParts = statuses.split("\0").filter(Boolean);
  const statusByPath = new Map<string, string>();
  for (let index = 0; index + 1 < statusParts.length; index += 2) statusByPath.set(statusParts[index + 1]!, statusParts[index]!);

  const files: FileChange[] = [];
  for (const entry of numstat.split("\0").filter(Boolean)) {
    const [added = "0", deleted = "0", path = ""] = entry.split("\t");
    if (!path) continue;
    files.push({
      path,
      status: statusByPath.get(path) ?? "M",
      additions: added === "-" ? 0 : Number.parseInt(added, 10) || 0,
      deletions: deleted === "-" ? 0 : Number.parseInt(deleted, 10) || 0,
      binary: added === "-" || deleted === "-",
    });
  }
  for (const path of untracked.split("\0").filter(Boolean)) {
    const content = await readFile(join(input.cwd, path), "utf8").catch(() => "");
    files.push({ path, status: "A", additions: content ? content.split(/\r?\n/).length - 1 : 0, deletions: 0, binary: false });
  }
  const categories: Record<string, string[]> = {};
  for (const file of files) {
    const name = category(file.path);
    if (name) (categories[name] ??= []).push(file.path);
  }
  const additions = files.reduce((total, file) => total + file.additions, 0);
  const deletions = files.reduce((total, file) => total + file.deletions, 0);
  const churn = additions + deletions;
  return {
    base: input.base,
    head: input.mode === "range" ? input.head : "working tree",
    summary: {
      files_changed: files.length,
      files_deleted: files.filter((file) => file.status === "D").length,
      lines_added: additions,
      lines_deleted: deletions,
      total_churn: churn,
      risk_level: files.length > 50 || churn > 2_000 ? "high" : files.length > 15 || churn > 500 ? "medium" : "low",
    },
    categories,
    files,
  };
}
