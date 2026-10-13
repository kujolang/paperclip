import { capabilityCatalog, applyCapabilityProfile, type CapabilityCatalog } from "../../src/abilities/catalog.js";
import { parsePluginConfig } from "../../src/config/schema.js";
import type { DoctorReport } from "../../src/health/doctor.js";
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
const detailData = parameters.get("state") === "populated"
  ? populatedData
  : { review: null, failure: null, context: null };
window.__KUJO_FIXTURE_DATA__ = {
  ...detailData,
  verificationEnabled: parameters.get("verification") === "1",
  specs: { files: parameters.get("spec") ? ["specs/release.spec.yml"] : [], truncated: false },
  spec: parameters.get("specReport") ? { id: "fixture-spec", path: "specs/release.spec.yml", provenance: { version: "1.0.1" }, stale: false,
    validation: { status: "warnings", native: true, strict: false, errors: [], warnings: ["Unknown field: owner_hint"] },
    contract: { name: "Release review", goal: "Verify the release requirements before publishing.", scope: "The package and its installation workflow",
      criteria: [{ text: "A new user can install the package", status: "not-run" }, { text: "Evidence remains scoped to the company", status: "not-run" }],
      checks: [{ description: "Validate the packaged artifact", checkType: "file_exists", status: "not-run" }],
      nonGoals: ["Deploying the release"], approvalPoints: ["Maintainer reviews release evidence"] },
    scope: "Contract validation only. Acceptance criteria and declared checks have not been executed or proved; approval points are declarations, not granted approvals.",
  } : null,
  history: parameters.get("history") ? ["before", "after"].map((id, index) => ({ id, kind: "language-latest", artifactId: id, storedAt: `2026-10-12 12:0${index}:00+00`, sourceKind: "observed", result: index ? "failed" : "observed", digest: "a".repeat(64), inputDigest: null, definitionDigest: null, parentId: null, payloadBytes: 500 })) : [],
  understanding: parameters.get("map") ? {
    status: "partial", stale: true, provenance: { componentVersion: "1.1.0" },
    fileTree: "# Project File Tree\n- [D] [workspace]\n  - [D] src\n    - [F] api.ts (TypeScript)",
    intelligence: { metrics: { total_files: 12, total_lines: 340, languages: { TypeScript: 12 } },
      dependencies: [{ module: "express", source: "src/api.ts" }], routes: [{ method: "GET", path: "/health", source: "src/api.ts" }],
      security_findings: [{ severity: "medium", label: "Dynamic evaluation", file: "src/api.ts", line: 8 }],
      parse_errors: [{ file: "src/large.ts", error: "truncated_100000b" }] },
    warnings: ["Scout reports heuristic repository observations, not a security certification or proof that tests passed."],
  } : null,
  sources: { files: parameters.get("language") ? ["src/main.kujo"] : [], truncated: false },
  language: parameters.get("language") ? {
    path: "src/main.kujo", runtimeVersion: "1.8.1", check: "failed", lint: "warnings", stale: false,
    scope: "Single-file lex/parse/compile and lint; project tests, imports and runtime behavior are not verified.",
    diagnostics: [{ tool: "check", code: "KUJOPARSE001", severity: "error", message: "Expected closing parenthesis", line: 2, column: 9 }],
  } : null,
  suggestedTask: parameters.get("issueTask") ? "Investigate the OAuth callback" : "",
  workspace: { state: parameters.get("workspace") ?? "ready", message: parameters.get("workspace") === "missing"
    ? "Connect a local project workspace in Paperclip project settings, then check again."
    : parameters.get("workspace") === "empty" ? "This Git workspace is empty. Add a Kujo source file to begin selecting task context."
    : "Your workspace is clean. Select context to understand the project before making a change." },
  readiness: {
    status: parameters.get("runtime") === "broken" ? "error" : "ok",
    runtime: { status: parameters.get("runtime") === "broken" ? "error" : "ok", repair: "Repair the configured Kujo binary in plugin settings." },
    capabilities: {
      language: parameters.get("runtime") === "broken" ? "blocked" : "ready",
      understand: parameters.get("runtime") === "broken" ? "blocked" : "ready",
      examples: parameters.get("runtime") === "broken" ? "blocked" : "ready",
      review: parameters.get("runtime") === "broken" ? "blocked" : "ready",
      context: parameters.get("runtime") === "broken" ? "blocked" : "ready",
      failureEvidence: parameters.get("runtime") === "broken" ? "blocked" : "ready",
    },
  },
};
const fixture = window.__KUJO_FIXTURE_DATA__ as { readiness: DoctorReport; catalog?: CapabilityCatalog; verificationEnabled: boolean };
fixture.readiness.runtime.platform = "linux";
fixture.readiness.runtime.arch = "x64";
fixture.readiness.components = ["scout", "context", "failure-evidence", "changebucket", "patchbrief", "spec"].map((id) => ({ id: id as DoctorReport["components"][number]["id"], version: "1.0.0", integrity: "ok" }));
const fixtureConfig = applyCapabilityProfile(parsePluginConfig({ capabilityProfile: parameters.get("profile") ?? "installed", features: { verification: parameters.get("verification") === "1" } }));
for (const feature of Object.keys(fixture.readiness.capabilities) as Array<keyof DoctorReport["capabilities"]>) if (!fixtureConfig.features[feature === "spec" ? "verification" : feature]) fixture.readiness.capabilities[feature] = "disabled";
fixture.readiness.capabilities.spec = !fixtureConfig.features.verification ? "disabled" : fixture.readiness.runtime.status === "ok" ? "ready" : "blocked";
fixture.verificationEnabled = fixtureConfig.features.verification;
fixture.catalog = capabilityCatalog(fixtureConfig, fixture.readiness, true);
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
const fixtureRoot = createRoot(document.getElementById("root")!);
function renderFixture() { fixtureRoot.render(
  <StrictMode>
    {surface === "task" ? <KujoTaskDetailView {...props} /> : <KujoDetailTab {...props} />}
  </StrictMode>,
);
}
window.__KUJO_NAVIGATE__ = (companyId) => { props.context.companyId = companyId; renderFixture(); };
renderFixture();
