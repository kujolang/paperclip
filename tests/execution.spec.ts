import { sourcePreparationFailure } from "../src/execution/preparation-error.js";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestHarness, testDatabase } from "./helpers/harness.js";
import manifest from "../src/manifest.js";
import { createExecutionCoordinator, confirmationFor } from "../src/execution/coordinator.js";
import type { ExecutionAdapter, ExecutionPlan, ExecutionRequest, ExecutionScope } from "../src/execution/contracts.js";
import { evidenceDigest, EVIDENCE_NAMESPACE } from "../src/storage/history.js";
import { executionLedger } from "../src/execution/ledger.js";
import { resolveKujo } from "../src/runtime/resolve-kujo.js";
import { parsePluginConfig } from "../src/config/schema.js";
import type { ExecuteKujoResult } from "../src/runtime/types.js";

type Card = Awaited<ReturnType<PluginContext["issues"]["requestConfirmation"]>>;
const roots: string[] = [];
const services: Array<ReturnType<typeof createExecutionCoordinator>> = [];
afterEach(async () => { await Promise.all(services.splice(0).map((service) => service.shutdown())); vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))); });
const scope: ExecutionScope = { companyId: "company", issueId: "issue" };
const digest = evidenceDigest({ fixture: true });
const plan: ExecutionPlan = { operation: "eval.run", projectId: "project", workspaceId: "workspace", suite: "eval.json", summary: "Run the local fixture evaluation", effects: ["read_workspace", "write_reports", "execute_project"], inputDigest: digest, workspaceDigest: digest, definitionDigest: digest, runtimeDigest: digest, componentDigest: digest, policyDigest: digest, timeoutMs: 5000 };
const request: ExecutionRequest = { plan, requester: { kind: "agent", id: "requester" } };
async function fixture(code = 'process.stdout.write("fixture completed");') {
  const cwd = await mkdtemp(join(tmpdir(), "kujo-execution-test-")); roots.push(cwd);
  const marker = join(cwd, "started");
  const script = join(cwd, "worker.cjs");
  await writeFile(script, `require('node:fs').appendFileSync(process.argv[2], 'start\\n');\n${code}`);
  const h = createTestHarness({ manifest });
  h.ctx.issues.get = async (id, companyId) => ({ id, companyId, projectId: "project" } as Awaited<ReturnType<typeof h.ctx.issues.get>>);
  h.ctx.projects.getWorkspaceForIssue = async () => ({ id: "workspace", projectId: "project", path: cwd } as Awaited<ReturnType<typeof h.ctx.projects.getWorkspaceForIssue>>);
  const cards: Card[] = [];
  const create = vi.fn(async (issueId: string, input: Parameters<typeof h.ctx.issues.requestConfirmation>[1], companyId: string) => {
    const card = { ...input, id: randomUUID(), issueId, companyId, kind: "request_confirmation", status: "pending", requestedResolverPolicy: "human_only", effectiveResolverPolicy: "human_only", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as Card;
    cards.push(card); return card;
  });
  h.ctx.issues.requestConfirmation = create;
  h.ctx.issues.listInteractions = async () => cards;
  const adapter: ExecutionAdapter = { materialize: vi.fn(async () => ({ invocation: { executable: process.execPath, cwd, args: [script, marker] }, collect: async (result: ExecuteKujoResult) => ({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }), dispose: vi.fn(async () => {}) })) };
  const service = createExecutionCoordinator(h.ctx, adapter); services.push(service);
  const second = () => { const value = createExecutionCoordinator(h.ctx, adapter); services.push(value); return value; };
  const approve = () => {
    const card = cards[0]!; card.status = "accepted"; card.result = { version: 1, outcome: "accepted" }; card.resolvedByUserId = "human"; card.resolvedAt = new Date().toISOString();
    return card;
  };
  return { cwd, marker, script, h, cards, create, adapter, service, second, approve };
}
async function prepared(f: Awaited<ReturnType<typeof fixture>>, value = request) { return await f.service.prepare(scope, "submission", value); }
async function waitForMarker(marker: string) { await vi.waitFor(async () => { await access(marker); }, { timeout: 5000, interval: 20 }); }
async function mutate(sql: string, id: string) { await (await testDatabase()).query(`UPDATE ${EVIDENCE_NAMESPACE}.executions SET ${sql} WHERE id=$1`, [id]); }

describe("human-bound persistent execution foundation", () => {
  it("persists before requesting confirmation, deduplicates preparation and waits for a human", async () => {
    const f = await fixture();
    const original = f.create.getMockImplementation()!;
    f.create.mockImplementation(async (...args) => {
      const rows = await (await testDatabase()).query(`SELECT state FROM ${EVIDENCE_NAMESPACE}.executions`);
      expect(rows.rows).toEqual([{ state: "preparing" }]);
      return await original(...args);
    });
    const record = await prepared(f);
    expect(record.state).toBe("pending");
    expect(f.cards[0]).toMatchObject({ resolverPolicy: "human_only", continuationPolicy: "none", payload: { target: { revisionId: record.requestDigest } } });
    expect(await f.second().prepare(scope, "submission", request)).toMatchObject({ id: record.id, state: "pending" });
    expect(f.create).toHaveBeenCalledTimes(1);
    await expect(f.service.start(scope, record.id)).rejects.toThrow("human approval");
    await expect(access(f.marker)).rejects.toThrow();
  });

  it("atomically admits one start across coordinators and never replays terminal work", async () => {
    const f = await fixture(); const record = await prepared(f); f.approve();
    await Promise.all([f.service.start(scope, record.id), f.second().start(scope, record.id)]);
    const result = await f.service.status(scope, record.id);
    expect(result).toMatchObject({ state: "succeeded", approvedBy: "human", result: { exitCode: 0, stdout: "fixture completed" } });
    expect((await readFile(f.marker, "utf8")).split("start")).toHaveLength(2);
    expect(await f.second().start(scope, record.id)).toEqual(result);
    expect(f.adapter.materialize).toHaveBeenCalledTimes(1);
  });

  it.each(["agent", "changed-payload", "wrong-company", "permissive-policy", "superseded", "missing-time", "future-time", "future-within-lifetime", "blocked"])("rejects invalid confirmation: %s", async (mode) => {
    const f = await fixture(); const record = await prepared(f); const card = f.approve();
    if (mode === "agent") { card.resolvedByUserId = null; card.resolvedByAgentId = "agent"; }
    if (mode === "changed-payload") card.payload.detailsMarkdown = "Run something else";
    if (mode === "wrong-company") card.companyId = "other";
    if (mode === "permissive-policy") card.effectiveResolverPolicy = "anyone";
    if (mode === "superseded") card.result = { version: 1, outcome: "superseded_by_newer_request" };
    if (mode === "missing-time") card.resolvedAt = null;
    if (mode === "future-time") card.resolvedAt = "2099-01-01T00:00:00Z";
    if (mode === "future-within-lifetime") card.resolvedAt = new Date(Date.now() + 60_000).toISOString();
    if (mode === "blocked") card.acceptanceBlocker = "workspace_sync_pending";
    await f.service.start(scope, record.id).catch(() => {});
    expect(f.adapter.materialize).not.toHaveBeenCalled();
    await expect(access(f.marker)).rejects.toThrow();
  });

  it("reconciles a lost confirmation response without creating another card", async () => {
    const f = await fixture(); const original = f.create.getMockImplementation()!;
    f.create.mockImplementation(async (...args) => { await original(...args); throw new Error("lost response"); });
    const record = await prepared(f);
    expect(record.state).toBe("pending"); f.approve();
    expect((await f.second().start(scope, record.id)).state).toBe("succeeded");
    expect(f.create).toHaveBeenCalledTimes(1);
  });

  it("does not recreate a request whose host creation is unconfirmed", async () => {
    const f = await fixture(); f.create.mockRejectedValue(new Error("host unavailable"));
    const record = await prepared(f);
    expect(record.state).toBe("preparing");
    expect((await f.second().prepare(scope, "submission", request)).state).toBe("preparing");
    expect((await f.second().start(scope, record.id)).state).toBe("preparing");
    expect(f.create).toHaveBeenCalledTimes(1);
    await expect(access(f.marker)).rejects.toThrow();
  });

  it("rejects ambiguous or missing persisted confirmations", async () => {
    const f = await fixture(); const record = await prepared(f);
    f.cards.push({ ...f.cards[0]! });
    expect((await f.service.status(scope, record.id)).state).toBe("uncertain");
    const g = await fixture(); const other = await g.service.prepare(scope, "other", request); g.cards.splice(0);
    expect((await g.service.status(scope, other.id)).diagnostic).toBe("confirmation_missing");
  });

  it("binds input, requester, workspace and company identity", async () => {
    const f = await fixture(); const record = await prepared(f); f.approve();
    await expect(f.service.prepare(scope, "submission", { ...request, requester: { kind: "human", id: "other" } })).rejects.toThrow("conflicts");
    await expect(f.service.prepare(scope, "submission", { ...request, plan: { ...plan, inputDigest: "a".repeat(64) } })).rejects.toThrow("conflicts");
    for (const target of [{ ...scope, companyId: "other" }, { ...scope, issueId: "other" }]) {
      await expect(f.service.status(target, record.id)).rejects.toThrow("not found");
      await expect(f.service.start(target, record.id)).rejects.toThrow("not found");
      await expect(f.service.cancel(target, record.id)).rejects.toThrow("not found");
    }
    f.h.ctx.projects.getWorkspaceForIssue = async () => null;
    await expect(f.service.start(scope, record.id)).rejects.toThrow("workspace");
    expect(f.adapter.materialize).not.toHaveBeenCalled();
  });

  it("expires approval and never restarts an expired owner lease", async () => {
    const f = await fixture(); const record = await prepared(f); f.approve();
    await mutate("expires_at=clock_timestamp()-interval '1 second'", record.id);
    expect((await f.second().start(scope, record.id)).state).toBe("expired");
    const g = await fixture(); const running = await g.service.prepare(scope, "running", request); g.approve();
    const ledger = executionLedger(g.h.ctx);
    expect(await ledger.claim(scope, running.id, running.interactionId!, "human", "dead-worker", "claim", new Date().toISOString())).toBe(true);
    await mutate("lease_until=clock_timestamp()-interval '1 second'", running.id);
    expect(await g.second().start(scope, running.id)).toMatchObject({ state: "uncertain", diagnostic: "owner_lease_expired" });
    expect(g.adapter.materialize).not.toHaveBeenCalled();
    expect(await ledger.finish(scope, running.id, "dead-worker", "claim", "succeeded", {}, null)).toBe(false);
  });

  it("does not spawn if the database claim committed but its response was lost", async () => {
    const f = await fixture(); const record = await prepared(f); f.approve();
    const execute = f.h.ctx.db.execute;
    f.h.ctx.db.execute = async (sql, params) => { const result = await execute(sql, params); if (sql.includes("approved_by = $5")) throw new Error("lost claim response"); return result; };
    await expect(f.service.start(scope, record.id)).rejects.toThrow("lost claim");
    expect((await f.second().start(scope, record.id)).state).toBe("running");
    expect(f.adapter.materialize).not.toHaveBeenCalled();
    await expect(access(f.marker)).rejects.toThrow();
  });

  it("requires explicit approved start intent and claims a queued command once across workers", async () => {
    const f = await fixture(), record = await prepared(f), starter = { kind: "human" as const, id: "board" };
    await expect(f.service.enqueue(scope, record.id, starter)).rejects.toThrow(/human approval/);
    f.approve();
    expect(await f.service.drainQueued()).toEqual({ attempted: 0, errors: 0 });
    const queued = await f.service.enqueue(scope, record.id, starter);
    expect(queued).toMatchObject({ state: "pending", startRequester: starter, result: null });
    expect(queued.startRequestedAt).toBeTruthy();
    expect(await readFile(f.marker, "utf8").catch(() => null)).toBeNull();
    expect(await f.service.enqueue(scope, record.id, starter)).toEqual(queued);
    await expect(f.service.enqueue(scope, record.id, { kind: "human", id: "other" })).rejects.toThrow(/another actor/);
    await Promise.all([f.service.drainQueued(), f.second().drainQueued()]);
    expect((await f.service.status(scope, record.id)).state).toBe("succeeded");
    expect(await readFile(f.marker, "utf8")).toBe("start\n");
    expect(await f.second().drainQueued()).toEqual({ attempted: 0, errors: 0 });
    await expect(f.service.startQueued({ ...scope, companyId: "other" }, record.id)).rejects.toThrow();
  });
  it("never picks up cancelled, expired or revoked queued approvals", async () => {
    for (const mode of ["cancel", "expire", "revoke"] as const) {
      const f = await fixture(), record = await f.service.prepare(scope, mode, request); f.approve();
      await f.service.enqueue(scope, record.id, { kind: "human", id: "board" });
      if (mode === "cancel") await f.service.cancel(scope, record.id);
      if (mode === "expire") await mutate("expires_at = clock_timestamp() - interval '1 second'", record.id);
      if (mode === "revoke") f.cards[0]!.status = "cancelled";
      await f.second().drainQueued();
      expect((await f.service.status(scope, record.id)).state).toBe(mode === "cancel" ? "cancelled" : mode === "expire" ? "expired" : "rejected");
      expect(await readFile(f.marker, "utf8").catch(() => null)).toBeNull();
    }
  });
  it("revalidates the queued requesting agent run and rejects caller identity changes", async () => {
    const f = await fixture(), starter = { kind: "agent" as const, id: "requester", runId: "run" };
    f.h.ctx.issues.get = async (id, companyId) => ({ id, companyId, projectId: "project", assigneeAgentId: "requester", checkoutRunId: "run" } as Awaited<ReturnType<typeof f.h.ctx.issues.get>>);
    const record = await prepared(f, { ...request, requester: starter }); f.approve();
    await expect(f.service.enqueue(scope, record.id, { ...starter, runId: "other" })).rejects.toThrow(/current assigned run/);
    await f.service.enqueue(scope, record.id, starter);
    f.h.ctx.issues.get = async (id, companyId) => ({ id, companyId, projectId: "project", assigneeAgentId: "requester", checkoutRunId: "different" } as Awaited<ReturnType<typeof f.h.ctx.issues.get>>);
    await f.second().drainQueued();
    expect(await f.service.status(scope, record.id)).toMatchObject({ state: "rejected", diagnostic: "queue_starter_unverified" });
    expect(await readFile(f.marker, "utf8").catch(() => null)).toBeNull();
  });
  it("executes a queued command for the still-current requesting agent", async () => {
    const f = await fixture(), starter = { kind: "agent" as const, id: "requester", runId: "run" };
    f.h.ctx.issues.get = async (id, companyId) => ({ id, companyId, projectId: "project", assigneeAgentId: starter.id, checkoutRunId: starter.runId } as Awaited<ReturnType<typeof f.h.ctx.issues.get>>);
    const record = await prepared(f, { ...request, requester: starter }); f.approve();
    await f.service.enqueue(scope, record.id, starter);
    expect(await f.second().drainQueued()).toEqual({ attempted: 1, errors: 0 });
    expect((await f.service.status(scope, record.id)).state).toBe("succeeded");
    expect(await readFile(f.marker, "utf8")).toBe("start\n");
  });
  it("leaves expired pickup windows pending without launching native work", async () => {
    const f = await fixture(), record = await prepared(f); f.approve();
    const queued = await f.service.enqueue(scope, record.id, { kind: "human", id: "board" });
    expect(await f.service.startQueued(scope, record.id, Date.now() - 1)).toEqual(queued);
    expect(await readFile(f.marker, "utf8").catch(() => null)).toBeNull();
    expect(await f.service.drainQueued()).toEqual({ attempted: 1, errors: 0 });
  });
  it("rechecks the pickup deadline after the final asynchronous spawn admission", async () => {
    const f = await fixture(), record = await prepared(f); f.approve();
    await f.service.enqueue(scope, record.id, { kind: "human", id: "board" });
    const deadline = Date.now() + 5000, query = f.h.ctx.db.query;
    f.h.ctx.db.query = async <T>(sql: string, values?: unknown[]) => {
      const rows = await query<T>(sql, values);
      if (sql.includes("SELECT CASE WHEN state = 'cancel_requested'")) await new Promise(resolve => setTimeout(resolve, Math.max(0, deadline - Date.now() + 25)));
      return rows;
    };
    expect(await f.service.startQueued(scope, record.id, deadline)).toMatchObject({ state: "cancelled", diagnostic: "queue_pickup_window_closed", result: null });
    expect(await readFile(f.marker, "utf8").catch(() => null)).toBeNull();
  }, 20000);
  it("never requeues a command after a lost claim response", async () => {
    const f = await fixture(), record = await prepared(f); f.approve();
    await f.service.enqueue(scope, record.id, { kind: "human", id: "board" });
    const execute = f.h.ctx.db.execute;
    f.h.ctx.db.execute = async (sql, values) => {
      const result = await execute(sql, values);
      if (sql.includes("SET state = 'running'")) throw new Error("lost claim response");
      return result;
    };
    expect(await f.service.drainQueued()).toEqual({ attempted: 1, errors: 1 });
    f.h.ctx.db.execute = execute;
    await mutate("lease_until = clock_timestamp() - interval '1 second'", record.id);
    expect(await f.service.status(scope, record.id)).toMatchObject({ state: "uncertain" });
    expect(await f.second().drainQueued()).toEqual({ attempted: 0, errors: 0 });
    expect(await readFile(f.marker, "utf8").catch(() => null)).toBeNull();
  });
  it("bounds each queue drain and preserves remaining submissions", async () => {
    const f = await fixture();
    for (let i = 0; i < 5; i++) {
      const record = await f.service.prepare(scope, `batch-${i}`, request);
      Object.assign(f.cards[i]!, { status: "accepted", result: { version: 1, outcome: "accepted" }, resolvedByUserId: "human", resolvedAt: new Date().toISOString() });
      await f.service.enqueue(scope, record.id, { kind: "human", id: "board" });
    }
    expect(await f.service.drainQueued()).toEqual({ attempted: 4, errors: 0 });
    expect((await f.service.list(scope)).filter(record => record.state === "pending")).toHaveLength(1);
    expect(await f.second().drainQueued()).toEqual({ attempted: 1, errors: 0 });
    expect((await readFile(f.marker, "utf8")).trim().split("\n")).toHaveLength(5);
  }, 15000);
  it("persists allowlisted preparation errors without private exception data or native replay", async () => {
    const f = await fixture(), record = await prepared(f); f.approve();
    const privateError = Object.assign(new Error("private-token-secret /private/workspace"), { code: "ENOSPC" });
    vi.mocked(f.adapter.materialize).mockRejectedValueOnce(sourcePreparationFailure("temporary_directory", privateError));
    const result = await f.service.start(scope, record.id);
    expect(result).toMatchObject({ state: "failed", result: null, diagnostic: "source_preparation:temporary_directory:ENOSPC" });
    expect(JSON.stringify(result)).not.toMatch(/private-token-secret|private\/workspace/);
    expect(await readFile(f.marker, "utf8").catch(() => null)).toBeNull();
    expect(await f.second().start(scope, record.id)).toEqual(result);
    expect(f.adapter.materialize).toHaveBeenCalledTimes(1);
  });
  it("detects changed approved inputs during materialization", async () => {
    const f = await fixture(); const record = await prepared(f); f.approve();
    vi.mocked(f.adapter.materialize).mockResolvedValue(null);
    expect((await f.service.start(scope, record.id)).state).toBe("stale");
    await expect(access(f.marker)).rejects.toThrow();
  });

  it("cancels before spawn even when materialization was already pending", async () => {
    const f = await fixture(); const record = await prepared(f); f.approve();
    const original = await f.adapter.materialize(scope, plan, new AbortController().signal);
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(f.adapter.materialize).mockImplementation(async () => { await wait; return original; });
    const started = f.service.start(scope, record.id);
    await vi.waitFor(async () => { expect((await f.second().status(scope, record.id)).state).toBe("running"); });
    await f.second().cancel(scope, record.id); release();
    expect((await started).state).toBe("cancelled");
    await expect(access(f.marker)).rejects.toThrow();
  });

  it("cancels an owned process from another coordinator and confirms termination", async () => {
    const f = await fixture("setInterval(() => {}, 1000);"); const record = await prepared(f); f.approve();
    const started = f.service.start(scope, record.id); await waitForMarker(f.marker);
    const cancelled = await f.second().cancel(scope, record.id);
    expect(["cancel_requested", "cancelled"]).toContain(cancelled.state);
    expect((await started).state).toBe("cancelled");
    expect((await f.second().status(scope, record.id)).state).toBe("cancelled");
  }, 15_000);

  it("records timeout, nonzero exit and redacted output without pretending rollback", async () => {
    const f = await fixture("process.stderr.write('api_key=fixtureSecret123'); process.exit(7);");
    const record = await prepared(f); f.approve();
    const failed = await f.service.start(scope, record.id);
    expect(failed.state).toBe("failed"); expect(failed.result?.exitCode).toBe(7);
    expect(JSON.stringify(failed.result)).not.toContain("fixtureSecret123");
    const g = await fixture("setInterval(() => {}, 1000);");
    const timeout = await g.service.prepare(scope, "timeout", { ...request, plan: { ...plan, timeoutMs: 200 } }); g.approve();
    expect(await g.service.start(scope, timeout.id)).toMatchObject({ state: "failed", diagnostic: "KUJO_EXEC_TIMEOUT" });
  }, 15_000);

  it("stops execution when database ownership observation is lost", async () => {
    const f = await fixture("setInterval(() => {}, 1000);"); const record = await prepared(f); f.approve();
    const started = f.service.start(scope, record.id); await waitForMarker(f.marker);
    const execute = f.h.ctx.db.execute;
    f.h.ctx.db.execute = async (sql, params) => { if (sql.includes("SET lease_until")) throw new Error("database unavailable"); return await execute(sql, params); };
    expect(await started).toMatchObject({ state: "uncertain", diagnostic: "execution_outcome_unconfirmed" });
  }, 15_000);

  it("keeps a collection failure uncertain and does not execute again", async () => {
    const f = await fixture(); const original = await f.adapter.materialize(scope, plan, new AbortController().signal);
    vi.mocked(f.adapter.materialize).mockResolvedValue({ ...original!, collect: async () => { throw new Error("receipt unavailable"); } });
    const record = await prepared(f); f.approve();
    expect((await f.service.start(scope, record.id)).state).toBe("uncertain");
    await f.second().start(scope, record.id);
    expect((await readFile(f.marker, "utf8")).split("start")).toHaveLength(2);
  });

  it("rejects tampered persisted input and observes durable cancellation before approval", async () => {
    const f = await fixture(); const record = await prepared(f);
    expect((await f.second().cancel(scope, record.id)).state).toBe("cancelled"); f.approve();
    expect((await f.service.start(scope, record.id)).state).toBe("cancelled");
    await mutate("request_digest=repeat('0',64)", record.id);
    await expect(f.service.status(scope, record.id)).rejects.toThrow("integrity");
  });

  it("runs a real released Kujo program through the approved coordinator", async () => {
    const f = await fixture();
    const runtime = await resolveKujo(parsePluginConfig({}), f.cwd);
    const source = join(f.cwd, "fixture.kujo"); await writeFile(source, 'print("native approved execution")\n');
    vi.mocked(f.adapter.materialize).mockResolvedValue({ invocation: { executable: runtime.executable, cwd: f.cwd, args: ["run", "--isolated-imports", source] }, collect: async (output) => ({ stdout: output.stdout, exitCode: output.exitCode }), dispose: async () => {} });
    const record = await prepared(f); f.approve();
    expect(await f.service.start(scope, record.id)).toMatchObject({ state: "succeeded", result: { stdout: "native approved execution\n", exitCode: 0 } });
    expect(confirmationFor(record).payload.detailsMarkdown).toContain("not a sandbox");
  });

  it("rejects extra effect-bearing confirmation payloads", async () => {
    const f = await fixture(); const record = await prepared(f); const card = f.approve();
    Object.assign(card.payload, { toolAction: { actionRequestId: "unrelated-action" } });
    expect((await f.service.start(scope, record.id)).state).toBe("uncertain");
    expect(f.adapter.materialize).not.toHaveBeenCalled();
  });

  it("rechecks approval expiration immediately before spawn", async () => {
    const f = await fixture(); const record = await prepared(f); f.approve();
    const original = await f.adapter.materialize(scope, plan, new AbortController().signal);
    vi.mocked(f.adapter.materialize).mockImplementation(async () => {
      await mutate("expires_at=clock_timestamp()-interval '1 second'", record.id); return original;
    });
    expect((await f.service.start(scope, record.id)).state).toBe("expired");
    await expect(access(f.marker)).rejects.toThrow();
  });

  it("shutdown cancels an unresponsive preparation without allowing a late spawn", async () => {
    const f = await fixture(); const record = await prepared(f); f.approve();
    const original = await f.adapter.materialize(scope, plan, new AbortController().signal);
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(f.adapter.materialize).mockImplementation(async () => { await wait; return original; });
    const started = f.service.start(scope, record.id);
    await vi.waitFor(() => { expect(f.adapter.materialize).toHaveBeenCalledTimes(2); });
    await f.service.shutdown();
    expect((await started).state).toBe("cancelled");
    release();
    await vi.waitFor(() => { expect(original!.dispose).toHaveBeenCalledTimes(1); });
    await expect(access(f.marker)).rejects.toThrow();
    await expect(f.service.start(scope, record.id)).rejects.toThrow("shutting down");
  });

  it("bounds output and preserves uncertain status when receipt persistence fails", async () => {
    const f = await fixture("process.stdout.write('x'.repeat(600000));");
    const record = await prepared(f); f.approve();
    expect(await f.service.start(scope, record.id)).toMatchObject({ state: "failed", diagnostic: "KUJO_OUTPUT_LIMIT" });
    const g = await fixture(); const other = await g.service.prepare(scope, "receipt-failure", request); g.approve();
    const execute = g.h.ctx.db.execute;
    let failed = false;
    g.h.ctx.db.execute = async (sql, params) => {
      if (!failed && sql.includes("SET state = $6")) { failed = true; throw new Error("receipt storage failed"); }
      return await execute(sql, params);
    };
    expect((await g.service.start(scope, other.id)).state).toBe("uncertain");
    await g.second().start(scope, other.id);
    expect((await readFile(g.marker, "utf8")).split("start")).toHaveLength(2);
  }, 15_000);

  it("preserves approval and terminal receipts across separate process restarts", async () => {
    const f = await fixture();
    await mkdir(join(f.cwd, "dist"));
    await copyFile(join(process.cwd(), "dist/runtime-supervisor.js"), join(f.cwd, "dist/runtime-supervisor.js"));
    const bundle = join(f.cwd, "dist/coordinator.mjs");
    await build({ entryPoints: [fileURLToPath(new URL("../src/execution/coordinator.ts", import.meta.url))], outfile: bundle, bundle: true, platform: "node", format: "esm", logLevel: "silent" });
    await writeFile(join(f.cwd, "request.json"), JSON.stringify(request));
    await writeFile(join(f.cwd, "migration.sql"), (await readFile(new URL("../migrations/002_execution.sql", import.meta.url), "utf8")) + "\n" + (await readFile(new URL("../migrations/003_execution_limits.sql", import.meta.url), "utf8")) + "\n" + (await readFile(new URL("../migrations/005_execution_queue.sql", import.meta.url), "utf8")));
    const script = fileURLToPath(new URL("./fixtures/execution-restart.mjs", import.meta.url));
    for (const phase of ["prepare", "enqueue", "execute", "inspect"]) {
      const output = execFileSync(process.execPath, [script, f.cwd, phase, import.meta.resolve("@electric-sql/pglite"), pathToFileURL(bundle).href], { encoding: "utf8", timeout: 60_000 });
      if (phase === "inspect") expect(output).toContain("passed across four processes");
    }
  }, 120_000);

  it("terminates ordinary child descendants when an owned execution is cancelled", async () => {
    const f = await fixture();
    const childReady = join(f.cwd, "child-ready"); const late = join(f.cwd, "late-effect");
    await writeFile(join(f.cwd, 'child.cjs'), "require('node:fs').writeFileSync(process.argv[2], 'ready'); setTimeout(() => require('node:fs').writeFileSync(process.argv[3], 'escaped'), 1200);");
    await writeFile(f.script, "const {join}=require('node:path'); require('node:child_process').spawn(process.execPath, [join(__dirname, 'child.cjs'), join(__dirname, 'child-ready'), join(__dirname, 'late-effect')], {stdio:'inherit'}); setInterval(() => {}, 1000);");
    const record = await prepared(f); f.approve();
    const running = f.service.start(scope, record.id); await waitForMarker(childReady);
    await f.service.cancel(scope, record.id);
    expect((await running).state).toBe("cancelled");
    await new Promise((resolve) => setTimeout(resolve, 1400));
    await expect(access(late)).rejects.toThrow();
  }, 15_000);

});
