import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

/** Observe only public issue events in the harness's disposable company. */
export async function qualifyProductionEvents({ call, companyId, projectId, issueId, root, checks, json, stop, start, waitUntil }) {
  const target = { entityType: "issue", entityId: issueId };
  const action = async (key, params) => (await call("/plugins/kujolang.paperclip/bridge/action", {
    method: "POST", body: { companyId, key, params },
  })).data.data;
  const history = async () => (await call("/plugins/kujolang.paperclip/bridge/data", {
    method: "POST", body: { companyId, key: "detail", params: target },
  })).data.data.history.filter(record => record.kind === "acceptance-result");
  await call("/plugins/kujolang.paperclip/config", { method: "POST", body: { companyId, configJson: {
    features: { assurance: true, execution: true },
    acceptancePolicies: [{ projectId, mode: "required", observeHandoffs: true, checks: [{ kind: "eval", suite: "event-fixture.json" }] }],
  } } });
  await waitUntil(async () => { try { return (await history()).length === 0; } catch { return false; } });
  await call(`/issues/${issueId}`, { method: "PATCH", body: { status: "in_review" } });
  await waitUntil(async () => (await history()).length === 1);
  const first = (await history())[0];
  const firstEvidence = await action("export-evidence", { ...target, evidenceId: first.id });
  assert.equal(firstEvidence.payload.status, "incomplete");
  assert.equal(firstEvidence.payload.verifiedComplete, false);
  assert.equal(firstEvidence.payload.checks[0].status, "missing");
  assert.equal((await call(`/issues/${issueId}`)).data.status, "in_review");
  checks.push("public in_review issue.updated event retains incomplete acceptance evidence without changing native issue status");

  await writeFile(join(root, "workspace/event-observation.txt"), "Changed submission for a second observed handoff\n");
  await call(`/issues/${issueId}`, { method: "PATCH", body: { status: "done" } });
  await waitUntil(async () => (await history()).length === 2);
  const beforeDuplicate = (await history()).map(record => record.id).sort();
  await call(`/issues/${issueId}`, { method: "PATCH", body: { title: "Duplicate done handoff observation" } });
  // Give the asynchronous subscriber a bounded observation window; identical
  // inputs must not add evidence or prepare execution during that window.
  await delay(2000);
  assert.deepEqual((await history()).map(record => record.id).sort(), beforeDuplicate);
  for (const key of ["manage-evaluation", "manage-kujo-assurance"]) {
    assert.deepEqual((await action(key, { issueId, operation: "list" })).requests, []);
  }
  assert.deepEqual((await call(`/issues/${issueId}/interactions`)).data, []);
  assert.equal((await call(`/issues/${issueId}`)).data.status, "done");
  checks.push("done handoff observes changed source; repeated identical evidence deduplicates during bounded observation and creates no execution requests or approval cards");
  await stop(); await start();
  await waitUntil(async () => { try { return (await history()).length === 2; } catch { return false; } });
  assert.deepEqual((await history()).map(record => record.id).sort(), beforeDuplicate);
  checks.push("event-created acceptance evidence survives full host/database restart without explicit acceptance action");
  await json("events.json", { schemaVersion: 1, statuses: ["in_review", "done"], retainedObservations: 2, missingChecksRemainIncomplete: true, queuedExecutions: 0, approvalCards: 0, duplicateObservationWindowMs: 2000, restartPreserved: true });
}
