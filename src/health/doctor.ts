import { access } from "node:fs/promises";
import { componentsInfo, resolveComponent } from "../components/registry.js";
import { PAPERCLIP_API_VERSION, PLUGIN_VERSION } from "../config/defaults.js";
import { tmpdir } from "node:os";
import { parsePluginConfig, type PluginConfig } from "../config/schema.js";
import { resolveKujo } from "../runtime/resolve-kujo.js";
import { normalizeError } from "../runtime/errors.js";

export type RuntimeHealth = {
  status: "ok" | "error";
  platform: string;
  arch: string;
  version?: string;
  source?: string;
  code?: string;
  repair?: string;
};

export type DoctorReport = Awaited<ReturnType<typeof doctor>>;

export async function doctor(config: PluginConfig = parsePluginConfig({})) {
  const components = await componentsInfo();
  const statuses = await Promise.all(components.map(async (component) => {
    try {
      const resolved = await resolveComponent(component.id);
      await access(resolved.entrypointPath);
      return { id: component.id, version: component.version, integrity: "ok" as const };
    } catch (error) {
      return { id: component.id, version: component.version, integrity: "failed" as const, error: error instanceof Error ? error.message : String(error) };
    }
  }));
  let runtime: RuntimeHealth;
  try {
    // Probe only the resolved executable, outside the project workspace. The
    // shared resolver enforces the version, timeout and bounded process contract.
    const resolved = await resolveKujo(config, tmpdir());
    runtime = { status: "ok", platform: resolved.platform, arch: resolved.arch, version: resolved.runtimeVersion, source: resolved.source };
  } catch (error) {
    const normalized = normalizeError(error);
    runtime = {
      status: "error", platform: process.platform, arch: process.arch, code: normalized.code,
      repair: config.runtime.binary
        ? "Check the configured absolute Kujo binary and its version, or clear the override to use the bundled runtime."
        : "Repair the plugin installation for this platform, or configure a compatible absolute Kujo binary.",
    };
  }
  const failed = runtime.status === "error" || statuses.some((status) => status.integrity === "failed");
  const capability = (enabled: boolean, ids: string[]) => !enabled ? "disabled" as const
    : runtime.status === "error" || statuses.some((item) => ids.includes(item.id) && item.integrity === "failed")
      ? "blocked" as const : "ready" as const;
  return {
    status: failed ? "error" as const : "ok" as const,
    pluginVersion: PLUGIN_VERSION,
    paperclipApiVersion: PAPERCLIP_API_VERSION,
    runtime,
    components: statuses,
    capabilities: {
      fence: capability(config.features.verification, ["fence"]),
      spec: capability(config.features.verification, ["spec"]),
      language: capability(config.features.language, []),
      understand: capability(config.features.understand, ["scout"]),
      examples: capability(config.features.examples, []),
      review: capability(config.features.review, ["changebucket", "patchbrief"]),
      context: capability(config.features.context, ["context"]),
      failureEvidence: capability(config.features.failureEvidence, ["failure-evidence"]),
    },
  };
}
