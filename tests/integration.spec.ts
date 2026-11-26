import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { resolveKujoBinary } from "@kujolang/kujo-runtime";
import { generateReviewPack } from "../src/features/review/generate.js";
import { captureFailure } from "../src/features/failure/capture.js";
import { generateContextPack } from "../src/features/context/generate.js";
import { getContextContent } from "../src/features/context/content.js";
import { isSnapshotCurrent } from "../src/paperclip/git.js";
import { prepareContextWorkspace } from "../src/paperclip/workspace-guard.js";
import { parsePluginConfig } from "../src/config/schema.js";

const execFileAsync = promisify(execFile);
const kujoBinary = process.env.KUJO_INTEGRATION_BINARY
  ? resolve(process.env.KUJO_INTEGRATION_BINARY)
  : resolveKujoBinary();
const config = parsePluginConfig({ runtime: { binary: kujoBinary, allowSystemPathFallback: false }, limits: { timeoutMs: 27_000 } });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kujo-paperclip-fixture-"));
  await execFileAsync("git", ["init", "--quiet", root]);
  await execFileAsync("git", ["-C", root, "config", "user.email", "test@example.test"]);
  await execFileAsync("git", ["-C", root, "config", "user.name", "Kujo Test"]);
  await writeFile(join(root, "package.json"), "{\"scripts\":{\"test\":\"vitest\"}}\n");
  await writeFile(join(root, "oauth.ts"), "export function callback() { return 'before'; }\n");
  await execFileAsync("git", ["-C", root, "add", "."]);
  await execFileAsync("git", ["-C", root, "commit", "--quiet", "-m", "fixture"]);
  await writeFile(join(root, "oauth.ts"), "export function callback() { return 'after'; }\n");
  await writeFile(join(root, "oauth.test.ts"), "test('callback', () => {});\n");
  return root;
}

describe("real Kujo component bridge", () => {
  it("generates a Review Pack with canonical tools", async () => {
    const cwd = await fixture();
    const pack = await generateReviewPack({ cwd, workspaceId: "ws", projectId: "project", config });
    expect(pack.footprint.filesChanged).toBe(2);
    expect(pack.componentStatus).toEqual({ footprint: "ok", summary: "ok", suggestedTests: "ok", handoff: "ok" });
    expect(pack.provenance.components.map((item) => item.id)).toContain("changebucket");
  }, 90_000);

  it("captures and defensively redacts failure evidence", async () => {
    const evidence = await captureFailure({
      companyId: "company",
      projectId: "project",
      title: "Test failed",
      command: "npm test",
      exitCode: 1,
      log: "Authorization: Bearer abc.def.ghi\nOPENAI_API_KEY=sk-proj-abcdefgh12345678",
      config,
    });
    expect(evidence.redaction.redactedCount).toBeGreaterThan(0);
    expect(JSON.stringify(evidence)).not.toContain("abcdefgh12345678");
    expect(evidence.provenance.componentId).toBe("failure-evidence");
  }, 90_000);

  it("selects a bounded task-specific Context Pack", async () => {
    const cwd = await fixture();
    const pack = await generateContextPack({ cwd, workspaceId: "ws", projectId: "project", task: "Add OAuth callback handling", depth: "minimal", config });
    expect(pack.provenance.componentId).toBe("context");
    expect(pack.files.length).toBeGreaterThan(0);
    expect(pack.estimatedTokens).toBeLessThanOrEqual(pack.budget);
    expect(pack.files.some((file) => file.path.includes("oauth"))).toBe(true);
    // A private context mirror must not change the dirty source's ctime via
    // hardlinks and invalidate the pack before its separate content read.
    expect(pack.stale).toBe(false);
    expect(await isSnapshotCurrent(cwd, pack.snapshot)).toBe(true);
    const selected = pack.files.find((file) => file.path === "oauth.ts");
    expect(selected).toBeDefined();
    const content = await getContextContent({ workspacePath: cwd, pack, paths: [selected!.path], maxTokens: pack.budget });
    expect(content.files[0]?.content).toContain("'after'");
  }, 90_000);

  it.skipIf(process.platform === "win32")("excludes linked workspace parents from both Context Pack stages", async () => {
    const cwd = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "kujo-paperclip-context-fixture-"));
    try {
      await mkdir(join(cwd, "src"));
      await writeFile(join(cwd, "src", "callback.md"), "A valid project file");
      await execFileAsync("git", ["-C", cwd, "add", "src/callback.md"]);
      const pack = await generateContextPack({ cwd, workspaceId: "ws", projectId: "project", task: "callback", depth: "broad", config });
      expect(pack.files.map((file) => file.path)).toContain("src/callback.md");

      await writeFile(join(outside, "callback.md"), "A distinct fixture outside the workspace");
      await rm(join(cwd, "src"), { recursive: true });
      await symlink(outside, join(cwd, "src"));
      const mirror = await prepareContextWorkspace(cwd, "callback", config);
      try {
        expect(mirror.selectedPaths).not.toContain("src/callback.md");
        await expect(readFile(join(mirror.path, "src", "callback.md"))).rejects.toMatchObject({ code: "ENOENT" });
      } finally { await mirror.cleanup(); }
      await expect(getContextContent({ workspacePath: cwd, pack, paths: ["src/callback.md"], maxTokens: 256, config }))
        .rejects.toMatchObject({ code: "KUJO_WORKSPACE_OUTSIDE_ALLOWED_ROOT" });
    } finally {
      await Promise.all([cwd, outside].map((path) => rm(path, { recursive: true, force: true })));
    }
  }, 90_000);

  it("caps revealed context after redaction without splitting UTF-8", async () => {
    const cwd = await fixture();
    try {
      const pack = await generateContextPack({ cwd, workspaceId: "ws", projectId: "project", task: "oauth", depth: "broad", config });
      expect(pack.files.map(file => file.path)).toContain("oauth.ts");
      await writeFile(join(cwd, "oauth.ts"), "API_KEY=fixture-value\n" + "é😀".repeat(300));
      const result = await getContextContent({ workspacePath: cwd, pack, paths: ["oauth.ts", "oauth.ts"], maxTokens: 256, config });
      expect(result.files).toHaveLength(1);
      expect(result.estimatedTokens).toBeLessThanOrEqual(256);
      expect(result.files[0]?.content).not.toContain("fixture-value");
      expect(result.files[0]?.content).not.toContain("�");
      expect(result.truncated).toBe(true);
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }, 90_000);
});
