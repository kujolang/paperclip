import { access } from "node:fs/promises";
import { componentsInfo, resolveComponent } from "../components/registry.js";
import { PAPERCLIP_API_VERSION, PLUGIN_VERSION } from "../config/defaults.js";

export async function doctor() {
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
  const failed = statuses.some((status) => status.integrity === "failed");
  return {
    status: failed ? "error" as const : "ok" as const,
    pluginVersion: PLUGIN_VERSION,
    paperclipApiVersion: PAPERCLIP_API_VERSION,
    runtime: { status: "unchecked" as const, platform: process.platform, arch: process.arch },
    components: statuses,
  };
}

