import { capabilityCatalog, applyCapabilityProfile, type CapabilityCatalog } from "../../src/abilities/catalog.js";
import { parsePluginConfig } from "../../src/config/schema.js";
import { SHIPCHECK_SCOPE, SHIPCHECK_CHECKS } from "../../src/features/shipcheck/schema.js";
import { CONCORD_SCOPE } from "../../src/features/concord/schema.js";
import { FENCE_SCOPE } from "../../src/features/fence/schema.js";
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
  starters: parameters.get("starters") && ["installed", "build", "full"].includes(parameters.get("profile") ?? "installed") ? [{ id: "script", title: "Local script", description: "Canonical Kujo project", prerequisites: "No credentials required." }, { id: "agent", title: "AI agent project", description: "Repository-owned agent", prerequisites: "Install pinned Kennel dependencies before running." }, { id: "mcp", title: "MCP server", description: "Canonical MCP framework", prerequisites: "Review demo roots and auth before connecting clients." }, { id: "api", title: "SQLite API", description: "Canonical CRUD backend", prerequisites: "Local loopback server; running creates a database and opens a port." }] : [],
  packageFiles: parameters.get("packages") ? { files: parameters.get("packages") === "empty" ? [] : ["kennel.toml"], truncated: false } : undefined,
  packages: parameters.get("packages") === "report" ? { id: "package-fixture", path: "kennel.toml", status: "warnings", stale: true, manifest: { name: "demo", version: "0.1.0", entry: "main.kujo" }, validation: { errors: [], warnings: ["Dependency does not pin a ref/tag/version/commit."] }, dependencies: [{ name: "local", kind: "path", source: "file:../local", requested: "", valid: true, diagnostic: "" }], dependencyCount: 1, lock: { status: "missing", entries: [], count: 0, version: "" }, lockAdmission: "not-git-visible", truncated: false, provenance: { version: "1.1.1" }, scope: "Dependencies, installed bytes, digests and source availability are not verified." } : null,
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
  shipcheck: parameters.get("shipcheck") ? {
    id: "fixture-shipcheck", status: parameters.get("shipcheck") === "warnings" ? "warnings" : "partial", stale: true,
    message: "Review copied-artifact coverage before using the gate.", provenance: { version: "1.0.0" },
    coverage: { copied: 8, gitVisible: 9, truncated: false, rejectedNames: 0, omitted: parameters.get("shipcheck") === "warnings" ? [] : [{ path: "README.md", reason: "oversize" }] },
    report: { project_type: "kujo", summary: { total_checks: 16, passed: 15, failed_errors: 0, warnings: 1, gate_passed: 1 },
      checks: SHIPCHECK_CHECKS.map((name) => name === "license" ? { name, passed: 0, severity: "warning", message: "No LICENSE file found", detail: "Consider adding a LICENSE file" }
        : { name, passed: 1, severity: "info", message: name === "git-repo" ? "Git repository detected" : name === "tests-exist" ? "Test directory found: tests/" : "Readiness signal present", detail: name === "tests-exist" ? "Presence only; no tests executed." : "" }), },
    scope: SHIPCHECK_SCOPE,
  } : null,
  concord: parameters.get("concord") ? {
    id: "fixture-concord", status: parameters.get("concord") === "blocked" ? "blocked" : "partial", stale: true,
    message: "Review coverage before accepting drift leads.", provenance: { version: "1.0.0" },
    issues: parameters.get("concord") === "blocked" ? [{ artifact: "kennel.toml", field: "entry", reason: "Snapshot entry must stay relative." }] : [],
    coverage: { copied: 3, gitVisible: 4, truncated: false, rejectedNames: 0, omitted: [{ path: "docs/large.md", reason: "oversize" }] },
    report: parameters.get("concord") === "blocked" ? null : { summary: { total_findings: 1, highest_severity: "high" }, findings: [{ id: "version-inconsistency", severity: "high", confidence: "high", category: "versions", title: "Version metadata disagrees", summary: "README and package version differ.", source_artifact: "package.json", target_artifact: "README.md", expected: "1.0.0", actual: "9.0.0", suggested_fix: "Align the documented version with the release.", human_review_required: true }] },
    scope: CONCORD_SCOPE,
  } : null,
  fence: parameters.get("fence") ? {
    id: "fixture-fence", status: parameters.get("fence") === "passed" ? "passed" : "partial", stale: true,
    message: "Canonical Fence analysis completed.", threshold: "none", thresholdStatus: "passed", provenance: { version: "1.0.0" },
    diagnostics: [{ severity: "warning", message: "Review the declared policy version." }],
    coverage: { inspected: 2, selected: 3, gitVisible: 4, truncated: false, rejectedNames: 0, omitted: parameters.get("fence") === "passed" ? [] : [{ path: "src/ui/large.ts", reason: "oversize" }] },
    report: { summary: { imports_checked: 1, errors: 1, warnings: 0, ignored_violations: 1 },
      zones: [{ name: "ui", files: 1, errors: 1, warnings: 0 }], skipped_files: [],
      ignored_violations: [{ file: "src/ui/legacy.ts", line: 3, reason: "Migration exception", expires: "2026-11-01" }],
      violations: [{ severity: "error", file: "src/ui/view.ts", line: 1, message: "UI must not depend on core", from_zone: "ui", to_zone: "core", from_owner: "frontend", to_owner: "platform", suggestion: "Depend on the public API." }] },
    scope: FENCE_SCOPE,
  } : null,
  executionHistory: { pending: parameters.get("historyPending") === "1" },
  history: parameters.get("evalHistory") ? ["outcome", ...(parameters.get("evalHistory") === "orphan" ? [] : ["plan"])].map(id => ({ id, kind: id === "plan" ? "evaluation-plan" : "evaluation-result", artifactId: "execution_fixture", storedAt: "2026-10-13 12:00:00+00", sourceKind: "observed", result: id === "plan" ? "requested evaluation; not run" : "evaluation partial · execution succeeded", digest: "a".repeat(64), inputDigest: "b".repeat(64), definitionDigest: "c".repeat(64), parentId: id === "outcome" ? "plan" : null, payloadBytes: 500 })) : parameters.get("history") ? ["before", "after"].map((id, index) => ({ id, kind: "language-latest", artifactId: id, storedAt: `2026-10-12 12:0${index}:00+00`, sourceKind: "observed", result: index ? "failed" : "observed", digest: "a".repeat(64), inputDigest: null, definitionDigest: null, parentId: null, payloadBytes: 500 })) : [],
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
fixture.readiness.components = ["scout", "context", "failure-evidence", "changebucket", "patchbrief", "spec", "fence", "concord", "shipcheck", "eval", "kennel", "crud-api", "mcp"].map((id) => ({ id: id as DoctorReport["components"][number]["id"], version: "1.0.0", integrity: "ok" }));
const fixtureConfig = applyCapabilityProfile(parsePluginConfig({ capabilityProfile: parameters.get("profile") ?? "installed", features: { verification: parameters.get("verification") === "1", execution: parameters.get("execution") === "1", sourceExecution: parameters.get("sourceExecution") === "1", projectCreation: parameters.get("projectCreation") === "1" } }));
for (const feature of Object.keys(fixture.readiness.capabilities) as Array<keyof DoctorReport["capabilities"]>) if (!fixtureConfig.features[feature === "packages" ? "language" : (feature === "spec" || feature === "fence" || feature === "concord" || feature === "shipcheck") ? "verification" : feature]) fixture.readiness.capabilities[feature] = "disabled";
fixture.readiness.capabilities.packages = !fixtureConfig.features.language ? "disabled" : fixture.readiness.runtime.status === "ok" ? "ready" : "blocked";
fixture.readiness.capabilities.spec = !fixtureConfig.features.verification ? "disabled" : fixture.readiness.runtime.status === "ok" ? "ready" : "blocked";
fixture.readiness.capabilities.fence = fixture.readiness.capabilities.spec;
fixture.readiness.capabilities.concord = fixture.readiness.capabilities.spec;
fixture.readiness.capabilities.shipcheck = fixture.readiness.capabilities.spec;
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
