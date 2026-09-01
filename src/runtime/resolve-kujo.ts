import { delimiter, isAbsolute } from "node:path";
import { access, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { KujoPluginError } from "./errors.js";
import { executeVersion } from "./execute-kujo.js";
import type { PluginConfig } from "../config/schema.js";
import type { ResolvedRuntime } from "./types.js";

const MINIMUM_RUNTIME = "1.2.0";

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

async function validateExecutable(candidate: string): Promise<string> {
  const resolved = await realpath(candidate).catch(() => null);
  if (!resolved || !isAbsolute(resolved)) {
    throw new KujoPluginError("KUJO_RUNTIME_NOT_FOUND", `Kujo executable does not exist: ${candidate}`);
  }
  await access(resolved, process.platform === "win32" ? constants.F_OK : constants.X_OK).catch(() => {
    throw new KujoPluginError("KUJO_RUNTIME_NOT_FOUND", `Kujo executable is not runnable: ${candidate}`);
  });
  return resolved;
}

async function resolveFromPath(): Promise<string | null> {
  const executable = process.platform === "win32" ? "kujo.exe" : "kujo";
  for (const segment of (process.env.PATH ?? "").split(delimiter)) {
    if (!segment || !isAbsolute(segment)) continue;
    const resolved = await validateExecutable(`${segment}/${executable}`).catch(() => null);
    if (resolved) return resolved;
  }
  return null;
}

async function assertCompatible(executable: string, cwd: string, source: ResolvedRuntime["source"]): Promise<ResolvedRuntime> {
  const runtimeVersion = await executeVersion(executable, cwd);
  if (compareVersions(runtimeVersion, MINIMUM_RUNTIME) < 0) {
    throw new KujoPluginError(
      "KUJO_RUNTIME_INCOMPATIBLE",
      `Kujo ${runtimeVersion} is older than required ${MINIMUM_RUNTIME}`,
      { executable, source, runtimeVersion },
    );
  }
  return { executable, runtimeVersion, source, platform: process.platform, arch: process.arch };
}

export async function resolveKujo(config: PluginConfig, cwd: string): Promise<ResolvedRuntime> {
  if (config.runtime.binary) {
    const executable = await validateExecutable(config.runtime.binary);
    return await assertCompatible(executable, cwd, "configured");
  }

  try {
    const runtime = await import("@kujolang/kujo-runtime");
    const info = runtime.getKujoRuntimeInfo();
    const executable = await validateExecutable(info.binaryPath);
    return await assertCompatible(executable, cwd, "bundled");
  } catch (error) {
    if (error instanceof KujoPluginError && error.code === "KUJO_RUNTIME_INCOMPATIBLE") throw error;
  }

  if (config.runtime.allowSystemPathFallback) {
    const executable = await resolveFromPath();
    if (executable) return await assertCompatible(executable, cwd, "path");
  }

  throw new KujoPluginError(
    "KUJO_RUNTIME_NOT_FOUND",
    "No configured, bundled, or compatible PATH Kujo runtime was found",
    { platform: process.platform, arch: process.arch },
  );
}

