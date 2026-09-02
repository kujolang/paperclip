import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KujoPluginError } from "../runtime/errors.js";
import { isPathInside } from "../runtime/path.js";

export type ComponentId = "changebucket" | "patchbrief" | "failure-evidence" | "context";

export type ComponentInfo = {
  id: ComponentId;
  repository: string;
  gitCommit: string;
  version: string;
  license: string;
  entrypoint: string;
  files: string[];
  checksums: Record<string, string>;
  outputContracts: Array<{ name: string; format: "json"; schema: string }>;
};

type ComponentLock = {
  schemaVersion: 1;
  bundleVersion: string;
  runtime: { minimumVersion: string };
  components: ComponentInfo[];
};

function packageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, basename(here) === "dist" ? ".." : "../..");
}

export async function loadComponentLock(): Promise<ComponentLock> {
  const filename = join(packageRoot(), "bundled", "kujo-components.lock.json");
  const value = JSON.parse(await readFile(filename, "utf8")) as ComponentLock;
  if (value.schemaVersion !== 1 || !Array.isArray(value.components)) {
    throw new KujoPluginError("KUJO_COMPONENT_INTEGRITY_FAILED", "Invalid component lock manifest");
  }
  return value;
}

export async function componentsInfo(): Promise<ComponentInfo[]> {
  return (await loadComponentLock()).components;
}

export async function resolveComponent(id: ComponentId): Promise<ComponentInfo & { root: string; entrypointPath: string }> {
  const lock = await loadComponentLock();
  const component = lock.components.find((candidate) => candidate.id === id);
  if (!component) throw new KujoPluginError("KUJO_COMPONENT_NOT_FOUND", `Unknown component: ${id}`);
  const root = join(packageRoot(), "bundled", "components", id);
  const realRoot = await realpath(root).catch(() => null);
  if (!realRoot) throw new KujoPluginError("KUJO_COMPONENT_INTEGRITY_FAILED", `${id} bundle directory is missing`);
  for (const relative of component.files) {
    const filename = join(realRoot, relative);
    const resolved = await realpath(filename).catch(() => null);
    if (!resolved || !isPathInside(realRoot, resolved)) {
      throw new KujoPluginError("KUJO_COMPONENT_INTEGRITY_FAILED", `${id} contains an unsafe or missing path`, { relative });
    }
    const digest = createHash("sha256").update(await readFile(resolved)).digest("hex");
    if (digest !== component.checksums[relative]) {
      throw new KujoPluginError("KUJO_COMPONENT_INTEGRITY_FAILED", `${id} checksum mismatch`, { relative });
    }
  }
  return { ...component, root: realRoot, entrypointPath: join(realRoot, component.entrypoint) };
}
