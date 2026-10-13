import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
const root = resolve(import.meta.dirname, "..");
const sources = [
  { repository: "https://github.com/kujolang/ability", directory: "ability", commit: "bcbecb49b147023877e83d5f2ea647dfede030b5", files: { "sdk/typescript/index.ts": "bundled/ability-contract/index.ts", "schema/ability.schema.json": "bundled/ability-contract/ability.schema.json", "schema/ability-profile.schema.json": "bundled/ability-contract/ability-profile.schema.json", "LICENSE": "bundled/ability-contract/LICENSE" } },
  { repository: "https://github.com/kujolang/kujo-cmd", directory: "kujo-cmd", commit: "7cedc7758cfd5214ec28c2ba62a20bd5cc3d8988", files: { "catalog/abilities.json": "bundled/ability-catalog/abilities.json", "catalog/profiles.json": "bundled/ability-catalog/profiles.json", "catalog/sources.json": "bundled/ability-catalog/sources.json", "LICENSE": "bundled/ability-catalog/LICENSE" } },
];
const lock = { schemaVersion: 1, sources: [] };
for (const source of sources) {
  const cwd = resolve(root, "..", source.directory);
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  if (git(["status", "--porcelain"]) || git(["rev-parse", "HEAD"]) !== source.commit) throw new Error(`${source.directory} must be clean at ${source.commit}`);
  const files = [];
  for (const [path, destination] of Object.entries(source.files)) {
    const content = execFileSync("git", ["show", `${source.commit}:${path}`], { cwd });
    await mkdir(dirname(resolve(root, destination)), { recursive: true });
    await writeFile(resolve(root, destination), content);
    files.push({ sourcePath: path, path: destination, sha256: createHash("sha256").update(content).digest("hex") });
  }
  lock.sources.push({ repository: source.repository, commit: source.commit, files });
}
await writeFile(resolve(root, "bundled/ability-sources.lock.json"), JSON.stringify(lock, null, 2) + "\n");
console.log("Synced pinned canonical Ability contract and catalog snapshots.");
