import { execFileSync } from "node:child_process";

const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" });
const report = JSON.parse(output)[0];
const files = new Set(report.files.map((file) => file.path));
for (const required of [
  "dist/manifest.js",
  "dist/worker.js",
  "dist/ui/index.js",
  "bundled/kujo-components.lock.json",
  "bundled/components/changebucket/changebucket.kujo",
  "bundled/components/patchbrief/patchbrief.kujo",
  "bundled/components/failure-evidence/casefile.kujo",
  "bundled/components/context/scent.kujo",
  "docs/INSTALLATION.md",
  "docs/USAGE.md",
  "docs/CONFIGURATION.md",
  "SECURITY.md",
  "VERSION",
]) {
  if (!files.has(required)) throw new Error(`npm tarball is missing ${required}`);
}
for (const file of files) {
  if (file.startsWith("tests/") || file === "components.sources.json") throw new Error(`npm tarball includes development file ${file}`);
}
console.log(`Verified npm tarball: ${files.size} files, ${report.size} bytes.`);
