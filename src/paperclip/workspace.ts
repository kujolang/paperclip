import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type { PluginContext, PluginWorkspace } from "@paperclipai/plugin-sdk";
import { KujoPluginError } from "../runtime/errors.js";
import { captureWorkspaceSnapshot } from "./git.js";

export type WorkspaceReadiness = {
  state: "ready" | "empty" | "missing" | "unavailable";
  message: string;
};

export async function inspectWorkspace(ctx: PluginContext, target: EntityTarget) {
  let workspace: Awaited<ReturnType<typeof resolveWorkspace>>;
  try {
    workspace = await resolveWorkspace(ctx, target);
  } catch (error) {
    if (!(error instanceof KujoPluginError) || error.code !== "KUJO_WORKSPACE_NOT_FOUND") throw error;
    return { workspace: null, readiness: {
      state: "missing", message: "Connect a local project workspace in Paperclip project settings, then check again.",
    } satisfies WorkspaceReadiness };
  }
  try {
    const snapshot = await captureWorkspaceSnapshot(workspace.path);
    const empty = snapshot.head === "unborn" && !snapshot.dirty;
    return { workspace, readiness: {
      state: empty ? "empty" : "ready",
      message: empty ? "This Git workspace is empty. Add a Kujo source file to begin selecting task context."
        : snapshot.dirty ? "Workspace changes are ready to review."
          : "Your workspace is clean. Select context to understand the project before making a change.",
    } satisfies WorkspaceReadiness };
  } catch {
    return { workspace, readiness: {
      state: "unavailable", message: "Git inspection is unavailable. Check that Git is installed and this workspace is a readable Git repository, then check again.",
    } satisfies WorkspaceReadiness };
  }
}

export type EntityTarget = {
  entityType: "issue" | "project";
  entityId: string;
  companyId: string;
};

export async function validateWorkspace(workspace: PluginWorkspace): Promise<PluginWorkspace & { path: string }> {
  const canonical = await realpath(workspace.path).catch(() => null);
  if (!canonical || !(await stat(canonical)).isDirectory()) {
    throw new KujoPluginError("KUJO_WORKSPACE_NOT_FOUND", "Paperclip workspace is not locally available", {
      workspaceId: workspace.id,
    });
  }
  if (!isAbsolute(canonical)) {
    throw new KujoPluginError("KUJO_WORKSPACE_OUTSIDE_ALLOWED_ROOT", "Paperclip returned a non-absolute workspace path");
  }
  return { ...workspace, path: canonical };
}

export async function resolveWorkspace(ctx: PluginContext, target: EntityTarget): Promise<PluginWorkspace & { path: string }> {
  const workspace = target.entityType === "issue"
    ? await ctx.projects.getWorkspaceForIssue(target.entityId, target.companyId)
    : await ctx.projects.getPrimaryWorkspace(target.entityId, target.companyId);
  if (!workspace) {
    throw new KujoPluginError("KUJO_WORKSPACE_NOT_FOUND", `No primary workspace is configured for ${target.entityType}`);
  }
  return await validateWorkspace(workspace);
}

export async function resolveProjectWorkspace(ctx: PluginContext, projectId: string, companyId: string): Promise<PluginWorkspace & { path: string }> {
  const workspace = await ctx.projects.getPrimaryWorkspace(projectId, companyId);
  if (!workspace) throw new KujoPluginError("KUJO_WORKSPACE_NOT_FOUND", "Project has no primary workspace", { projectId });
  return await validateWorkspace(workspace);
}
