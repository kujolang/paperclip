import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const lock = JSON.parse(await readFile(new URL("bundled/verification-sources.lock.json", root), "utf8"));
for (const source of lock.sources) for (const file of source.files) {
  const bytes = await readFile(new URL(file.path, root));
  if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error(`Verification contract checksum mismatch: ${file.path}`);
}
console.log("Verified pinned canonical evaluation-result contract and example.");
