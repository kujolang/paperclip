import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const npm = process.env.npm_execpath
  ? { executable: process.execPath, prefix: [process.env.npm_execpath] }
  : { executable: "npm", prefix: [] };
const allowedLicenses = new Set(["Apache-2.0", "BSD-3-Clause", "ISC", "MIT", "MPL-2.0"]);
for (const [path, entry] of Object.entries(lock.packages ?? {})) {
  if (!path) continue;
  if (typeof entry.license !== "string" || !allowedLicenses.has(entry.license)) {
    throw new Error(`${path} has an unapproved or missing license: ${entry.license ?? "missing"}`);
  }
  if (path.startsWith("node_modules/") && !entry.integrity && !entry.link) {
    throw new Error(`${path} is missing registry integrity metadata`);
  }
}

execFileSync(npm.executable, [...npm.prefix, "audit", "--audit-level=high"], { stdio: "inherit" });
const sbom = JSON.parse(execFileSync(npm.executable, [...npm.prefix, "sbom", "--sbom-format", "cyclonedx"], { encoding: "utf8" }));
if (sbom.bomFormat !== "CycloneDX" || !Array.isArray(sbom.components) || sbom.components.length === 0) {
  throw new Error("npm did not produce a valid non-empty CycloneDX SBOM");
}
console.log(`Verified ${Object.keys(lock.packages).length - 1} locked packages and ${sbom.components.length} SBOM components.`);
