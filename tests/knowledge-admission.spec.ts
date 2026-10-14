import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parsePluginConfig } from "../src/config/schema.js";
import { captureKnowledgeFiles, discoverKnowledgeFiles, inspectKnowledgeFreshness } from "../src/features/knowledge/admission.js";
import { ingestKnowledge, knowledgeNamespace } from "../src/features/knowledge/native.js";
const roots: string[] = [];
const config = parsePluginConfig({});
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function workspace() {
  const cwd = await mkdtemp(join(tmpdir(), "knowledge-admission-test-")); roots.push(cwd);
  execFileSync("git", ["init", "--quiet", cwd]);
  await writeFile(join(cwd, ".gitignore"), "ignored.md\n");
  await writeFile(join(cwd, "readme.md"), "# Kujo\nKujo runs local programs.\n");
  await writeFile(join(cwd, "ignored.md"), "not admitted");
  await writeFile(join(cwd, ".env.txt"), "secret");
  return cwd;
}
describe("explicit knowledge input admission", () => {
  it("discovers names only and reads only explicitly selected eligible paths", async () => {
    const cwd = await workspace();
    await writeFile(join(cwd, "oversize.txt"), "x".repeat(65537));
    expect((await discoverKnowledgeFiles(cwd)).files).toEqual(["oversize.txt", "readme.md"]);
    const captured = await captureKnowledgeFiles({ cwd, paths: ["readme.md"], config });
    expect(captured.files.map(file => file.path)).toEqual(["readme.md"]);
    for (const path of ["ignored.md", ".env.txt", "../outside.md", "oversize.txt"]) await expect(captureKnowledgeFiles({ cwd, paths: [path], config })).rejects.toThrow();
    await writeFile(join(cwd, "binary.txt"), Buffer.from([0, 1, 2]));
    await expect(captureKnowledgeFiles({ cwd, paths: ["readme.md", "binary.txt"], config })).rejects.toThrow();
  }, 60_000);

  it.each([false, true])("checks actual content changes (UTF-8 BOM=%s) and reports unavailable instead of current for lost files", async (bom) => {
    const cwd = await workspace();
    if (bom) await writeFile(join(cwd, "readme.md"), "\uFEFF# Kujo\nKujo runs local programs.\n");
    const captured = await captureKnowledgeFiles({ cwd, paths: ["readme.md"], config });
    const retained = await ingestKnowledge({ namespace: knowledgeNamespace("c", "p", "w"), files: captured.files.map(({ path, content }) => ({ path, content })), config });
    expect((await inspectKnowledgeFreshness({ cwd, retained, config })).status).toBe("current");
    // Git remains unborn and dirty in both states, so HEAD/status alone is insufficient.
    await writeFile(join(cwd, "readme.md"), "# Changed\nThe source changed without a commit.\n");
    expect(await inspectKnowledgeFreshness({ cwd, retained, config })).toMatchObject({ status: "changed", changed: ["readme.md"] });
    await rm(join(cwd, "readme.md"));
    expect((await inspectKnowledgeFreshness({ cwd, retained, config })).status).toBe("unavailable");
  }, 60_000);

  it.skipIf(process.platform === "win32")("rejects symlink components rather than reading external content", async () => {
    const cwd = await workspace();
    const outside = await mkdtemp(join(tmpdir(), "knowledge-outside-")); roots.push(outside);
    await writeFile(join(outside, "external.md"), "private outside content");
    await symlink(join(outside, "external.md"), join(cwd, "linked.md"));
    await mkdir(join(cwd, "docs"));
    await symlink(outside, join(cwd, "docs", "outside"));
    await expect(captureKnowledgeFiles({ cwd, paths: ["linked.md"], config })).rejects.toThrow();
    await expect(captureKnowledgeFiles({ cwd, paths: ["docs/outside/external.md"], config })).rejects.toThrow();
  }, 60_000);
});
