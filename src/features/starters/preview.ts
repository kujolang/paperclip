import { stageApplicationStarter } from "./application.js";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { PluginConfig } from "../../config/schema.js";
import { executeKujo } from "../../runtime/execute-kujo.js";
import { resolveKujo } from "../../runtime/resolve-kujo.js";
import { removeTree } from "../../runtime/files.js";

export const starterInputSchema = z.object({
  kind: z.enum(["script", "agent", "api", "mcp"]),
  name: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/).default("my-kujo-project"),
}).strict();
export const starterCatalog = [
  { id: "script", title: "Local script", description: "A Kujo package and Hello World entry point.", prerequisites: "Compatible Kujo runtime. No dependency installation or provider credentials needed." },
  { id: "api", title: "SQLite API", description: "A canonical CRUD backend with item/project routes, validation and persistent SQLite data.", prerequisites: "Local loopback server; running it creates a SQLite database and opens a port. Review authentication before any exposure." },
  { id: "mcp", title: "MCP server", description: "A canonical local MCP framework with tools, resources and a contained demo workspace.", prerequisites: "Running opens a loopback port; tools can access permitted demo files. Review roots/auth before connecting clients." },
  { id: "agent", title: "AI agent project", description: "Repository-owned instructions, schemas, capabilities, evaluation and fixture provider configuration.", prerequisites: "Install the pinned Kennel dependencies before running. Fixture mode needs no provider credentials; live providers require explicit configuration." },
] as const;
export type StarterPreview = {
  schemaVersion: 1; kind: "script" | "agent" | "api" | "mcp"; entrypoint: string; provenance?: Awaited<ReturnType<typeof stageApplicationStarter>>; name: string; runtimeVersion: string;
  files: { path: string; content: string; sha256: string }[]; totalBytes: number; digest: string;
  status: "preview"; notice: string;
};
export function requireStarters(config: PluginConfig) {
  if (!config.features.examples || !["installed", "build", "full"].includes(config.capabilityProfile)) throw new Error("Starter previews are disabled by company feature/profile settings");
}
export async function previewStarter(raw: unknown, config: PluginConfig): Promise<StarterPreview> {
  requireStarters(config);
  const input = starterInputSchema.parse(raw);
  const directory = await mkdtemp(join(tmpdir(), "kujo-paperclip-starter-"));
  try {
    const runtime = await resolveKujo(config, directory);
    const target = join(directory, input.name);
    let provenance: StarterPreview["provenance"];
    if (input.kind === "api" || input.kind === "mcp") provenance = await stageApplicationStarter(target, input.name, input.kind);
    else {
      const args = input.kind === "script" ? ["init", "--dir", target, "--name", input.name]
        : ["agent", "new", input.name, "--dir", target, "--profile", "basic", "--provider", "fixture", "--no-git", "--json"];
      const result = await executeKujo({ executable: runtime.executable, cwd: directory, args,
        timeoutMs: Math.min(config.limits.timeoutMs, 5000), maxStdoutBytes: 16384, maxStderrBytes: 4096 });
      if (result.exitCode !== 0) throw new Error("The canonical starter generator did not complete. Check the name and runtime compatibility.");
    }
    const files: StarterPreview["files"] = [];
    let totalBytes = 0;
    async function collect(relative = "", depth = 0) {
      if (depth > 8) throw new Error("Starter directory depth exceeded");
      const entries = await readdir(join(target, relative));
      if (entries.length > 64) throw new Error("Starter file limit exceeded");
      for (const name of entries.sort()) {
        const path = relative ? `${relative}/${name}` : name;
        if (name === ".git" || name === "node_modules" || name === "kennel_packages") throw new Error("Unexpected generated dependency or repository directory");
        const stat = await lstat(join(target, path));
        if (stat.isSymbolicLink()) throw new Error("Starter contains a symlink");
        if (stat.isDirectory()) { await collect(path, depth + 1); continue; }
        if (!stat.isFile() || stat.nlink !== 1 || stat.size > 65536 || files.length >= 64) throw new Error("Starter contains an unsupported or oversized file");
        const bytes = await readFile(join(target, path));
        totalBytes += bytes.length;
        if (totalBytes > 262144) throw new Error("Starter total byte limit exceeded");
        const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (content.includes("\0") || content.includes(directory)) throw new Error("Starter contains binary data or a nonportable generation path");
        files.push({ path, content, sha256: createHash("sha256").update(bytes).digest("hex") });
      }
    }
    await collect();
    const entrypoint = input.kind === "api" ? "main.kujo" : input.kind === "mcp" ? "server.kujo" : "src/main.kujo";
    if (!files.some(file => file.path === entrypoint) || !files.some(file => file.path === (input.kind === "api" || input.kind === "mcp" ? "src/server/runtime.kujo" : "kujo.toml"))) throw new Error("Canonical starter is missing its entry point or manifest");
    return { schemaVersion: 1, ...input, entrypoint, ...(provenance ? { provenance } : {}), status: "preview", runtimeVersion: runtime.runtimeVersion, files, totalBytes,
      digest: createHash("sha256").update(JSON.stringify(files.map(({ path, sha256 }) => ({ path, sha256 })))).digest("hex"),
      notice: "Prepared from canonical Kujo generators or pinned source in a private temporary directory. Project files are unchanged. Dependencies are not installed; the generated program and evaluations have not run. Review the files before creating a project." };
  } finally { await removeTree(directory); }
}
