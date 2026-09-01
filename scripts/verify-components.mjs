import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(await readFile(join(root, "bundled", "kujo-components.lock.json"), "utf8"));
const ids = new Set();
if (lock.schemaVersion !== 1 || !/^\d+\.\d+\.\d+$/.test(lock.bundleVersion)) throw new Error("Invalid component lock header");
for (const component of lock.components) {
  if (ids.has(component.id)) throw new Error(`Duplicate component id: ${component.id}`);
  ids.add(component.id);
  if (!/^\d+\.\d+\.\d+$/.test(component.version)) throw new Error(`${component.id}: invalid version`);
  if (!/^[a-f0-9]{40}$/.test(component.gitCommit) || component.license !== "MIT") throw new Error(`${component.id}: incomplete provenance`);
  for (const relative of component.files) {
    const filename = join(root, "bundled", "components", component.id, relative);
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${component.id}: invalid file ${relative}`);
    const checksum = createHash("sha256").update(await readFile(filename)).digest("hex");
    if (checksum !== component.checksums[relative]) throw new Error(`${component.id}: checksum mismatch for ${relative}`);
  }
  if (!component.files.includes(component.entrypoint)) throw new Error(`${component.id}: entrypoint missing from file list`);
  for (const contract of component.outputContracts) {
    const bundledSchema = join(root, "bundled", "components", component.id, contract.schema);
    const packageSchema = join(root, contract.schema);
    const schemaInfo = await lstat(bundledSchema).catch(() => lstat(packageSchema).catch(() => null));
    if (!schemaInfo?.isFile()) throw new Error(`${component.id}: missing output schema ${contract.schema}`);
  }
}
console.log(`Verified ${ids.size} components and all checksums.`);
