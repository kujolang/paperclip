import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
import { afterEach, describe, expect, it } from "vitest";
import { executeSupervisedKujo } from "../src/runtime/supervised-kujo.js";
import { safeChildEnv } from "../src/runtime/execute-kujo.js";
import { removeTree } from "../src/runtime/files.js";
import { SUPERVISOR_LEASE_MS } from "../src/runtime/supervisor-protocol.js";

const roots: string[] = [], workers: ChildProcess[] = [];
afterEach(async () => {
  for (const worker of workers.splice(0)) {
    if (worker.exitCode === null && worker.signalCode === null) {
      if (process.platform !== "win32") worker.kill("SIGCONT");
      const closed = once(worker, "close"); worker.kill("SIGKILL"); await closed;
    }
  }
  await Promise.all(roots.splice(0).map(removeTree));
});
const input = (code: string) => ({ executable: process.execPath, cwd: process.cwd(), args: ["-e", code], timeoutMs: 10_000, maxStdoutBytes: 1024, maxStderrBytes: 1024 });
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function root() { const value = await mkdtemp(join(tmpdir(), "kujo-supervisor-")); roots.push(value); return value; }
async function ready(path: string) { let value: string | undefined; await expect.poll(async () => { value = await readFile(path, "utf8").catch(() => undefined); return value; }, { timeout: 10_000 }).toBeTruthy(); return value!; }

// A real worker process imports the production executor, with the same packed
// directory shape. Its native child and grandchild independently emit heartbeats.
async function workerFixture() {
  const cwd = await root(); await mkdir(join(cwd, "dist"));
  await writeFile(join(cwd, "package.json"), '{"type":"module"}');
  await copyFile(resolve("dist/runtime-supervisor.js"), join(cwd, "dist/runtime-supervisor.js"));
  await writeFile(join(cwd, "invocation.json"), JSON.stringify({ ...input(""), cwd, args: [resolve("tests/fixtures/supervisor-native.cjs"), cwd], timeoutMs: 20_000 }));
  await build({ entryPoints: [resolve("tests/fixtures/supervised-worker.ts")], outfile: join(cwd, "dist/worker.js"), bundle: true, platform: "node", format: "esm" });
  const worker = fork(join(cwd, "dist/worker.js"), [cwd], { execArgv: [], env: safeChildEnv(), stdio: ["ignore", "ignore", "ignore", "ipc"] }); workers.push(worker);
  const nativePid = Number(await ready(join(cwd, "native-pid"))), descendantPid = Number(await ready(join(cwd, "descendant-pid")));
  await ready(join(cwd, "native-tick")); await ready(join(cwd, "descendant-tick"));
  expect(alive(nativePid)).toBe(true); expect(alive(descendantPid)).toBe(true);
  return { worker, cwd, nativePid, descendantPid, async stopped(timeout = 6000) {
    await expect.poll(() => alive(nativePid) || alive(descendantPid), { timeout }).toBe(false);
    const before = await readFile(join(cwd, "descendant-tick"), "utf8"); await delay(150);
    expect(await readFile(join(cwd, "descendant-tick"), "utf8")).toBe(before);
  } };
}

describe("independently owned execution supervisor", () => {
  it("retains exit/output and the scrubbed environment without a shell", async () => {
    const result = await executeSupervisedKujo({ ...input("process.stdout.write(JSON.stringify(process.argv.slice(1)));process.stderr.write('diagnostic');process.exitCode=7"), args: ["-e", "process.stdout.write(JSON.stringify(process.argv.slice(1)));process.stderr.write('diagnostic');process.exitCode=7", "literal;$(not-a-command)"] });
    expect(result).toMatchObject({ exitCode: 7, stderr: "diagnostic", stdout: '["literal;$(not-a-command)"]', timedOut: false });
    const clean = await executeSupervisedKujo(input("process.stdout.write(String(process.env.NODE_OPTIONS ?? 'absent'))"));
    expect(clean.stdout).toBe("absent");
  });
  it("rejects invalid or already-cancelled admission without executing", async () => {
    const cwd = await root(), marker = join(cwd, "unexpected");
    const invocation = input("require('node:fs').writeFileSync(process.argv[1],'executed')"); invocation.args.push(marker);
    await expect(executeSupervisedKujo({ ...invocation, timeoutMs: Infinity })).rejects.toThrow();
    await expect(executeSupervisedKujo({ ...invocation, signal: AbortSignal.abort() })).rejects.toMatchObject({ code: "KUJO_EXEC_CANCELLED" });
    expect(await readFile(marker, "utf8").catch(() => null)).toBeNull();
  });
  it("enforces native timeout, cancellation and output caps independently", async () => {
    await expect(executeSupervisedKujo({ ...input("process.on('SIGTERM',()=>{});setInterval(()=>{},100)"), timeoutMs: 150 })).rejects.toMatchObject({ code: "KUJO_EXEC_TIMEOUT" });
    const controller = new AbortController();
    const running = executeSupervisedKujo({ ...input("setInterval(()=>{},100)"), signal: controller.signal });
    const cancelled = expect(running).rejects.toMatchObject({ code: "KUJO_EXEC_CANCELLED" });
    await delay(100); controller.abort(); await cancelled;
    await expect(executeSupervisedKujo(input("process.on('SIGTERM',()=>{});process.stdout.write('x'.repeat(10000));setInterval(()=>{},100)"))).rejects.toMatchObject({ code: "KUJO_OUTPUT_LIMIT" });
  }, 10_000);
  it("stops the native process and descendants when its worker dies abruptly", async () => {
    const f = await workerFixture();
    const closed = once(f.worker, "close"); f.worker.kill("SIGKILL"); await closed;
    await f.stopped();
    expect(await readFile(join(f.cwd, "result"), "utf8").catch(() => null)).toBeNull();
  }, 15_000);
  it("expires a stalled worker lease instead of leaving trusted code running", async () => {
    const f = await workerFixture(); f.worker.send("stall");
    await f.stopped(SUPERVISOR_LEASE_MS + 4000);
    expect(await ready(join(f.cwd, "result"))).toContain("KUJO_EXEC_CANCELLED");
  }, 20_000);
  it("fails closed when the packed supervisor is absent", async () => {
    const cwd = await root(); await mkdir(join(cwd, "dist")); await writeFile(join(cwd, "package.json"), '{"type":"module"}');
    await writeFile(join(cwd, "invocation.json"), JSON.stringify(input("process.stdout.write('unexpected')")));
    await build({ entryPoints: [resolve("tests/fixtures/supervised-worker.ts")], outfile: join(cwd, "dist/worker.js"), bundle: true, platform: "node", format: "esm" });
    const worker = fork(join(cwd, "dist/worker.js"), [cwd], { execArgv: [], env: safeChildEnv(), stdio: ["ignore", "ignore", "ignore", "ipc"] }); workers.push(worker);
    const [message] = await once(worker, "message"); expect(message).toContain("without a confirmed outcome");
  });
});
