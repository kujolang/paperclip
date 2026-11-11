import { describe, expect, it, vi } from "vitest";
import type { Issue, Project, PluginWorkspace } from "@paperclipai/plugin-sdk";
import { createTestHarness } from "./helpers/harness.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { requireReadableEntity, resolveProjectWorkspace, resolveWorkspace } from "../src/paperclip/workspace.js";
import { appendEvidence, listEvidence } from "../src/storage/history.js";

const project = { id: "project", companyId: "company", visibility: "open" } as Project;
const issue = { id: "issue", companyId: "company", projectId: "project", visibility: "open" } as Issue;
const workspace: PluginWorkspace = { id: "workspace", projectId: "project", path: process.cwd(), name: "Fixture", repoUrl: null, repoRef: null, defaultRef: null, isPrimary: true, createdAt: "", updatedAt: "" };
const projectTarget = { companyId: "company", entityType: "project" as const, entityId: "project" };
const issueTarget = { companyId: "company", entityType: "issue" as const, entityId: "issue" };

function harness() {
  const h = createTestHarness({ manifest });
  vi.spyOn(h.ctx.projects, "get").mockImplementation(async (id, company) => id === project.id && company === project.companyId ? project : null);
  vi.spyOn(h.ctx.issues, "get").mockImplementation(async (id, company) => id === issue.id && company === issue.companyId ? issue : null);
  vi.spyOn(h.ctx.projects, "getPrimaryWorkspace").mockResolvedValue(workspace);
  vi.spyOn(h.ctx.projects, "getWorkspaceForIssue").mockResolvedValue(workspace);
  return h;
}

describe("host entity admission before workspace lookup", () => {
  it("admits matching public project and issue entities before resolving their workspaces", async () => {
    const h = harness();
    expect(await requireReadableEntity(h.ctx, projectTarget)).toMatchObject(project);
    expect(await requireReadableEntity(h.ctx, issueTarget)).toMatchObject(issue);
    expect(await resolveProjectWorkspace(h.ctx, "project", "company")).toMatchObject({ id: "workspace", projectId: "project" });
    expect(await resolveWorkspace(h.ctx, issueTarget)).toMatchObject({ id: "workspace", projectId: "project" });
    expect(h.ctx.issues.get).toHaveBeenCalledWith("issue", "company");
    expect(h.ctx.projects.get).toHaveBeenCalledWith("project", "company");
  });

  it.each([
    ["missing", null],
    ["foreign company", { ...project, companyId: "foreign" }],
    ["wrong identity", { ...project, id: "foreign" }],
    ["private", { ...project, visibility: "private" }],
  ])("rejects a %s project before any workspace path is obtained", async (_label, value) => {
    const h = harness();
    vi.mocked(h.ctx.projects.get).mockResolvedValue(value as Project | null);
    await expect(resolveProjectWorkspace(h.ctx, "project", "company")).rejects.toThrow();
    expect(h.ctx.projects.getPrimaryWorkspace).not.toHaveBeenCalled();
    expect(h.ctx.projects.getWorkspaceForIssue).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["foreign company", { ...issue, companyId: "foreign" }],
    ["wrong identity", { ...issue, id: "foreign" }],
    ["private", { ...issue, visibility: "private" }],
  ])("rejects a %s issue even when the host workspace API would return a path", async (_label, value) => {
    const h = harness();
    vi.mocked(h.ctx.issues.get).mockResolvedValue(value as Issue | null);
    await expect(resolveWorkspace(h.ctx, issueTarget)).rejects.toThrow();
    expect(h.ctx.projects.getWorkspaceForIssue).not.toHaveBeenCalled();
    expect(h.ctx.projects.getPrimaryWorkspace).not.toHaveBeenCalled();
  });

  it("rejects workspaces whose project differs from the requested project or issue", async () => {
    const h = harness();
    vi.mocked(h.ctx.projects.getPrimaryWorkspace).mockResolvedValue({ ...workspace, projectId: "foreign" });
    vi.mocked(h.ctx.projects.getWorkspaceForIssue).mockResolvedValue({ ...workspace, projectId: "foreign" });
    await expect(resolveProjectWorkspace(h.ctx, "project", "company")).rejects.toThrow();
    await expect(resolveWorkspace(h.ctx, issueTarget)).rejects.toThrow();
  });

  it("rejects an open issue whose project is private before obtaining its workspace", async () => {
    const h = harness();
    vi.mocked(h.ctx.projects.get).mockResolvedValue({ ...project, visibility: "private" });
    await expect(resolveWorkspace(h.ctx, issueTarget)).rejects.toThrow();
    expect(h.ctx.projects.getWorkspaceForIssue).not.toHaveBeenCalled();
  });
});

describe("retained evidence observes current entity privacy", () => {
  it.each(["issue", "project"] as const)("denies %s evidence export after the entity becomes private", async entityType => {
    const h = harness();
    await plugin.definition.setup(h.ctx);
    const target = entityType === "issue" ? issueTarget : projectTarget;
    await appendEvidence(h.ctx, target, "failure-latest", { id: "previously-public", retained: "private-fixture-content" });
    const [record] = await listEvidence(h.ctx, target);
    expect(record).toBeDefined();
    if (entityType === "issue") vi.mocked(h.ctx.issues.get).mockResolvedValue({ ...issue, visibility: "private" });
    else vi.mocked(h.ctx.projects.get).mockResolvedValue({ ...project, visibility: "private" });
    const human = { companyId: "company", actor: { type: "user" as const, userId: "human", companyId: "company" } };
    for (const key of ["inspect-evidence", "export-evidence"]) {
      await expect(h.performAction(key, { entityType, entityId: target.entityId, evidenceId: record!.id }, human)).rejects.toThrow(/private|unavailable|not found|readable/i);
    }
    expect(h.ctx.projects.getPrimaryWorkspace).not.toHaveBeenCalled();
    expect(h.ctx.projects.getWorkspaceForIssue).not.toHaveBeenCalled();
  });

  it("denies agent project history after the project becomes private", async () => {
    const h = harness();
    await plugin.definition.setup(h.ctx);
    vi.mocked(h.ctx.projects.get).mockResolvedValue({ ...project, visibility: "private" });
    const result = await h.executeTool("list-evidence", { scope: "project" }, { companyId: "company", projectId: "project", runId: "run" });
    expect(result.error).toMatch(/private|unavailable|not found|readable/i);
    expect(result.content).toBeUndefined();
  });

  it.each(["manage-evaluation", "manage-kujo-execution", "manage-kujo-starter", "manage-kujo-workflow"])("denies private-issue recovery through %s even while execution is disabled", async key => {
    const h = harness();
    await plugin.definition.setup(h.ctx);
    vi.mocked(h.ctx.issues.get).mockResolvedValue({ ...issue, visibility: "private" });
    const query = vi.spyOn(h.ctx.db, "query");
    const human = { companyId: "company", actor: { type: "user" as const, userId: "human", companyId: "company" } };
    await expect(h.performAction(key, { issueId: "issue", operation: "list" }, human)).rejects.toThrow(/unavailable|not found/i);
    await expect(h.performAction(key, { issueId: "issue", operation: "cancel", id: "retained-request" }, human)).rejects.toThrow(/unavailable|not found/i);
    expect(query).not.toHaveBeenCalled();
  });

  it("denies issue evidence when its parent project becomes private", async () => {
    const h = harness();
    await plugin.definition.setup(h.ctx);
    vi.mocked(h.ctx.projects.get).mockResolvedValue({ ...project, visibility: "private" });
    const human = { companyId: "company", actor: { type: "user" as const, userId: "human", companyId: "company" } };
    await expect(h.performAction("export-evidence", { entityType: "issue", entityId: "issue", evidenceId: "retained-evidence" }, human)).rejects.toThrow(/unavailable|not found/i);
  });
});
