import { readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { redactText } from "../failure/redact.js";
import type { ContextPack } from "./schema.js";
import { KujoPluginError } from "../../runtime/errors.js";

const SENSITIVE = /(^|\/)(?:\.env(?:\.|$)|id_(?:rsa|ed25519)|credentials?|secrets?)(?:\/|$)/i;

export async function getContextContent(input: {
  workspacePath: string;
  pack: ContextPack;
  paths?: string[];
  maxTokens: number;
}): Promise<{ files: Array<{ path: string; content: string; truncated: boolean }>; estimatedTokens: number; truncated: boolean }> {
  const allowed = new Set(input.pack.files.map((file) => file.path));
  const requested = input.paths?.length ? input.paths : input.pack.files.map((file) => file.path);
  const workspace = await realpath(input.workspacePath);
  const maxBytes = Math.max(1_024, Math.min(input.maxTokens, input.pack.budget) * 4);
  let used = 0;
  let truncated = false;
  const files = [];
  for (const relative of requested) {
    if (!allowed.has(relative) || relative.startsWith("/") || relative.split(/[\\/]/).includes("..") || SENSITIVE.test(relative)) continue;
    const candidate = await realpath(join(workspace, relative)).catch(() => null);
    if (!candidate || !candidate.startsWith(`${workspace}/`)) continue;
    const info = await stat(candidate);
    if (!info.isFile() || info.size > 1_000_000) continue;
    const bytes = await readFile(candidate);
    if (bytes.includes(0)) continue;
    const remaining = maxBytes - used;
    if (remaining <= 0) { truncated = true; break; }
    const source = bytes.subarray(0, remaining);
    const content = redactText(source.toString("utf8")).text;
    files.push({ path: relative, content, truncated: source.byteLength < bytes.byteLength });
    used += Buffer.byteLength(content);
    if (source.byteLength < bytes.byteLength) truncated = true;
  }
  if (files.length === 0 && requested.length > 0) {
    throw new KujoPluginError("KUJO_WORKSPACE_OUTSIDE_ALLOWED_ROOT", "No requested Context Pack paths were safe and readable");
  }
  return { files, estimatedTokens: Math.ceil(used / 4), truncated };
}

