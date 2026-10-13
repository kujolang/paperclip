import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestHarness, testDatabase } from "./helpers/harness.js";
import manifest from "../src/manifest.js";
import { registerWorkflows, type workflowView } from "../src/features/dispatch/bridge.js";
import { executionLedger } from "../src/execution/ledger.js";
import { executionPlanSchema } from "../src/execution/contracts.js";
import { EVIDENCE_NAMESPACE } from "../src/storage/history.js";
import { publicWorkflowControl, publicWorkflowPlan } from "../src/features/dispatch/public.js";
import { getEvidence } from "../src/storage/history.js";
import { removeTree } from "../src/runtime/files.js";
import { validateAbilityReceipt } from "../bundled/ability-contract/index.js";

const roots: string[] = [], services: ReturnType<typeof registerWorkflows>[] = [];
afterEach(async () => { await Promise.all(services.splice(0).map(s => s.shutdown())); vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(removeTree)); });
const scope = { companyId: "company", issueId: "issue" };
const human = { companyId: "company", actor: { type: "user" as const, userId: "board", companyId: "company" } };
type View = ReturnType<typeof workflowView>;
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kujo-workflow-public-")); roots.push(root); await chmod(root, 0o700);
  vi.stubEnv("PAPERCLIP_PLUGIN_ID", randomUUID());
  const h = createTestHarness({ manifest, config: { features: { workflows: true } } });
  h.ctx.issues.get = async (id, companyId) => ({ id, companyId, projectId: null, assigneeAgentId: "agent", checkoutRunId: "run" } as Awaited<ReturnType<PluginContext["issues"]["get"]>>);
  h.ctx.projects.getWorkspaceForIssue = vi.fn(async () => { throw new Error("Projectless workflows must not resolve a workspace"); });
  h.ctx.localFolders.status = async () => ({ folderKey: "workflow-state", configured: true, path: root, realPath: root, access: "readWrite", readable: true, writable: true, requiredDirectories: [], requiredFiles: [], missingDirectories: [], missingFiles: [], healthy: true, problems: [], checkedAt: new Date().toISOString() });
  type Card = Awaited<ReturnType<PluginContext["issues"]["requestConfirmation"]>>;
  const cards: Card[] = [];
  h.ctx.issues.requestConfirmation = async (issueId, input, companyId) => { const card = { ...input, id: randomUUID(), issueId, companyId, kind: "request_confirmation", status: "pending", requestedResolverPolicy: "human_only", effectiveResolverPolicy: "human_only" } as Card; cards.push(card); return card; };
  h.ctx.issues.listInteractions = async () => cards;
  const service = registerWorkflows(h.ctx); services.push(service);
  const action = (input: Record<string, unknown>) => h.performAction<View>("manage-kujo-workflow", { issueId: "issue", ...input }, human);
  const approve = (id: string) => { const card = cards.find(c => c.id === id)!; card.status = "accepted"; card.result = { version: 1, outcome: "accepted" }; card.resolvedByUserId = "board"; card.resolvedAt = new Date().toISOString(); };
  const prepare = (submissionId = "first") => action({ operation: "prepare", template: "approval-handoff", topic: "Public workflow fixture", submissionId });
  return { root, h, cards, service, action, approve, prepare };
}
const posix = process.platform === "darwin" || process.platform === "linux";
describe.skipIf(!posix)("public durable Dispatch journey", () => {
  it("runs a projectless human-approved workflow and checkpoint across service restart without replay", async () => {
    const f = await fixture(), prepared = await f.prepare();
    expect(prepared.plan).toMatchObject({ projectId: null, workspaceId: null, timeoutMs: 120000, operation: "dispatch.start" });
    expect(await readdir(f.root)).toEqual([]);
    await expect(f.action({ operation: "start", id: prepared.id })).rejects.toThrow(/human approval/);
    f.approve(prepared.interactionId!);
    expect(await f.service.drainQueued()).toEqual({ attempted: 0, errors: 0 });
    expect(await readdir(f.root)).toEqual([]);
    const queued = await f.action({ operation: "start", id: prepared.id }); expect(queued.queuedAt).toBeTruthy(); expect(queued.state).toBe("pending");
    await f.service.shutdown();
    const recovered = registerWorkflows(f.h.ctx); services.push(recovered);
    expect(await recovered.drainQueued()).toEqual({ attempted: 1, errors: 0 });
    const completed = await recovered.status(scope, prepared.id);
    expect(completed.state, JSON.stringify(completed)).toBe("succeeded");
    const observed = await recovered.observe(scope, prepared.id);
    expect(observed.control).toMatchObject({ available: true, run_status: "paused" });
    const request = await recovered.decide(scope, prepared.id, "approve", "Reviewed fixture gate", "decision", { kind: "human", id: "board" });
    f.approve(request.interactionId!);
    await recovered.start(scope, request.id, { kind: "human", id: "board" });
    expect(await recovered.drainQueued()).toEqual({ attempted: 1, errors: 0 });
    const decision = await recovered.status(scope, request.id);
    expect(decision.state, JSON.stringify(decision)).toBe("succeeded");
    await (await testDatabase()).query(`UPDATE ${EVIDENCE_NAMESPACE}.executions SET state='uncertain', diagnostic='fixture_lost_response' WHERE id=$1`, [request.id]);
    const checkpoint = await recovered.observe(scope, request.id);
    expect(checkpoint).toMatchObject({ status: "decision-observed", decisionReceipt: { match: "exact", decision_status: "applied" } });
    expect((await recovered.status(scope, request.id)).state).toBe("uncertain");
    expect((await recovered.observe(scope, prepared.id)).control).toMatchObject({ run_status: "completed" });
    expect(await recovered.drainQueued()).toEqual({ attempted: 0, errors: 0 });
    const view = await f.action({ operation: "status", id: request.id }) as View & { history: { status: string; outcomeId: string; planId: string } };
    expect(view.history.status).toBe("retained");
    const saved = await getEvidence(f.h.ctx, { companyId: scope.companyId, entityType: "issue", entityId: scope.issueId }, view.history.outcomeId);
    expect(saved?.receipt.kind).toBe("workflow-result");
    expect(saved?.payload.planEvidence).toMatchObject({ id: view.history.planId });
    expect(validateAbilityReceipt(view.abilityReceipt).ok).toBe(true);
    expect(view.abilityReceipt).toMatchObject({ ability_id: "kujo.paperclip.workflow.manage", handler_id: "kujo.paperclip.workflow.host" });
    expect(f.h.ctx.projects.getWorkspaceForIssue).not.toHaveBeenCalled();
    await (await testDatabase()).query(`UPDATE ${EVIDENCE_NAMESPACE}.executions SET finished_at = clock_timestamp() - interval '31 days' WHERE id=$1`, [prepared.id]);
    await executionLedger(f.h.ctx).maintain(scope.companyId);
    expect((await recovered.status(scope, prepared.id)).state).toBe("succeeded");
  }, 180000);
  it("rejects foreign owners, agent checkpoint attribution, changed input identity and unsafe storage", async () => {
    const f = await fixture(), prepared = await f.prepare();
    expect((await f.prepare()).id).toBe(prepared.id);
    await expect(f.action({ operation: "prepare", template: "approval-handoff", topic: "Changed", submissionId: "first" })).rejects.toThrow(/conflicts/);
    await expect(f.service.status({ ...scope, companyId: "other" }, prepared.id)).rejects.toThrow(/not found/);
    await expect(f.service.decide(scope, prepared.id, "approve", "agent", "other", { kind: "agent", id: "agent", runId: "run" })).rejects.toThrow(/human/);
    const tool = await f.h.executeTool("manage-kujo-workflow", { operation: "start", issueId: "issue", id: prepared.id }, { companyId: "company", agentId: "agent", runId: "run" });
    expect(tool.error).toMatch(/requesting agent/);
    await chmod(f.root, 0o755);
    await expect(f.prepare("unsafe")).rejects.toThrow(/unsafe_directory/);
    expect(await readdir(f.root)).toEqual([]);
  }, 20000);
  it("releases never-started capacity and enforces the separate durable budget", async () => {
    const f = await fixture(), prepared = await f.prepare();
    const plan = (await executionLedger(f.h.ctx).read(scope, prepared.id))!.request.plan;
    expect(executionPlanSchema.safeParse(plan).success).toBe(true);
    expect(executionPlanSchema.safeParse({ ...plan, timeoutMs: 27000 }).success).toBe(false);
    expect(executionPlanSchema.safeParse({ ...plan, operation: "eval.run", workflow: undefined, projectId: "p", workspaceId: "w" }).success).toBe(false);
    await f.service.cancel(scope, prepared.id);
    await (await testDatabase()).query(`UPDATE ${EVIDENCE_NAMESPACE}.executions SET finished_at = clock_timestamp() - interval '31 days' WHERE id=$1`, [prepared.id]);
    await executionLedger(f.h.ctx).maintain(scope.companyId);
    await expect(f.service.status(scope, prepared.id)).rejects.toThrow(/not found/);
    expect(await readdir(f.root)).toEqual([]);
  }, 20000);
  it("serializes competing native owners and caps retained parents independently of active requests", async () => {
    const f = await fixture(), first = await f.prepare();
    const ledger = executionLedger(f.h.ctx), original = (await ledger.read(scope, first.id))!.request;
    await ledger.cancel(scope, first.id);
    for (let index = 0; index < 20; index++) {
      const id = `parent-${index}`;
      await ledger.insert(scope, id, { ...original, plan: { ...original.plan, workflow: { ...original.plan.workflow!, parentId: id } } });
      await ledger.bind(scope, id, `card-${index}`);
      expect(await ledger.claim(scope, id, `card-${index}`, "human", "owner", id, new Date().toISOString())).toBe(true);
      expect(await ledger.finish(scope, id, "owner", id, "succeeded", {}, null)).toBe(true);
    }
    await expect(ledger.insert(scope, "overflow", original)).rejects.toThrow(/Twenty workflow reservations/);
    const command = { operation: "decide-approval" as const, decision: { run_id: "run-fixture", step_id: "gate", event_id: "event", decision_id: "decision", expected_state_revision: 1, decision: "approve" as const, actor: { id: "human", type: "human" as const, authenticated_by: "fixture", authorization: "fixture" }, response: "reviewed", decided_at: new Date().toISOString() } };
    for (const id of ["decision-a", "decision-b"]) {
      await ledger.insert(scope, id, { ...original, plan: { ...original.plan, operation: "dispatch.decide", workflow: { ...original.plan.workflow!, parentId: "parent-0", command } } });
      await ledger.bind(scope, id, `card-${id}`);
    }
    const claims = await Promise.allSettled(["decision-a", "decision-b"].map(id => ledger.claim(scope, id, `card-${id}`, "human", "owner", id, new Date().toISOString())));
    expect(claims.filter(value => value.status === "fulfilled" && value.value)).toHaveLength(1);
    expect((await ledger.read(scope, "parent-0"))?.state).toBe("succeeded");
    const db = await testDatabase();
    await db.query(`UPDATE ${EVIDENCE_NAMESPACE}.executions SET created_at = clock_timestamp() - interval '1 day' WHERE workflow_slot IS NOT NULL`);
    await db.query(`INSERT INTO ${EVIDENCE_NAMESPACE}.executions (id, company_id, issue_id, request_digest, request, state, finished_at)
      SELECT 'recent-' || n, company_id, issue_id, request_digest, request, 'succeeded', clock_timestamp()
      FROM ${EVIDENCE_NAMESPACE}.executions CROSS JOIN generate_series(1, 100) AS n WHERE id = 'decision-a'`);
    const listed = await ledger.list(scope);
    expect(listed.filter(item => item.id.startsWith("parent-"))).toHaveLength(20);
    expect(listed.length).toBeLessThanOrEqual(100);
  }, 30000);

  it("keeps raw command inputs private while retaining reviewed digests and redacting native display", async () => {
    const f = await fixture();
    const record = await f.service.prepare(scope, { template: "approval-handoff", topic: "password=private-fixture" }, "private", { kind: "human", id: "board" });
    const view = publicWorkflowPlan(record.request.plan);
    expect(view.workflow).not.toHaveProperty("command");
    expect(JSON.parse(view.preview!).command.topic).not.toContain("private-fixture");
    expect(JSON.stringify(view)).not.toContain("private-fixture");
    expect(view.inputDigest).toBe(record.request.plan.inputDigest);
    const raw = { schema: "kujo.control-view/v1" as const, available: true as const, run_id: "run-fixture", state_revision: 1, run_status: "paused", human_intervention: { text: "password=private-fixture" }, current_control_boundary: null };
    expect(JSON.stringify(publicWorkflowControl(raw))).not.toContain("private-fixture");
    expect(raw.human_intervention.text).toContain("private-fixture");
  }, 20000);

});
