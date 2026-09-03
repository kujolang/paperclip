import { build } from "esbuild";
import { rm } from "node:fs/promises";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

const presets = createPluginBundlerPresets({
  pluginRoot: import.meta.dirname,
  uiEntry: "src/ui/index.tsx",
  sourcemap: false,
});
const worker = {
  ...presets.esbuild.worker,
  external: [...new Set([...(presets.esbuild.worker.external ?? []), "@kujolang/kujo-runtime"])],
};

await rm(new URL("./dist", import.meta.url), { recursive: true, force: true });
await Promise.all([
  build(worker),
  build(presets.esbuild.manifest),
  ...(presets.esbuild.ui ? [build(presets.esbuild.ui)] : []),
]);
