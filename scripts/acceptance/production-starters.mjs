import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
export async function qualifyProductionStarters({ call, companyId, projectId, issueId, root, node, checks, json, stop, start, waitUntil }) {
  const route = "/plugins/kujolang.paperclip/bridge/action";
  const action = async (operation, params = {}, options = {}) => (await call(route, { method: "POST", body: { companyId, key: "manage-kujo-starter", params: { issueId, operation, ...params } }, ...options })).data;
  const config = enabled => call("/plugins/kujolang.paperclip/config", { method: "POST", body: { companyId, configJson: { capabilityProfile: "build", features: { projectCreation: enabled } } } });
  const accept = record => call(`/issues/${issueId}/interactions/${record.interactionId}/accept`, { method: "POST", body: {} });
  assert.match((await action("inspect", { kind: "script", name: "host-script" }, { status: 502 })).message, /disabled/);
  await config(true);
  await waitUntil(async () => { try { return !!(await action("inspect", { kind: "script", name: "host-script" })).data.preview; } catch { return false; } });
  const receipts = [];
  for (const kind of ["script", "api", "mcp", "agent"]) {
    const name = `host-${kind}`;
    const preview = (await action("inspect", { kind, name })).data.preview;
    assert.equal(await stat(join(root, "workspace", name)).catch(() => null), null);
    const request = (await action("prepare", { kind, name, submissionId: name })).data;
    assert.equal((await action("prepare", { kind, name, submissionId: name })).data.id, request.id);
    assert.match((await action("start", { id: request.id }, { status: 502 })).message, /human approval/);
    await accept(request);
    const receipt = (await action("start", { id: request.id })).data;
    assert.equal(receipt.state, "succeeded"); assert.equal(receipt.result.classification, "created"); assert.equal(receipt.history.status, "retained");
    assert.equal(receipt.abilityReceipt.ability_id, "kujo.paperclip.starter.create");
    for (const file of preview.files) {
      const bytes = await readFile(join(root, "workspace", name, file.path));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
    }
    assert.deepEqual((await action("prepare", { kind, name, submissionId: name })).data, receipt);
    receipts.push(receipt);
  }
  checks.push("all four canonical starters create exact reviewed files only after board approval; duplicate submissions replay retained outcomes without writing again");
  const stale = (await action("prepare", { kind: "script", name: "host-conflict", submissionId: "conflict" })).data;
  await accept(stale); await mkdir(join(root, "workspace/host-conflict")); await writeFile(join(root, "workspace/host-conflict/keep"), "preserved");
  assert.equal((await action("start", { id: stale.id })).data.state, "stale");
  assert.equal(await readFile(join(root, "workspace/host-conflict/keep"), "utf8"), "preserved");
  const pending = (await action("prepare", { kind: "script", name: "cancelled-project", submissionId: "cancelled" })).data;
  await config(false);
  await waitUntil(async () => { try { return /disabled/.test((await action("status", { id: pending.id }, { status: 502 })).message); } catch { return false; } });
  assert.equal((await action("cancel", { id: pending.id })).data.state, "cancelled");
  assert.equal(await stat(join(root, "workspace/cancelled-project")).catch(() => null), null);
  await config(true);
  await waitUntil(async () => { try { return (await action("status", { id: receipts[0].id })).data.state === "succeeded"; } catch { return false; } });
  checks.push("late destination conflicts preserve existing bytes and become stale; disabled cancellation creates no project files");
  const exported = (await call(route, { method: "POST", body: { companyId, key: "export-evidence", params: { entityType: "issue", entityId: issueId, evidenceId: receipts[0].history.outcomeId } } })).data.data;
  assert.equal(exported.parent.status, "retained"); assert.equal(exported.payload.planEvidence.digest, exported.parent.receipt.digest);
  await stop(); await start();
  await waitUntil(async () => { try { return (await action("status", { id: receipts[0].id })).data.state === "succeeded"; } catch { return false; } });
  assert.deepEqual((await action("status", { id: receipts[0].id })).data, receipts[0]);
  assert.equal((await action("list")).data.history.pending, false);
  const other = (await call("/companies", { method: "POST", status: 201, body: { name: "Unrelated starter tenant" } })).data.id;
  await call("/plugins/kujolang.paperclip/config", { method: "POST", body: { companyId: other, configJson: { features: { projectCreation: true } } } });
  await action("status", {}, { status: 502, body: { companyId: other, key: "manage-kujo-starter", params: { operation: "status", issueId, id: receipts[0].id } } });
  checks.push("creation receipts, linked export and publication acknowledgment survive full host/database restart; foreign tenant reads are denied");
  await writeFile(join(root, "starter-agent-idle.mjs"), "setTimeout(() => {}, 120000);\n");
  const agent = (await call(`/companies/${companyId}/agents`, { method: "POST", status: 201, body: { name: "Starter creation agent", role: "ceo", adapterType: "process", adapterConfig: { command: node, args: [join(root, "starter-agent-idle.mjs")] } } })).data;
  const key = (await call(`/agents/${agent.id}/keys`, { method: "POST", status: 201, body: { name: "Disposable starter creation key" } })).data;
  const token = key.token || key.key;
  let agentRunId;
  try {
    const run = (await call(`/agents/${agent.id}/heartbeat/invoke`, { method: "POST", status: 202, body: { reason: "starter_qualification", idempotencyKey: `starter-${agent.id}` } })).data;
    agentRunId = run.id;
    const issue = (await call(`/companies/${companyId}/issues`, { method: "POST", status: 201, body: { title: "Agent starter qualification", projectId, status: "backlog" } })).data;
    await call(`/issues/${issue.id}/checkout`, { method: "POST", token, runId: run.id, body: { agentId: agent.id, expectedStatuses: ["backlog"] } });
    const tool = async parameters => (await call("/plugins/tools/execute", { method: "POST", token, runId: run.id, body: { tool: "kujolang.paperclip:manage-kujo-starter", parameters: { issueId: issue.id, ...parameters }, runContext: { companyId, projectId, agentId: agent.id, runId: run.id } } })).data.result;
    assert.match((await tool({ operation: "list", issueId })).error, /assigned issue/);
    const request = (await tool({ operation: "prepare", kind: "script", name: "agent-created", submissionId: "agent-starter" })).data;
    assert.ok(request.id); assert.match((await tool({ operation: "start", id: request.id })).error, /human approval/);
    assert.equal((await call(`/issues/${issue.id}/interactions/${request.interactionId}/accept`, { method: "POST", token, runId: run.id, status: 403, body: {} })).data.code, "interaction_human_only");
    await call(`/issues/${issue.id}/interactions/${request.interactionId}/accept`, { method: "POST", body: {} });
    assert.equal((await tool({ operation: "start", id: request.id })).data.state, "succeeded");
  } finally { if (agentRunId) await call(`/heartbeat-runs/${agentRunId}/cancel`, { method: "POST", body: {} }); }
  checks.push("assigned current agent run can create only its own approved starter; agent cannot accept the human-only card");
  await json("starter-creation-receipts.json", { receipts, exported, companyId, projectId, issueId });
}
