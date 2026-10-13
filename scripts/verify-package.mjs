import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const npm = process.env.npm_execpath
  ? { executable: process.execPath, prefix: [process.env.npm_execpath] }
  : { executable: "npm", prefix: [] };
const output = execFileSync(npm.executable, [...npm.prefix, "pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" });
const report = JSON.parse(output)[0];
const files = new Set(report.files.map((file) => file.path));
const allowedRoots = ["dist/", "bundled/", "docs/", "examples/", "schemas/", "skills/"];
const allowedFiles = new Set(["CHANGELOG.md", "LICENSE", "README.md", "SECURITY.md", "VERSION", "package.json", "migrations/001_evidence.sql", "migrations/002_execution.sql", "migrations/003_execution_limits.sql", "migrations/004_execution_history.sql"]);
for (const required of [
  "dist/manifest.js",
  "bundled/ability-sources.lock.json",
  "bundled/verification-sources.lock.json",
  "bundled/verification-contract/evaluation-result.schema.json",
  "bundled/ability-contract/index.ts",
  "bundled/ability-catalog/abilities.json",
  "bundled/ability-catalog/profiles.json",
  "dist/worker.js",
  "dist/ui/index.js",
  "migrations/001_evidence.sql",
  "migrations/002_execution.sql",
  "migrations/003_execution_limits.sql", "migrations/004_execution_history.sql",
  "bundled/kujo-components.lock.json",
  "bundled/components/changebucket/changebucket.kujo",
  "bundled/components/patchbrief/patchbrief.kujo",
  "bundled/components/failure-evidence/casefile.kujo",
  "bundled/components/context/scent.kujo",
  "bundled/components/scout/scout.kujo",
  "bundled/components/scout/lib/scout_runtime.kujo",
  "bundled/components/spec/src/validate.kujo",
  "bundled/components/spec/src/convert.kujo",
  "bundled/components/spec/src/common.kujo",
  "bundled/components/spec/schema/spec.schema.json",
  "bundled/components/fence/fence.kujo",
  "bundled/components/fence/src/analyze.kujo",
  "bundled/components/fence/src/resolve.kujo",
  "schemas/fence-analysis.schema.json",
  "bundled/components/concord/src/snapshot.kujo",
  "bundled/components/concord/concord.kujo",
  "schemas/concord-analysis.schema.json",
  "bundled/components/kennel/src/validator.kujo",
  "bundled/components/crud-api/src/server/runtime.kujo",
  "bundled/components/mcp/src/server/runtime.kujo",
  "bundled/components/eval/main.kujo",
  "bundled/components/eval/src/eval_core.kujo",
  "bundled/components/eval/schema/evaluation-result.schema.json",
  "bundled/components/eval/schema/eval-suite.schema.json",
  "bundled/components/shipcheck/shipcheck.kujo",
  "bundled/components/shipcheck/src/git.kujo",
  "bundled/components/shipcheck/schemas/shipcheck-report.schema.json",
  "schemas/spec-validation.schema.json",
  "schemas/repository-understanding.schema.json",
  "examples/first-run.kujo",
  "docs/INSTALLATION.md",
  "docs/USAGE.md",
  "docs/CONFIGURATION.md",
  "SECURITY.md",
  "VERSION",
]) {
  if (!files.has(required)) throw new Error(`npm tarball is missing ${required}`);
}
// Npm omits some names (including .gitignore) even under an allowed files root.
// A source-tree integrity check cannot establish installed-package integrity.
const componentLock = JSON.parse(readFileSync(new URL("../bundled/kujo-components.lock.json", import.meta.url), "utf8"));
for (const component of componentLock.components) {
  for (const relative of component.files) {
    const required = `bundled/components/${component.id}/${relative}`;
    if (!files.has(required)) throw new Error(`npm tarball is missing pinned component file ${required}`);
  }
}
for (const file of files) {
  if (!allowedFiles.has(file) && !allowedRoots.some((root) => file.startsWith(root))) {
    throw new Error(`npm tarball includes unexpected file ${file}`);
  }
}
const worker = readFileSync(new URL("../dist/worker.js", import.meta.url), "utf8");
if (!worker.includes('import("@kujolang/kujo-runtime")')) {
  throw new Error("worker bundle must resolve @kujolang/kujo-runtime from the installed package tree");
}
if (worker.includes("Kujo's platform package")) {
  throw new Error("worker bundle must not inline @kujolang/kujo-runtime");
}
console.log(`Verified npm tarball: ${files.size} files, ${report.size} bytes.`);

if (worker.includes("Isolated approval acceptance fixture")) {
  throw new Error("development approval fixture must not be bundled in the production worker");
}
