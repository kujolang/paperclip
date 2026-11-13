import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Real authenticated host, real native RunLedger outputs; no mocked host APIs. */
export async function qualifyAccountability({ call, companyId, projectId, issueId, root, node, checks, json, stop, start, waitUntil }) {
  await call("/plugins/kujolang.paperclip/config", { method: "POST", body: { companyId, configJson: { features: { verification: true } } } });
  const detail = async id => (await call("/plugins/kujolang.paperclip/bridge/data", { method: "POST", body: { companyId, key: "detail", params: { entityType: "issue", entityId: id } } })).data.data;
  await waitUntil(async () => { try { return (await detail(issueId)).verificationEnabled; } catch { return false; } });
  const samples = await Promise.all(["failed-attempt.json", "corrected-attempt.json"].map(async filename => JSON.parse(await readFile(new URL(`../../examples/accountability-evidence/${filename}`, import.meta.url), "utf8"))));
  // This scenario imports retained real producer output; it does not rerun its checks in Paperclip.
  await writeFile(join(root, "accountability-agent.mjs"), "setTimeout(() => {}, 600000);\n");
  const retained = [];
  let leadId;
  for (const role of ["lead", "implementation", "testing", "review"]) {
    const agent = (await call(`/companies/${companyId}/agents`, { method: "POST", status: 201, body: { name: `Accountability ${role}`, role: role === "lead" ? "ceo" : "engineer", ...(leadId ? { reportsTo: leadId } : {}), adapterType: "process", adapterConfig: { command: node, args: [join(root, "accountability-agent.mjs")] } } })).data;
    leadId ??= agent.id;
    const key = (await call(`/agents/${agent.id}/keys`, { method: "POST", status: 201, body: { name: "Disposable accountability key" } })).data;
    const token = key.token || key.key;
    let runId;
    try {
      runId = (await call(`/agents/${agent.id}/heartbeat/invoke`, { method: "POST", status: 202, body: { reason: "accountability_qualification" } })).data.id;
      assert.ok(runId);
      const issue = role === "lead" ? { id: issueId } : (await call(`/companies/${companyId}/issues`, { method: "POST", status: 201, body: { title: `${role}: searchable task list`, parentId: issueId, projectId, status: "backlog", description: "Acceptance: search filters matching tasks; imported pass is not independently verified." } })).data;
      await call(`/issues/${issue.id}/checkout`, { method: "POST", token, runId, body: { agentId: agent.id, expectedStatuses: ["backlog", "todo"] } });
      const tool = async parameters => (await call("/plugins/tools/execute", { method: "POST", token, runId, body: { tool: "kujolang.paperclip:import-verification", parameters, runContext: { companyId, projectId, agentId: agent.id, runId } } })).data.result;
      const records = [];
      for (const sample of samples) {
        const result = await tool({ format: "runledger", issueId: issue.id, json: JSON.stringify(sample.record) });
        assert.equal(result.error, undefined); assert.equal(result.data.host.agentId, agent.id); assert.equal(result.data.host.runId, runId);
        assert.equal(result.data.host.parentIssueId, role === "lead" ? null : issueId);
        assert.equal(result.data.classification, sample.classification);
        records.push(result.data.id);
      }
      assert.ok((await tool({ format: "runledger", issueId: issue.id, json: JSON.stringify(samples[1].record), agentId: "forged" })).error);
      const state = await detail(issue.id);
      assert.equal(state.history.filter(row => row.kind === "runledger-import").length, 2);
      retained.push({ role, agentId: agent.id, runId, issueId: issue.id, parentIssueId: role === "lead" ? null : issueId, records });
    } finally {
      try { if (runId) await call(`/heartbeat-runs/${runId}/cancel`, { method: "POST", body: {} }); }
      finally { await call(`/agents/${agent.id}/keys/${key.id}`, { method: "DELETE" }); }
    }
  }
  await stop(); await start();
  for (const row of retained) await waitUntil(async () => { try { const state = await detail(row.issueId); return row.records.every(id => state.history.some(receipt => receipt.artifactId === id)); } catch { return false; } });
  checks.push("accountability: four real host agents with hierarchy and parent-child assignments import distinct native RunLedger failed/corrected records with host attribution; forged identities rejected; all eight records survive full host/database restart");
  await json("accountability.json", { schemaVersion: 1, scope: "Real host hierarchy and authenticated tool imports of retained local CLI evidence; no autonomous delivery, Workcell or Lens execution", retained });
}
