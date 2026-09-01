import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePluginConfig } from "../src/config/schema.js";
import { redactText, truncateMiddle } from "../src/features/failure/redact.js";
import { validateGitRef } from "../src/paperclip/git.js";
import { getContextContent } from "../src/features/context/content.js";
import type { ContextPack } from "../src/features/context/schema.js";
import { executeKujo } from "../src/runtime/execute-kujo.js";
import { resolveKujo } from "../src/runtime/resolve-kujo.js";

describe("configuration and input boundaries", () => {
  it("applies safe defaults and rejects excessive limits", () => {
    expect(parsePluginConfig({}).runtime.allowSystemPathFallback).toBe(true);
    expect(() => parsePluginConfig({ limits: { timeoutMs: 999_999 } })).toThrow();
  });

  it("accepts ordinary refs and rejects option/traversal forms", () => {
    expect(validateGitRef("origin/main")).toBe("origin/main");
    expect(() => validateGitRef("--help")).toThrow(/Invalid git ref/);
    expect(() => validateGitRef("main..secret")).toThrow(/Invalid git ref/);
  });

  it("honors an explicit executable before bundled/PATH resolution", async () => {
    const resolved = await resolveKujo(parsePluginConfig({ runtime: { binary: process.execPath, allowSystemPathFallback: false } }), process.cwd());
    expect(resolved.source).toBe("configured");
    expect(resolved.executable).toBe(process.execPath);
  });
});

describe("process bounds", () => {
  it("terminates output that exceeds the configured cap", async () => {
    await expect(executeKujo({
      executable: process.execPath,
      cwd: process.cwd(),
      args: ["-e", "process.stdout.write('x'.repeat(10000))"],
      timeoutMs: 5_000,
      maxStdoutBytes: 100,
      maxStderrBytes: 100,
    })).rejects.toMatchObject({ code: "KUJO_OUTPUT_LIMIT" });
  });

  it("terminates timed-out processes", async () => {
    await expect(executeKujo({
      executable: process.execPath,
      cwd: process.cwd(),
      args: ["-e", "setInterval(() => {}, 1000)"],
      timeoutMs: 100,
      maxStdoutBytes: 100,
      maxStderrBytes: 100,
    })).rejects.toMatchObject({ code: "KUJO_EXEC_TIMEOUT" });
  });
});

describe("failure evidence defenses", () => {
  it("redacts representative secrets", () => {
    const source = [
      "OPENAI_API_KEY=sk-proj-abcdefgh12345678",
      "Authorization: Bearer abc.def.ghi",
      "postgres://user:password@example.test/db",
      "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
    ].join("\n");
    const result = redactText(source);
    expect(result.count).toBeGreaterThanOrEqual(4);
    expect(result.text).not.toContain("abcdefgh12345678");
    expect(result.text).not.toContain("user:password");
    expect(result.text).not.toContain("PRIVATE KEY-----\nsecret");
  });

  it("preserves both ends when truncating", () => {
    const result = truncateMiddle(`start-${"x".repeat(1000)}-end`, 100);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("start-");
    expect(result.text).toContain("-end");
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(120);
  });
});

describe("Context Pack content boundary", () => {
  it("only reads selected in-workspace non-sensitive files", async () => {
    const root = await mkdtemp(join(tmpdir(), "kujo-context-test-"));
    const outside = await mkdtemp(join(tmpdir(), "kujo-context-outside-"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "safe.ts"), "export const answer = 42;\n");
    await writeFile(join(root, ".env"), "API_KEY=secret\n");
    await writeFile(join(outside, "escape.txt"), "outside\n");
    await symlink(join(outside, "escape.txt"), join(root, "src", "escape.txt"));
    const pack = {
      schemaVersion: 1,
      id: "context_test",
      generatedAt: new Date(0).toISOString(),
      task: "test",
      depth: "focused",
      budget: 16000,
      estimatedTokens: 20,
      files: [
        { path: "src/safe.ts", reason: "source" },
        { path: ".env", reason: "sensitive" },
        { path: "src/escape.txt", reason: "symlink" },
      ],
      ignoredFiles: 0,
      truncated: false,
      exclusions: [],
      workspaceId: "workspace",
      projectId: "project",
      snapshot: { gitRoot: root, branch: "main", head: "abc", dirty: false, fingerprint: "def" },
      stale: false,
      cacheKey: "cache",
      provenance: { pluginVersion: "0.1.0", kujoRuntimeVersion: "1.2.0", componentId: "context", componentVersion: "1.0.0", componentCommit: "a".repeat(40) },
    } satisfies ContextPack;
    const result = await getContextContent({ workspacePath: root, pack, maxTokens: 1000 });
    expect(result.files.map((file) => file.path)).toEqual(["src/safe.ts"]);
  });
});
