import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { PluginConfig } from "../../config/schema.js";
import { executeKujo, safeChildEnv } from "../../runtime/execute-kujo.js";
import { KujoPluginError } from "../../runtime/errors.js";
import type { ResolvedRuntime } from "../../runtime/types.js";
import { workspaceRelativePathSchema, workspaceTextPathSchema } from "../language/source.js";

const execFileAsync = promisify(execFile);
export const SNAPSHOT_LIMITS = { files: 1000, fileBytes: 65_536, totalBytes: 16_777_216 } as const;
const recordSchema = z.object({ path: workspaceTextPathSchema, status: z.enum(["copied", "oversize", "budget", "unreadable"]), regular: z.boolean(), bytes: z.number().int().nonnegative() }).strict();
export type SnapshotFile = Omit<z.infer<typeof recordSchema>, "status"> & { status: z.infer<typeof recordSchema>["status"] | "not-text"; digest?: string };

// The manifest is host-owned. Whole-file beneath-root reads reject symlinks at
// every component, special files and size overruns before copying. The helper
// never executes a project module or prints source content or native IO errors.
const READER = String.raw`params := args()
manifest := parse_json(read_file(params[0]))
mut records = []
mut charged = 0
mut fi = 0
while fi < len(manifest["paths"]) {
    let path = manifest["paths"][fi]
    mut cap = 65536
    if manifest["max_bytes"] - charged < cap { cap = manifest["max_bytes"] - charged }
    mut status = "budget"
    mut regular = false
    mut size = 0
    mut read_completed = false
    if cap > 0 {
        try {
            let bytes = read_binary_file_beneath(manifest["root"], path, cap)
            size = len(bytes)
            read_completed = true
            regular = true
            charged = charged + size
            write_binary_file(manifest["destination"] + "/" + path, bytes)
            status = "copied"
        } except e {
            // A failed bounded read may have consumed cap+1 bytes if the file
            // grew after its metadata check. Charge that conservative ceiling.
            if read_completed == false { charged = charged + cap + 1 }
            status = "unreadable"
            if contains(to_string(e), "read_file_beneath[size_limit_exceeded]") == 1 {
                regular = true
                status = "oversize"
                if cap < 65536 { status = "budget" }
            }
        }
    }
    records = push(records, { "path": path, "status": status, "regular": regular, "bytes": size })
    fi = fi + 1
}
print(to_json({ "records": records, "charged_bytes": charged }))
`;

export async function discoverWorkspaceInventory(cwd: string, priority: (path: string) => number = () => 0) {
  const { stdout } = await execFileAsync("git", ["-C", cwd, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8", env: safeChildEnv(), maxBuffer: 2_000_000, timeout: 5000, windowsHide: true,
  });
  const visible = [...new Set(stdout.split("\0").filter(Boolean))];
  const safe = visible.filter((path) => workspaceRelativePathSchema.safeParse(path).success && !path.startsWith("~") && !path.split("/").includes(".git"));
  safe.sort((a, b) => priority(a) - priority(b) || (a < b ? -1 : a > b ? 1 : 0));
  const candidates = safe.slice(0, SNAPSHOT_LIMITS.files);
  const paths = candidates.filter((path) => workspaceTextPathSchema.safeParse(path).success);
  return { paths, candidates, excludedSensitive: candidates.length - paths.length, truncated: safe.length > SNAPSHOT_LIMITS.files, rejected: visible.length - safe.length, visible: visible.length };
}

export async function copyWorkspaceSnapshot(input: { cwd: string; directory: string; runtime: ResolvedRuntime; config: PluginConfig; catalog: Awaited<ReturnType<typeof discoverWorkspaceInventory>> }) {
  const workspace = join(input.directory, "workspace");
  await mkdir(workspace, { mode: 0o700 });
  for (const path of input.catalog.paths) {
    workspaceTextPathSchema.parse(path);
    await mkdir(dirname(join(workspace, path)), { recursive: true, mode: 0o700 });
  }
  const helper = join(input.directory, "copy-snapshot.kujo"), manifest = join(input.directory, "copy-manifest.json");
  await writeFile(helper, READER, { mode: 0o600 });
  await writeFile(manifest, JSON.stringify({ root: input.cwd, destination: workspace, paths: input.catalog.paths, max_bytes: SNAPSHOT_LIMITS.totalBytes }), { mode: 0o600 });
  const result = await executeKujo({ executable: input.runtime.executable, cwd: input.directory,
    args: ["run", "--isolated-imports", helper, "--", manifest], timeoutMs: Math.min(input.config.limits.timeoutMs, 5000),
    maxStdoutBytes: Math.min(input.config.limits.maxStdoutBytes, 1_200_000), maxStderrBytes: Math.min(input.config.limits.maxStderrBytes, 4096) });
  if (result.exitCode !== 0) throw new KujoPluginError("KUJO_RUNTIME_EXEC_FAILED", "Bounded workspace snapshot could not be prepared");
  const parsed = z.object({ records: z.array(recordSchema).max(SNAPSHOT_LIMITS.files), charged_bytes: z.number().int().min(0).max(SNAPSHOT_LIMITS.totalBytes + 1) }).strict().parse(JSON.parse(result.stdout));
  if (parsed.records.length !== input.catalog.paths.length || parsed.records.some((record, index) => record.path !== input.catalog.paths[index])) {
    throw new KujoPluginError("KUJO_COMPONENT_SCHEMA_INVALID", "Snapshot inventory does not match the admitted paths");
  }
  const files: SnapshotFile[] = [];
  const digest = createHash("sha256");
  let copiedBytes = 0;
  for (const record of parsed.records) {
    const file: SnapshotFile = { ...record };
    if (file.status === "copied") {
      const bytes = await readFile(join(workspace, file.path));
      if (bytes.length !== file.bytes || bytes.length > SNAPSHOT_LIMITS.fileBytes) throw new KujoPluginError("KUJO_OUTPUT_LIMIT", "Snapshot copy exceeds its declared size");
      file.digest = createHash("sha256").update(bytes).digest("hex");
      try {
        if (bytes.includes(0)) throw new Error("NUL");
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        copiedBytes += bytes.length;
      } catch {
        file.status = "not-text";
        await rm(join(workspace, file.path));
      }
    }
    if (file.status !== "copied") await rm(join(workspace, file.path), { force: true });
    files.push(file);
    digest.update(JSON.stringify(file)).update("\0");
  }
  digest.update(JSON.stringify(input.catalog));
  return { workspace, files, digest: digest.digest("hex"), copiedBytes, chargedBytes: parsed.charged_bytes, catalog: input.catalog };
}
