import { build } from "esbuild";
import { resolve } from "node:path";

export async function buildRuntimeSupervisor(outfile = resolve(import.meta.dirname, "../dist/runtime-supervisor.js")) {
  await build({ entryPoints: [resolve(import.meta.dirname, "../src/runtime/supervisor-entry.ts")], outfile,
    platform: "node", format: "esm", bundle: true, sourcemap: false, target: "node24" });
}
