/** Opt-in live host qualification. Never connects to an existing Paperclip instance. */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { access, copyFile, mkdir, mkdtemp, open, readdir, realpath, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hostArg = process.env.KUJO_ACCEPTANCE_HOST;
if (!hostArg) throw new Error("Set KUJO_ACCEPTANCE_HOST to a prepared Paperclip source checkout; no existing server URL is accepted.");
const host = await realpath(hostArg);
const node = process.env.KUJO_ACCEPTANCE_NODE || process.execPath;
const loader = join(host, "cli/node_modules/tsx/dist/loader.mjs");
await Promise.all([access(loader), access(join(host, "server/src/index.ts")), access(join(repo, "node_modules/esbuild"))]);
// mkdtemp guarantees a new instance; never reuse a caller-selected database/config.
const root = await mkdtemp(join(tmpdir(), "kujo-execution-host-"));
await import("node:fs/promises").then(({ chmod }) => chmod(root, 0o700));
const fixture = join(root, "plugin");
const checks = [];
let child;
let log;
let stopping;
let cookie = "";
const evidence = { schemaVersion: 1, fixture: "fixed-program authenticated execution", startedAt: new Date().toISOString(),
  hostCommit: execFileSync("git", ["-C", host, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  pluginCommit: execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), checks };
async function port() {
  const server = createServer();
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const value = server.address().port;
  await new Promise((ok, fail) => server.close(error => error ? fail(error) : ok()));
  return value;
}
const httpPort = await port();
let dbPort = await port();
while (dbPort === httpPort) dbPort = await port();
const base = `http://127.0.0.1:${httpPort}`;
async function json(file, value) { await writeFile(join(root, file), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 }); }
async function call(route, { method = "GET", body, status = 200, session = cookie, token, runId } = {}) {
  const headers = { "Content-Type": "application/json", Origin: base };
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (session) headers.Cookie = session;
  if (runId) headers["X-Paperclip-Run-Id"] = runId;
  const response = await fetch(`${base}/api${route}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45_000), redirect: "error" });
  // Auth response bodies and Set-Cookie are never written to evidence or logs.
  assert.equal(response.status, status, `${method} ${route}: unexpected HTTP status`);
  const data = await response.json();
  return { data, cookies: response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ") };
}
const env = Object.fromEntries(["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "TEMP", "TMP", "SystemRoot"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { PAPERCLIP_CONFIG: join(root, "config.json"), PAPERCLIP_HOME: join(root, "home"), PAPERCLIP_INSTANCE_ID: "acceptance",
  PAPERCLIP_DEPLOYMENT_MODE: "authenticated", PAPERCLIP_DEPLOYMENT_EXPOSURE: "private", PAPERCLIP_AUTH_BASE_URL_MODE: "explicit", PAPERCLIP_AUTH_PUBLIC_BASE_URL: base,
  PAPERCLIP_MIGRATION_AUTO_APPLY: "true", PAPERCLIP_MIGRATION_PROMPT: "never", PAPERCLIP_TELEMETRY_DISABLED: "1", HEARTBEAT_SCHEDULER_ENABLED: "false",
  PAPERCLIP_ANNOUNCEMENTS_ENABLED: "false", HOST: "127.0.0.1", PORT: String(httpPort), SERVE_UI: "false",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), PAPERCLIP_AGENT_JWT_SECRET: randomBytes(32).toString("hex") });
function stop() {
  stopping ??= stopOwned().finally(() => { stopping = undefined; });
  return stopping;
}
async function stopOwned() {
  if (!child) return;
  const processToStop = child;
  const closed = once(processToStop, "close");
  if (processToStop.exitCode === null && processToStop.signalCode === null) {
    processToStop.kill("SIGTERM");
    let timeout;
    try {
      await Promise.race([closed, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Owned host did not stop gracefully; inspect private server.log")), 30_000); })]);
    } finally { clearTimeout(timeout); }
  }
  child = undefined;
  await log?.close(); log = undefined;
}
// Interactive interruption must not abandon this harness's server/database.
for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]]) process.once(signal, () => {
  void (async () => {
    evidence.status = "interrupted";
    try { await stop(); evidence.hostStopped = true; }
    catch { evidence.hostStopped = false; }
    evidence.finishedAt = new Date().toISOString();
    await json("result.json", evidence);
    process.exit(exitCode);
  })();
});
async function start() {
  log = await open(join(root, "server.log"), "a", 0o600);
  // --import runs the source host in this exact child PID, not a CLI wrapper.
  child = spawn(node, ["--import", pathToFileURL(loader).href, join(host, "server/src/index.ts")], { cwd: root, env, stdio: ["ignore", log.fd, log.fd] });
  let launchError;
  child.on("error", error => { launchError = error; });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Owned host exited; inspect private server.log");
    try {
      const health = (await call("/health", { session: "" })).data;
      assert.equal(health.deploymentMode, "authenticated");
      assert.equal(health.deploymentExposure, "private");
      return;
    } catch { await delay(250); }
  }
  throw new Error("Owned host startup timed out; inspect private server.log");
}
async function waitUntil(check, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await delay(100); }
  throw new Error("Acceptance condition timed out");
}
try {
  await mkdir(join(fixture, "dist"), { recursive: true });
  await mkdir(join(fixture, "migrations"));
  await mkdir(join(root, "workspace"));
  await symlink(join(repo, "node_modules"), join(fixture, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(join(fixture, "package.json"), JSON.stringify({ name: "@kujolang/approval-acceptance-fixture", version: "0.0.0", private: true, type: "module",
    paperclipPlugin: { manifest: "./dist/manifest.js", worker: "./dist/worker.js" } }));
  for (const file of await readdir(join(repo, "migrations"))) if (file.endsWith(".sql")) await copyFile(join(repo, "migrations", file), join(fixture, "migrations", file));
  await build({ entryPoints: { worker: join(repo, "tests/host/execution-worker.ts"), manifest: join(repo, "tests/host/execution-manifest.ts") }, outdir: join(fixture, "dist"), bundle: true, platform: "node", format: "esm", packages: "external" });
  await json("config.json", { $meta: { version: 1, updatedAt: new Date().toISOString(), source: "doctor" },
    database: { mode: "embedded-postgres", embeddedPostgresDataDir: join(root, "db"), embeddedPostgresPort: dbPort, backup: { enabled: false, dir: join(root, "backups") } },
    logging: { mode: "file", logDir: join(root, "logs") }, server: { deploymentMode: "authenticated", exposure: "private", bind: "loopback", host: "127.0.0.1", port: httpPort, serveUi: false },
    auth: { baseUrlMode: "explicit", publicBaseUrl: base, disableSignUp: false }, storage: { provider: "local_disk", localDisk: { baseDir: join(root, "storage") } },
    secrets: { provider: "local_encrypted", strictMode: false, localEncrypted: { keyFilePath: join(root, "secrets/master.key") } }, telemetry: { enabled: false }, updates: { checkEnabled: false } });
  console.log(`Isolated acceptance evidence: ${root}`);
  await start();
  const signup = await call("/auth/sign-up/email", { method: "POST", session: "", body: { name: "Acceptance test board user", email: "kujo-acceptance@example.test", password: randomBytes(32).toString("hex") } });
  cookie = signup.cookies; assert.ok(cookie);
  const userId = signup.data.user.id;
  await call("/bootstrap/claim", { method: "POST", body: {} });
  const companyId = (await call("/companies", { method: "POST", status: 201, body: { name: "Kujo execution acceptance" } })).data.id;
  const projectId = (await call(`/companies/${companyId}/projects`, { method: "POST", status: 201, body: { name: "Fixed-program fixture" } })).data.id;
  await call(`/projects/${projectId}/workspaces`, { method: "POST", status: 201, body: { name: "Isolated fixture", cwd: join(root, "workspace"), isPrimary: true } });
  const issueId = (await call(`/companies/${companyId}/issues`, { method: "POST", status: 201, body: { title: "Verify authenticated execution", projectId, status: "backlog" } })).data.id;
  const installed = (await call("/plugins/install", { method: "POST", body: { packageName: fixture, isLocalPath: true } })).data;
  assert.equal(installed.status, "ready");
  checks.push("fresh authenticated instance and local worker installation");
  const bridge = "/plugins/kujolang.paperclip/bridge/action";
  const action = async (key, params, options = {}) => (await call(bridge, { method: "POST", body: { companyId, key: `${key}-fixture`, params: { issueId, ...params } }, ...options })).data;
  const prepare = async (submissionId, mode = "complete") => (await action("prepare", { submissionId, mode })).data;
  const status = async id => (await action("status", { id })).data;
  const accept = async (record, options = {}) => (await call(`/issues/${issueId}/interactions/${record.interactionId}/accept`, { method: "POST", body: {}, ...options })).data;
  const pending = await prepare("approval"); assert.equal(pending.state, "pending");
  assert.equal((await prepare("approval")).id, pending.id);
  const cards = (await call(`/issues/${issueId}/interactions`)).data;
  assert.equal(cards.filter(card => card.idempotencyKey === `kujo.execution:${pending.id}`).length, 1);
  await action("start", { id: pending.id }, { status: 401, session: "" });
  assert.match((await action("start", { id: pending.id }, { status: 502 })).message, /human approval/);
  checks.push("duplicate prepare reconciles one card; unauthenticated and unapproved start denied");
  const outsider = await call("/auth/sign-up/email", { method: "POST", session: "", body: { name: "Unrelated test user", email: "kujo-outsider@example.test", password: randomBytes(32).toString("hex") } });
  assert.ok(outsider.cookies);
  await action("start", { id: pending.id }, { status: 403, session: outsider.cookies });
  await accept(pending, { status: 404, session: outsider.cookies });
  checks.push("authenticated nonmember cannot approve or start another company's request");
  const agent = (await call(`/companies/${companyId}/agents`, { method: "POST", status: 201, body: { name: "Untrusted acceptance agent", role: "ceo", adapterType: "process", adapterConfig: { command: node, args: ["--version"] } } })).data;
  const key = (await call(`/agents/${agent.id}/keys`, { method: "POST", status: 201, body: { name: "Disposable acceptance key" } })).data;
  const token = key.token || key.key; assert.equal(typeof token, "string");
  try {
    const run = (await call(`/agents/${agent.id}/heartbeat/invoke`, { method: "POST", status: 202, body: { reason: "approval_actor_acceptance_fixture", idempotencyKey: `acceptance-${agent.id}` } })).data;
    assert.ok(run.id);
    const denied = await accept(pending, { status: 403, token, runId: run.id });
    assert.equal(denied.code, "interaction_human_only");
    assert.match((await action("start", { id: pending.id }, { status: 502, token })).message, /human approval/);
    const forged = (await call(bridge, { method: "POST", status: 502, token, body: { companyId, key: "prepare-fixture", params: { issueId, submissionId: "forged" }, actorContext: { type: "user", userId, companyId } } })).data;
    assert.match(forged.message, /Authenticated board user/);
  } finally { await call(`/agents/${agent.id}/keys/${key.id}`, { method: "DELETE", body: {} }); }
  checks.push("agent with real host run attribution cannot accept human-only card or forge board identity");
  const otherCompany = (await call("/companies", { method: "POST", status: 201, body: { name: "Other acceptance tenant" } })).data.id;
  for (const operation of ["status", "start", "cancel"]) {
    const denied = (await call(bridge, { method: "POST", status: 502, body: { companyId: otherCompany, key: `${operation}-fixture`, params: { issueId, id: pending.id } } })).data;
    assert.match(denied.message, /company|not found/);
  }
  checks.push("cross-company status, start and cancel denied even for shared administrator");
  await accept(pending);
  const succeeded = (await action("start", { id: pending.id })).data;
  assert.equal(succeeded.state, "succeeded"); assert.equal(succeeded.approvedBy, userId);
  assert.equal(succeeded.result.exitCode, 0); assert.match(succeeded.result.stdout, /authenticated host fixture completed/);
  assert.deepEqual((await action("start", { id: pending.id })).data, succeeded);
  checks.push("host-recorded board acceptance authorizes native Kujo; terminal replay immutable");
  const cancelled = await prepare("cancel-before-accept");
  assert.equal((await action("cancel", { id: cancelled.id })).data.state, "cancelled");
  await accept(cancelled);
  assert.equal((await action("start", { id: cancelled.id })).data.state, "cancelled");
  checks.push("late acceptance cannot undo durable cancellation");
  const slow = await prepare("cancel-running", "slow"); await accept(slow);
  const running = action("start", { id: slow.id });
  // Observe both outcomes even when a parallel assertion fails.
  running.catch(() => {});
  await waitUntil(async () => (await status(slow.id)).state === "running");
  await delay(500);
  const cancelledRunning = (await action("cancel", { id: slow.id })).data;
  assert.equal(cancelledRunning.state, "cancelled");
  assert.equal((await running).data.state, "cancelled");
  assert.equal((await action("start", { id: slow.id })).data.state, "cancelled");
  checks.push("concurrent worker cancellation stops running native fixture and remains final");
  const restartPending = await prepare("restart-pending");
  await call("/plugins/kujolang.paperclip/disable", { method: "POST", body: {} });
  await call("/plugins/kujolang.paperclip/enable", { method: "POST", body: {} });
  assert.equal((await status(restartPending.id)).state, "pending");
  assert.deepEqual(await status(succeeded.id), succeeded);
  checks.push("worker reload preserves pending approval and terminal receipt");
  await stop(); await start();
  await waitUntil(async () => { try { return (await status(restartPending.id)).state === "pending"; } catch { return false; } });
  assert.deepEqual(await status(succeeded.id), succeeded);
  assert.equal((await status(slow.id)).state, "cancelled");
  await accept(restartPending);
  assert.equal((await action("start", { id: restartPending.id })).data.state, "succeeded");
  checks.push("full authenticated host/database restart preserves session, pending card, cancellation and terminal result");
  await json("receipts.json", { succeeded, cancelled: await status(slow.id), afterRestart: await status(restartPending.id) });
  evidence.status = "passed";
} catch (error) {
  evidence.status = "failed";
  // Error bodies may contain credentials; store only the assertion/operation message.
  evidence.failure = String(error.message).slice(0, 1000);
  process.exitCode = 1;
} finally {
  try { await stop(); evidence.hostStopped = true; }
  catch (error) { evidence.hostStopped = false; evidence.shutdownError = String(error.message); process.exitCode = 1; }
  evidence.finishedAt = new Date().toISOString();
  await json("result.json", evidence);
  console.log(`${evidence.status}: ${checks.length} checks; result ${join(root, "result.json")}`);
  if (evidence.failure) console.error(evidence.failure);
}
