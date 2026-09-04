import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const manifest = JSON.parse(read("package.json"));
const version = read("VERSION").trim();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.version === version, `package.json version ${manifest.version} does not match VERSION ${version}`);
assert(read("src/config/defaults.ts").includes(`PLUGIN_VERSION = "${version}"`), "plugin source version is out of sync");
assert(read("README.md").includes(`version-${version}-black`), "README version badge is out of sync");
assert(read("CHANGELOG.md").includes(`## ${version}`), "CHANGELOG is missing the current version");

for (const path of [
  "AGENTS.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "VERSION",
  "docs/README.md",
  "docs/INSTALLATION.md",
  "docs/USAGE.md",
  "docs/CONFIGURATION.md",
  "package-lock.json",
]) {
  assert(existsSync(join(root, path)), `required repository file is missing: ${path}`);
}

for (const name of ["preinstall", "install", "postinstall"]) {
  assert(!(name in (manifest.scripts ?? {})), `package must not define ${name}`);
}

for (const path of ["docs", "SECURITY.md", "VERSION"]) {
  assert(manifest.files.includes(path), `npm files list is missing ${path}`);
}

const markdownFiles = [
  "README.md",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  ...readdirSync(join(root, "docs"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => `docs/${entry.name}`),
];

for (const markdownFile of markdownFiles) {
  const content = read(markdownFile);
  for (const match of content.matchAll(/\bnpm run ([A-Za-z0-9:_-]+)/g)) {
    const script = match[1];
    assert(script in (manifest.scripts ?? {}), `${markdownFile} references unknown npm script ${script}`);
  }
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split("#", 1)[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    const localPath = resolve(root, dirname(markdownFile), decodeURIComponent(target));
    assert(existsSync(localPath), `${markdownFile} links to missing path ${target}`);
  }
}

console.log(`Verified repository conventions for ${manifest.name}@${version}.`);
