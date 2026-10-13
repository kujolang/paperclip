import { describe, expect, it } from "vitest";
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

it("previews unchanged canonical API bytes with source provenance and backend-only instructions", async () => {
  const preview = await previewStarter({ kind: "api", name: "demo-api" }, parsePluginConfig({}));
  const component = await resolveComponent("crud-api");
  expect(preview).toMatchObject({ status: "preview", entrypoint: "main.kujo", provenance: { commit: component.gitCommit, version: component.version } });
  for (const relative of component.files) {
    const name = relative === "README.md" ? "UPSTREAM_README.md" : relative;
    expect(preview.files.find(file => file.path === name)?.content).toBe(await readFile(join(component.root, relative), "utf8"));
  }
  expect(preview.files.find(file => file.path === "README.md")?.content).toContain("backend only");
  expect(preview.files.some(file => file.path.endsWith(".db"))).toBe(false);
});

describe("materialized API starter consumer", () => {
  it("serves health and authenticated CRUD and persists rows across an owned restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "kujo-api-starter-consumer-"));
    let child: ReturnType<typeof spawn> | undefined;
    let closed: Promise<unknown> | undefined;
    let log = "";
    async function stop() { if (child && child.exitCode === null && child.signalCode === null) { child.kill(); await closed; } child = undefined; }
    try {
      const config = parsePluginConfig({});
      const preview = await previewStarter({ kind: "api", name: "fixture-api" }, config);
      for (const file of preview.files) { await mkdir(dirname(join(root, file.path)), { recursive: true }); await writeFile(join(root, file.path), file.content); }
      const runtime = await resolveKujo(config, root);
      const reserve = createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening");
      const port = (reserve.address() as { port: number }).port;
      await new Promise<void>((ok, fail) => reserve.close(error => error ? fail(error) : ok()));
      const base = `http://127.0.0.1:${port}`;
      const request = (path: string, options?: RequestInit) => fetch(base + path, { ...options, signal: AbortSignal.timeout(2000) });
      async function start() {
        child = spawn(runtime.executable, ["run", preview.entrypoint, "--interpreter"], { cwd: root, env: safeChildEnv({ KUJO_CRUD_PORT: String(port), KUJO_CRUD_API_HOST: "127.0.0.1", KUJO_CRUD_AUTH_TOKEN: "starter-fixture-credential" }), stdio: ["ignore", "pipe", "pipe"] });
        closed = once(child, "close");
        child.stdout?.on("data", bytes => { log = (log + String(bytes)).slice(-10000); }); child.stderr?.on("data", bytes => { log = (log + String(bytes)).slice(-10000); });
        for (let attempt = 0; attempt < 60; attempt++) {
          if (child.exitCode !== null) throw new Error(`API exited: ${log}`);
          try { if ((await request("/health")).ok) return; } catch { /* owned startup */ }
          await delay(100);
        }
        throw new Error(`API startup timed out: ${log}`);
      }
      await start();
      expect(await (await request("/health")).json()).toMatchObject({ status: "ok", database: "connected", items: 5 });
      const body = JSON.stringify({ title: "Starter-owned row", content: "Persisted content", status: "draft" });
      expect((await request("/items", { method: "POST", headers: { "Content-Type": "application/json" }, body })).status).toBe(401);
      const headers = { "Content-Type": "application/json", Authorization: "Bearer starter-fixture-credential" };
      const created = await request("/items", { method: "POST", headers, body }); expect(created.status).toBe(201);
      const record = await created.json() as { id: number; title: string; updated_at: string }; expect(record.title).toBe("Starter-owned row");
      await stop(); await start();
      expect(await (await request(`/items/${record.id}`)).json()).toMatchObject({ title: "Starter-owned row" });
      expect(await (await request("/health")).json()).toMatchObject({ items: 6 });
      expect((await request(`/items/${record.id}`, { method: "PATCH", headers, body: JSON.stringify({ title: "Updated starter row" }) })).status).toBe(428);
      const updated = await request(`/items/${record.id}`, { method: "PATCH", headers: { ...headers, "If-Unmodified-Since": record.updated_at }, body: JSON.stringify({ title: "Updated starter row" }) });
      expect(updated.status).toBe(200);
      const changed = await updated.json() as { title: string; updated_at: string }; expect(changed.title).toBe("Updated starter row");
      expect((await request(`/items/${record.id}`, { method: "DELETE", headers: { ...headers, "If-Unmodified-Since": changed.updated_at } })).status).toBe(200);
      expect((await request(`/items/${record.id}`)).status).toBe(404);
    } finally { await stop(); await removeTree(root); }
  }, 30_000);
});
