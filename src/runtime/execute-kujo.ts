import { spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { KujoPluginError } from "./errors.js";
import type { ExecuteKujoInput, ExecuteKujoResult } from "./types.js";

function safeChildEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const allowed = ["PATH", "NODE_PATH", "LANG", "LC_ALL", "TMPDIR", "TEMP", "SYSTEMROOT", "WINDIR"];
  const env: NodeJS.ProcessEnv = {};
  for (const key of allowed) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return { ...env, ...extra };
}

async function assertDirectory(cwd: string): Promise<string> {
  if (!cwd || !cwd.startsWith("/")) {
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
    });

    let stdout: Buffer = Buffer.alloc(0);
    let stderr: Buffer = Buffer.alloc(0);
    let timedOut = false;
    let outputExceeded = false;

    const append = (current: Buffer, chunk: Buffer, limit: number): Buffer => {
      const remaining = Math.max(0, limit - current.byteLength);
      if (chunk.byteLength > remaining) outputExceeded = true;
      return remaining === 0 ? current : Buffer.concat([current, chunk.subarray(0, remaining)]);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk, input.maxStdoutBytes);
      if (outputExceeded) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk, input.maxStderrBytes);
      if (outputExceeded) child.kill("SIGTERM");
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1_000).unref();
    }, input.timeoutMs);
    timer.unref();

    child.once("error", (error) => {
      clearTimeout(timer);
      reject(new KujoPluginError("KUJO_RUNTIME_EXEC_FAILED", error.message, { executable: input.executable }));
    });

    child.once("close", (code) => {
      clearTimeout(timer);
      const details = {
        executable: input.executable,
        exitCode: code ?? -1,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        durationMs: Math.round(performance.now() - start),
        timedOut,
      };
      if (timedOut) {
        reject(new KujoPluginError("KUJO_EXEC_TIMEOUT", `Kujo exceeded ${input.timeoutMs} ms`, details));
      } else if (outputExceeded) {
        reject(new KujoPluginError("KUJO_OUTPUT_LIMIT", "Kujo output exceeded the configured byte limit", details));
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
