import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootFlag = process.argv.indexOf("--local-root");
const sourceRoot = resolve(rootFlag >= 0 ? process.argv[rootFlag + 1] : "..");
const declaration = JSON.parse(await readFile(join(root, "components.sources.json"), "utf8"));
const outputRoot = join(root, "bundled", "components");
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const bundled = [];
for (const component of declaration.components) {
  const sourceDir = resolve(sourceRoot, component.sourceDirectory);
  const expectedPrefix = `${sourceRoot}${sep}`;
  if (!sourceDir.startsWith(expectedPrefix)) throw new Error(`Unsafe source directory: ${sourceDir}`);
  const commit = execFileSync("git", ["-C", sourceDir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (commit !== component.gitCommit) throw new Error(`${component.id}: expected ${component.gitCommit}, found ${commit}`);
  const dirty = execFileSync("git", ["-C", sourceDir, "status", "--porcelain"], { encoding: "utf8" }).trim();
  if (dirty) throw new Error(`${component.id}: source checkout must be clean`);

  const checksums = {};
  for (const relative of component.files) {
    if (relative.startsWith("/") || relative.split(/[\\/]/).includes("..")) throw new Error(`Unsafe component path: ${relative}`);
    const source = join(sourceDir, relative);
    const info = await lstat(source);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error(`${component.id}: unsafe or missing file ${relative}`);
    const target = join(outputRoot, component.id, relative);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { preserveTimestamps: false });
    const bytes = await readFile(target);
    checksums[relative] = createHash("sha256").update(bytes).digest("hex");
  }
  bundled.push({
    id: component.id,
    repository: component.repository,
    gitCommit: component.gitCommit,
    version: component.version,
    license: "MIT",
    entrypoint: component.entrypoint,
    files: component.files,
    checksums,
    outputContracts: component.outputContracts,
  });
}

const lock = {
  schemaVersion: declaration.schemaVersion,
  bundleVersion: declaration.bundleVersion,
  runtime: declaration.runtime,
  components: bundled,
};
await writeFile(join(root, "bundled", "kujo-components.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
console.log(`Bundled ${bundled.length} pinned Kujo components.`);
