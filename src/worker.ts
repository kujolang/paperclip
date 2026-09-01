import { definePlugin, runWorker, type PluginContext, type ToolRunContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { parsePluginConfig } from "./config/schema.js";
import { contextContentTool, contextTool, failureTool, reviewTool } from "./manifest.js";
import { generateReviewPack } from "./features/review/generate.js";
import type { ReviewPack } from "./features/review/schema.js";
import { captureFailure } from "./features/failure/capture.js";
import type { FailureEvidence } from "./features/failure/schema.js";
import { generateContextPack } from "./features/context/generate.js";
import type { ContextPack } from "./features/context/schema.js";
import { getContextContent } from "./features/context/content.js";
import { resolveProjectWorkspace, resolveWorkspace } from "./paperclip/workspace.js";
import { loadArtifact, saveArtifact, type StateTarget } from "./storage/state.js";
import { doctor } from "./health/doctor.js";
import { normalizeError } from "./runtime/errors.js";

const reviewInput = z.object({
  mode: z.enum(["working_tree", "range"]).default("working_tree"),
  base: z.string().max(255).optional(),
  head: z.string().max(255).optional(),
}).strict();

const failureInput = z.object({
  title: z.string().trim().min(1).max(200),
  command: z.string().max(4_000).optional(),
  exitCode: z.number().int().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  log: z.string().max(200_000).optional(),
  notes: z.string().max(10_000).optional(),
}).strict();

const contextInput = z.object({
  task: z.string().trim().min(1).max(10_000),
  depth: z.enum(["minimal", "focused", "broad"]).default("focused"),
  includeContent: z.boolean().default(false),
}).strict();

const contextContentInput = z.object({
  contextPackId: z.string().min(1).max(100),
  paths: z.array(z.string().max(1_000)).max(100).optional(),
  maxTokens: z.number().int().min(256).max(40_000).default(16_000),
}).strict();

const actionTarget = z.object({
  entityType: z.enum(["project", "issue"]),
  entityId: z.string().min(1),
}).strict();

async function configFor(ctx: PluginContext, companyId: string) {
  return parsePluginConfig(await ctx.config.get(companyId));
}

function compactReview(pack: ReviewPack) {
  return {
    status: "ok",
    riskLevel: pack.footprint.riskLevel,
    filesChanged: pack.footprint.filesChanged,
    churn: pack.footprint.churn,
    signals: pack.footprint.signals.map((signal) => signal.message),
    suggestedTests: pack.suggestedTests.map((item) => item.command),
    reviewPackId: pack.id,
    stale: pack.stale,
  };
}

function compactContext(pack: ContextPack) {
  return {
    status: "ok",
    contextPackId: pack.id,
    selectedFiles: pack.files.length,
    estimatedTokens: pack.estimatedTokens,
    topFiles: pack.files.slice(0, 20).map(({ path, reason }) => ({ path, reason })),
    truncated: pack.truncated,
  };
}

async function reviewForProject(ctx: PluginContext, runCtx: ToolRunContext, params: z.infer<typeof reviewInput>) {
  const config = await configFor(ctx, runCtx.companyId);
  if (!config.features.review) throw new Error("Review Pack is disabled by configuration");
  const workspace = await resolveProjectWorkspace(ctx, runCtx.projectId, runCtx.companyId);
  const pack = await generateReviewPack({
    cwd: workspace.path,
    workspaceId: workspace.id,
    projectId: runCtx.projectId,
    runId: runCtx.runId,
    mode: params.mode,
    ...(params.base ? { base: params.base } : {}),
    ...(params.head ? { head: params.head } : {}),
    config,
  });
  await saveArtifact(ctx, { entityType: "project", entityId: runCtx.projectId }, "review-latest", pack);
  return pack;
}

function registerTools(ctx: PluginContext) {
  ctx.tools.register(reviewTool.name, reviewTool, async (raw, runCtx) => {
    try {
      const pack = await reviewForProject(ctx, runCtx, reviewInput.parse(raw));
      const data = compactReview(pack);
      return { content: JSON.stringify(data), data };
    } catch (error) {
      const normalized = normalizeError(error);
      return { error: normalized.message, data: { code: normalized.code } };
    }
  });

  ctx.tools.register(failureTool.name, failureTool, async (raw, runCtx) => {
    try {
      const params = failureInput.parse(raw);
      const config = await configFor(ctx, runCtx.companyId);
      if (!config.features.failureEvidence) throw new Error("Failure Evidence is disabled by configuration");
      const workspace = await resolveProjectWorkspace(ctx, runCtx.projectId, runCtx.companyId).catch(() => null);
      const evidence = await captureFailure({
        companyId: runCtx.companyId,
        projectId: runCtx.projectId,
        runId: runCtx.runId,
        ...(workspace ? { workspaceId: workspace.id } : {}),
        title: params.title,
        ...(params.command === undefined ? {} : { command: params.command }),
        ...(params.exitCode === undefined ? {} : { exitCode: params.exitCode }),
        ...(params.durationMs === undefined ? {} : { durationMs: params.durationMs }),
        ...(params.log === undefined ? {} : { log: params.log }),
        ...(params.notes === undefined ? {} : { notes: params.notes }),
        config,
      });
      await saveArtifact(ctx, { entityType: "run", entityId: runCtx.runId }, "failure-latest", evidence);
      const data = { status: "ok", failureEvidenceId: evidence.id, redactedCount: evidence.redaction.redactedCount };
      return { content: JSON.stringify(data), data };
    } catch (error) {
      const normalized = normalizeError(error);
      return { error: normalized.message, data: { code: normalized.code } };
    }
  });

  ctx.tools.register(contextTool.name, contextTool, async (raw, runCtx) => {
    try {
      const params = contextInput.parse(raw);
      const config = await configFor(ctx, runCtx.companyId);
      if (!config.features.context) throw new Error("Context Pack is disabled by configuration");
      const workspace = await resolveProjectWorkspace(ctx, runCtx.projectId, runCtx.companyId);
      const pack = await generateContextPack({
        cwd: workspace.path,
        workspaceId: workspace.id,
        projectId: runCtx.projectId,
        task: params.task,
        depth: params.depth,
        config,
      });
      await saveArtifact(ctx, { entityType: "project", entityId: runCtx.projectId }, "context-latest", pack);
      const data = compactContext(pack);
      if (params.includeContent) {
        Object.assign(data, { content: await getContextContent({ workspacePath: workspace.path, pack, maxTokens: pack.budget }) });
      }
      return { content: JSON.stringify(data), data };
    } catch (error) {
      const normalized = normalizeError(error);
      return { error: normalized.message, data: { code: normalized.code } };
    }
  });

  ctx.tools.register(contextContentTool.name, contextContentTool, async (raw, runCtx) => {
    try {
      const params = contextContentInput.parse(raw);
      const pack = await loadArtifact<ContextPack>(ctx, { entityType: "project", entityId: runCtx.projectId }, "context-latest");
      if (!pack || pack.id !== params.contextPackId) throw new Error("Context Pack was not found for this project");
      const workspace = await resolveProjectWorkspace(ctx, runCtx.projectId, runCtx.companyId);
      const data = await getContextContent({
        workspacePath: workspace.path,
        pack,
        ...(params.paths ? { paths: params.paths } : {}),
        maxTokens: params.maxTokens,
      });
      return { content: JSON.stringify(data), data };
    } catch (error) {
      const normalized = normalizeError(error);
      return { error: normalized.message, data: { code: normalized.code } };
    }
  });
}

function registerUiBridge(ctx: PluginContext) {
  ctx.data.register("doctor", async () => await doctor());
  ctx.data.register("detail", async (params) => {
    const target = z.object({ entityType: z.enum(["project", "issue", "run"]), entityId: z.string().min(1) }).parse(params) as StateTarget;
    const [review, failure, context] = await Promise.all([
      loadArtifact<ReviewPack>(ctx, target, "review-latest"),
      loadArtifact<FailureEvidence>(ctx, target, "failure-latest"),
      loadArtifact<ContextPack>(ctx, target, "context-latest"),
    ]);
    return { review, failure, context };
  });

  ctx.actions.register("generate-review", async (params, actionCtx) => {
    if (!actionCtx.companyId) throw new Error("Company context is required");
    const target = actionTarget.parse(params);
    const workspace = await resolveWorkspace(ctx, { ...target, companyId: actionCtx.companyId });
    const config = await configFor(ctx, actionCtx.companyId);
    const pack = await generateReviewPack({
      cwd: workspace.path,
      workspaceId: workspace.id,
      projectId: workspace.projectId,
      ...(target.entityType === "issue" ? { issueId: target.entityId } : {}),
      config,
    });
    await saveArtifact(ctx, target, "review-latest", pack);
    return compactReview(pack);
  });

  ctx.actions.register("generate-context", async (params, actionCtx) => {
    if (!actionCtx.companyId) throw new Error("Company context is required");
    const value = actionTarget.extend({ task: z.string().min(1).max(10_000), depth: z.enum(["minimal", "focused", "broad"]).default("focused") }).parse(params);
    const workspace = await resolveWorkspace(ctx, { entityType: value.entityType, entityId: value.entityId, companyId: actionCtx.companyId });
    const config = await configFor(ctx, actionCtx.companyId);
    const pack = await generateContextPack({ cwd: workspace.path, workspaceId: workspace.id, projectId: workspace.projectId, task: value.task, depth: value.depth, config });
    await saveArtifact(ctx, value, "context-latest", pack);
    return compactContext(pack);
  });

  ctx.actions.register("capture-failure", async (params, actionCtx) => {
    if (!actionCtx.companyId) throw new Error("Company context is required");
    const value = actionTarget.extend({
      title: z.string().trim().min(1).max(200),
      command: z.string().max(4_000).optional(),
      exitCode: z.number().int().optional(),
      log: z.string().max(200_000).optional(),
      notes: z.string().max(10_000).optional(),
    }).parse(params);
    const workspace = await resolveWorkspace(ctx, { entityType: value.entityType, entityId: value.entityId, companyId: actionCtx.companyId });
    const config = await configFor(ctx, actionCtx.companyId);
    const evidence = await captureFailure({
      companyId: actionCtx.companyId,
      projectId: workspace.projectId,
      workspaceId: workspace.id,
      ...(value.entityType === "issue" ? { issueId: value.entityId } : {}),
      title: value.title,
      ...(value.command === undefined ? {} : { command: value.command }),
      ...(value.exitCode === undefined ? {} : { exitCode: value.exitCode }),
      ...(value.log === undefined ? {} : { log: value.log }),
      ...(value.notes === undefined ? {} : { notes: value.notes }),
      config,
    });
    await saveArtifact(ctx, value, "failure-latest", evidence);
    return { status: "ok", failureEvidenceId: evidence.id, redactedCount: evidence.redaction.redactedCount };
  });
}

let health: { status: "ok" | "degraded" | "error"; message: string; details: Record<string, unknown> } = {
  status: "degraded",
  message: "Plugin is starting",
  details: {},
};

const plugin = definePlugin({
  async setup(ctx) {
    registerTools(ctx);
    registerUiBridge(ctx);
    const report = await doctor();
    health = {
      status: report.status === "ok" ? "ok" : "error",
      message: report.status === "ok" ? "Kujo components are ready" : "A bundled component failed integrity verification",
      details: report,
    };
    ctx.logger.info("Kujo plugin initialized", { pluginId: ctx.manifest.id, componentCount: report.components.length, status: report.status });
  },
  async onHealth() { return health; },
  async onValidateConfig(value) {
    try {
      const parsed = parsePluginConfig(value);
      return { ok: true, warnings: parsed.features.verification ? ["Verification is experimental in v0.1."] : [] };
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : "Invalid configuration"] };
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
