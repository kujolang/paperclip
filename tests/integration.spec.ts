import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { generateReviewPack } from "../src/features/review/generate.js";
import { captureFailure } from "../src/features/failure/capture.js";
import { generateContextPack } from "../src/features/context/generate.js";
import { parsePluginConfig } from "../src/config/schema.js";

const execFileAsync = promisify(execFile);
const kujoBinary = process.env.KUJO_INTEGRATION_BINARY
  ? resolve(process.env.KUJO_INTEGRATION_BINARY)
  : resolve(import.meta.dirname, "../../kujo/target/release/kujo");
const config = parsePluginConfig({ runtime: { binary: kujoBinary, allowSystemPathFallback: false }, limits: { timeoutMs: 60_000 } });

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
    expect(pack.componentStatus.footprint).toBe("ok");
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
    expect(pack.files.length).toBeGreaterThan(0);
    expect(pack.estimatedTokens).toBeLessThanOrEqual(pack.budget);
    expect(pack.files.some((file) => file.path.includes("oauth"))).toBe(true);
  }, 90_000);
});
