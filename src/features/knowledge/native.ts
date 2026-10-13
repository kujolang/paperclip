import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { resolveComponent } from "../../components/registry.js";
import type { PluginConfig } from "../../config/schema.js";
import { executeKujo } from "../../runtime/execute-kujo.js";
import { removeTree } from "../../runtime/files.js";
import { resolveKujo } from "../../runtime/resolve-kujo.js";
import { redactText } from "../failure/redact.js";
import { workspaceTextPathSchema } from "../language/source.js";
import { RAG_BRIDGE } from "./bridge.js";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const namespaceSchema = z.string().regex(/^pc_[a-f0-9]{64}$/);
export const knowledgePathSchema = workspaceTextPathSchema.refine(path =>
  /\.(?:md|markdown|txt|kujo)$/i.test(path) && !path.split("/").some(part => part.startsWith(".") || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) || /^(?:node_modules|vendor)$/i.test(part)),
  "Choose a visible Markdown, text or Kujo source file");
const sourceSchema = z.object({ path: knowledgePathSchema, content: z.string().max(65_536).refine(value => !value.includes("\0") && Buffer.byteLength(value) <= 65_536) }).strict();
const corpusSchema = z.array(sourceSchema).min(1).max(64).superRefine((files, ctx) => {
  if (new Set(files.map(file => file.path.toLowerCase())).size !== files.length) ctx.addIssue({ code: "custom", message: "Corpus paths must be unique on every supported platform" });
  if (files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0) > 131_072) ctx.addIssue({ code: "custom", message: "Corpus exceeds 128 KiB" });
});
const manifestFileSchema = z.object({ path: knowledgePathSchema, sourceDigest: sha, indexedDigest: sha, lines: z.number().int().positive(), redactedCount: z.number().int().nonnegative() }).strict();
const MAX_INDEX = 8_000_000;
export const retainedKnowledgeSchema = z.object({
  schema: z.literal("kujo.paperclip.knowledge-index/v1"), namespace: namespaceSchema,
  componentCommit: z.string().regex(/^[a-f0-9]{40}$/), runtimeVersion: z.string(), bridgeDigest: sha,
  generatedAt: z.iso.datetime(), files: z.array(manifestFileSchema).min(1).max(64),
  chunks: z.number().int().positive(), index: z.string().max(MAX_INDEX), indexDigest: sha, corpusDigest: sha,
}).strict();
export type RetainedKnowledge = z.infer<typeof retainedKnowledgeSchema>;
const ingestSchema = z.object({ ok: z.boolean(), aborted: z.boolean(), chunks: z.number().int().nonnegative(),
  stats: z.object({ files_seen: z.number().int().nonnegative(), docs_loaded: z.number().int().nonnegative(), errors: z.number().int().nonnegative(), total_bytes_estimate: z.number().nonnegative() }).strict(),
}).strict();
const citationSchema = z.object({ path: z.string().max(1100), line_start: z.number().int().positive(), line_end: z.number().int().positive(),
  text: z.string().max(65_536), score: z.number().finite(), confidence: z.number().min(0).max(1) });
const answerSchema = z.object({ answer: z.string().max(65_536), count: z.number().int().min(0).max(6),
  citations: z.array(citationSchema).max(6), confidence: z.number().min(0).max(1), confidence_band: z.enum(["low", "medium", "high"]),
  safe_response_policy: z.object({ triggered: z.boolean(), reason: z.string() }),
});
export type KnowledgeAnswer = {
  answer: string; citations: Array<{ path: string; lineStart: number; lineEnd: number; text: string; score: number; confidence: number; sourceDigest: string; indexedDigest: string }>;
  confidence: number; confidenceBand: "low" | "medium" | "high"; status: "answered" | "insufficient-evidence";
  policyReason: string; corpusDigest: string; generatedAt: string;
  scope: "Offline retrieval draft from the indexed, redacted snapshot. Citations refer to that snapshot, not necessarily the current workspace; no external AI provider was used.";
};

// Internal boundary: callers supply only explicitly admitted bytes, never a workspace
// path. Host authorization, durable storage and freshness are the service's job.
async function withRag<T>(config: PluginConfig, run: (context: {
  directory: string; componentCommit: string; runtimeVersion: string;
  invoke: (request: Record<string, string>, outputLimit: number) => Promise<string>;
}) => Promise<T>): Promise<T> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "kujo-paperclip-rag-")));
  try {
    const [runtime, component] = await Promise.all([resolveKujo(config, directory), resolveComponent("rag")]);
    const code = join(directory, "code");
    for (const path of component.files) {
      await mkdir(dirname(join(code, path)), { recursive: true, mode: 0o700 });
      await cp(join(component.root, path), join(code, path));
    }
    const entrypoint = join(code, "paperclip-rag.kujo");
    await writeFile(entrypoint, RAG_BRIDGE, { mode: 0o600 });
    return await run({ directory, componentCommit: component.gitCommit, runtimeVersion: runtime.runtimeVersion,
      invoke: async (request, outputLimit) => {
        await writeFile(join(directory, "request.json"), JSON.stringify(request), { mode: 0o600 });
        const result = await executeKujo({ executable: runtime.executable, cwd: directory,
          args: ["run", "--isolated-imports", "--interpreter", entrypoint], timeoutMs: Math.min(config.limits.timeoutMs, 27_000),
          maxStdoutBytes: Math.min(config.limits.maxStdoutBytes, outputLimit), maxStderrBytes: Math.min(config.limits.maxStderrBytes, 4096) });
        if (result.exitCode !== 0 || result.timedOut) throw new Error("Native knowledge operation did not complete");
        return result.stdout;
      } });
  } finally { await removeTree(directory); }
}

export function knowledgeNamespace(companyId: string, projectId: string, workspaceId: string): string {
  return `pc_${digest(JSON.stringify([companyId, projectId, workspaceId]))}`;
}

export async function ingestKnowledge(input: { namespace: string; files: Array<{ path: string; content: string }>; config: PluginConfig }): Promise<RetainedKnowledge> {
  const namespace = namespaceSchema.parse(input.namespace);
  const files = corpusSchema.parse(input.files).sort((a, b) => a.path.localeCompare(b.path, "en"));
  return withRag(input.config, async ({ directory, componentCommit, runtimeVersion, invoke }) => {
    const manifest: z.infer<typeof manifestFileSchema>[] = [];
    for (const file of files) {
      const redacted = redactText(file.content);
      const target = join(directory, "corpus", file.path);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, redacted.text, { mode: 0o600, flag: "wx" });
      manifest.push({ path: file.path, sourceDigest: digest(file.content), indexedDigest: digest(redacted.text), lines: redacted.text.split("\n").length, redactedCount: redacted.count });
    }
    const result = ingestSchema.parse(JSON.parse(await invoke({ action: "ingest", namespace }, 16_384)));
    if (!result.ok || result.aborted || result.stats.errors || result.stats.docs_loaded !== files.length || result.stats.files_seen !== files.length || result.chunks === 0) {
      throw new Error("Knowledge ingestion is incomplete or empty; no index was admitted");
    }
    const path = join(directory, "retained-index.json");
    if ((await stat(path)).size > MAX_INDEX) throw new Error("Native knowledge index exceeds its storage limit");
    const index = await readFile(path, "utf8");
    return retainedKnowledgeSchema.parse({ schema: "kujo.paperclip.knowledge-index/v1", namespace, componentCommit, runtimeVersion,
      bridgeDigest: digest(RAG_BRIDGE), generatedAt: new Date().toISOString(), files: manifest, chunks: result.chunks,
      index, indexDigest: digest(index), corpusDigest: digest(JSON.stringify(manifest)) });
  });
}

export async function queryKnowledge(input: { namespace: string; retained: RetainedKnowledge; question: string; config: PluginConfig }): Promise<KnowledgeAnswer> {
  const namespace = namespaceSchema.parse(input.namespace);
  const retained = retainedKnowledgeSchema.parse(input.retained);
  const question = z.string().trim().min(1).max(4000).parse(input.question);
  if (retained.namespace !== namespace || retained.indexDigest !== digest(retained.index)
    || retained.corpusDigest !== digest(JSON.stringify(retained.files)) || retained.bridgeDigest !== digest(RAG_BRIDGE)) throw new Error("Knowledge index identity or integrity mismatch; ingest again");
  return withRag(input.config, async ({ directory, componentCommit, invoke }) => {
    if (retained.componentCommit !== componentCommit) throw new Error("Knowledge component changed; ingest again");
    await writeFile(join(directory, "retained-index.json"), retained.index, { mode: 0o600 });
    const result = answerSchema.parse(JSON.parse(await invoke({ action: "query", namespace, question: redactText(question).text }, 512_000)));
    if (result.count !== result.citations.length || (result.safe_response_policy.triggered && result.count !== 0)) throw new Error("Native knowledge answer contradicts its evidence");
    const citations = result.citations.map(citation => {
      const nativePath = citation.path.replaceAll("\\", "/");
      const path = nativePath.replace(/^\.\//, "").replace(/^corpus\//, "");
      const file = retained.files.find(file => file.path === path);
      if (!/^(?:\.\/)?corpus\//.test(nativePath) || !file || citation.line_end < citation.line_start || citation.line_end > file.lines) throw new Error("Native citation is outside the indexed corpus");
      return { path, lineStart: citation.line_start, lineEnd: citation.line_end, text: redactText(citation.text).text,
        score: citation.score, confidence: citation.confidence, sourceDigest: file.sourceDigest, indexedDigest: file.indexedDigest };
    });
    return { answer: redactText(result.answer).text, citations, confidence: result.confidence, confidenceBand: result.confidence_band,
      status: citations.length ? "answered" : "insufficient-evidence", policyReason: result.safe_response_policy.reason,
      corpusDigest: retained.corpusDigest, generatedAt: new Date().toISOString(),
      scope: "Offline retrieval draft from the indexed, redacted snapshot. Citations refer to that snapshot, not necessarily the current workspace; no external AI provider was used." };
  });
}
