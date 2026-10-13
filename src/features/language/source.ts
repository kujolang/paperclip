import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { PluginConfig } from "../../config/schema.js";
import { executeKujo, safeChildEnv } from "../../runtime/execute-kujo.js";
import { KujoPluginError } from "../../runtime/errors.js";
import type { ResolvedRuntime } from "../../runtime/types.js";

const execFileAsync = promisify(execFile);
export const MAX_SOURCE_BYTES = 65_536;
const sensitive = /(^|\/)(?:\.env(?:\.|$)|credentials?(?:\.|\/|$)|secrets?(?:\.|\/|$)|id_(?:rsa|ed25519)(?:\.|$))/i;
export const sourcePathSchema = z.string().min(1).max(1000).refine((value) =>
  value.endsWith(".kujo") && !value.startsWith("/") && !/[\\:\x00-\x1f\x7f]/.test(value)
  && value.split("/").every((part) => part !== ".." && part !== "." && part !== "") && !sensitive.test(value),
  "Choose a relative, non-sensitive .kujo source path");

export async function discoverSources(cwd: string) {
  const { stdout } = await execFileAsync("git", ["-C", cwd, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8", env: safeChildEnv(), maxBuffer: 2_000_000, timeout: 5_000, windowsHide: true,
  });
  const paths = [...new Set(stdout.split("\0").filter((path) => sourcePathSchema.safeParse(path).success))].sort();
  return { files: paths.slice(0, 1000), truncated: paths.length > 1000 };
}

// The runtime's capability filesystem API opens a regular file beneath the
// canonical workspace. It resists symlink escapes and reads at most limit+1.
// Only this fixed helper executes; source is copied for check/lint/format.
const READER = `params := args()\nbytes := read_binary_prefix_beneath(params[0], params[1], 65537)\nprint(to_json({"base64": encode_base64(bytes)}))\n`;
export async function readSource(input: { cwd: string; path: string; directory: string; runtime: ResolvedRuntime; config: PluginConfig }) {
  sourcePathSchema.parse(input.path);
  const helper = join(input.directory, "read-source.kujo");
  await writeFile(helper, READER, { mode: 0o600 });
  const result = await executeKujo({ executable: input.runtime.executable, cwd: input.directory,
    args: ["run", helper, "--", input.cwd, input.path], timeoutMs: Math.min(input.config.limits.timeoutMs, 5_000),
    maxStdoutBytes: Math.min(input.config.limits.maxStdoutBytes, 100_000), maxStderrBytes: Math.min(input.config.limits.maxStderrBytes, 4_096) });
  if (result.exitCode !== 0) throw new KujoPluginError("KUJO_WORKSPACE_OUTSIDE_ALLOWED_ROOT", "Source is not a safe readable regular file in the project workspace");
  const { base64 } = z.object({ base64: z.string().max(90_000).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).parse(JSON.parse(result.stdout));
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > MAX_SOURCE_BYTES) throw new KujoPluginError("KUJO_OUTPUT_LIMIT", "Source exceeds the 64 KiB language-operation limit");
  if (bytes.includes(0)) throw new KujoPluginError("KUJO_INVALID_CONFIG", "Source must be UTF-8 text without NUL bytes");
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return { source, digest: createHash("sha256").update(bytes).digest("hex") };
}
