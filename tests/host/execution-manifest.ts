import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { instanceConfigJsonSchema } from "../../src/config/schema.js";
const manifest: PaperclipPluginManifestV1 = {
  id: "kujolang.paperclip", apiVersion: 1, version: "0.0.0", displayName: "Kujo approval acceptance fixture", author: "Kujolang",
  description: "Development-only fixed-program execution acceptance; never install over a real Kujo plugin.", categories: ["workspace"],
  capabilities: ["issues.read", "projects.read", "project.workspaces.read", "issue.interactions.create", "issue.interactions.read", "database.namespace.read", "database.namespace.write", "database.namespace.migrate"],
  instanceConfigSchema: instanceConfigJsonSchema,
  entrypoints: { worker: "./dist/worker.js" }, database: { namespaceSlug: "kujo_evidence", migrationsDir: "migrations" },
};
export default manifest;
