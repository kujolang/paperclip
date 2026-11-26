import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePluginConfig, type PluginConfig } from "../../config/schema.js";
import { copyContextFiles } from "../../paperclip/workspace-guard.js";
import { KujoPluginError } from "../../runtime/errors.js";
import { redactText } from "../failure/redact.js";
import type { ContextPack } from "./schema.js";

const SENSITIVE = /(^|\/)(?:\.env(?:\.|$)|id_(?:rsa|ed25519)|credentials?|secrets?)(?:\/|$)/i;
const MAX_READ_FILES = 4;
const MAX_FILE_BYTES = 1_000_000;

export async function getContextContent(input: {
  workspacePath: string;
  pack: ContextPack;
  paths?: string[];
  maxTokens: number;
  config?: PluginConfig;
}): Promise<{ files: Array<{ path: string; content: string; truncated: boolean }>; estimatedTokens: number; truncated: boolean }> {
  const allowed = new Set(input.pack.files.map((file) => file.path));
  const requested = input.paths?.length ? input.paths : input.pack.files.map((file) => file.path);
  const selected = [...new Set(requested.filter((path) => allowed.has(path) && !SENSITIVE.test(path)))];
  const maxBytes = Math.max(0, Math.min(input.maxTokens, input.pack.budget) * 4);
  const files = [];
  let used = 0;
  let truncated = selected.length > MAX_READ_FILES;
  const copy = await copyContextFiles({ cwd: input.workspacePath, paths: selected.slice(0, MAX_READ_FILES),
    cap: MAX_FILE_BYTES, prefix: false, config: input.config ?? parsePluginConfig({}) });
  try {
    for (const path of copy.selectedPaths) {
      const remaining = maxBytes - used;
      if (remaining <= 0) { truncated = true; break; }
      const bytes = await readFile(join(copy.path, path));
      if (bytes.includes(0) || bytes.length > MAX_FILE_BYTES) continue;
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { continue; }
      const redacted = Buffer.from(redactText(text).text);
      const clipped = redacted.length > remaining;
      const content = clipped ? new TextDecoder().decode(redacted.subarray(0, remaining), { stream: true }) : redacted.toString("utf8");
      files.push({ path, content, truncated: clipped });
      used += Buffer.byteLength(content);
      truncated ||= clipped;
    }
  } finally {
    await copy.cleanup();
  }
  if (files.length === 0 && requested.length > 0) {
    throw new KujoPluginError("KUJO_WORKSPACE_OUTSIDE_ALLOWED_ROOT", "No requested Context Pack paths were safe and readable");
  }
  return { files, estimatedTokens: Math.ceil(used / 4), truncated };
}
