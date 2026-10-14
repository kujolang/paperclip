import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "./helpers/harness.js";
import manifest from "../src/manifest.js";
import { registerKnowledge } from "../src/features/knowledge/service.js";
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "knowledge-public-test-")); roots.push(cwd); execFileSync("git", ["init", "--quiet", cwd]);
  await writeFile(join(cwd, "readme.md"), "# Kujo\nKujo runs local programs and imports modules.\n");
  const h = createTestHarness({ manifest });
  vi.spyOn(h.ctx.projects, "get").mockImplementation(async (id, companyId) => companyId === "company" && id === "project" ? { id, companyId } as never : null);
  vi.spyOn(h.ctx.projects, "getPrimaryWorkspace").mockImplementation(async (_id, companyId) => companyId === "company" ? { id: "workspace", projectId: "project", path: cwd } as never : null);
  registerKnowledge(h.ctx);
  const call = (input: Record<string, unknown>, companyId = "company") => h.executeTool("manage-project-knowledge", input, { companyId, projectId: "project" });
  return { h, cwd, call };
}
describe("public project knowledge journey", () => {
  it("discovers without ingestion, indexes selected files, queries, checks content freshness and deletes", async () => {
    const { call, cwd } = await fixture();
    expect((await call({ operation: "status" })).data).toMatchObject({ index: null });
    expect((await call({ operation: "discover" })).data).toMatchObject({ files: ["readme.md"] });
    expect((await call({ operation: "ingest", paths: ["readme.md"] })).error).toBeTruthy();
    const created = await call({ operation: "ingest", paths: ["readme.md"], revision: null });
    expect(created.error).toBeUndefined();
    const index = (created.data as { index: { revision: string } }).index;
    expect(created.data).not.toHaveProperty("index.index");
    const answer = await call({ operation: "query", revision: index.revision, question: "What does Kujo do?" });
    expect(answer.error).toBeUndefined();
    expect(answer.data).toMatchObject({ answer: { status: "answered", citations: [expect.objectContaining({ path: "readme.md" })] } });
    await writeFile(join(cwd, "readme.md"), "# Changed\nChanged source contents without commit.\n");
    expect((await call({ operation: "freshness", revision: index.revision })).data).toMatchObject({ freshness: { status: "changed" } });
    expect((await call({ operation: "ingest", paths: ["missing.md"], revision: index.revision })).error).toBeTruthy();
    expect((await call({ operation: "status" })).data).toMatchObject({ index: { revision: index.revision } });
    expect((await call({ operation: "delete", revision: index.revision, workspaceId: "workspace" })).data).toEqual({ deleted: true });
    expect((await call({ operation: "query", revision: index.revision, question: "Kujo?" })).error).toBeTruthy();
  }, 60_000);
  it("uses host identity, rejects forged arguments and retains cleanup when disabled", async () => {
    const { h, call } = await fixture();
    expect((await call({ operation: "discover" }, "other")).error).toBeTruthy();
    expect((await call({ operation: "discover", companyId: "company" })).error).toBeTruthy();
    const created = await call({ operation: "ingest", paths: ["readme.md"], revision: null });
    const index = (created.data as { index: { revision: string } }).index;
    vi.spyOn(h.ctx.config, "get").mockResolvedValue({ features: { knowledge: false } });
    expect((await call({ operation: "query", revision: index.revision, question: "Kujo?" })).error).toContain("disabled");
    expect((await call({ operation: "list" })).data).toMatchObject({ enabled: false, indexes: [expect.objectContaining({ revision: index.revision })] });
    expect((await call({ operation: "delete", revision: index.revision, workspaceId: "workspace" })).data).toEqual({ deleted: true });
    await expect(h.performAction("manage-project-knowledge", { entityType: "project", entityId: "project", operation: "status" }, { companyId: "company" })).rejects.toThrow("Authenticated human");
  }, 60_000);
});
