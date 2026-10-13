import { createHash } from "node:crypto";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { PluginConfig } from "../../config/schema.js";
import { resolveKujo } from "../../runtime/resolve-kujo.js";
import { removeTree } from "../../runtime/files.js";
import { discoverWorkspaceText, readWorkspaceText } from "../language/source.js";
import { knowledgePathSchema, type RetainedKnowledge } from "./native.js";

export const knowledgeSelectionSchema = z.array(knowledgePathSchema).min(1).max(64).refine(paths =>
  new Set(paths.map(path => path.toLowerCase())).size === paths.length, "Select unique paths");

// Metadata only. Discovery never opens the selected file contents.
export const discoverKnowledgeFiles = (cwd: string) => discoverWorkspaceText(cwd, path => knowledgePathSchema.safeParse(path).success);

// Call only after explicit content-read/ingest admission. The path belongs to the
// host's workspace, not an agent argument. Unreadable input is an error, never a
// silently smaller corpus that would replace the previous index.
export async function captureKnowledgeFiles(input: { cwd: string; paths: string[]; config: PluginConfig }) {
  const paths = knowledgeSelectionSchema.parse(input.paths);
  const cwd = await realpath(input.cwd);
  const catalog = await discoverKnowledgeFiles(cwd);
  if (paths.some(path => !catalog.files.includes(path))) throw new Error("Selected knowledge files are outside the current eligible catalog");
  const directory = await realpath(await mkdtemp(join(tmpdir(), "kujo-knowledge-capture-")));
  try {
    const runtime = await resolveKujo(input.config, directory);
    const deadline = Date.now() + Math.min(input.config.limits.timeoutMs, 27_000);
    const files = [];
    let bytes = 0;
    for (const path of paths) {
      const remaining = deadline - Date.now();
      if (remaining < 1000) throw new Error("Knowledge input capture exceeded its time budget");
      const config = { ...input.config, limits: { ...input.config.limits, timeoutMs: Math.min(input.config.limits.timeoutMs, remaining) } };
      const file = await readWorkspaceText({ cwd, path, directory, runtime, config });
      // TextDecoder removes a UTF-8 BOM; retain the admitted bytes so original
      // file digests and later freshness checks describe the same source.
      const hash = (text: string) => createHash("sha256").update(text).digest("hex");
      let content = file.source;
      if (hash(content) !== file.digest) {
        content = "\uFEFF" + content;
        if (hash(content) !== file.digest) throw new Error("Knowledge text decoding changed the admitted bytes");
      }
      bytes += Buffer.byteLength(content);
      if (bytes > 131_072) throw new Error("Selected knowledge corpus exceeds 128 KiB");
      files.push({ path, content, digest: file.digest });
    }
    return { files, bytes, catalogTruncated: catalog.truncated, eligibleFiles: catalog.files.length };
  } finally { await removeTree(directory); }
}

// This is an explicit reread action, not an implicit side effect of querying a
// retained snapshot. Unknown/unreadable coverage cannot be called current.
export async function inspectKnowledgeFreshness(input: { cwd: string; retained: RetainedKnowledge; config: PluginConfig }) {
  try {
    const captured = await captureKnowledgeFiles({ ...input, paths: input.retained.files.map(file => file.path) });
    const changed = captured.files.filter(file => input.retained.files.find(old => old.path === file.path)?.sourceDigest !== file.digest).map(file => file.path);
    return { status: changed.length ? "changed" as const : "current" as const, changed, checkedAt: new Date().toISOString() };
  } catch {
    return { status: "unavailable" as const, changed: [], checkedAt: new Date().toISOString() };
  }
}
