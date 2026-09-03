import { rm } from "node:fs/promises";

export async function removeTree(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
