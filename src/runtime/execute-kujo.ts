import { spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { KujoPluginError } from "./errors.js";
import type { ExecuteKujoInput, ExecuteKujoResult } from "./types.js";

const activeTerminators = new Set<() => Promise<void>>();

export async function terminateActiveKujoProcesses(): Promise<void> {
  await Promise.allSettled([...activeTerminators].map((terminate) => terminate()));
}

export function safeChildEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const allowed = ["PATH", "NODE_PATH", "LANG", "LC_ALL", "TMPDIR", "TEMP", "SYSTEMROOT", "WINDIR"];
  const env: NodeJS.ProcessEnv = {};
  for (const key of allowed) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
  return {
    ...env,
    ...extra,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_EXTERNAL_DIFF: "",
    GIT_CONFIG_COUNT: "3",
    GIT_CONFIG_KEY_0: "core.fsmonitor",
    GIT_CONFIG_VALUE_0: "false",
    GIT_CONFIG_KEY_1: "core.hooksPath",
    GIT_CONFIG_VALUE_1: nullDevice,
    GIT_CONFIG_KEY_2: "diff.external",
    GIT_CONFIG_VALUE_2: "",
  };
}

async function assertDirectory(cwd: string): Promise<string> {
  if (!cwd || !isAbsolute(cwd)) {
    throw new KujoPluginError("KUJO_WORKSPACE_NOT_FOUND", "Workspace path must be absolute", { cwd });
  }
  const resolved = await realpath(cwd).catch(() => null);
  if (!resolved || !(await stat(resolved)).isDirectory()) {
    throw new KujoPluginError("KUJO_WORKSPACE_NOT_FOUND", "Workspace directory does not exist", { cwd });
  }
  return resolved;
}

export async function executeKujo(input: ExecuteKujoInput): Promise<ExecuteKujoResult> {
  const cwd = await assertDirectory(input.cwd);
  const start = performance.now();

  return await new Promise<ExecuteKujoResult>((resolve, reject) => {
    const child = spawn(input.executable, input.args, {
      cwd,
      env: safeChildEnv(input.env),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });

    let stdout: Buffer = Buffer.alloc(0);
    let stderr: Buffer = Buffer.alloc(0);
    let timedOut = false;
    let outputExceeded = false;
    let cancelled = false;
    let killTimer: NodeJS.Timeout | undefined;
    let treeTermination: Promise<void> | undefined;

    const signalTree = (signal: NodeJS.Signals) => {
      if (process.platform !== "win32" && child.pid) {
        try {
          process.kill(-child.pid, signal);
          return;
        } catch { /* Fall back to the direct child below. */ }
      }
      child.kill(signal);
    };

    const forceWindowsTree = (): Promise<void> => new Promise((done) => {
      if (!child.pid) return done();
      const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
        env: safeChildEnv(),
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("error", () => { child.kill("SIGKILL"); done(); });
      killer.once("close", () => done());
    });

    const terminate = () => {
      if (process.platform === "win32") {
        treeTermination ??= forceWindowsTree();
      } else {
        signalTree("SIGTERM");
        treeTermination ??= new Promise<void>((done) => {
          killTimer = setTimeout(() => { signalTree("SIGKILL"); done(); }, 1_000);
          killTimer.unref();
        });
      }
    };

    const terminateAndWait = async () => {
      cancelled = true;
      terminate();
      await treeTermination;
    };
    activeTerminators.add(terminateAndWait);
    input.signal?.addEventListener("abort", terminateAndWait, { once: true });
    if (input.signal?.aborted) void terminateAndWait();

    const cleanup = () => {
      activeTerminators.delete(terminateAndWait);
      input.signal?.removeEventListener("abort", terminateAndWait);
    };

    const append = (current: Buffer, chunk: Buffer, limit: number): Buffer => {
      const remaining = Math.max(0, limit - current.byteLength);
      if (chunk.byteLength > remaining) outputExceeded = true;
      return remaining === 0 ? current : Buffer.concat([current, chunk.subarray(0, remaining)]);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk, input.maxStdoutBytes);
      if (outputExceeded) terminate();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk, input.maxStderrBytes);
      if (outputExceeded) terminate();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, input.timeoutMs);
    timer.unref();

    child.once("error", (error) => {
      clearTimeout(timer);
      if (killTimer && !treeTermination) clearTimeout(killTimer);
      cleanup();
      reject(new KujoPluginError("KUJO_RUNTIME_EXEC_FAILED", error.message, { executable: input.executable }));
    });

    child.once("close", async (code) => {
      clearTimeout(timer);
      await treeTermination;
      cleanup();
      const details = {
        executable: input.executable,
        exitCode: code ?? -1,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        durationMs: Math.round(performance.now() - start),
        timedOut,
      };
      if (cancelled && !timedOut && !outputExceeded) {
        reject(new KujoPluginError("KUJO_EXEC_CANCELLED", "Kujo execution was cancelled", details));
      } else if (outputExceeded) {
        reject(new KujoPluginError("KUJO_OUTPUT_LIMIT", "Kujo output exceeded the configured byte limit", details));
      } else if (timedOut) {
        reject(new KujoPluginError("KUJO_EXEC_TIMEOUT", `Kujo exceeded ${input.timeoutMs} ms`, details));
      } else {
        resolve({ ...details, runtimeVersion: "unknown" });
      }
    });
  });
}

export async function executeVersion(executable: string, cwd: string, timeoutMs = 5_000): Promise<string> {
  const result = await executeKujo({
    executable,
    cwd,
    args: ["--version"],
    timeoutMs,
    maxStdoutBytes: 16_384,
    maxStderrBytes: 16_384,
  });
  if (result.exitCode !== 0) {
    throw new KujoPluginError("KUJO_RUNTIME_EXEC_FAILED", "Kujo --version failed", result);
  }
  const match = `${result.stdout}\n${result.stderr}`.match(/(?:kujo\s+)?v?(\d+\.\d+\.\d+)/i);
  if (!match?.[1]) {
    throw new KujoPluginError("KUJO_RUNTIME_INCOMPATIBLE", "Unable to parse Kujo runtime version");
  }
  return match[1];
}
