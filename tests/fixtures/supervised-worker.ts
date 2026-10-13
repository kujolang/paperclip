import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { executeSupervisedKujo } from "../../src/runtime/supervised-kujo.js";

const root = process.argv[2]!;
process.on("message", message => {
  if (message === "stall") Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 8000);
});
try {
  await executeSupervisedKujo(JSON.parse(readFileSync(join(root, "invocation.json"), "utf8")));
} catch (error) {
  writeFileSync(join(root, "result"), String(error));
  if (process.connected) process.send?.(String(error));
} finally {
  if (process.connected) process.disconnect?.();
}
