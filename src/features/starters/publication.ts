import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { removeTree } from "../../runtime/files.js";
import type { ResolvedRuntime, ExecuteKujoResult } from "../../runtime/types.js";
import { workspaceRelativePathSchema } from "../language/source.js";
import { starterInputSchema, type StarterPreview } from "./preview.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const publicationMarker = ".kujo-paperclip-starter.json";
export function starterMarker(preview: StarterPreview) {
  const content = JSON.stringify({ schemaVersion: 1, kind: preview.kind, name: preview.name, starterDigest: preview.digest });
  return { path: publicationMarker, content, sha256: hash(content), bytes: Buffer.byteLength(content) };
}
// Fixed host helper. Native descriptor-relative copy creates parents without
// following symlinks and atomically refuses an existing destination file.
// No generated code, imports, package installs, or server entrypoints execute.
export const STARTER_PUBLISHER = String.raw`params := args()
manifest := parse_json(read_file(params[0]))
mut records = []
mut failed_path = ""
mut status = "created"
if path_exists(manifest["root"] + "/" + manifest["name"]) {
    status = "conflict"
} else {
    mut i = 0
    while i < len(manifest["files"]) && failed_path == "" {
        let file = manifest["files"][i]
        try {
            let result = copy_file_beneath(manifest["source"], file["path"], manifest["root"], manifest["name"] + "/" + file["path"], 65536)
            if result["sha256"] != file["sha256"] || result["bytes"] != file["bytes"] {
                failed_path = file["path"]
                status = "incomplete"
            } else {
                records = push(records, { "path": file["path"], "sha256": result["sha256"], "bytes": result["bytes"] })
            }
        } except e {
            failed_path = file["path"]
            status = "incomplete"
        }
        i = i + 1
    }
}
print(to_json({ "schema_version": 1, "status": status, "failed_path": failed_path, "files": records }))
if status != "created" { exit(1) }
`;

export async function requireAbsentStarter(root: string, name: string) {
  starterInputSchema.parse({ kind: "script", name });
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) throw new Error("Choose a portable nonreserved starter directory name");
  try { await lstat(join(root, name)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  throw new Error("Starter destination already exists; choose a new directory name. Existing files are never overwritten or resumed.");
}

/** Internal primitive: the caller must bind host-owned root, preview/runtime
 * bytes and explicit effect approval before using the returned invocation. */
export async function prepareStarterPublication(preview: StarterPreview, root: string, runtime: ResolvedRuntime) {
  await requireAbsentStarter(root, preview.name);
  if (!preview.files.length || preview.files.length > 64 || preview.totalBytes > 262144) throw new Error("Starter exceeds publication bounds");
  const paths = new Set<string>();
  let total = 0;
  for (const file of preview.files) {
    workspaceRelativePathSchema.parse(file.path);
    if (file.path.split("/").some(part => /[ .]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) || paths.has(file.path.toLowerCase()) || file.path === publicationMarker) throw new Error("Starter contains ambiguous or reserved paths");
    paths.add(file.path.toLowerCase());
    const bytes = Buffer.byteLength(file.content); total += bytes;
    if (bytes > 65536 || hash(file.content) !== file.sha256) throw new Error("Starter source bytes do not match review");
  }
  if (total !== preview.totalBytes || hash(JSON.stringify(preview.files.map(({ path, sha256 }) => ({ path, sha256 })))) !== preview.digest) throw new Error("Starter review digest does not match its files");
  const directory = await mkdtemp(join(tmpdir(), "kujo-starter-publication-"));
  try {
    const source = join(directory, "source"); await mkdir(source, { mode: 0o700 });
    const files = [starterMarker(preview), ...preview.files];
    for (const file of files) { await mkdir(dirname(join(source, file.path)), { recursive: true, mode: 0o700 }); await writeFile(join(source, file.path), file.content, { mode: 0o600, flag: "wx" }); }
    const inventory = files.map(file => ({ path: file.path, sha256: file.sha256, bytes: Buffer.byteLength(file.content) }));
    const helper = join(directory, "publish.kujo"), manifest = join(directory, "inputs.json");
    await writeFile(helper, STARTER_PUBLISHER, { mode: 0o600 });
    await writeFile(manifest, JSON.stringify({ root, source, name: preview.name, files: inventory }), { mode: 0o600 });
    return { invocation: { executable: runtime.executable, cwd: directory, args: ["run", "--isolated-imports", "--interpreter", helper, "--", manifest] },
      collect: async (output: ExecuteKujoResult) => {
        const result = z.object({ schema_version: z.literal(1), status: z.enum(["created", "conflict", "incomplete"]), failed_path: z.string(),
          files: z.array(z.object({ path: z.string(), sha256: z.string(), bytes: z.number().int().nonnegative() }).strict()).max(65) }).strict().parse(JSON.parse(output.stdout));
        if (result.files.some((file, index) => file.path !== inventory[index]?.path || file.sha256 !== inventory[index]?.sha256 || file.bytes !== inventory[index]?.bytes)
          || (result.status === "created" && (output.exitCode !== 0 || result.files.length !== inventory.length || result.failed_path))
          || (result.status !== "created" && output.exitCode === 0)
          || (result.status === "conflict" && (result.files.length || result.failed_path))
          || (result.status === "incomplete" && result.failed_path !== inventory[result.files.length]?.path)) throw new Error("Native starter publication evidence does not match the approved inventory");
        return { schemaVersion: 1, classification: result.status, destination: preview.name, entrypoint: `${preview.name}/${preview.entrypoint}`, kind: preview.kind, starterDigest: preview.digest,
          files: result.files, failedPath: result.failed_path || null, exitCode: output.exitCode, durationMs: output.durationMs,
          notice: "Native no-overwrite copies observed. This is not an atomic directory transaction or proof files remain unchanged. An incomplete/uncertain operation may leave files, including its failed path; inspect before any new request. No rollback, retry, dependency install, generated-program execution or server start." };
      }, dispose: async () => { await removeTree(directory); } };
  } catch (error) { await removeTree(directory); throw error; }
}
