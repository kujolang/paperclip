import { lstat, opendir } from "node:fs/promises";
import { join } from "node:path";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import type { ExecutionScope } from "../../execution/contracts.js";
import { openWorkflowStorage } from "../../execution/workflow-storage.js";
import { evidenceDigest } from "../../storage/history.js";
import { dispatchRunIdSchema } from "./native.js";

export const WORKFLOW_FOLDER = "workflow-state";
/** Only the host's operator configuration may choose storage. Paths never leave
 * this service in UI/tool output, and a healthy host folder must still be private. */
export async function resolveWorkflowStorage(ctx: PluginContext, scope: Pick<ExecutionScope, "companyId">) {
  if (process.platform !== "darwin" && process.platform !== "linux") throw new Error("Dispatch workflows require macOS or Linux");
  const installationId = z.uuid().parse(process.env.PAPERCLIP_PLUGIN_ID);
  if (!ctx.localFolders?.status) throw new Error("This Paperclip host does not support company local folders; upgrade the host");
  const folder = await ctx.localFolders.status(scope.companyId, WORKFLOW_FOLDER).catch(() => { throw new Error("Cannot inspect company workflow-state folder; check operator configuration"); });
  if (!folder.configured || !folder.healthy || !folder.writable || folder.access !== "readWrite" || !folder.realPath) {
    throw new Error("Configure the Kujo workflow-state folder in company plugin settings");
  }
  const root = folder.realPath;
  const store = await openWorkflowStorage(root);
  const identity = await lstat(root).catch(() => { throw new Error("Workflow storage changed during inspection"); });
  const storageDigest = evidenceDigest({ installationId, companyId: scope.companyId, root, device: identity.dev, inode: identity.ino });
  return { store, root, installationId, storageDigest };
}

/** Locate the one native run in an exclusively reserved start directory. This
 * is discovery only: canonical inspect remains the state authority. */
export async function discoverOwnedRun(nativeRoot: string) {
  const directory = join(nativeRoot, "runs");
  let stat;
  try { stat = await lstat(directory); }
  catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return null; throw error; }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Workflow run directory is unavailable");
  const handle = await opendir(directory);
  const ids: string[] = [];
  let count = 0;
  for await (const entry of handle) {
    if (++count > 32) throw new Error("Workflow reservation inventory exceeds its limit");
    if (entry.isDirectory() && dispatchRunIdSchema.safeParse(entry.name).success) ids.push(entry.name);
  }
  if (ids.length > 1) throw new Error("Workflow reservation contains ambiguous run identities");
  return ids[0] ?? null;
}

export async function workflowStorageReady(ctx: PluginContext, companyId: string) {
  try { await resolveWorkflowStorage(ctx, { companyId }); return true; }
  catch { return false; }
}
