import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { instanceConfigJsonSchema } from "./config/schema.js";
import { MINIMUM_HOST_VERSION, PLUGIN_VERSION } from "./config/defaults.js";

export const languageTool = {
  name: "check-kujo-source", displayName: "Check Kujo Source",
  description: "Check and lint one Git-visible .kujo file in the current project. Does not execute source or modify files; results do not verify imports, project tests or runtime behavior.",
  parametersSchema: { type: "object", additionalProperties: false, required: ["path"], properties: { path: { type: "string", minLength: 1, maxLength: 1000, description: "Relative .kujo path from this project's source catalog" } } },
} as const;
export const formatTool = {
  name: "preview-kujo-format", displayName: "Preview Kujo Formatting",
  description: "Explicitly read one Git-visible .kujo source file and return a bounded, redacted original/formatted preview. Does not write files or apply fixes.",
  parametersSchema: languageTool.parametersSchema,
} as const;

export const understandTool = {
  name: "understand-repository",
  displayName: "Understand Repository",
  description: "Map the current project with bounded Scout analysis: structure, languages, dependencies, routes and heuristic observations. Does not modify project files or execute project code. Source content requires a separate Context Pack read.",
  parametersSchema: { type: "object", additionalProperties: false, properties: {} },
} as const;

export const reviewTool = {
  name: "review-changes",
  displayName: "Generate Review Pack",
  description: "Measure and summarize the current project changes without modifying the workspace.",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      mode: { type: "string", enum: ["working_tree", "range"], default: "working_tree" },
      base: { type: "string", maxLength: 255 },
      head: { type: "string", maxLength: 255 },
    },
  },
} as const;

export const failureTool = {
  name: "capture-failure",
  displayName: "Capture Failure Evidence",
  description: "Turn bounded failure text into a redacted, persistent evidence record. This does not execute commands.",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["title"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      command: { type: "string", maxLength: 4000 },
      exitCode: { type: "integer" },
      durationMs: { type: "integer", minimum: 0 },
      log: { type: "string", maxLength: 200000 },
      notes: { type: "string", maxLength: 10000 },
    },
  },
} as const;

export const contextTool = {
  name: "get-context",
  displayName: "Get Context Pack",
  description: "Select bounded, task-relevant files from the current Paperclip project workspace.",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["task"],
    properties: {
      task: { type: "string", minLength: 1, maxLength: 10000 },
      depth: { type: "string", enum: ["minimal", "focused", "broad"], default: "focused" },
      includeContent: { type: "boolean", default: false },
    },
  },
} as const;

export const contextContentTool = {
  name: "get-context-content",
  displayName: "Read Context Pack Content",
  description: "Read safe, redacted content for files already selected by a Context Pack.",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["contextPackId"],
    properties: {
      contextPackId: { type: "string", minLength: 1, maxLength: 100 },
      paths: { type: "array", maxItems: 100, items: { type: "string", maxLength: 1000 } },
      maxTokens: { type: "integer", minimum: 256, maximum: 40000, default: 16000 },
    },
  },
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: "kujolang.paperclip",
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Kujo — Reviewable Agent Work",
  description: "Add scoped context, change review, and reproducible evidence to Paperclip agent workflows.",
  author: "Kujolang",
  categories: ["workspace", "ui"],
  minimumHostVersion: MINIMUM_HOST_VERSION,
  capabilities: [
    "agent.tools.register",
    "projects.read",
    "issues.read",
    "project.workspaces.read",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
    "ui.detailTab.register",
    "skills.managed",
  ],
  entrypoints: { worker: "./dist/worker.js", ui: "./dist/ui" },
  instanceConfigSchema: instanceConfigJsonSchema,
  tools: [languageTool, formatTool, understandTool, reviewTool, failureTool, contextTool, contextContentTool],
  skills: [{
    skillKey: "scoped-repository-context",
    displayName: "Scoped Repository Context",
    description: "Request focused Context Packs before broad repository exploration.",
  }],
  ui: {
    slots: [
      {
        type: "detailTab",
        id: "kujo",
        displayName: "Kujo",
        exportName: "KujoDetailTab",
        entityTypes: ["project", "issue", "run"],
      },
      {
        type: "taskDetailView",
        id: "kujo-task-view",
        displayName: "Kujo",
        exportName: "KujoTaskDetailView",
        entityTypes: ["issue"],
      },
    ],
  },
};

export default manifest;
