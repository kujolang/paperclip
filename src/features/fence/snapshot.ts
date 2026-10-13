import { discoverWorkspaceInventory } from "../verification/snapshot.js";
export { copyWorkspaceSnapshot as copyFenceSnapshot, SNAPSHOT_LIMITS, type SnapshotFile } from "../verification/snapshot.js";

const priority = (path: string) => path === "fence.toml" || path === "fence.json" ? 0 : /\.(?:toml|json)$/.test(path) ? 1 : 2;
export const discoverFenceInventory = (cwd: string) => discoverWorkspaceInventory(cwd, priority);
