import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Exercises actual src/worker.ts handlers in the isolated host harness. */
export async function qualifyProductionEvaluation({ call, companyId, projectId, issueId, root, node, checks, json, stop, start, waitUntil }) {
  const route = "/plugins/kujolang.paperclip/bridge/action";
  const action = async (operation, params = {}, options = {}) => (await call(route, { method: "POST", body: { companyId, key: "manage-evaluation", params: { issueId, operation, ...params } }, ...options })).data;
  const config = async execution => call("/plugins/kujolang.paperclip/config", { method: "POST", body: { companyId, configJson: { features: { execution }, capabilityProfile: "ship" } } });
  const accept = async record => call(`/issues/${issueId}/interactions/${record.interactionId}/accept`, { method: "POST", body: {} });
  assert.match((await action("inspect", { suite: "eval.json" }, { status: 502 })).message, /disabled/);
  await config(true);
  await waitUntil(async () => { try { return !!(await action("inspect", { suite: "eval.json" })).data.plan; } catch { return false; } });
  const request = (await action("prepare", { suite: "eval.json", submissionId: "public-human" })).data;
  assert.equal(request.requester.kind, "human"); assert.equal(request.state, "pending");
  assert.equal((await action("prepare", { suite: "eval.json", submissionId: "public-human" })).data.id, request.id);
  assert.match((await action("start", { id: request.id }, { status: 502 })).message, /human approval/);
  await action("start", { id: request.id }, { status: 401, session: "" });
  await action("prepare", { suite: "eval.json", submissionId: "forged", requester: { kind: "human", id: "forged" } }, { status: 502 });
  checks.push("production handlers require settings, authenticated human identity and exact approval; duplicate preparation reconciles");
  await accept(request);
  const receipt = (await action("start", { id: request.id })).data;
  assert.equal(receipt.state, "succeeded"); assert.equal(receipt.result.classification, "passed");
  assert.equal(receipt.ownerId, undefined); assert.equal(receipt.claimId, undefined);
  assert.deepEqual((await action("start", { id: request.id })).data, receipt);
  checks.push("production worker runs approved native Eval and retains immutable public receipt without ownership secrets");
  const stale = (await action("prepare", { suite: "eval.json", submissionId: "public-stale" })).data;
  await accept(stale); await writeFile(join(root, "workspace/answer.json"), '{"answer":41}');
  assert.equal((await action("start", { id: stale.id })).data.state, "stale");
  const failure = (await action("prepare", { suite: "eval.json", submissionId: "public-failure" })).data;
  await accept(failure);
  const failed = (await action("start", { id: failure.id })).data;
  assert.equal(failed.state, "failed"); assert.equal(failed.result.classification, "failed");
  await writeFile(join(root, "workspace/answer.json"), '{"answer":42}');
  checks.push("production handler rejects changed approval and preserves canonical failed checks");
  const pending = (await action("prepare", { suite: "eval.json", submissionId: "public-cancel" })).data;
  await config(false);
  assert.match((await action("status", { id: receipt.id }, { status: 502 })).message, /disabled/);
  const recovery = (await action("list")).data.requests;
  assert.ok(recovery.some(item => item.id === pending.id)); assert.ok(recovery.every(item => !item.plan && !item.result));
  assert.equal((await action("cancel", { id: pending.id })).data.state, "cancelled");
  checks.push("disabled production execution retains bounded recovery metadata and cancellation only");
  await config(true);
  await waitUntil(async () => { try { return !!(await action("status", { id: receipt.id })).data; } catch { return false; } });
  await writeFile(join(root, "agent-idle.mjs"), "setTimeout(() => {}, 120000);\n");
  const agent = (await call(`/companies/${companyId}/agents`, { method: "POST", status: 201, body: { name: "Production Eval agent", role: "ceo", adapterType: "process", adapterConfig: { command: node, args: [join(root, "agent-idle.mjs")] } } })).data;
  const key = (await call(`/agents/${agent.id}/keys`, { method: "POST", status: 201, body: { name: "Disposable production Eval key" } })).data;
  const token = key.token || key.key;
  let agentRunId;
  try {
    const run = (await call(`/agents/${agent.id}/heartbeat/invoke`, { method: "POST", status: 202, body: { reason: "production_eval_qualification", idempotencyKey: `eval-${agent.id}` } })).data;
    assert.ok(run.id); agentRunId = run.id;
    const agentIssue = (await call(`/companies/${companyId}/issues`, { method: "POST", status: 201, body: { title: "Agent Eval qualification", projectId, status: "backlog" } })).data;
    await call(`/issues/${agentIssue.id}/checkout`, { method: "POST", token, runId: run.id, body: { agentId: agent.id, expectedStatuses: ["backlog"] } });
    const tool = async parameters => (await call("/plugins/tools/execute", { method: "POST", token, runId: run.id, body: { tool: "kujolang.paperclip:manage-evaluation", parameters: { issueId: agentIssue.id, ...parameters }, runContext: { companyId, projectId, agentId: agent.id, runId: run.id } } })).data.result;
    const wrong = await tool({ operation: "list", issueId }); assert.match(wrong.error, /assigned issue/);
    const prepared = await tool({ operation: "prepare", suite: "eval.json", submissionId: "agent-native" });
    assert.equal(prepared.error, undefined); assert.equal(prepared.data.requester.runId, run.id);
    const request = prepared.data;
    assert.match((await tool({ operation: "start", id: request.id })).error, /human approval/);
    const denied = await call(`/issues/${agentIssue.id}/interactions/${request.interactionId}/accept`, { method: "POST", token, runId: run.id, status: 403, body: {} });
    assert.equal(denied.data.code, "interaction_human_only");
    await call(`/issues/${agentIssue.id}/interactions/${request.interactionId}/accept`, { method: "POST", body: {} });
    const completed = await tool({ operation: "start", id: request.id });
    assert.equal(completed.error, undefined); assert.equal(completed.data.result.classification, "passed");
    checks.push("authenticated agent tool binds real checkout/run, cannot self-approve, and executes only after board approval");
  } finally {
    try { if (agentRunId) await call(`/heartbeat-runs/${agentRunId}/cancel`, { method: "POST", body: {} }); }
    finally { await call(`/agents/${agent.id}/keys/${key.id}`, { method: "DELETE" }); }
  }
  await stop(); await start();
  await waitUntil(async () => { try { return (await action("status", { id: receipt.id })).data.state === "succeeded"; } catch { return false; } });
  assert.deepEqual((await action("status", { id: receipt.id })).data, receipt);
  assert.deepEqual((await action("status", { id: failed.id })).data, failed);
  checks.push("production success and failure receipts survive full authenticated host/database restart");
  const other = (await call("/companies", { method: "POST", status: 201, body: { name: "Unrelated production tenant" } })).data.id;
  await call("/plugins/kujolang.paperclip/config", { method: "POST", body: { companyId: other, configJson: { features: { execution: true }, capabilityProfile: "ship" } } });
  // Enable the other tenant too: a disabled feature must not be the reason
  // this cross-company read is rejected.
  const deniedTenant = await action("status", { id: receipt.id }, { status: 502, body: { companyId: other, key: "manage-evaluation", params: { issueId, operation: "status", id: receipt.id } } });
  assert.match(deniedTenant.message, /issue|company|not found/i);
  assert.doesNotMatch(deniedTenant.message, /disabled/);
  checks.push("production receipt access rejects a different tenant even for the shared board administrator");
  await json("receipts.json", { receipt, failed, pendingId: pending.id, companyId, projectId, issueId });
}
