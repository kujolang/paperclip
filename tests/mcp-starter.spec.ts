import { expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { previewStarter } from "../src/features/starters/preview.js";
import { parsePluginConfig } from "../src/config/schema.js";
import { resolveKujo } from "../src/runtime/resolve-kujo.js";
import { safeChildEnv } from "../src/runtime/execute-kujo.js";
import { resolveComponent } from "../src/components/registry.js";
import { removeTree } from "../src/runtime/files.js";

it("previews unchanged portable MCP source and demo files without installing integrations", async () => {
  const preview = await previewStarter({ kind: "mcp", name: "demo-mcp" }, parsePluginConfig({}));
  const component = await resolveComponent("mcp");
  expect(preview).toMatchObject({ status: "preview", entrypoint: "server.kujo", provenance: { commit: component.gitCommit, version: "1.3.1" } });
  for (const relative of component.files) expect(preview.files.find(file => file.path === (relative === "README.md" ? "UPSTREAM_README.md" : relative))?.content).toBe(await readFile(join(component.root, relative), "utf8"));
  const config = JSON.parse(preview.files.find(file => file.path === "mcp-server.json")!.content);
  expect(config.http.host).toBe("127.0.0.1"); expect(config.permissions.allowed_directories).toEqual(["./demo"]);
  expect(preview.files.find(file => file.path === "README.md")?.content).toContain("does not\nregister any server");
});

it("materialized MCP starter supports authenticated JSON-RPC and rejects forbidden paths/writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "kujo-mcp-starter-consumer-"));
  let child: ReturnType<typeof spawn> | undefined, closed: Promise<unknown> | undefined;
  let log = "";
  try {
    const config = parsePluginConfig({}); const preview = await previewStarter({ kind: "mcp", name: "fixture-mcp" }, config);
    for (const file of preview.files) { await mkdir(dirname(join(root, file.path)), { recursive: true }); await writeFile(join(root, file.path), file.content); }
    await writeFile(join(root, "outside.md"), "NOT_IN_MCP_ROOT");
    const reserve = createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening"); const port = (reserve.address() as { port: number }).port;
    await new Promise<void>((ok, fail) => reserve.close(error => error ? fail(error) : ok()));
    const settings = JSON.parse(await readFile(join(root, "mcp-server.json"), "utf8")); settings.http.port = port; settings.auth.enabled = true; settings.auth.token = "mcp-starter-fixture-credential";
    await writeFile(join(root, "mcp-server.json"), JSON.stringify(settings));
    const runtime = await resolveKujo(config, root);
    child = spawn(runtime.executable, ["run", preview.entrypoint, "--interpreter"], { cwd: root, env: safeChildEnv(), stdio: ["ignore", "pipe", "pipe"] }); closed = once(child, "close");
    child.stdout?.on("data", bytes => { log = (log + String(bytes)).slice(-10000); }); child.stderr?.on("data", bytes => { log = (log + String(bytes)).slice(-10000); });
    const base = `http://127.0.0.1:${port}/mcp/v1`;
    const headers = { "Content-Type": "application/json", Authorization: "Bearer mcp-starter-fixture-credential" };
    let ready = false;
    for (let i = 0; i < 60; i++) { if (child.exitCode !== null) throw new Error(`MCP exited: ${log}`); try { if ((await fetch(base + "/health", { headers, signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* owned startup */ } await delay(100); }
    expect(ready, log).toBe(true);
    const rpc = async (method: string, params: object = {}) => {
      const response = await fetch(base, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(3000) });
      expect(response.status).toBe(200); return await response.json() as { result?: { protocolVersion?: string; tools?: { name: string }[]; resources?: unknown[] }; error?: { message: string } };
    };
    expect((await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}', signal: AbortSignal.timeout(3000) })).status).toBe(401);
    expect((await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "starter-fixture", version: "1.0.0" } })).result?.protocolVersion).toBe("2025-11-25");
    expect((await rpc("tools/list")).result?.tools?.some(tool => tool.name === "read_project_docs")).toBe(true);
    const docs = await rpc("tools/call", { name: "read_project_docs", arguments: { file_name: "README" } });
    expect(docs.error).toBeUndefined();
    expect(JSON.stringify(docs.result)).toContain("README.md");
    expect((await rpc("resources/list")).result?.resources?.length).toBeGreaterThan(0);
    expect((await rpc("resources/read", { uri: "project://docs" })).error).toBeUndefined();
    const denied = await rpc("tools/call", { name: "read_text_range", arguments: { file_path: "../outside.md", start_line: 1, end_line: 2 } });
    expect(denied.error).toBeDefined(); expect(JSON.stringify(denied)).not.toContain("NOT_IN_MCP_ROOT");
    const before = await readFile(join(root, "demo/docs/README.md"), "utf8");
    expect((await rpc("tools/call", { name: "write_text_safe", arguments: { file_path: "docs/README.md", content: "overwrite" } })).error).toBeDefined();
    expect(await readFile(join(root, "demo/docs/README.md"), "utf8")).toBe(before);
  } finally { if (child && child.exitCode === null && child.signalCode === null) { child.kill(); await closed; } await removeTree(root); }
}, 30_000);
