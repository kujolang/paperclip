import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness } from "./helpers/harness.js";
import manifest from "../src/manifest.js";
import { createEvalHostService, evalExecutionEnabled } from "../src/features/eval/host.js";
import { executionLedger } from "../src/execution/ledger.js";
import { confirmationFor } from "../src/execution/coordinator.js";
import { parsePluginConfig } from "../src/config/schema.js";
import { removeTree } from "../src/runtime/files.js";
import { safeChildEnv } from "../src/runtime/execute-kujo.js";

const scope = { companyId: "company", issueId: "issue" };
type Card = Awaited<ReturnType<PluginContext["issues"]["requestConfirmation"]>>;
const roots: string[] = [];
const services: ReturnType<typeof createEvalHostService>[] = [];
afterEach(async () => { await Promise.all(services.splice(0).map(service => service.shutdown())); await Promise.all(roots.splice(0).map(removeTree)); });
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "kujo-eval-host-test-")); roots.push(cwd);
  execFileSync("git", ["init", "--quiet", cwd], { env: safeChildEnv() });
  await writeFile(join(cwd, "answer.json"), '{"answer":42}');
  await writeFile(join(cwd, "eval.json"), JSON.stringify({ name: "Host-admitted suite", tests: [{ name: "answer", check: "json_value_equals", params: { path: "answer.json", json_path: "answer", expected: 42 } }] }));
  let config = parsePluginConfig({ features: { execution: true } });
  const h = createTestHarness({ manifest });
  h.ctx.config.get = async () => config;
  h.ctx.issues.get = async (id, companyId) => ({ id, companyId, projectId: "project" } as Awaited<ReturnType<typeof h.ctx.issues.get>>);
  h.ctx.projects.getWorkspaceForIssue = async () => ({ id: "workspace", projectId: "project", path: cwd } as Awaited<ReturnType<typeof h.ctx.projects.getWorkspaceForIssue>>);
  const cards: Card[] = [];
  h.ctx.issues.requestConfirmation = async (issueId, input, companyId) => {
    const card = { ...input, id: `card-${cards.length}`, issueId, companyId, kind: "request_confirmation", status: "pending", requestedResolverPolicy: "human_only", effectiveResolverPolicy: "human_only" } as Card;
    cards.push(card); return card;
  };
  h.ctx.issues.listInteractions = async () => cards;
  const service = createEvalHostService(h.ctx); services.push(service);
  return { cwd, h, cards, service,
    config: (next: unknown) => { config = parsePluginConfig(next); },
    prepare: (id = "request") => service.prepare(scope, "eval.json", id, { kind: "human", id: "board" }),
    approve: (id: string | null) => { const card = cards.find(card => card.id === id)!; card.status = "accepted"; card.result = { version: 1, outcome: "accepted" }; card.resolvedByUserId = "board"; card.resolvedAt = new Date().toISOString(); },
  };
}
describe("host-owned Eval admission", () => {
  it("requires explicit execution settings and a canonical profile containing Eval", () => {
    expect(evalExecutionEnabled(parsePluginConfig({}))).toBe(false);
    for (const profile of ["essentials", "review", "build"] as const) expect(evalExecutionEnabled(parsePluginConfig({ features: { execution: true }, capabilityProfile: profile }))).toBe(false);
    for (const profile of ["installed", "ship", "full"] as const) expect(evalExecutionEnabled(parsePluginConfig({ features: { execution: true }, capabilityProfile: profile }))).toBe(true);
  });
  it("captures only the host issue workspace, exposes review content and executes its approved frozen copy", async () => {
    const f = await fixture();
    const preview = await f.service.inspect(scope, "eval.json");
    expect(preview).toMatchObject({ plan: { projectId: "project", workspaceId: "workspace", maxStdoutBytes: 500000, maxStderrBytes: 64000 }, coverage: { scope: "git-visible-text", copied: 2, complete: true } });
    expect(preview.plan.preview).toContain("json_value_equals");
    const request = await f.prepare();
    expect(f.cards[0]!.payload.detailsMarkdown!.length).toBeLessThanOrEqual(20000);
    expect((await f.service.list(scope)).map(item => item.id)).toContain(request.id);
    f.approve(request.interactionId);
    const result = await f.service.start(scope, request.id);
    expect(result).toMatchObject({ state: "succeeded", result: { classification: "passed", nativeClassification: "passed", coverage: { copied: 2, complete: true } } });
    expect(await f.service.start(scope, request.id)).toEqual(result);
    await expect(f.service.status({ ...scope, companyId: "other" }, request.id)).rejects.toThrow(/not found/);
  }, 20_000);
  it("requires fresh approval for a legacy pending request without a frozen Ability binding", async () => {
    const f = await fixture(); const preview = await f.service.inspect(scope, "eval.json");
    delete preview.plan.abilityReceipt;
    const ledger = executionLedger(f.h.ctx);
    await ledger.insert(scope, "legacy-pending", { plan: preview.plan, requester: { kind: "human", id: "board" } });
    const stored = (await ledger.read(scope, "legacy-pending"))!;
    const card = await f.h.ctx.issues.requestConfirmation(scope.issueId, confirmationFor(stored), scope.companyId);
    await ledger.bind(scope, stored.id, card.id); f.approve(card.id);
    expect(await f.service.start(scope, stored.id)).toMatchObject({ state: "stale", diagnostic: "approved_inputs_changed", result: null });
    expect((await ledger.read(scope, stored.id))!.request.plan).not.toHaveProperty("abilityReceipt");
  }, 20_000);
  it("invalidates approval after source or admitted settings change", async () => {
    const f = await fixture(); const request = await f.prepare(); f.approve(request.interactionId);
    await writeFile(join(f.cwd, "answer.json"), '{"answer":41}');
    expect((await f.service.start(scope, request.id)).state).toBe("stale");
    const next = await f.prepare("policy"); f.approve(next.interactionId);
    f.config({ features: { execution: true }, limits: { timeoutMs: 2000 } });
    expect((await f.service.start(scope, next.id)).state).toBe("stale");
  }, 20_000);
  it("keeps partial coverage explicit and does not read sensitive input files", async () => {
    const f = await fixture(); await writeFile(join(f.cwd, ".env"), "TOP_SECRET_NOT_READ");
    const preview = await f.service.inspect(scope, "eval.json");
    expect(preview.coverage).toMatchObject({ complete: false, excludedSensitive: 1, copied: 2 });
    expect(preview.plan.preview).not.toContain("TOP_SECRET_NOT_READ");
    const request = await f.prepare(); f.approve(request.interactionId);
    expect((await f.service.start(scope, request.id)).result).toMatchObject({ classification: "partial", nativeClassification: "passed", coverage: { complete: false } });
  }, 20_000);
  it("checks settings on prepare, read and start while preserving scoped cancellation", async () => {
    const f = await fixture(); const request = await f.prepare(); f.config({});
    await expect(f.prepare("disabled")).rejects.toThrow(/disabled/);
    await expect(f.service.inspect(scope, "eval.json")).rejects.toThrow(/disabled/);
    await expect(f.service.status(scope, request.id)).rejects.toThrow(/disabled/);
    await expect(f.service.list(scope)).rejects.toThrow(/disabled/);
    await expect(f.service.start(scope, request.id)).rejects.toThrow(/disabled/);
    expect((await f.service.cancel(scope, request.id)).state).toBe("cancelled");
  }, 20_000);
  it("bounds concurrent preparation and rejects missing, unsafe or oversized approval previews", async () => {
    const f = await fixture();
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => f.service.inspect(scope, "eval.json")));
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(2);
    for (const path of ["missing.json", "../eval.json", ".env"]) await expect(f.service.inspect(scope, path)).rejects.toThrow();
    await writeFile(join(f.cwd, "eval.json"), JSON.stringify({ name: "x".repeat(13000), tests: [] }));
    await expect(f.prepare()).rejects.toThrow(/confirmation limit/);
    expect(f.cards).toHaveLength(0);
    await writeFile(join(f.cwd, "eval.json"), "secret-invalid-json");
    await expect(f.prepare()).rejects.toThrow("Eval suite must contain valid JSON");
  }, 20_000);
  it("keeps a third start pending when this worker is busy, then admits an explicit retry", async () => {
    const f = await fixture(); const requests = [];
    for (let index = 0; index < 3; index++) { const request = await f.prepare(`parallel-${index}`); f.approve(request.interactionId); requests.push(request); }
    const results = await Promise.allSettled(requests.map(request => f.service.start(scope, request.id)));
    expect(results.filter(item => item.status === "rejected")).toHaveLength(1);
    for (const request of requests) {
      const result = await f.service.start(scope, request.id);
      expect(result).toMatchObject({ state: "succeeded", result: { classification: "passed" } });
    }
  }, 30_000);
});
