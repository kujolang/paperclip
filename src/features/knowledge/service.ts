import { randomUUID } from "node:crypto";
import { saveArtifact } from "../../storage/state.js";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { knowledgeTool } from "../../abilities/generated.js";
import { projectionReceipt, toolEnabled } from "../../abilities/catalog.js";
import { parsePluginConfig, type PluginConfig } from "../../config/schema.js";
import { resolveWorkspace, type EntityTarget } from "../../paperclip/workspace.js";
import { evidenceDigest } from "../../storage/history.js";
import { captureKnowledgeFiles, discoverKnowledgeFiles, inspectKnowledgeFreshness, knowledgeSelectionSchema } from "./admission.js";
import { ingestKnowledge, queryKnowledge, knowledgeNamespace } from "./native.js";
import { readKnowledge, replaceKnowledge, deleteKnowledge, listKnowledge, knowledgeSummary } from "./store.js";

const revision = z.uuid();
export const knowledgeInput = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("discover") }).strict(),
  z.object({ operation: z.literal("status") }).strict(),
  z.object({ operation: z.literal("list") }).strict(),
  z.object({ operation: z.literal("ingest"), paths: knowledgeSelectionSchema, revision: revision.nullable() }).strict(),
  z.object({ operation: z.literal("query"), revision, question: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ operation: z.literal("freshness"), revision }).strict(),
  z.object({ operation: z.literal("delete"), revision, workspaceId: z.string().min(1).max(200) }).strict(),
]);
export type KnowledgeInput = z.infer<typeof knowledgeInput>;

export function createKnowledgeService(ctx: PluginContext) {
  let active = 0;
  async function admit(target: EntityTarget, allowDisabled = false) {
    const config = parsePluginConfig(await ctx.config.get(target.companyId));
    const enabled = toolEnabled(config, knowledgeTool);
    if (!enabled && !allowDisabled) throw new Error("Knowledge is disabled by company settings or profile");
    const entity = target.entityType === "project" ? await ctx.projects.get(target.entityId, target.companyId) : await ctx.issues.get(target.entityId, target.companyId);
    if (!entity || entity.id !== target.entityId || entity.companyId !== target.companyId) throw new Error("Knowledge project context is unavailable");
    const projectId = target.entityType === "project" ? entity.id : (entity as { projectId?: string | null }).projectId;
    if (!projectId) throw new Error("Knowledge requires a project");
    return { config, enabled, project: { companyId: target.companyId, projectId } };
  }
  return async (target: EntityTarget, raw: unknown) => {
    const input = knowledgeInput.parse(raw);
    const admission = await admit(target, ["list", "status", "delete"].includes(input.operation));
    if (input.operation === "list" || (input.operation === "status" && !admission.enabled)) return { enabled: admission.enabled, indexes: await listKnowledge(ctx, admission.project) };
    if (input.operation === "delete") {
      const known = (await listKnowledge(ctx, admission.project)).find(item => item.workspaceId === input.workspaceId && item.revision === input.revision);
      if (!known) throw new Error("Knowledge index changed or expired; refresh before deleting it");
      return { deleted: await deleteKnowledge(ctx, { ...admission.project, workspaceId: input.workspaceId }, input.revision) };
    }
    const workspace = await resolveWorkspace(ctx, target);
    if (workspace.projectId !== admission.project.projectId) throw new Error("Knowledge workspace does not match its project");
    const scope = { ...admission.project, workspaceId: workspace.id };
    const namespace = knowledgeNamespace(scope.companyId, scope.projectId, scope.workspaceId);
    const current = await readKnowledge(ctx, scope);
    if (input.operation === "status") return { enabled: true, index: current ? knowledgeSummary(current) : null, indexes: await listKnowledge(ctx, admission.project) };
    if (input.operation === "discover") return { ...await discoverKnowledgeFiles(workspace.path), limits: { files: 64, fileBytes: 65_536, totalBytes: 131_072 }, notice: "Names only. Selecting files does not read them; Index selected files explicitly reads and retains their redacted content." };
    if (input.revision !== (current?.revision ?? null)) throw new Error("Knowledge index changed or expired; refresh before continuing");
    if (active >= 2) throw new Error("Knowledge is busy; try again after the current operations finish");
    active++;
    const deadline = Date.now() + Math.min(admission.config.limits.timeoutMs, 27_000);
    function boundedConfig(): PluginConfig {
      const remaining = deadline - Date.now();
      if (remaining < 1000) throw new Error("Knowledge operation exceeded its time budget");
      return { ...admission.config, limits: { ...admission.config.limits, timeoutMs: remaining } };
    }
    async function recheck() {
      const next = await admit(target), nextWorkspace = await resolveWorkspace(ctx, target);
      if (evidenceDigest(next.config) !== evidenceDigest(admission.config) || nextWorkspace.id !== workspace.id || nextWorkspace.path !== workspace.path || nextWorkspace.projectId !== workspace.projectId) throw new Error("Knowledge configuration or workspace changed; refresh before continuing");
    }
    try {
      if (input.operation === "ingest") {
        const captured = await captureKnowledgeFiles({ cwd: workspace.path, paths: input.paths, config: boundedConfig() });
        const retained = await ingestKnowledge({ namespace, files: captured.files.map(({ path, content }) => ({ path, content })), config: boundedConfig() });
        await recheck();
        const stored = await replaceKnowledge(ctx, scope, input.revision, retained);
        return { index: knowledgeSummary(stored), indexes: await listKnowledge(ctx, admission.project), coverage: { selected: captured.files.length, bytes: captured.bytes, eligibleFiles: captured.eligibleFiles, catalogTruncated: captured.catalogTruncated }, notice: "Indexed the selected snapshot only. Current workspace freshness has not been checked." };
      }
      if (!current) throw new Error("Knowledge index is unavailable; ingest selected files first");
      const result = input.operation === "query" ? { answer: await queryKnowledge({ namespace, retained: current.retained, question: input.question, config: boundedConfig() }) }
        : { freshness: await inspectKnowledgeFreshness({ cwd: workspace.path, retained: current.retained, config: boundedConfig() }) };
      await recheck();
      if ((await readKnowledge(ctx, scope))?.revision !== current.revision) throw new Error("Knowledge index changed during the operation; refresh before continuing");
      if ("answer" in result) await saveArtifact(ctx, target, "knowledge-answer", {
        schemaVersion: 1, id: `knowledge_${randomUUID()}`, generatedAt: new Date().toISOString(), projectId: scope.projectId,
        workspaceId: scope.workspaceId, revision: current.revision, answer: result.answer,
        provenance: { component: "rag", commit: current.retained.componentCommit, runtimeVersion: current.retained.runtimeVersion },
      }, { inputs: { corpusDigest: current.retained.corpusDigest, questionDigest: evidenceDigest(input.operation === "query" ? input.question : "") }, definition: knowledgeTool, projection: projectionReceipt(knowledgeTool) });
      return { ...result, revision: current.revision };
    } finally { active--; }
  };
}

export function registerKnowledge(ctx: PluginContext) {
  const execute = createKnowledgeService(ctx);
  const safeError = (error: unknown) => error instanceof Error && /^(?:Knowledge |Selected knowledge |Company knowledge |Private knowledge |Native knowledge )/.test(error.message) ? error.message : "Knowledge operation failed. Check your selected files and refresh status before retrying a write.";
  ctx.actions.register(knowledgeTool.name, async (params, action) => {
    if (!action.companyId || action.actor?.type !== "user" || action.actor.companyId !== action.companyId || !action.actor.userId) throw new Error("Authenticated human company context is required");
    const { entityType, entityId, companyId: _companyId, renderEnvironment: _environment, ...raw } = params;
    const target = z.object({ entityType: z.enum(["project", "issue"]), entityId: z.string().min(1).max(200) }).parse({ entityType, entityId });
    try { return await execute({ ...target, companyId: action.companyId }, raw); } catch (error) { throw new Error(safeError(error)); }
  });
  ctx.tools.register(knowledgeTool.name, knowledgeTool, async (raw, run) => {
    try {
      if (!run.companyId || !run.projectId) throw new Error("Knowledge requires host company and project context");
      const data = await execute({ companyId: run.companyId, entityType: "project", entityId: run.projectId }, raw);
      return { data, content: JSON.stringify(data) };
    } catch (error) { return { error: safeError(error) }; }
  });
}
