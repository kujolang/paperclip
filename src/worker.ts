import { definePlugin, runWorker, type PluginContext, type ToolRunContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { parsePluginConfig } from "./config/schema.js";
import { listEvidenceTool, readEvidenceTool, languageTool, formatTool, understandTool, contextContentTool, contextTool, failureTool, reviewTool } from "./manifest.js";
import { generateReviewPack } from "./features/review/generate.js";
import { reviewPackSchema, type ReviewPack } from "./features/review/schema.js";
import { captureFailure } from "./features/failure/capture.js";
import { failureEvidenceSchema, type FailureEvidence } from "./features/failure/schema.js";
import { generateContextPack } from "./features/context/generate.js";
import { contextPackSchema, type ContextPack } from "./features/context/schema.js";
import { getContextContent } from "./features/context/content.js";
import { inspectWorkspace, resolveProjectWorkspace, resolveWorkspace } from "./paperclip/workspace.js";
import { clearArtifacts, ensureHistory, loadArtifact, saveArtifact, type StateTarget } from "./storage/state.js";
import { listEvidence, getEvidence, exportEvidence, compareEvidence, type ArtifactKind } from "./storage/history.js";
import { doctor } from "./health/doctor.js";
import { normalizeError } from "./runtime/errors.js";
import { terminateActiveKujoProcesses } from "./runtime/execute-kujo.js";
import { isSnapshotCurrent } from "./paperclip/git.js";
import { runBundledExample } from "./features/onboarding/example.js";

import { understandRepository } from "./features/understand/generate.js";
import { understandingSchema } from "./features/understand/schema.js";

import { analyzeSource, previewFormat } from "./features/language/analyze.js";
import { discoverSources, sourcePathSchema } from "./features/language/source.js";
import { languageReportSchema } from "./features/language/schema.js";

const languageInput = z.object({ path: sourcePathSchema }).strict();
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

function actionParams(params: Record<string, unknown>): Record<string, unknown> {
  const { companyId: _companyId, renderEnvironment: _renderEnvironment, ...pluginParams } = params;
  return pluginParams;
}

async function configFor(ctx: PluginContext, companyId: string) {
  return parsePluginConfig(await ctx.config.get(companyId));
}

const historyTarget = z.object({ entityType: z.enum(["project", "issue", "run"]), entityId: z.string().min(1), evidenceId: z.string().min(1).max(100), otherId: z.string().min(1).max(100).optional() }).strict();
function evidenceEnabled(config: ReturnType<typeof parsePluginConfig>, kind: ArtifactKind) {
  const feature = { "review-latest": "review", "context-latest": "context", "failure-latest": "failureEvidence", "understand-latest": "understand", "language-latest": "language" } as const;
  return config.features[feature[kind]];
}

async function audit(ctx: PluginContext, entry: {
  companyId: string;
  operation: string;
  entityType: StateTarget["entityType"];
  entityId: string;
  artifactId: string;
}) {
  await ctx.activity.log({
    companyId: entry.companyId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    message: `Kujo ${entry.operation}`,
    metadata: { operation: entry.operation, artifactId: entry.artifactId },
  }).catch((error) => ctx.logger.warn("Kujo audit event failed", {
    operation: entry.operation,
    message: error instanceof Error ? error.message : String(error),
  }));
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
  await saveArtifact(ctx, { entityType: "project", entityId: runCtx.projectId, companyId: runCtx.companyId }, "review-latest", pack, { inputs: { params, config, snapshot: pack.source }, definition: reviewTool });
  await audit(ctx, { companyId: runCtx.companyId, operation: "review.generated", entityType: "project", entityId: runCtx.projectId, artifactId: pack.id });
  return pack;
}

function registerTools(ctx: PluginContext) {
  for (const tool of [listEvidenceTool, readEvidenceTool]) ctx.tools.register(tool.name, tool, async (params, runCtx) => {
    try {
      const input = z.object({ scope: z.enum(["project", "run"]).default("project"), ...(tool.name === "get-evidence" ? { evidenceId: z.string().min(1).max(100) } : {}) }).strict().parse(params);
      const entityId = input.scope === "run" ? runCtx.runId : runCtx.projectId;
      if (!entityId || !runCtx.companyId) throw new Error("Host project/run and company context are required");
      const target: StateTarget = { companyId: runCtx.companyId, entityType: input.scope, entityId };
      const config = await configFor(ctx, target.companyId);
      await ensureHistory(ctx, target);
      if (tool.name === "list-evidence") {
        const data = { records: (await listEvidence(ctx, target)).filter((record) => evidenceEnabled(config, record.kind)) };
        return { content: JSON.stringify(data), data };
      }
      const record = await getEvidence(ctx, target, z.string().parse(input.evidenceId));
      if (!record || !evidenceEnabled(config, record.receipt.kind)) throw new Error("Evidence is unavailable or its feature is disabled");
      const data = exportEvidence(record), content = JSON.stringify(data);
      if (Buffer.byteLength(content) > 65_536) throw new Error("Evidence exceeds the 64 KiB agent read limit; inspect or download it in the Kujo panel");
      return { content, data };
    } catch (error) { return { error: normalizeError(error).message }; }
  });
  for (const tool of [languageTool, formatTool]) ctx.tools.register(tool.name, tool, async (raw, runCtx) => {
    try {
      const params = languageInput.parse(raw);
      const config = await configFor(ctx, runCtx.companyId);
      const workspace = await resolveProjectWorkspace(ctx, runCtx.projectId, runCtx.companyId);
      const input = { ...params, cwd: workspace.path, projectId: workspace.projectId, workspaceId: workspace.id, config };
      const target = { entityType: "project" as const, entityId: runCtx.projectId, companyId: runCtx.companyId };
      if (tool.name === languageTool.name) {
        const report = await analyzeSource(input);
        await saveArtifact(ctx, target, "language-latest", report, { inputs: { params, config, sourceDigest: report.sourceDigest }, definition: languageTool });
        await audit(ctx, { ...target, operation: "language.checked", artifactId: report.id });
        const { snapshot: _snapshot, ...data } = report;
        return { content: JSON.stringify(data), data };
      }
      const data = await previewFormat(input);
      await audit(ctx, { ...target, operation: "language.format-preview", artifactId: data.sourceDigest });
      return { content: JSON.stringify(data), data };
    } catch (error) {
      const normalized = normalizeError(error);
      return { error: normalized.message, data: { code: normalized.code } };
    }
  });
  ctx.tools.register(understandTool.name, understandTool, async (raw, runCtx) => {
    try {
      z.object({}).strict().parse(raw);
      const config = await configFor(ctx, runCtx.companyId);
      const workspace = await resolveProjectWorkspace(ctx, runCtx.projectId, runCtx.companyId);
      const pack = await understandRepository({ cwd: workspace.path, projectId: workspace.projectId, workspaceId: workspace.id, config });
      await saveArtifact(ctx, { entityType: "project", entityId: runCtx.projectId, companyId: runCtx.companyId }, "understand-latest", pack, { inputs: { config, workspaceId: workspace.id, snapshot: pack.snapshot }, definition: understandTool });
      await audit(ctx, { companyId: runCtx.companyId, operation: "repository.understood", entityType: "project", entityId: runCtx.projectId, artifactId: pack.id });
      // The snapshot is private host evidence; do not expose its absolute Git root.
      const { snapshot: _snapshot, ...data } = pack;
      return { content: JSON.stringify(data), data };
    } catch (error) {
      const normalized = normalizeError(error);
      return { error: normalized.message, data: { code: normalized.code } };
    }
  });
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
      await saveArtifact(ctx, { entityType: "run", entityId: runCtx.runId, companyId: runCtx.companyId }, "failure-latest", evidence, { inputs: { params, config }, definition: failureTool });
      await audit(ctx, { companyId: runCtx.companyId, operation: "failure.generated", entityType: "run", entityId: runCtx.runId, artifactId: evidence.id });
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
      await saveArtifact(ctx, { entityType: "project", entityId: runCtx.projectId, companyId: runCtx.companyId }, "context-latest", pack, { inputs: { task: params.task, depth: params.depth, config, snapshot: pack.snapshot }, definition: contextTool });
      await audit(ctx, { companyId: runCtx.companyId, operation: "context.generated", entityType: "project", entityId: runCtx.projectId, artifactId: pack.id });
      const data = compactContext(pack);
      if (params.includeContent) {
        Object.assign(data, { content: await getContextContent({ workspacePath: workspace.path, pack, maxTokens: pack.budget }) });
        await audit(ctx, { companyId: runCtx.companyId, operation: "context.content-read", entityType: "project", entityId: runCtx.projectId, artifactId: pack.id });
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
      const config = await configFor(ctx, runCtx.companyId);
      if (!config.features.context) throw new Error("Context Pack is disabled by configuration");
      const pack = await loadArtifact(ctx, { entityType: "project", entityId: runCtx.projectId, companyId: runCtx.companyId }, "context-latest", contextPackSchema);
      if (!pack || pack.id !== params.contextPackId) throw new Error("Context Pack was not found for this project");
      const workspace = await resolveProjectWorkspace(ctx, runCtx.projectId, runCtx.companyId);
      if (pack.workspaceId !== workspace.id || !(await isSnapshotCurrent(workspace.path, pack.snapshot))) {
        throw new Error("Context Pack is stale for the current workspace; generate a new pack");
      }
      const data = await getContextContent({
        workspacePath: workspace.path,
        pack,
        ...(params.paths ? { paths: params.paths } : {}),
        maxTokens: params.maxTokens,
      });
      await audit(ctx, { companyId: runCtx.companyId, operation: "context.content-read", entityType: "project", entityId: runCtx.projectId, artifactId: pack.id });
      return { content: JSON.stringify(data), data };
    } catch (error) {
      const normalized = normalizeError(error);
      return { error: normalized.message, data: { code: normalized.code } };
    }
  });
}

function registerUiBridge(ctx: PluginContext) {
  ctx.data.register("doctor", async (params) => {
    const companyId = z.string().min(1).optional().parse(params.companyId);
    return await doctor(companyId ? await configFor(ctx, companyId) : undefined);
  });
  ctx.data.register("detail", async (params) => {
    const target = z.object({
      entityType: z.enum(["project", "issue", "run"]),
      entityId: z.string().min(1),
      companyId: z.string().min(1),
    }).parse(params) as StateTarget;
    const config = await configFor(ctx, target.companyId);
    const inspection = target.entityType === "run"
      ? null
      : await inspectWorkspace(ctx, { entityType: target.entityType, entityId: target.entityId, companyId: target.companyId });
    const workspace = inspection?.workspace;
    const issue = target.entityType === "issue" ? await ctx.issues.get(target.entityId, target.companyId) : null;
    const suggestedTask = issue
      ? `${issue.title}\n\n${issue.description ?? ""}`.trim().slice(0, 10_000)
      : "Understand this repository and identify the best starting points for the next change.";
    const [review, failure, context, understanding, language] = await Promise.all([
      config.features.review ? loadArtifact(ctx, target, "review-latest", reviewPackSchema) : null,
      config.features.failureEvidence ? loadArtifact(ctx, target, "failure-latest", failureEvidenceSchema) : null,
      config.features.context ? loadArtifact(ctx, target, "context-latest", contextPackSchema) : null,
      config.features.understand ? loadArtifact(ctx, target, "understand-latest", understandingSchema) : null,
      config.features.language ? loadArtifact(ctx, target, "language-latest", languageReportSchema) : null,
    ]);
    const ownedReview = review && (
      (target.entityType === "project" && review.projectId === target.entityId) ||
      (target.entityType === "issue" && review.issueId === target.entityId)
    ) ? review : null;
    const ownedFailure = failure && failure.context.companyId === target.companyId && (
      (target.entityType === "project" && failure.context.projectId === target.entityId) ||
      (target.entityType === "issue" && failure.context.issueId === target.entityId) ||
      (target.entityType === "run" && failure.context.runId === target.entityId)
    ) ? failure : null;
    const ownedContext = context && workspace && context.projectId === workspace.projectId && context.workspaceId === workspace.id
      ? context
      : null;
    const ownedUnderstanding = understanding && workspace && understanding.projectId === workspace.projectId && understanding.workspaceId === workspace.id
      ? { ...understanding, stale: understanding.stale || !(await isSnapshotCurrent(workspace.path, understanding.snapshot)) } : null;
    const ownedLanguage = language && workspace && language.projectId === workspace.projectId && language.workspaceId === workspace.id
      ? { ...language, stale: language.stale || !(await isSnapshotCurrent(workspace.path, language.snapshot)) } : null;
    const sources = config.features.language && workspace ? await discoverSources(workspace.path).catch(() => ({ files: [], truncated: false })) : { files: [], truncated: false };
    await ensureHistory(ctx, target);
    const history = (await listEvidence(ctx, target)).filter((record) => evidenceEnabled(config, record.kind));
    return { history, language: ownedLanguage, sources, understanding: ownedUnderstanding, review: ownedReview, failure: ownedFailure, context: ownedContext, readiness: await doctor(config), workspace: inspection?.readiness, suggestedTask };
  });

  for (const operation of ["check-kujo-source", "preview-kujo-format"]) ctx.actions.register(operation, async (params, actionCtx) => {
    if (!actionCtx.companyId) throw new Error("Company context is required");
    const value = actionTarget.extend({ path: sourcePathSchema }).parse(actionParams(params));
    const target = { entityType: value.entityType, entityId: value.entityId, companyId: actionCtx.companyId };
    const config = await configFor(ctx, target.companyId);
    const workspace = await resolveWorkspace(ctx, target);
    const input = { cwd: workspace.path, projectId: workspace.projectId, workspaceId: workspace.id, path: value.path, config };
    if (operation === "check-kujo-source") {
      const report = await analyzeSource(input);
      await saveArtifact(ctx, target, "language-latest", report, { inputs: { params: value, config, sourceDigest: report.sourceDigest }, definition: languageTool });
      await audit(ctx, { ...target, operation: "language.checked", artifactId: report.id });
      return { check: report.check, lint: report.lint, reportId: report.id };
    }
    const preview = await previewFormat(input);
    await audit(ctx, { ...target, operation: "language.format-preview", artifactId: preview.sourceDigest });
    return preview;
  });

  ctx.actions.register("understand-repository", async (params, actionCtx) => {
    if (!actionCtx.companyId) throw new Error("Company context is required");
    const target = actionTarget.parse(actionParams(params));
    const config = await configFor(ctx, actionCtx.companyId);
    const workspace = await resolveWorkspace(ctx, { ...target, companyId: actionCtx.companyId });
    const pack = await understandRepository({ cwd: workspace.path, projectId: workspace.projectId, workspaceId: workspace.id,
      ...(target.entityType === "issue" ? { issueId: target.entityId } : {}), config });
    await saveArtifact(ctx, { ...target, companyId: actionCtx.companyId }, "understand-latest", pack, { inputs: { config, workspaceId: workspace.id, snapshot: pack.snapshot }, definition: understandTool });
    await audit(ctx, { companyId: actionCtx.companyId, operation: "repository.understood", ...target, artifactId: pack.id });
    return { status: pack.status, understandingId: pack.id };
  });

  ctx.actions.register("run-example", async (params, actionCtx) => {
    if (!actionCtx.companyId) throw new Error("Company context is required");
    z.object({}).strict().parse(actionParams(params));
    const result = await runBundledExample(await configFor(ctx, actionCtx.companyId));
    await ctx.activity.log({ companyId: actionCtx.companyId, message: "Kujo bundled example checked and executed", metadata: { operation: "example.executed", runtimeVersion: result.runtimeVersion } });
    return result;
  });

  ctx.actions.register("generate-review", async (params, actionCtx) => {
    if (!actionCtx.companyId) throw new Error("Company context is required");
    const target = actionTarget.parse(actionParams(params));
    const config = await configFor(ctx, actionCtx.companyId);
    if (!config.features.review) throw new Error("Review Pack is disabled by configuration");
    const workspace = await resolveWorkspace(ctx, { ...target, companyId: actionCtx.companyId });
    const pack = await generateReviewPack({
      cwd: workspace.path,
      workspaceId: workspace.id,
      projectId: workspace.projectId,
      ...(target.entityType === "issue" ? { issueId: target.entityId } : {}),
      config,
    });
    await saveArtifact(ctx, { ...target, companyId: actionCtx.companyId }, "review-latest", pack, { inputs: { params: target, config, snapshot: pack.source }, definition: reviewTool });
    await audit(ctx, { companyId: actionCtx.companyId, operation: "review.generated", entityType: target.entityType, entityId: target.entityId, artifactId: pack.id });
    return compactReview(pack);
  });

  ctx.actions.register("generate-context", async (params, actionCtx) => {
    if (!actionCtx.companyId) throw new Error("Company context is required");
    const value = actionTarget.extend({ task: z.string().min(1).max(10_000), depth: z.enum(["minimal", "focused", "broad"]).default("focused") }).parse(actionParams(params));
    const config = await configFor(ctx, actionCtx.companyId);
    if (!config.features.context) throw new Error("Context Pack is disabled by configuration");
    const workspace = await resolveWorkspace(ctx, { entityType: value.entityType, entityId: value.entityId, companyId: actionCtx.companyId });
    const pack = await generateContextPack({ cwd: workspace.path, workspaceId: workspace.id, projectId: workspace.projectId, task: value.task, depth: value.depth, config });
    await saveArtifact(ctx, { ...value, companyId: actionCtx.companyId }, "context-latest", pack, { inputs: { task: value.task, depth: value.depth, config, snapshot: pack.snapshot }, definition: contextTool });
    await audit(ctx, { companyId: actionCtx.companyId, operation: "context.generated", entityType: value.entityType, entityId: value.entityId, artifactId: pack.id });
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
    }).parse(actionParams(params));
    const config = await configFor(ctx, actionCtx.companyId);
    if (!config.features.failureEvidence) throw new Error("Failure Evidence is disabled by configuration");
    const workspace = await resolveWorkspace(ctx, { entityType: value.entityType, entityId: value.entityId, companyId: actionCtx.companyId });
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
    await saveArtifact(ctx, { ...value, companyId: actionCtx.companyId }, "failure-latest", evidence, { inputs: { params: value, config }, definition: failureTool });
    await audit(ctx, { companyId: actionCtx.companyId, operation: "failure.generated", entityType: value.entityType, entityId: value.entityId, artifactId: evidence.id });
    return { status: "ok", failureEvidenceId: evidence.id, redactedCount: evidence.redaction.redactedCount };
  });

  for (const operation of ["inspect-evidence", "export-evidence", "compare-evidence", "attach-evidence"]) ctx.actions.register(operation, async (params, actionCtx) => {
    if (!actionCtx.companyId) throw new Error("Company context is required");
    const value = historyTarget.parse(actionParams(params));
    const target = { entityType: value.entityType, entityId: value.entityId, companyId: actionCtx.companyId };
    if (operation === "attach-evidence" && (target.entityType !== "issue" || actionCtx.actor.type !== "user" || !actionCtx.actor.userId || actionCtx.actor.companyId !== target.companyId)) {
      throw new Error("Issue attachment requires an authenticated human in this company");
    }
    const config = await configFor(ctx, target.companyId);
    await ensureHistory(ctx, target);
    const record = await getEvidence(ctx, target, value.evidenceId);
    if (!record || !evidenceEnabled(config, record.receipt.kind)) throw new Error("Evidence is unavailable or its feature is disabled");
    if (operation === "compare-evidence") {
      const other = value.otherId ? await getEvidence(ctx, target, value.otherId) : null;
      if (!other || !evidenceEnabled(config, other.receipt.kind)) throw new Error("Comparison evidence is unavailable or its feature is disabled");
      return compareEvidence(record, other);
    }
    const exported = exportEvidence(record);
    if (operation === "attach-evidence") {
      if (!await ctx.issues.get(target.entityId, target.companyId)) throw new Error("Issue was not found in this company");
      const body = `# Kujo evidence\n\n${exported.notice}\n\n\`\`\`json\n${JSON.stringify(exported, null, 2)}\n\`\`\``;
      if (Buffer.byteLength(body) > 400_000) throw new Error("Evidence is too large for an issue document; download the export instead");
      const document = await ctx.issues.documents.upsert({ companyId: target.companyId, issueId: target.entityId, key: `kujo-${record.receipt.id.slice(-56)}`, title: `Kujo ${record.receipt.kind.replace("-latest", "")} evidence`, format: "markdown", body, changeSummary: "Explicit human attachment of retained Kujo evidence" });
      await audit(ctx, { ...target, operation: "evidence.attached", artifactId: record.receipt.id });
      return { status: "attached", documentId: document.id };
    }
    if (operation === "inspect-evidence") {
      let freshness: "current" | "stale" | "unknown" = "unknown";
      const snapshot = languageReportSchema.shape.snapshot.safeParse(record.payload.snapshot);
      if (target.entityType !== "run" && snapshot.success) {
        const inspection = await inspectWorkspace(ctx, { ...target, entityType: target.entityType }).catch(() => null);
        if (inspection?.workspace) {
          const current = await isSnapshotCurrent(inspection.workspace.path, snapshot.data).catch(() => null);
          freshness = record.payload.stale === true || current === false ? "stale" : current === true ? "current" : "unknown";
        }
      }
      return { ...exported, currentWorkspace: { freshness, checkedAt: new Date().toISOString(), notice: "Current observation; not part of the immutable receipt. Unknown means freshness could not be established." } };
    }
    return exported;
  });

  ctx.actions.register("clear-artifacts", async (params, actionCtx) => {
    if (!actionCtx.companyId) throw new Error("Company context is required");
    const target = actionTarget.parse(actionParams(params));
    await resolveWorkspace(ctx, { ...target, companyId: actionCtx.companyId });
    await clearArtifacts(ctx, { ...target, companyId: actionCtx.companyId });
    await ctx.activity.log({
      companyId: actionCtx.companyId,
      entityType: target.entityType,
      entityId: target.entityId,
      message: "Kujo artifacts cleared",
      metadata: { operation: "artifacts.cleared" },
    });
    return { status: "ok" };
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
    // Startup has no company identity. Company overrides are probed by the
    // scoped Doctor/detail handlers, not borrowed from another tenant.
    const report = await doctor();
    health = {
      status: report.status === "ok" ? "ok" : "error",
      message: report.status === "ok" ? "Kujo runtime and components are ready" : "Kujo runtime or components need attention",
      details: report,
    };
    ctx.logger.info("Kujo plugin initialized", { pluginId: ctx.manifest.id, componentCount: report.components.length, status: report.status });
  },
  async onHealth() { return health; },
  async onShutdown() { await terminateActiveKujoProcesses(); },
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
