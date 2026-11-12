import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, rm, open, readdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { z } from "zod";
import { packageRoot, resolveComponent } from "../../components/registry.js";
import { executeKujo } from "../../runtime/execute-kujo.js";
import type { ResolvedRuntime } from "../../runtime/types.js";
import { redactText } from "../failure/redact.js";

const path = z.string().min(1).max(500).regex(/^[a-zA-Z0-9_.\/-]+$/).refine(s => !s.startsWith("/") && !s.split("/").some(p => p === ".." || p === "." || p === ".git"));
export const assuranceSelection = z.object({ kind: z.enum(["lens", "muzzle", "workcell", "packwrite"]), path, target: z.string().max(2000).optional() }).strict();
export type Selection = z.infer<typeof assuranceSelection>;
export function localTarget(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.hash || url.search) throw new Error("Lens requires a credential-free loopback HTTP URL without query or fragment");
  return url.href;
}
export type Artifact = { path: string; bytes: number; sha256: string; mediaType: string; encoding: "utf8" | "base64"; content: string };
/** Read only regular files beneath a private output root, with explicit budgets.
 * Never truncate logs silently or follow browser/project-created symlinks. */
export async function artifacts(root: string): Promise<Artifact[]> {
  const result: Artifact[] = []; let charged = 0;
  async function walk(directory: string, depth: number) {
    if (depth > 8) throw new Error("Artifact depth exceeds retention limit");
    const entries = await readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; });
    if (entries.length > 100) throw new Error("Artifact inventory exceeds retention limit");
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error("Artifact symlinks are forbidden");
      const filename = join(directory, entry.name);
      if (entry.isDirectory()) { await walk(filename, depth + 1); continue; }
      if (!entry.isFile()) throw new Error("Artifact must be a regular file");
      if (result.length >= 80) throw new Error("Artifact count exceeds retention limit");
      const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 1_000_000 || charged + stat.size > 2_000_000) throw new Error("Artifact bytes exceed retention limit; evidence is incomplete");
        const bytes = Buffer.alloc(stat.size + 1), read = await file.read(bytes, 0, bytes.length, 0);
        if (read.bytesRead !== stat.size) throw new Error("Artifact changed while collecting");
        const data = bytes.subarray(0, stat.size); charged += data.length;
        const png = data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
        let content: string;
        if (png) content = data.toString("base64");
        else { content = new TextDecoder("utf-8", { fatal: true }).decode(data); content = redactText(content.replaceAll(root, "<artifacts>")).text; }
        result.push({ path: relative(root, filename), bytes: data.length, sha256: createHash("sha256").update(data).digest("hex"), mediaType: png ? "image/png" : "text/plain", encoding: png ? "base64" : "utf8", content });
      } finally { await file.close(); }
    }
  }
  if (await lstat(root).then(s => s.isSymbolicLink()).catch(() => false)) throw new Error("Artifact root symlink forbidden");
  await walk(root, 0); return result;
}
type NativeAssurance = {component: unknown; preview: unknown; cleanup:()=>Promise<void>; invocation:{executable:string;cwd:string;args:string[];env:Record<string,string>};collect:()=>Promise<Artifact[]>};
export async function nativeAssurance(input: { selection: Selection; directory: string; workspace: string; runtime: ResolvedRuntime; dockerHost: string | null }): Promise<NativeAssurance> {
  const { selection, directory, workspace, runtime } = input;
  const component = await resolveComponent(selection.kind), native = join(directory, "native");
  await cp(component.root, native, { recursive: true, dereference: false });
  // CommonJS browser bridge must not inherit the plugin's ES module package type.
  await writeFile(join(native, "package.json"), '{"type":"commonjs"}');
  const env: Record<string,string> = { KUJO_BIN: runtime.executable };
  const output = join(directory, "artifacts"); await mkdir(output);
  let cwd = workspace, entry = join(native, component.entrypoint), args: string[];
  let preview: unknown;
  let contained: Awaited<ReturnType<typeof prepareContainedMuzzle>> | undefined;
  if (selection.kind === "lens") {
    const target = localTarget(selection.target ?? "");
    for (const [name, version] of [["playwright-core", "1.61.1"], ["axe-core", "4.11.4"]]) {
      const manifest = JSON.parse(await readFile(join(packageRoot(), "node_modules", name!, "package.json"), "utf8"));
      if (manifest.version !== version) throw new Error(`Install optional ${name}@${version} for Lens`);
    }
    await symlink(join(packageRoot(), "node_modules"), join(native, "node_modules"), "dir");
    cwd = native;
    args = ["check", target, "--quick", "--json", "--out", output, "--timeout", "5", "--check-links", "--max-links", "10", "--accessibility", "--spec", join(workspace, selection.path)];
    const spec = JSON.parse(await readFile(join(workspace, selection.path), "utf8"));
    if (Array.isArray(spec.steps)) {
      validateLensFlow(spec, target);
      args = ["flow", join(workspace, selection.path), "--execute", "--json", "--out", output];
    }
    preview = { target, spec, network: "loopback-only; no saved authentication", warning: "Screenshots contain page pixels. Use a fixture without sensitive content." };
  } else if (selection.kind === "muzzle") {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(selection.path)) throw new Error("Select a named Muzzle workflow");
    const manifest = await readFile(join(workspace, ".muzzle", "manifests", `${selection.path}.json`), "utf8");
    const scripts = (await readdir(join(workspace, ".muzzle", "workflows"))).filter(p => p.startsWith(selection.path + "."));
    if (scripts.length !== 1) throw new Error("Muzzle workflow script is ambiguous or missing");
    const parsedManifest = JSON.parse(manifest);
    if (parsedManifest.name !== selection.path || parsedManifest.script !== `workflows/${scripts[0]}`) throw new Error("Muzzle manifest must select the exact reviewed script");
    preview = { manifest: parsedManifest, script: await readFile(join(workspace, ".muzzle", "workflows", scripts[0]!), "utf8"), containment: "host process; trusted code required" };
    if (selection.target) {
      contained = await prepareContainedMuzzle({ input, manifest: parsedManifest, script: scripts[0]! });
      preview = { workflow: preview, containment: contained.preview };
    }
    env.MUZZLE_ROOT = native;
    args = ["run", selection.path, "--json", "--approve", "--policy", "enforce", "--validate-args", "--timeout", contained ? "20000" : "10000"];
  } else if (selection.kind === "packwrite") {
    if (selection.path !== "agent") throw new Error("PackWrite uses the agent/ execution-pack directory");
    entry = join(native, "paperclip-summary.kujo");
    if (selection.target) {
      const manifestPath = path.parse(selection.target);
      const manifest = await readFile(join(workspace, manifestPath), "utf8");
      preview = { mode: "compile supplied PackWrite manifest into a reviewable pack; no provider call or project write", manifest: JSON.parse(manifest) };
      await writeFile(entry, 'from src.config import config_defaults\nfrom src.validate import summary_run\nfrom src.pack import pack_parse, pack_apply\nparams := args()\ncfg := config_defaults()\nparsed := pack_parse(read_file(params[0]))\nif parsed["ok"] == false { print(to_json(parsed)); exit(2) }\nresult := pack_apply(parsed["files"], cfg, params[1], false)\nif result["ok"] == false { print(to_json(result)); exit(2) }\nprint(to_json(summary_run(params[1] + "/agent", cfg)))\n');
      args = [join(workspace, manifestPath), output];
    } else {
      await writeFile(entry, 'from src.config import config_defaults\nfrom src.validate import summary_run\nparams := args()\ncfg := config_defaults()\nprint(to_json(summary_run(params[0], cfg)))\n');
      args = [join(workspace, "agent")];
      preview = { files: await artifacts(join(workspace, "agent")), mode: "native deterministic validation; planning text never executes" };
    }
  } else {
    if (!input.dockerHost) throw new Error("Configure an explicit local Docker Unix socket for Workcell");
    const definition = JSON.parse(await readFile(join(workspace, selection.path), "utf8"));
    z.object({
      version: z.literal(1), name: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
      runtime: z.object({ backend: z.literal("docker"), image: z.string().regex(/^sha256:[a-f0-9]{64}$/), build_context: z.literal("").optional(), engine_runtime: z.literal("").optional() }).strict(),
      command: z.array(z.string().min(1).max(4000)).min(1).max(32),
      workspace: z.object({ strategy: z.literal("git-worktree"), mount_path: z.literal("/workspace"), run_as: z.literal("host").optional() }).strict(),
      network: z.object({ mode: z.literal("none") }).strict(),
      resources: z.object({ cpus: z.number().positive().max(2), memory: z.enum(["256m", "512m", "1g"]), pids: z.number().int().min(16).max(256), timeout_ms: z.number().int().min(100).max(10000) }).strict(),
      filesystem: z.object({ read_only_root: z.literal(true), tmpfs: z.tuple([z.literal("/tmp")]) }).strict(),
      environment: z.object({ allow: z.array(z.never()).max(0), set: z.object({}).strict() }).strict(),
      secrets: z.array(z.never()).max(0), artifacts: z.object({ export: z.array(path).max(16) }).strict(),
      cleanup: z.object({ keep_failed: z.literal(false) }).strict(), receipt: z.object({ path: z.literal(".workcell/runs") }).strict(),
      trust_profile: z.literal("contained-standard").optional(),
    }).strict().parse(definition);
    env.WORKCELL_PROJECT_DIR = native;
    env.DOCKER_HOST = input.dockerHost;
    env.TMPDIR = await realpath(directory);
    preview = { definition, source: "bounded Git-visible text snapshot; synthetic input commit, not a source repository commit" };
    // Native Workcell owns disposable worktrees of this private snapshot repository.
    for (const gitArgs of [["init"], ["add", "."], ["-c", "user.name=Paperclip snapshot", "-c", "user.email=snapshot@localhost", "commit", "-m", "Frozen approved inputs"]]) {
      const result = await executeKujo({ executable: "git", cwd: workspace, args: gitArgs, timeoutMs: 5000, maxStdoutBytes: 10000, maxStderrBytes: 10000 });
      if (result.exitCode) throw new Error("Cannot initialize private Workcell input snapshot");
    }
    const executionDefinition = join(directory, "approved-workcell.json");
    await writeFile(executionDefinition, JSON.stringify({ ...definition, name: workcellLabel(directory) }));
    args = ["run", "--file", executionDefinition, "--repo", workspace, "--output", output, "--no-pull", "--json"];
  }
  return { component: contained ? { ...component, workcell: contained.component } : component, preview, cleanup: () => contained ? contained.cleanup() : selection.kind === "workcell" ? cleanupWorkcell(directory, input.dockerHost!, runtime) : Promise.resolve(), invocation: { executable: runtime.executable, cwd, args: ["run", "--isolated-imports", entry, "--", ...args], env },
    collect: async () => {
      if (selection.kind === "muzzle") {
        for (const name of ["logs", "reports", "state"]) {
          const source = join(workspace, ".muzzle", name);
          if (await lstat(source).then(s => s.isDirectory() && !s.isSymbolicLink()).catch(() => false)) await cp(source, join(output, name), { recursive: true, dereference: false });
        }
      }
      if (contained) await cp(contained.output, join(output, "workcell"), { recursive: true, dereference: false });
      if (selection.kind === "packwrite") return artifacts(join(selection.target ? output : workspace, "agent"));
      return artifacts(output);
    } };
}

export const workcellLabel = (directory: string) => `paperclip-${createHash("sha256").update(directory).digest("hex").slice(0,48)}`;
export async function cleanupWorkcell(directory: string, dockerHost: string, runtime: ResolvedRuntime) {
  const run = (args: string[]) => executeKujo({ executable: "docker", args, cwd: directory, env: { DOCKER_HOST: dockerHost }, timeoutMs: 5000, maxStdoutBytes: 10000, maxStderrBytes: 10000 });
  const listed = await run(["ps", "-aq", "--filter", "label=dev.kujo.workcell=true", "--filter", `label=dev.kujo.workcell.project=${workcellLabel(directory)}`]);
  if (listed.exitCode) throw new Error("Workcell cleanup unavailable; retain owned storage and retry recovery");
  const ids = listed.stdout.trim().split(/\s+/).filter(Boolean);
  if (ids.length > 4 || ids.some(id => !/^[a-f0-9]{12,64}$/.test(id))) throw new Error("Workcell cleanup inventory is invalid");
  for (const id of ids) if ((await run(["rm", "-f", id])).exitCode) throw new Error("Owned Workcell container cleanup failed");
  const recovery = await mkdtemp(join(tmpdir(), "kujo-workcell-recovery-"));
  try {
    const component = await resolveComponent("workcell");
    await cp(component.root, recovery, { recursive: true });
    const entry = join(recovery, "paperclip-cleanup.kujo");
    await writeFile(entry, 'from src.workspace.workspace import clean_stale_workspaces\nprint(to_json(clean_stale_workspaces([])))\n');
    const result = await executeKujo({ executable: runtime.executable, cwd: recovery, args: ["run", "--isolated-imports", entry], env: { TMPDIR: await realpath(directory) }, timeoutMs: 5000, maxStdoutBytes: 10000, maxStderrBytes: 10000 });
    const outcome = JSON.parse(result.stdout);
    if (result.exitCode || !outcome.ok || outcome.skipped?.length) throw new Error("Owned Workcell workspace cleanup incomplete");
  } finally { await rm(recovery, { recursive: true, force: true }); }

}

export function validateLensFlow(value: unknown, target: string) {
  const text = z.string().min(1).max(500);
  const step = z.union([
    z.object({ visit: text }).strict(), z.object({ assert_selector: text }).strict(), z.object({ assert_text: text }).strict(), z.object({ wait_for_selector: text }).strict(),
    z.object({ assert_no_console_errors: z.literal(true) }).strict(), z.object({ assert_no_failed_requests: z.literal(true) }).strict(),
    z.object({ screenshot: z.object({name:z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/)}).strict() }).strict(),
    z.object({ type: z.object({selector:text,value:z.string().max(100),secret:z.literal(false).optional()}).strict() }).strict(),
    z.object({ click: z.object({selector:text,safe:z.literal(true)}).strict() }).strict(),
  ]);
  const flow=z.object({name:text,description:text.optional(),url:text,viewports:z.tuple([z.literal("desktop")]),timeout_seconds:z.number().int().min(1).max(5),allow_external:z.literal(false),allow_destructive:z.literal(false).optional(),steps:z.array(step).min(1).max(12)}).strict().parse(value);
  if (!("visit" in flow.steps[0]!) || localTarget((flow.steps[0] as {visit:string}).visit) !== localTarget(target) || !flow.steps.some(item => "assert_selector" in item || "assert_text" in item)) throw new Error("An executed flow must begin with the reviewed URL and contain an assertion");
  if(localTarget(flow.url)!==localTarget(target))throw new Error("Flow URL must match the reviewed target");
  for(const item of flow.steps)if("visit" in item && new URL(localTarget(item.visit)).origin!==new URL(target).origin)throw new Error("Flow navigation must stay on the reviewed origin");
  return flow;
}

async function prepareContainedMuzzle({input,manifest,script}:{input:{selection:Selection;directory:string;workspace:string;runtime:ResolvedRuntime;dockerHost:string|null};manifest:Record<string,unknown>;script:string}) {
  if (manifest.runner !== "bash") throw new Error("Contained Muzzle currently supports reviewed bash workflows only");
  const definitionPath = path.parse(input.selection.target);
  const definition = JSON.parse(await readFile(join(input.workspace, definitionPath), "utf8"));
  const command = ["sh", `/workspace/.muzzle/workflows/${script}`];
  if (JSON.stringify(definition.command) !== JSON.stringify(command)) throw new Error("Workcell command must invoke exactly the selected Muzzle script with sh and no arguments");
  const directory = join(input.directory, "contained-workcell"); await mkdir(directory);
  const workspace = join(directory,"workspace"); await cp(input.workspace,workspace,{recursive:true,dereference:false});
  const work = await nativeAssurance({...input,directory,workspace,selection:{kind:"workcell",path:definitionPath}});
  const quote = (value:string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const invocation=work.invocation;
  const shell = "#!/bin/sh\nexec env " + Object.entries(invocation.env).map(([k,v])=>`${k}=${quote(v)}`).join(" ") + " " + [invocation.executable,...invocation.args].map(quote).join(" ") + "\n";
  await writeFile(join(input.workspace,".muzzle","workflows",script),shell);
  return {preview:work.preview,component:work.component,cleanup:work.cleanup,output:join(directory,"artifacts")};
}
