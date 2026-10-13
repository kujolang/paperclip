import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewStarter } from "../src/features/starters/preview.js";
import { prepareStarterPublication, publicationMarker } from "../src/features/starters/publication.js";
import { parsePluginConfig } from "../src/config/schema.js";
import { resolveKujo } from "../src/runtime/resolve-kujo.js";
import { executeKujo } from "../src/runtime/execute-kujo.js";
import { removeTree } from "../src/runtime/files.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(removeTree)); });
async function fixture(kind: "script" | "agent" | "api" | "mcp" = "script") {
  const root = await mkdtemp(join(tmpdir(), "kujo-starter-write-test-")); roots.push(root);
  const config = parsePluginConfig({}), runtime = await resolveKujo(config, root);
  const preview = await previewStarter({ kind, name: "new-project" }, config);
  const materialized = await prepareStarterPublication(preview, root, runtime);
  return { root, runtime, preview, materialized, run: () => executeKujo({ ...materialized.invocation, timeoutMs: 10000, maxStdoutBytes: 64000, maxStderrBytes: 4096 }) };
}
describe("native starter publication", () => {
  for (const kind of ["script", "agent", "api", "mcp"] as const) it(`publishes exact ${kind} preview bytes without executing generated programs`, async () => {
    const f = await fixture(kind);
    try {
      const output = await f.run(); expect(output.exitCode, output.stderr).toBe(0);
      const result = await f.materialized.collect(output); expect(result.classification).toBe("created");
      expect(result.files).toHaveLength(f.preview.files.length + 1);
      for (const file of f.preview.files) expect(await readFile(join(f.root, f.preview.name, file.path), "utf8")).toBe(file.content);
      expect(JSON.parse(await readFile(join(f.root, f.preview.name, publicationMarker), "utf8")).starterDigest).toBe(f.preview.digest);
      await expect(prepareStarterPublication(f.preview, f.root, f.runtime)).rejects.toThrow(/already exists/);
    } finally { await f.materialized.dispose(); }
  }, 20000);
  it("refuses a destination appearing after preparation and preserves all existing bytes", async () => {
    const f = await fixture();
    try {
      await mkdir(join(f.root, f.preview.name)); await writeFile(join(f.root, f.preview.name, "keep.txt"), "preserve");
      const output = await f.run(), result = await f.materialized.collect(output);
      expect(result).toMatchObject({ classification: "conflict", files: [] });
      expect(await readFile(join(f.root, f.preview.name, "keep.txt"), "utf8")).toBe("preserve");
    } finally { await f.materialized.dispose(); }
  });
  it("rejects symlink destinations and refuses source/digest/path substitution", async () => {
    const f = await fixture();
    try {
      const elsewhere = join(f.root, "elsewhere"); await mkdir(elsewhere);
      await symlink(elsewhere, join(f.root, f.preview.name), process.platform === "win32" ? "junction" : "dir");
      expect((await f.materialized.collect(await f.run())).classification).toBe("conflict");
      await expect(prepareStarterPublication({ ...f.preview, name: "safe", files: [{ ...f.preview.files[0]!, path: "../escape" }] }, f.root, f.runtime)).rejects.toThrow();
      await expect(prepareStarterPublication({ ...f.preview, name: "safe", digest: "0".repeat(64) }, f.root, f.runtime)).rejects.toThrow(/digest/);
      await expect(prepareStarterPublication({ ...f.preview, name: "con" }, f.root, f.runtime)).rejects.toThrow(/reserved/);
    } finally { await f.materialized.dispose(); }
  });
  it("retains explicit partial publication without rollback after a source read fails", async () => {
    const f = await fixture();
    try {
      await rm(join(f.materialized.invocation.cwd, "source", f.preview.files[0]!.path));
      const result = await f.materialized.collect(await f.run());
      expect(result).toMatchObject({ classification: "incomplete", failedPath: f.preview.files[0]!.path });
      expect(result.files.map(file => file.path)).toEqual([publicationMarker]);
      expect(await readFile(join(f.root, f.preview.name, publicationMarker), "utf8")).toContain(f.preview.digest);
    } finally { await f.materialized.dispose(); }
  });
  it("rejects missing or contradictory native publication receipts", async () => {
    const f = await fixture();
    try {
      const output = await f.run();
      await expect(f.materialized.collect({ ...output, stdout: "{}" })).rejects.toThrow();
      await expect(f.materialized.collect({ ...output, exitCode: 1 })).rejects.toThrow(/evidence/);
      const result = JSON.parse(output.stdout); result.files[0].sha256 = "forged";
      await expect(f.materialized.collect({ ...output, stdout: JSON.stringify(result) })).rejects.toThrow(/evidence/);
    } finally { await f.materialized.dispose(); }
  });
});
