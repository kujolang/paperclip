import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Core public tools and board actions, using only this harness's disposable state. */
export async function qualifyProductionCore({ call, companyId, projectId, issueId, root, node, checks, json, stop, start, waitUntil }) {
  const target = { entityType: "project", entityId: projectId };
  const action = async (key, params = {}, options = {}) => {
    try {
      return (await call("/plugins/kujolang.paperclip/bridge/action", {
        method: "POST", body: { companyId, key, params: { ...target, ...params } }, ...options,
      })).data;
    } catch (error) { throw new Error(`Core action ${key}: ${error.message}`, { cause: error }); }
  };
  const detail = async (entity = target, options = {}) => (await call("/plugins/kujolang.paperclip/bridge/data", {
    method: "POST", body: { companyId, key: "detail", params: entity }, ...options,
  })).data.data;
  const config = async enabled => call("/plugins/kujolang.paperclip/config", { method: "POST", body: {
    companyId, configJson: { capabilityProfile: "installed", features: { verification: enabled, review: enabled, context: enabled, language: enabled, knowledge: enabled, workflows: enabled } },
  } });
  const files = {
    "README.md": "# Fixture\n\nOAuth callback fixture. Install with npm install. Run npm test.\n",
    "package.json": JSON.stringify({ name: "core-fixture", version: "1.0.0", scripts: { test: "node --version" } }),
    "oauth.ts": "export const callback = 'before';\n",
    "main.kujo": "println(42)\n",
    "kennel.toml": '[package]\nname="core-fixture"\nversion="1.0.0"\n',
    "task.spec.json": JSON.stringify({ name: "Core fixture", goal: "Review callback behavior", acceptance_criteria: ["Callback is reviewed"] }),
    "fence.json": JSON.stringify({ version: 1, source_roots: ["src"], fail_on: "error", scan: { include: ["src/**/*.ts"] }, zones: { ui: { paths: ["src/ui/**"], cannot_depend_on: ["core"] }, core: { paths: ["src/core/**"] } } }),
    "src/ui/view.ts": 'import { value } from "../core/service";\n',
    "src/core/service.ts": "export const value = 42;\n",
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, "workspace", path)), { recursive: true });
    await writeFile(join(root, "workspace", path), content);
  }
  const gitEnv = { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" };
  const git = args => execFileSync("git", ["-C", join(root, "workspace"), ...args], { env: gitEnv, encoding: "utf8" });
  git(["add", "."]);
  git(["-c", "user.name=Acceptance", "-c", "user.email=acceptance@example.test", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Core fixture baseline"]);
  await writeFile(join(root, "workspace/oauth.ts"), "export const callback = 'after';\n");
  await config(true);
  await waitUntil(async () => { try { return (await detail()).catalog.capabilities.find(row => row.tool === "inspect-task-contract")?.enabled; } catch { return false; } });
  const before = git(["status", "--porcelain=v1", "-z"]);
  const review = (await action("generate-review")).data;
  assert.equal(review.status, "ok"); assert.equal(review.filesChanged, 1);
  const context = (await action("generate-context", { task: "Review OAuth callback handling", depth: "minimal" })).data;
  assert.ok(context.selectedFiles > 0); assert.ok(context.topFiles.some(file => file.path === "oauth.ts"));
  const failure = (await action("capture-failure", { title: "Supplied fixture failure", command: "fixture-check", exitCode: 1, log: "Authorization: Bearer abc.def.ghi" })).data;
  assert.equal(failure.status, "ok"); assert.ok(failure.redactedCount > 0);
  const mapped = (await action("understand-repository")).data;
  assert.ok(["complete", "partial"].includes(mapped.status)); assert.ok(mapped.understandingId);
  const checked = (await action("check-kujo-source", { path: "main.kujo" })).data;
  assert.equal(checked.check, "passed");
  const formatted = (await action("preview-kujo-format", { path: "main.kujo" })).data;
  assert.equal(formatted.source, files["main.kujo"]); assert.equal(typeof formatted.formatted, "string");
  const spec = (await action("inspect-task-contract", { path: "task.spec.json" })).data;
  assert.equal(spec.status, "passed");
  const architecture = (await action("inspect-architecture")).data;
  assert.equal(architecture.status, "failed");
  const drift = (await action("inspect-artifact-drift")).data;
  assert.ok(["passed", "warnings", "failed"].includes(drift.status)); assert.ok(drift.reportId);
  const release = (await action("inspect-release-readiness")).data;
  assert.ok(["passed", "warnings", "failed"].includes(release.status)); assert.ok(release.reportId);
  const importedJson = await readFile(new URL("../../bundled/verification-contract/evaluation-result.example.json", import.meta.url), "utf8");
  const imported = (await action("import-verification", { json: importedJson })).data;
  assert.equal(imported.classification, "failed"); assert.equal(imported.executionObserved, false);
  const state = await detail();
  assert.equal(state.spec.contract.criteria[0].status, "not-run");
  assert.equal(state.fence.report.summary.violations, 1);
  assert.equal(state.shipcheck.report.summary.total_checks, 16);
  assert.equal(git(["status", "--porcelain=v1", "-z"]), before);
  for (const [path, content] of Object.entries(files)) if (path !== "oauth.ts") assert.equal(await readFile(join(root, "workspace", path), "utf8"), content);
  checks.push("core board actions execute real pinned review/context/failure/map/language/Spec/Fence/Concord/ShipCheck/import workflows without workspace writes");

  const record = state.history.find(item => item.kind === "failure-latest"); assert.ok(record);
  const exported = (await action("export-evidence", { evidenceId: record.id })).data;
  assert.equal(exported.receipt.kind, "failure-latest"); assert.doesNotMatch(JSON.stringify(exported), /abc\.def\.ghi/);
  await stop(); await start();
  await waitUntil(async () => { try { return (await detail()).history.some(item => item.id === record.id); } catch { return false; } });
  assert.deepEqual((await action("export-evidence", { evidenceId: record.id })).data, exported);
  checks.push("core evidence preserves integrity and redaction across full host/database restart");

  // Plugins are deliberately not members of private issues in current Paperclip.
  const privateIssue = (await call(`/companies/${companyId}/issues`, { method: "POST", status: 201, body: { title: "Private core fixture", projectId, visibility: "private", status: "backlog" } })).data;
  assert.equal(privateIssue.visibility, "private");
  await detail({ entityType: "issue", entityId: issueId });
  const denied = await action("capture-failure", { entityType: "issue", entityId: privateIssue.id, title: "Must not cross privacy boundary" }, { status: 502 });
  assert.match(denied.message, /issue|workspace|not found|unavailable|private/i);
  const deniedImport = await action("import-verification", { entityType: "issue", entityId: privateIssue.id, json: importedJson }, { status: 502 });
  assert.match(deniedImport.message, /issue|not found|unavailable|private/i);
  const privateProject = (await call(`/companies/${companyId}/projects`, { method: "POST", status: 201, body: { name: "Private core project", visibility: "private" } })).data;
  assert.equal(privateProject.visibility, "private");
  await call(`/projects/${privateProject.id}/workspaces`, { method: "POST", status: 201, body: { name: "Private fixture workspace", cwd: join(root, "workspace"), isPrimary: true } });
  const deniedProject = await action("generate-review", { entityType: "project", entityId: privateProject.id }, { status: 502 });
  assert.match(deniedProject.message, /project|not found|unavailable|private/i);
  for (const key of ["manage-evaluation", "manage-kujo-execution", "manage-kujo-starter", "manage-kujo-workflow"]) {
    for (const operation of ["list", "cancel"]) {
      const deniedRecovery = (await call("/plugins/kujolang.paperclip/bridge/action", { method: "POST", status: 502, body: {
        companyId, key, params: { issueId: privateIssue.id, operation, ...(operation === "cancel" ? { id: "retained-request" } : {}) },
      } })).data;
      assert.match(deniedRecovery.message, /not found|unavailable/i, `${key} ${operation} must reject private scope before accessing recovery metadata`);
    }
  }
  await action("generate-context", { task: "", depth: "minimal" }, { status: 502 });
  await action("check-kujo-source", { path: "../main.kujo" }, { status: 502 });
  await action("generate-review", {}, { status: 401, session: "" });
  checks.push("core actions reject invalid input, traversal, unauthenticated access and private issue/project workspace access while open issues remain readable");

  await writeFile(join(root, "core-agent-idle.mjs"), "setTimeout(() => {}, 600000);\n");
  const agent = (await call(`/companies/${companyId}/agents`, { method: "POST", status: 201, body: { name: "Core tool acceptance", role: "ceo", adapterType: "process", adapterConfig: { command: node, args: [join(root, "core-agent-idle.mjs")] } } })).data;
  const key = (await call(`/agents/${agent.id}/keys`, { method: "POST", status: 201, body: { name: "Disposable core key" } })).data;
  const token = key.token || key.key;
  let runId;
  try {
    runId = (await call(`/agents/${agent.id}/heartbeat/invoke`, { method: "POST", status: 202, body: { reason: "core_qualification", idempotencyKey: `core-${agent.id}` } })).data.id;
    assert.ok(runId);
    const agentIssue = (await call(`/companies/${companyId}/issues`, { method: "POST", status: 201, body: { title: "Core tool assignment", projectId, status: "backlog" } })).data;
    await call(`/issues/${agentIssue.id}/checkout`, { method: "POST", token, runId, body: { agentId: agent.id, expectedStatuses: ["backlog"] } });
    const tool = async (name, parameters = {}) => (await call("/plugins/tools/execute", { method: "POST", token, runId, body: { tool: `kujolang.paperclip:${name}`, parameters, runContext: { companyId, projectId, agentId: agent.id, runId } } })).data.result;
    const ok = async (name, parameters = {}) => { const result = await tool(name, parameters); assert.equal(result.error, undefined, `${name}: ${result.error}`); assert.ok(result.data); return result.data; };
    const catalog = await ok("list-capabilities"); assert.equal(catalog.capabilities.length, 21);
    assert.equal((await ok("review-changes")).filesChanged, 1);
    const pack = await ok("get-context", { task: "Review OAuth callback handling", depth: "minimal" });
    const content = await ok("get-context-content", { contextPackId: pack.contextPackId, paths: ["oauth.ts"] });
    assert.equal(content.files.length, 1); assert.equal(content.files[0].content, "export const callback = 'after';\n");
    assert.ok((await tool("get-context-content", { contextPackId: pack.contextPackId, paths: ["../outside"] })).error);
    await writeFile(join(root, "workspace/oauth.ts"), "export const callback = 'changed-after-selection';\n");
    assert.match((await tool("get-context-content", { contextPackId: pack.contextPackId, paths: ["oauth.ts"] })).error, /stale/);
    await writeFile(join(root, "workspace/oauth.ts"), "export const callback = 'after';\n");
    assert.ok((await tool("get-context", { task: "", companyId: "forged" })).error);
    const toolFailure = await ok("capture-failure", { title: "Agent supplied failure", log: "Authorization: Bearer abc.def.ghi" }); assert.ok(toolFailure.redactedCount > 0);
    assert.ok((await ok("understand-repository")).intelligence.metrics.total_files > 0);
    assert.equal((await ok("check-kujo-source", { path: "main.kujo" })).check, "passed");
    assert.equal((await ok("preview-kujo-format", { path: "main.kujo" })).source, files["main.kujo"]);
    assert.equal((await ok("inspect-task-contract", { path: "task.spec.json" })).contract.criteria[0].status, "not-run");
    assert.equal((await ok("inspect-architecture")).report.summary.violations, 1);
    assert.ok((await ok("inspect-artifact-drift")).report);
    assert.equal((await ok("inspect-release-readiness")).report.summary.total_checks, 16);
    assert.equal((await ok("import-verification", { json: importedJson })).executionObserved, false);
    const listed = await ok("list-evidence", { scope: "run" });
    const failureRecord = listed.records.find(item => item.kind === "failure-latest"); assert.ok(failureRecord);
    const read = await ok("get-evidence", { scope: "run", evidenceId: failureRecord.id });
    assert.doesNotMatch(JSON.stringify(read), /abc\.def\.ghi/);
    const packages = await ok("inspect-kujo-packages", { path: "kennel.toml" });
    assert.equal(packages.manifest.name, "core-fixture"); assert.equal(packages.status, "passed");
    assert.ok((await tool("inspect-kujo-packages", { path: "../kennel.toml" })).error);
    const indexed = await ok("manage-project-knowledge", { operation: "ingest", paths: ["README.md"], revision: null });
    const revision = indexed.index.revision; assert.ok(revision);
    const answer = await ok("manage-project-knowledge", { operation: "query", revision, question: "How do I install and test the OAuth callback fixture?" });
    assert.equal(answer.answer.status, "answered");
    assert.ok(answer.answer.citations.some(citation => citation.path === "README.md"));
    const freshness = await ok("manage-project-knowledge", { operation: "freshness", revision });
    assert.equal(freshness.freshness.status, "current");
    assert.ok((await tool("manage-project-knowledge", { operation: "query", revision, question: "" })).error);
    const retainedIndex = indexed.indexes.find(index => index.revision === revision); assert.ok(retainedIndex);
    assert.equal((await ok("manage-project-knowledge", { operation: "delete", revision, workspaceId: retainedIndex.workspaceId })).deleted, true);
    assert.equal((await ok("manage-project-knowledge", { operation: "list" })).indexes.length, 0);
    const workflowFolder = join(root, "core-workflow-state");
    await mkdir(workflowFolder, { mode: 0o700 }); await chmod(workflowFolder, 0o700);
    await call(`/plugins/kujolang.paperclip/companies/${companyId}/local-folders/workflow-state`, { method: "PUT", body: { path: workflowFolder, access: "readWrite" } });
    const workflow = await ok("manage-kujo-workflow", { operation: "inspect", issueId: agentIssue.id, template: "approval-handoff", topic: "Core assigned-agent inspection" });
    assert.ok(workflow.plan); assert.equal(workflow.plan.projectId, null); assert.equal(workflow.plan.workspaceId, null);
    assert.deepEqual((await ok("manage-kujo-workflow", { operation: "list", issueId: agentIssue.id })).requests, []);
    assert.ok((await tool("manage-kujo-workflow", { operation: "inspect", issueId: agentIssue.id, template: "not-a-template", topic: "Invalid" })).error);
    checks.push("core agent package inspection, native knowledge ingest/query/freshness/delete and assigned workflow inspect/list cover three additional public tools with malformed negatives");
    await config(false);
    await waitUntil(async () => { try { return !(await detail()).catalog.capabilities.find(row => row.tool === "review-changes")?.enabled; } catch { return false; } });
    assert.match((await tool("review-changes")).error, /disabled/);
    assert.match((await tool("inspect-task-contract", { path: "task.spec.json" })).error, /disabled/);
    checks.push("authenticated assigned-agent core tools return structured native evidence, enforce two-stage context selection, redact run evidence and reject disabled/forged requests");
  } finally {
    try { if (runId) await call(`/heartbeat-runs/${runId}/cancel`, { method: "POST", body: {} }); }
    finally { await call(`/agents/${agent.id}/keys/${key.id}`, { method: "DELETE" }); }
    await config(true);
  }
  await call("/plugins/tools/execute", { method: "POST", token, runId, status: 401, body: { tool: "kujolang.paperclip:list-capabilities", parameters: {}, runContext: { companyId, projectId, agentId: agent.id, runId } } });
  checks.push("core revoked agent credential is rejected by the public tool endpoint");
  assert.equal(git(["status", "--porcelain=v1", "-z"]), before);
  for (const [path, content] of Object.entries(files)) if (path !== "oauth.ts") assert.equal(await readFile(join(root, "workspace", path), "utf8"), content);
  assert.equal(await readFile(join(root, "workspace/oauth.ts"), "utf8"), "export const callback = 'after';\n");
  await json("core.json", { companyId, projectId, issueId, privateIssueId: privateIssue.id, review, context, failure, exported, checks: checks.filter(check => check.startsWith("core") || check.startsWith("authenticated assigned-agent core")) });
}
