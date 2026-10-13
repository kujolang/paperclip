import { execFileSync } from "node:child_process";
import { chmod, link, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import { afterEach, describe, expect, it } from "vitest";
import { openWorkflowStorage, type WorkflowStorageBinding } from "../src/execution/workflow-storage.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const binding: WorkflowStorageBinding = { installationId: "installation", companyId: "company", issueId: "issue", executionId: "execution", requestDigest: "a".repeat(64) };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kujo-workflow-storage-")); roots.push(root);
  const storageRoot = join(root, "private"); await mkdir(storageRoot, { mode: 0o700 });
  return { root, storageRoot, store: await openWorkflowStorage(storageRoot) };
}
const posix = process.platform === "darwin" || process.platform === "linux";
describe.skipIf(!posix)("persistent native workflow storage", () => {
  it("survives independent process ownership without reinitializing native state", async () => {
    const f = await fixture();
    const module = join(f.root, "storage.mjs");
    await build({ entryPoints: ["src/execution/workflow-storage.ts"], outfile: module, platform: "node", format: "esm", bundle: true });
    // Each call is a different process; no worker memory authorizes recovery.
    const script = join(f.root, "probe.mjs");
    await writeFile(script, `import {openWorkflowStorage} from './storage.mjs';\nimport {writeFile,readFile} from 'node:fs/promises';\nimport {join} from 'node:path';\nconst s=await openWorkflowStorage(process.argv[2]); const b=JSON.parse(process.argv[3]);\nif(process.argv[4]==='reserve'){const p=await s.reserve(b);await writeFile(join(p.nativeRoot,'canonical-state.json'),'paused');}\nelse{const p=await s.recover(b);process.stdout.write(await readFile(join(p.nativeRoot,'canonical-state.json'),'utf8'));}\n`);
    execFileSync(process.execPath, [script, f.storageRoot, JSON.stringify(binding), "reserve"]);
    expect(execFileSync(process.execPath, [script, f.storageRoot, JSON.stringify(binding), "recover"], { encoding: "utf8" })).toBe("paused");
    await expect(f.store.reserve(binding)).rejects.toMatchObject({ code: "already_reserved" });
  });
  it("admits exactly one concurrent reservation and isolates installation/company/issue identities", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([f.store.reserve(binding), f.store.reserve(binding)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const paths = new Set([(await f.store.recover(binding)).nativeRoot]);
    for (const field of ["installationId", "companyId", "issueId", "executionId"] as const) {
      const other = { ...binding, [field]: "other" };
      await expect(f.store.recover(other)).rejects.toMatchObject({ code: "missing_state" });
      paths.add((await f.store.reserve(other)).nativeRoot);
    }
    expect(paths.size).toBe(5);
    await expect(f.store.recover({ ...binding, requestDigest: "b".repeat(64) })).rejects.toMatchObject({ code: "invalid_binding" });
  });
  it("does not repair partial reservations or recreate missing native state", async () => {
    const f = await fixture(); const p = await f.store.reserve(binding);
    await rm(join(dirname(p.nativeRoot), "owner.json"));
    await expect(f.store.recover(binding)).rejects.toMatchObject({ code: "missing_state" });
    await expect(f.store.reserve(binding)).rejects.toMatchObject({ code: "already_reserved" });
    const b = { ...binding, executionId: "second" }; const q = await f.store.reserve(b);
    await rm(q.nativeRoot, { recursive: true });
    await expect(f.store.recover(b)).rejects.toMatchObject({ code: "missing_state" });
  });
  it("rejects symlinked roots and native directories without touching their targets", async () => {
    const f = await fixture(); const alias = join(f.root, "alias"); await symlink(f.storageRoot, alias);
    await expect(openWorkflowStorage(alias)).rejects.toMatchObject({ code: "unsafe_directory" });
    const p = await f.store.reserve(binding); await rm(p.nativeRoot, { recursive: true });
    const target = join(f.root, "outside"); await mkdir(target, { mode: 0o700 }); await writeFile(join(target, "keep"), "untouched");
    await symlink(target, p.nativeRoot);
    await expect(f.store.recover(binding)).rejects.toMatchObject({ code: "unsafe_directory" });
    expect(await readFile(join(target, "keep"), "utf8")).toBe("untouched");
  });
  it("rejects substituted namespace and ownership marker symlinks", async () => {
    const f = await fixture(); const p = await f.store.reserve(binding);
    const owner = join(dirname(p.nativeRoot), "owner.json"), copy = join(f.root, "owner-copy.json");
    await rename(owner, copy); await symlink(copy, owner);
    await expect(f.store.recover(binding)).rejects.toMatchObject({ code: "storage_unavailable" });
    await rm(owner); await rename(copy, owner);
    const installation = dirname(dirname(p.nativeRoot)), moved = join(f.root, "moved-installation");
    await rename(installation, moved); await symlink(moved, installation);
    await expect(f.store.recover(binding)).rejects.toMatchObject({ code: "unsafe_directory" });
    await expect(f.store.reserve({ ...binding, executionId: "new" })).rejects.toMatchObject({ code: "unsafe_directory" });
  });
  it("rejects root replacement, permissive directories and changed/hardlinked metadata", async () => {
    const f = await fixture(); const p = await f.store.reserve(binding); const owner = join(dirname(p.nativeRoot), "owner.json");
    await link(owner, join(f.root, "linked"));
    await expect(f.store.recover(binding)).rejects.toMatchObject({ code: "invalid_binding" });
    await rm(join(f.root, "linked")); await writeFile(owner, "x".repeat(257));
    await expect(f.store.recover(binding)).rejects.toMatchObject({ code: "invalid_binding" });
    await chmod(p.nativeRoot, 0o755);
    await expect(f.store.recover(binding)).rejects.toMatchObject({ code: "unsafe_directory" });
    await rename(f.storageRoot, join(f.root, "previous")); await mkdir(f.storageRoot, { mode: 0o700 });
    await expect(f.store.recover(binding)).rejects.toMatchObject({ code: "root_changed" });
  });
  it("rejects invalid inputs and returns bounded errors without filesystem details", async () => {
    const f = await fixture();
    await expect(openWorkflowStorage("relative")).rejects.toMatchObject({ code: "invalid_root" });
    await expect(openWorkflowStorage(join(f.root, "missing-private-path"))).rejects.toMatchObject({ message: "Workflow storage: storage_unavailable" });
    await expect(f.store.reserve({ ...binding, requestDigest: "invalid" })).rejects.toMatchObject({ code: "invalid_binding" });
    await chmod(f.storageRoot, 0o755);
    await expect(openWorkflowStorage(f.storageRoot)).rejects.toMatchObject({ code: "unsafe_directory" });
  });
});
it.skipIf(posix)("does not claim POSIX durable runner support on other platforms", async () => {
  await expect(openWorkflowStorage("unused")).rejects.toMatchObject({ code: "unsupported_platform" });
});
