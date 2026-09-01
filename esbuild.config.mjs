import { build } from "esbuild";
import { rm } from "node:fs/promises";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

const presets = createPluginBundlerPresets({
  pluginRoot: import.meta.dirname,
  uiEntry: "src/ui/index.tsx",
  sourcemap: false,
});

await rm(new URL("./dist", import.meta.url), { recursive: true, force: true });
await Promise.all([
  build(presets.esbuild.worker),
  build(presets.esbuild.manifest),
  ...(presets.esbuild.ui ? [build(presets.esbuild.ui)] : []),
]);
