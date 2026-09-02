import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { validateComponentOutput } from "../src/components/validate-output.js";
import { loadComponentLock, resolveComponent } from "../src/components/registry.js";
import { parsePluginConfig } from "../src/config/schema.js";
import { contextPackSchema } from "../src/features/context/schema.js";
import { failureEvidenceSchema } from "../src/features/failure/schema.js";
import { redactText, truncateMiddle } from "../src/features/failure/redact.js";
import { reviewPackSchema } from "../src/features/review/schema.js";
import { captureWorkspaceSnapshot, isSnapshotCurrent, validateGitRef } from "../src/paperclip/git.js";
import { assertBoundedWorkspaceInputs } from "../src/paperclip/workspace-guard.js";
import { executeKujo, terminateActiveKujoProcesses } from "../src/runtime/execute-kujo.js";

const execFileAsync = promisify(execFile);

describe("hostile contract inputs", () => {
  it.each(["", "--upload-pack=x", "../main", "main..secret", "main\\secret", " main", "main\0evil", "a".repeat(256)])(
    "rejects hostile git ref %j",
    (ref) => expect(() => validateGitRef(ref)).toThrow(/Invalid git ref/),
  );

  it("rejects unknown configuration keys and non-finite limits", () => {
    expect(() => parsePluginConfig({ unexpected: true })).toThrow();
    expect(() => parsePluginConfig({ runtime: { binary: "/bin/kujo", injected: true } })).toThrow();
    for (const timeoutMs of [Number.NaN, Number.POSITIVE_INFINITY, 999, 27_001]) {
      expect(() => parsePluginConfig({ limits: { timeoutMs } })).toThrow();
    }
  });

  it("fails closed for malformed or unsupported component output", () => {
    expect(() => validateComponentOutput("changebucket", undefined, { summary: { files_changed: -1 } })).toThrow(/KUJO_COMPONENT_SCHEMA_INVALID/);
    expect(() => validateComponentOutput("context", "pack", { output_dir: "x", estimated_tokens: Infinity, budget: 1, included_files: 0 })).toThrow(/KUJO_COMPONENT_SCHEMA_INVALID/);
    expect(() => validateComponentOutput("patchbrief", "delete-everything", {})).toThrow(/KUJO_COMPONENT_SCHEMA_INVALID/);
  });
});

describe("redaction and byte bounds", () => {
  it("redacts quoted values, current token formats, credentials, and multiline keys", () => {
    const secrets = [
      'PASSWORD="correct horse battery staple"',
      "secret='value with spaces'",
      `GITHUB_TOKEN=ghp_${"a".repeat(36)}`,
      `AWS_ACCESS_KEY_ID=AKIA${"A".repeat(16)}`,
      "Cookie: session=top-secret; theme=dark",
      "mysql://admin:p@ssword@example.test/app",
      "-----BEGIN OPENSSH PRIVATE KEY-----\nprivate material\n-----END OPENSSH PRIVATE KEY-----",
    ].join("\n");
    const result = redactText(secrets);
    expect(result.count).toBeGreaterThanOrEqual(7);
    for (const leaked of ["correct horse", "value with spaces", "ghp_", "AKIA", "session=", "p@ssword", "private material"]) {
      expect(result.text).not.toContain(leaked);
    }
  });

  it.each([1, 8, 64, 100])("never exceeds a %i-byte truncation cap or creates broken UTF-8", (maxBytes) => {
    const result = truncateMiddle(`start-${"😀秘密".repeat(100)}-end`, maxBytes);
    expect(result.truncated).toBe(true);
    expect(result.storedBytes).toBeLessThanOrEqual(maxBytes);
    expect(Buffer.byteLength(result.text)).toBe(result.storedBytes);
    expect(result.text).not.toContain("�");
  });
});

describe("process isolation, concurrency, and termination", () => {
  const processInput = (source: string) => ({
    executable: process.execPath,
    cwd: process.cwd(),
    args: ["-e", source],
    timeoutMs: 10_000,
    maxStdoutBytes: 128,
    maxStderrBytes: 128,
  });

  it("escalates an output-limit termination when a child ignores SIGTERM", async () => {
    const started = performance.now();
    await expect(executeKujo(processInput("process.on('SIGTERM',()=>{});process.stdout.write('x'.repeat(10000));setInterval(()=>{},1000)")))
      .rejects.toMatchObject({ code: "KUJO_OUTPUT_LIMIT" });
    expect(performance.now() - started).toBeLessThan(3_000);
  });

  it("terminates descendants when a bounded operation is stopped", async () => {
    const root = await mkdtemp(join(tmpdir(), "kujo-process-tree-test-"));
    const marker = join(root, "descendant-survived");
    const descendant = `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(marker)}, "alive"), 1500)`;
    const parent = `const {spawn}=require("node:child_process");spawn(process.execPath,["-e",${JSON.stringify(descendant)}],{stdio:"ignore"});process.stdout.write("x".repeat(10000));setInterval(()=>{},1000)`;
    try {
      await expect(executeKujo(processInput(parent))).rejects.toMatchObject({ code: "KUJO_OUTPUT_LIMIT" });
      await new Promise((resolve) => setTimeout(resolve, 1_700));
      await expect(access(marker)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("runs concurrent bounded operations without mixing output", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => executeKujo(processInput(`process.stdout.write('job-${index}')`))));
    expect(results.map((result) => result.stdout)).toEqual(Array.from({ length: 8 }, (_, index) => `job-${index}`));
  });

  it("cancels active native work during shutdown", async () => {
    const running = executeKujo(processInput("process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"));
    const cancelled = expect(running).rejects.toMatchObject({ code: "KUJO_EXEC_CANCELLED" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await terminateActiveKujoProcesses();
    await cancelled;
  });
});

describe("component integrity and stale-state recovery", () => {
  it("pins every component file and entrypoint to its recorded digest", async () => {
    const lock = await loadComponentLock();
    expect(new Set(lock.components.map((component) => component.id)).size).toBe(lock.components.length);
    for (const component of lock.components) {
      expect(component.files).toContain(component.entrypoint);
      expect(Object.keys(component.checksums).sort()).toEqual([...component.files].sort());
      const resolved = await resolveComponent(component.id);
      for (const relative of component.files) {
        const digest = createHash("sha256").update(await readFile(join(resolved.root, relative))).digest("hex");
        expect(digest).toBe(component.checksums[relative]);
      }
    }
  });

  it("detects stale workspace state and recovers after a clean reset", async () => {
    const root = await mkdtemp(join(tmpdir(), "kujo-stale-test-"));
    await execFileAsync("git", ["init", "--quiet", root]);
    await execFileAsync("git", ["-C", root, "config", "user.email", "test@example.test"]);
    await execFileAsync("git", ["-C", root, "config", "user.name", "Kujo Test"]);
    await writeFile(join(root, "tracked.txt"), "original\n");
    await execFileAsync("git", ["-C", root, "add", "."]);
    await execFileAsync("git", ["-C", root, "commit", "--quiet", "-m", "fixture"]);
    const snapshot = await captureWorkspaceSnapshot(root);
    await writeFile(join(root, "tracked.txt"), "changed\n");
    expect(await isSnapshotCurrent(root, snapshot)).toBe(false);
    await writeFile(join(root, "tracked.txt"), "original\n");
    expect(await isSnapshotCurrent(root, snapshot)).toBe(true);
  });
});

describe("hostile workspace containment", () => {
  it("rejects Git-visible files too large for bundled analyzers", async () => {
    const root = await mkdtemp(join(tmpdir(), "kujo-workspace-bound-test-"));
    try {
      await execFileAsync("git", ["init", "--quiet", root]);
      const handle = await open(join(root, "oversized.data"), "w");
      await handle.truncate(25_000_001);
      await handle.close();
      await expect(assertBoundedWorkspaceInputs(root)).rejects.toMatchObject({ code: "KUJO_OUTPUT_LIMIT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("schema compatibility", () => {
  const base = {
    schemaVersion: 1 as const,
    id: "artifact_1",
    generatedAt: new Date(0).toISOString(),
    projectId: "project",
    workspaceId: "workspace",
  };

  it("accepts additive 0.1.x fields while rejecting unknown schema versions", () => {
    const context = {
      ...base, task: "task", depth: "focused", budget: 100, estimatedTokens: 1, files: [], ignoredFiles: 0,
      truncated: false, exclusions: [], snapshot: { gitRoot: "/repo", branch: "main", head: "abc", dirty: false, fingerprint: "def" },
      stale: false, cacheKey: "key", provenance: { pluginVersion: "0.1.0", kujoRuntimeVersion: "1.2.2", componentId: "context", componentVersion: "1", componentCommit: "a".repeat(40) },
      futureOptionalField: { safe: true },
    };
    expect(contextPackSchema.safeParse(context).success).toBe(true);
    expect(contextPackSchema.parse(context)).toMatchObject({ schemaVersion: 1, id: "artifact_1" });
    expect(contextPackSchema.safeParse({ ...context, schemaVersion: 2 }).success).toBe(false);
  });

  it("continues parsing minimal version-one review and failure artifacts", () => {
    expect(reviewPackSchema.safeParse({
      ...base, source: { gitRoot: "/repo", branch: "main", head: "abc", base: "HEAD", dirty: false, fingerprint: "def" },
      footprint: { filesChanged: 0, additions: 0, deletions: 0, churn: 0, riskLevel: "low", files: [], categories: {}, signals: [] },
      suggestedTests: [], componentStatus: { footprint: "ok", summary: "failed", suggestedTests: "failed", handoff: "failed" }, stale: false,
      provenance: { pluginVersion: "0.1.0", kujoRuntimeVersion: "1.2.2", components: [] },
    }).success).toBe(true);
    expect(failureEvidenceSchema.safeParse({
      schemaVersion: 1, id: "failure_1", capturedAt: base.generatedAt, context: { companyId: "company", projectId: "project" },
      failure: { title: "failed" }, environment: [], evidence: [], redaction: { applied: true, rulesVersion: "1", redactedCount: 0 },
      provenance: { pluginVersion: "0.1.0", kujoRuntimeVersion: "1.2.2", componentId: "failure-evidence", componentVersion: "1", componentCommit: "a".repeat(40) },
    }).success).toBe(true);
  });
});
