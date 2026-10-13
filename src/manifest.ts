import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { instanceConfigJsonSchema } from "./config/schema.js";
import { MINIMUM_HOST_VERSION, PLUGIN_VERSION } from "./config/defaults.js";

import { projectedTools } from "./abilities/generated.js";
export { specTool, importVerificationTool, catalogTool, languageTool, formatTool, understandTool, reviewTool, failureTool, contextTool, contextContentTool, listEvidenceTool, readEvidenceTool } from "./abilities/generated.js";

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
    "issue.documents.write",
    "agent.tools.register",
    "projects.read",
    "issues.read",
    "project.workspaces.read",
    "database.namespace.read",
    "database.namespace.write",
    "database.namespace.migrate",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
    "ui.detailTab.register",
    "skills.managed",
  ],
  entrypoints: { worker: "./dist/worker.js", ui: "./dist/ui" },
  database: { namespaceSlug: "kujo_evidence", migrationsDir: "migrations" },
  instanceConfigSchema: instanceConfigJsonSchema,
  tools: projectedTools,
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
