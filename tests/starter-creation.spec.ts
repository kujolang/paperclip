import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { createTestHarness } from "./helpers/harness.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { removeTree } from "../src/runtime/files.js";
import { validateAbilityReceipt } from "../bundled/ability-contract/index.js";
import type { starterCreationView } from "../src/features/starters/bridge.js";
import { toolEnabled } from "../src/abilities/catalog.js";
import { starterCreationTool } from "../src/abilities/generated.js";
import { parsePluginConfig } from "../src/config/schema.js";

type View = ReturnType<typeof starterCreationView> & { history: { status: string; outcomeId: string } };
const roots: string[] = [];
const human = { companyId: "company", actor: { type: "user" as const, companyId: "company", userId: "board" } };
const run = { companyId: "company", projectId: "project", agentId: "agent", runId: "run" };
afterEach(async () => { await plugin.definition.onShutdown?.(); await Promise.all(roots.splice(0).map(removeTree)); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kujo-starter-host-")); roots.push(root);
  const h = createTestHarness({ manifest, config: { features: { projectCreation: true }, capabilityProfile: "build" } });
  h.ctx.issues.get = async (id, companyId) => ({ id, companyId, projectId: "project", assigneeAgentId: "agent", checkoutRunId: "run" } as Awaited<ReturnType<PluginContext["issues"]["get"]>>);
  h.ctx.projects.getWorkspaceForIssue = async () => ({ id: "workspace", projectId: "project", path: root } as Awaited<ReturnType<PluginContext["projects"]["getWorkspaceForIssue"]>>);
  type Card = Awaited<ReturnType<PluginContext["issues"]["requestConfirmation"]>>;
  const cards: Card[] = [];
  h.ctx.issues.requestConfirmation = async (issueId, input, companyId) => { const card = { ...input, id: `card-${cards.length}`, issueId, companyId, kind: "request_confirmation", status: "pending", requestedResolverPolicy: "human_only", effectiveResolverPolicy: "human_only" } as Card; cards.push(card); return card; };
  h.ctx.issues.listInteractions = async () => cards;
  await plugin.definition.setup(h.ctx);
  const action = (input: Record<string, unknown>) => h.performAction<View>("manage-kujo-starter", { issueId: "issue", ...input }, human);
  const prepare = (name = "approved-project", submissionId = name, kind = "script") => action({ operation: "prepare", kind, name, submissionId });
  const approve = (record: View) => { const card = cards.find(item => item.id === record.interactionId)!; Object.assign(card, { status: "accepted", result: { version: 1, outcome: "accepted" }, resolvedByUserId: "board", resolvedAt: new Date().toISOString() }); };
  return { root, h, cards, action, prepare, approve, tool: (params: Record<string, unknown>, context = run) => h.executeTool("manage-kujo-starter", { issueId: "issue", ...params }, context) };
}
describe("human-approved project creation", () => {
  it("requires separate opt-in and Installed/Build/Full", () => {
    expect(toolEnabled(parsePluginConfig({ features: { examples: true, sourceExecution: true, execution: true } }), starterCreationTool)).toBe(false);
    for (const capabilityProfile of ["installed", "build", "full"] as const) expect(toolEnabled(parsePluginConfig({ capabilityProfile, features: { projectCreation: true } }), starterCreationTool)).toBe(true);
    for (const capabilityProfile of ["review", "ship", "essentials"] as const) expect(toolEnabled(parsePluginConfig({ capabilityProfile, features: { projectCreation: true } }), starterCreationTool)).toBe(false);
  });
  it("creates canonical source only after exact human approval in an empty non-Git workspace", async () => {
    const f = await fixture();
    const inspected = await f.action({ operation: "inspect", kind: "script", name: "approved-project" });
    expect(inspected.plan).toMatchObject({ operation: "starter.create", effects: ["write_files", "write_reports"] });
    expect(await stat(join(f.root, "approved-project")).catch(() => null)).toBeNull();
    const prepared = await f.prepare(); expect((await f.prepare()).id).toBe(prepared.id); expect(f.cards).toHaveLength(1);
    await expect(f.action({ operation: "start", id: prepared.id })).rejects.toThrow(/human approval/);
    f.approve(prepared); const result = await f.action({ operation: "start", id: prepared.id });
    expect(result).toMatchObject({ state: "succeeded", result: { classification: "created" }, history: { status: "retained" } });
    expect(await readFile(join(f.root, "approved-project/src/main.kujo"), "utf8")).toContain("Hello from Kujo");
    expect(validateAbilityReceipt(result.abilityReceipt).ok).toBe(true);
    expect((result.result?.files as { path: string; sha256: string }[])[0]?.sha256).toBe(JSON.parse(prepared.plan.preview!).marker.sha256);
    expect(result.abilityReceipt).toMatchObject({ ability_id: "kujo.paperclip.starter.create", handler_id: "kujo.paperclip.starter.host" });
    expect(await f.action({ operation: "start", id: result.id })).toEqual(result);
    expect(await f.prepare()).toEqual(result); expect(f.cards).toHaveLength(1);
    await expect(f.prepare("different", "approved-project")).rejects.toThrow(/conflicts/);
    const evidence = await f.h.executeTool("get-evidence", { scope: "issue", issueId: "issue", evidenceId: result.history.outcomeId }, run);
    expect(evidence.data).toMatchObject({ receipt: { kind: "starter-creation-result" }, parent: { status: "retained" } });
  });
  it("makes destination conflicts and changed policy stale before any write", async () => {
    const f = await fixture(), request = await f.prepare(); f.approve(request);
    await mkdir(join(f.root, "approved-project")); await writeFile(join(f.root, "approved-project/keep"), "existing");
    expect(await f.action({ operation: "start", id: request.id })).toMatchObject({ state: "stale" });
    expect(await readFile(join(f.root, "approved-project/keep"), "utf8")).toBe("existing");
    const policy = await f.prepare("policy"); f.approve(policy);
    f.h.ctx.config.get = async () => ({ capabilityProfile: "build", features: { projectCreation: true }, limits: { timeoutMs: 1000 } });
    expect(await f.action({ operation: "start", id: policy.id })).toMatchObject({ state: "stale" });
    expect(await stat(join(f.root, "policy")).catch(() => null)).toBeNull();
  });
  it("denies injected roots/files, forged humans and cross-company reads", async () => {
    const f = await fixture();
    await expect(f.h.performAction("manage-kujo-starter", { issueId: "issue", operation: "list" })).rejects.toThrow(/human/);
    for (const extra of [{ root: "/tmp" }, { files: [] }, { command: "sh" }, { approvalId: "fake" }]) await expect(f.action({ operation: "prepare", kind: "script", name: "name", submissionId: "id", ...extra })).rejects.toThrow();
    for (const name of ["../escape", "con", "a/b"]) await expect(f.prepare(name)).rejects.toThrow();
    const request = await f.prepare();
    await expect(f.h.performAction("manage-kujo-starter", { issueId: "issue", operation: "status", id: request.id }, { companyId: "other", actor: { type: "user", companyId: "other", userId: "board" } })).rejects.toThrow(/not found/);
  });
  it("requires the requesting assigned agent run; disabled cancellation remains available", async () => {
    const f = await fixture(), humanRequest = await f.prepare();
    expect((await f.tool({ operation: "list" }, { ...run, runId: "old" })).error).toContain("assigned issue");
    expect((await f.tool({ operation: "cancel", id: humanRequest.id })).error).toContain("requesting agent run");
    const request = (await f.tool({ operation: "prepare", kind: "api", name: "agent-api", submissionId: "agent" })).data as View;
    expect((await f.tool({ operation: "start", id: request.id })).error).toContain("human approval");
    f.approve(request); expect((await f.tool({ operation: "start", id: request.id })).data).toMatchObject({ state: "succeeded" });
    f.h.ctx.config.get = async () => ({ features: { projectCreation: false } });
    await expect(f.action({ operation: "status", id: request.id })).rejects.toThrow(/disabled/);
    expect(await f.action({ operation: "cancel", id: humanRequest.id })).toMatchObject({ state: "cancelled" });
    expect(await stat(join(f.root, "approved-project")).catch(() => null)).toBeNull();
  });
});
