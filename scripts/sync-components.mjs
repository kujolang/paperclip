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
const componentFlag = process.argv.indexOf("--component");
const selected = componentFlag >= 0 ? process.argv[componentFlag + 1] : null;
if (componentFlag >= 0 && !declaration.components.some(component => component.id === selected)) throw new Error("Unknown --component selection");
const previous = selected ? JSON.parse(await readFile(join(root, "bundled", "kujo-components.lock.json"), "utf8")) : null;
if (!selected) await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const bundled = [];
for (const component of declaration.components) {
  if (selected && component.id !== selected) {
    const retained = previous.components.find(item => item.id === component.id);
    if (!retained || retained.license !== "MIT" || ["id", "repository", "gitCommit", "version", "entrypoint", "files", "outputContracts"].some(key => JSON.stringify(retained[key]) !== JSON.stringify(component[key]))) throw new Error(`${component.id}: retained declaration differs; sync it explicitly`);
    for (const relative of retained.files) {
      const filename = join(outputRoot, component.id, relative);
      const info = await lstat(filename);
      if (!info.isFile() || info.isSymbolicLink() || createHash("sha256").update(await readFile(filename)).digest("hex") !== retained.checksums[relative]) throw new Error(`${component.id}: retained snapshot failed integrity verification`);
    }
    bundled.push(retained);
    continue;
  }
  const sourceDir = resolve(sourceRoot, component.sourceDirectory);
  const expectedPrefix = `${sourceRoot}${sep}`;
  if (!sourceDir.startsWith(expectedPrefix)) throw new Error(`Unsafe source directory: ${sourceDir}`);
  const commit = execFileSync("git", ["-C", sourceDir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (commit !== component.gitCommit) throw new Error(`${component.id}: expected ${component.gitCommit}, found ${commit}`);
  const dirty = execFileSync("git", ["-C", sourceDir, "status", "--porcelain"], { encoding: "utf8" }).trim();
  if (dirty) throw new Error(`${component.id}: source checkout must be clean`);

  await rm(join(outputRoot, component.id), { recursive: true, force: true });
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
