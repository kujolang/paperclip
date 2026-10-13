import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness } from "./helpers/harness.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { safeChildEnv } from "../src/runtime/execute-kujo.js";
import { removeTree } from "../src/runtime/files.js";
import type { EvaluationView } from "../src/features/eval/bridge.js";
const roots: string[] = [];
afterEach(async () => { await plugin.definition.onShutdown?.(); await Promise.all(roots.splice(0).map(removeTree)); });
const run = { companyId: "company", projectId: "project", agentId: "agent", runId: "run" };
const human = { companyId: "company", actor: { type: "user" as const, userId: "board", companyId: "company" } };
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "kujo-eval-public-")); roots.push(cwd);
  execFileSync("git", ["init", "--quiet", cwd], { env: safeChildEnv() });
  await writeFile(join(cwd, "answer.json"), '{"answer":42}');
  await writeFile(join(cwd, "eval.json"), JSON.stringify({ name: "Public suite", tests: [{ name: "answer", check: "json_value_equals", params: { path: "answer.json", json_path: "answer", expected: 42 } }] }));
  const h = createTestHarness({ manifest, config: { features: { execution: true } } });
  h.ctx.issues.get = async (id, companyId) => ({ id, companyId, projectId: "project", assigneeAgentId: "agent", checkoutRunId: "run", executionRunId: null } as Awaited<ReturnType<PluginContext["issues"]["get"]>>);
  h.ctx.projects.getWorkspaceForIssue = async () => ({ id: "workspace", projectId: "project", path: cwd } as Awaited<ReturnType<PluginContext["projects"]["getWorkspaceForIssue"]>>);
  type Card = Awaited<ReturnType<PluginContext["issues"]["requestConfirmation"]>>;
  const cards: Card[] = [];
  h.ctx.issues.requestConfirmation = async (issueId, input, companyId) => {
    const card = { ...input, id: `card-${cards.length}`, issueId, companyId, kind: "request_confirmation", status: "pending", requestedResolverPolicy: "human_only", effectiveResolverPolicy: "human_only" } as Card;
    cards.push(card); return card;
  };
  h.ctx.issues.listInteractions = async () => cards;
  await plugin.definition.setup(h.ctx);
  return { h, cards, approve: () => { const card = cards.at(-1)!; card.status = "accepted"; card.result = { version: 1, outcome: "accepted" }; card.resolvedByUserId = "board"; card.resolvedAt = new Date().toISOString(); },
    action: (input: Record<string, unknown>) => h.performAction<EvaluationView>("manage-evaluation", { issueId: "issue", ...input }, human),
    tool: (input: Record<string, unknown>, context = run) => h.executeTool("manage-evaluation", { issueId: "issue", ...input }, context) };
}
describe("public Eval workflow", () => {
  it("exposes only create/read confirmation permissions and rejects injected authority", async () => {
    expect(manifest.capabilities).toContain("issue.interactions.create");
    expect(manifest.capabilities).toContain("issue.interactions.read");
    expect(manifest.capabilities).not.toContain("issue.interactions.respond");
    const f = await fixture();
    await expect(f.h.performAction("manage-evaluation", { operation: "list", issueId: "issue" })).rejects.toThrow(/human/);
    await expect(f.action({ operation: "prepare", suite: "eval.json", submissionId: "bad", requester: { kind: "human", id: "forged" } })).rejects.toThrow();
    await expect(f.action({ operation: "start", id: "fake", approvalId: "forged" })).rejects.toThrow();
    expect(f.cards).toHaveLength(0);
  });
  it("runs through the production action only after human approval and exposes no ownership secrets", async () => {
    const f = await fixture();
    const prepared = await f.action({ operation: "prepare", suite: "eval.json", submissionId: "human" });
    expect(prepared).toMatchObject({ state: "pending", requester: { kind: "human", id: "board" } });
    expect(prepared).not.toHaveProperty("claimId"); expect(prepared).not.toHaveProperty("ownerId");
    await expect(f.action({ operation: "start", id: prepared.id })).rejects.toThrow(/human approval/);
    f.approve();
    const finished = await f.action({ operation: "start", id: prepared.id });
    expect(finished).toMatchObject({ state: "succeeded", result: { classification: "passed" }, history: { status: "retained" } });
    const exported = await f.h.performAction<{ parent: { status: string }; payload: { executionState: string } }>("export-evidence", { entityType: "issue", entityId: "issue", evidenceId: finished.history!.outcomeId }, human);
    expect(exported).toMatchObject({ parent: { status: "retained" }, payload: { executionState: "succeeded" } });
    expect(await f.action({ operation: "start", id: prepared.id })).toEqual(finished);
    expect((await f.action({ operation: "list" }) as unknown as { requests: unknown[] }).requests).toHaveLength(1);
    await expect(f.h.performAction("manage-evaluation", { operation: "status", issueId: "issue", id: prepared.id }, { companyId: "other", actor: { type: "user", userId: "board", companyId: "other" } })).rejects.toThrow(/not found/);
  }, 20000);
  it("binds agent preparation and mutation to the host issue assignment and exact requesting run", async () => {
    const f = await fixture();
    for (const other of [{ ...run, runId: "old" }, { ...run, projectId: "other" }, { ...run, agentId: "other" }]) expect((await f.tool({ operation: "prepare", suite: "eval.json", submissionId: "invalid" }, other)).error).toContain("assigned issue");
    expect(f.cards).toHaveLength(0);
    const prepared = (await f.tool({ operation: "prepare", suite: "eval.json", submissionId: "agent" })).data as EvaluationView;
    expect(prepared.requester).toEqual({ kind: "agent", id: "agent", runId: "run" });
    expect((await f.tool({ operation: "start", id: prepared.id })).error).toContain("human approval");
    f.approve();
    const completed = (await f.tool({ operation: "start", id: prepared.id })).data as EvaluationView;
    expect(completed).toMatchObject({ state: "succeeded", result: { classification: "passed" }, history: { status: "retained" } });
    const listedHistory = await f.h.executeTool("list-evidence", { scope: "issue", issueId: "issue" }, run);
    expect(listedHistory.data).toMatchObject({ records: expect.arrayContaining([expect.objectContaining({ kind: "evaluation-result" })]) });
    const readHistory = await f.h.executeTool("get-evidence", { scope: "issue", issueId: "issue", evidenceId: completed.history!.outcomeId }, run);
    expect(readHistory.data).toMatchObject({ parent: { status: "retained" }, payload: { classification: "passed" } });
    expect((await f.h.executeTool("list-evidence", { scope: "issue", issueId: "issue" }, { ...run, runId: "old" })).error).toContain("assigned issue");
    expect((await f.h.executeTool("list-evidence", { scope: "project", issueId: "issue" }, run)).error).toContain("Only issue scope");
    const humanRequest = await f.action({ operation: "prepare", suite: "eval.json", submissionId: "human" });
    expect((await f.tool({ operation: "cancel", id: humanRequest.id })).error).toContain("requesting agent run");
    f.h.ctx.config.get = async () => ({ features: { execution: false } });
    const listed = await f.action({ operation: "list" }) as unknown as { requests: unknown[] };
    expect(listed.requests).toHaveLength(2); expect(listed.requests[0]).not.toHaveProperty("plan");
    expect((await f.action({ operation: "cancel", id: humanRequest.id })).state).toBe("cancelled");
    await expect(f.action({ operation: "status", id: prepared.id })).rejects.toThrow(/disabled/);
  }, 20000);
});
