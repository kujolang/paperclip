import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { KujoDetailTab, KujoTaskDetailView } from "../../src/ui/index.js";

const populatedData = {
  review: {
    footprint: {
      filesChanged: 7,
      additions: 142,
      deletions: 18,
      churn: 160,
      riskLevel: "medium",
      signals: [{ id: "auth", severity: "attention", message: "Authentication boundary changed." }],
    },
    suggestedTests: [
      { command: "npm run verify" },
      { command: "npm run test:ui" },
    ],
    stale: false,
  },
  failure: {
    failure: { title: "Hosted verification failed", command: "npm run verify", exitCode: 1 },
    redaction: { redactedCount: 2 },
    evidence: [{ label: "stderr", content: "Expected status 200, received 500", truncated: false }],
  },
  context: {
    task: "Verify the Paperclip integration before release",
    stale: false,
    files: [
      { path: "src/ui/index.tsx", reason: "Owns both registered Paperclip surfaces." },
      { path: "src/worker.ts", reason: "Binds actions to tenant-scoped storage." },
    ],
    estimatedTokens: 1840,
    depth: "focused",
    truncated: false,
  },
};

const parameters = new URLSearchParams(window.location.search);
const surface = parameters.get("surface") ?? "detail";
const entityType = parameters.get("entity") ?? "project";
const theme = parameters.get("theme") ?? "light";
document.documentElement.dataset.theme = theme;
window.__KUJO_FIXTURE_DATA__ = parameters.get("state") === "populated"
  ? populatedData
  : { review: null, failure: null, context: null };
window.__KUJO_ACTIONS__ = [];

const props = {
  context: {
    companyId: "company-fixture",
    companyPrefix: "FIX",
    projectId: "project-fixture",
    userId: "user-fixture",
    entityType,
    entityId: `${entityType}-fixture`,
  },
};
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {surface === "task" ? <KujoTaskDetailView {...props} /> : <KujoDetailTab {...props} />}
  </StrictMode>,
);
