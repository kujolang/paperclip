import type { PluginConfig } from "../config/schema.js";
import { executeKujo } from "../runtime/execute-kujo.js";
import { KujoPluginError } from "../runtime/errors.js";
import { resolveKujo } from "../runtime/resolve-kujo.js";
import type { ExecuteKujoResult } from "../runtime/types.js";
import { resolveComponent, type ComponentId } from "./registry.js";
import { validateComponentOutput } from "./validate-output.js";

export type RunComponentInput = {
  component: ComponentId;
  cwd: string;
  args: string[];
  config: PluginConfig;
  interpreter?: boolean;
};

export type RunComponentResult<T = unknown> = ExecuteKujoResult & {
  component: ComponentId;
  componentVersion: string;
  componentCommit: string;
  parsed?: T;
};

export async function runComponent<T = unknown>(input: RunComponentInput): Promise<RunComponentResult<T>> {
  const [runtime, component] = await Promise.all([
    resolveKujo(input.config, input.cwd),
    resolveComponent(input.component),
  ]);
  const invocation = ["run", ...(input.interpreter ? ["--interpreter"] : []), component.entrypointPath, "--", ...input.args];
  const result = await executeKujo({
    executable: runtime.executable,
    cwd: input.cwd,
    args: invocation,
    timeoutMs: input.config.limits.timeoutMs,
    maxStdoutBytes: input.config.limits.maxStdoutBytes,
    maxStderrBytes: input.config.limits.maxStderrBytes,
  });
  if (result.exitCode !== 0) {
    throw new KujoPluginError("KUJO_RUNTIME_EXEC_FAILED", `${input.component} exited with ${result.exitCode}`, {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
  let parsed: T | undefined;
  const trimmed = result.stdout.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      parsed = validateComponentOutput(input.component, input.args[0], JSON.parse(trimmed)) as T;
    } catch {
      throw new KujoPluginError("KUJO_COMPONENT_SCHEMA_INVALID", `${input.component} returned invalid JSON`);
    }
  }
  return {
    ...result,
    runtimeVersion: runtime.runtimeVersion,
    component: input.component,
    componentVersion: component.version,
    componentCommit: component.gitCommit,
    ...(parsed === undefined ? {} : { parsed }),
  };
}
