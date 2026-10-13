import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parsePluginConfig } from "../src/config/schema.js";
import { resolveKujo } from "../src/runtime/resolve-kujo.js";
import { copyFenceSnapshot, discoverFenceInventory } from "../src/features/fence/snapshot.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kujo-fence-copy-")); roots.push(root);
  const cwd = join(root, "source"), directory = join(root, "private");
  await mkdir(cwd); await mkdir(directory);
  execFileSync("git", ["init", "--quiet", cwd]);
  const config = parsePluginConfig({ features: { verification: true } });
  const runtime = await resolveKujo(config, directory);
  return { root, cwd, directory, config, runtime };
}
describe("private Fence source snapshots", () => {
  it("copies bounded UTF-8 text and reports oversized/binary/missing files without mutating sources", async () => {
    const input = await fixture();
    await writeFile(join(input.cwd, "fence.json"), "{}");
    await writeFile(join(input.cwd, "code.ts"), "export const answer = 42;\n");
    await writeFile(join(input.cwd, "large.ts"), "x".repeat(65537));
    await writeFile(join(input.cwd, "binary.ts"), Buffer.from([255, 0, 1]));
    await writeFile(join(input.cwd, "missing.ts"), "gone");
    execFileSync("git", ["-C", input.cwd, "add", "."]);
    await rm(join(input.cwd, "missing.ts"));
    const catalog = await discoverFenceInventory(input.cwd);
    const result = await copyFenceSnapshot({ ...input, catalog });
    expect(Object.fromEntries(result.files.map((file) => [file.path, file.status]))).toEqual({ "fence.json": "copied", "code.ts": "copied", "large.ts": "oversize", "binary.ts": "not-text", "missing.ts": "unreadable" });
    expect(await readFile(join(result.workspace, "code.ts"), "utf8")).toBe("export const answer = 42;\n");
    expect(await readFile(join(input.cwd, "code.ts"), "utf8")).toBe("export const answer = 42;\n");
    expect(result.copiedBytes).toBe(28);
    expect(result.files.find((file) => file.path === "code.ts")?.digest).toMatch(/^[a-f0-9]{64}$/);
  }, 30_000);

  it("refuses both inside and outside symlink targets without retaining their contents", async () => {
    const input = await fixture();
    await writeFile(join(input.cwd, ".env"), "PRIVATE_INSIDE");
    await writeFile(join(input.root, "outside.ts"), "PRIVATE_OUTSIDE");
    // Junctions are available without elevated symlink permission on Windows.
    if (process.platform === "win32") {
      await mkdir(join(input.cwd, "inside"));
      await writeFile(join(input.cwd, "inside", "value.ts"), "PRIVATE_INSIDE");
      await symlink(join(input.cwd, "inside"), join(input.cwd, "alias"), "junction");
      await symlink(input.root, join(input.cwd, "outside"), "junction");
    } else {
      await symlink(".env", join(input.cwd, "alias.ts"));
      await symlink("../outside.ts", join(input.cwd, "outside.ts"));
    }
    const paths = process.platform === "win32" ? ["alias/value.ts", "outside/outside.ts"] : ["alias.ts", "outside.ts"];
    const result = await copyFenceSnapshot({ ...input, catalog: { paths, candidates: paths, excludedSensitive: 0, visible: 2, rejected: 0, truncated: false } });
    expect(result.files.every((file) => file.status === "unreadable" && !file.regular)).toBe(true);
    expect(result.copiedBytes).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_INSIDE|PRIVATE_OUTSIDE/);
  }, 30_000);

  it("prioritizes configuration before the 1000-file cap and counts sensitive-path exclusions", async () => {
    const input = await fixture();
    await writeFile(join(input.cwd, "fence.toml"), "version = 1\n");
    await writeFile(join(input.cwd, ".env"), "SECRET");
    for (let i = 0; i < 1001; i++) await writeFile(join(input.cwd, `a-${i}.ts`), "");
    const catalog = await discoverFenceInventory(input.cwd);
    expect(catalog.paths[0]).toBe("fence.toml");
    expect(catalog.candidates).toHaveLength(1000);
    expect(catalog.paths).not.toContain(".env");
    expect(catalog).toMatchObject({ truncated: true, excludedSensitive: 1, rejected: 0, visible: 1003 });
  }, 30_000);
});
