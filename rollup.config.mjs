import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

const presets = createPluginBundlerPresets({ pluginRoot: import.meta.dirname, uiEntry: "src/ui/index.tsx" });

export default [presets.rollup.worker, presets.rollup.manifest, presets.rollup.ui].filter(Boolean);
