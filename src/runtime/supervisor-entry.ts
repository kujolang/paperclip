// An independently bounded child owns the native process. Worker SIGKILL or an
// unresponsive event loop closes/expires the control channel and aborts it.
// This is trusted-host process containment, not a sandbox or daemon.
import { executeKujo } from "./execute-kujo.js";
import { KujoPluginError } from "./errors.js";
import { supervisorInput, SUPERVISOR_LEASE_MS } from "./supervisor-protocol.js";

const controller = new AbortController();
let admitted = false;
let lastPulse = Date.now();
let finished = false;
const stop = () => controller.abort();
const lease = setInterval(() => { if (Date.now() - lastPulse >= SUPERVISOR_LEASE_MS) stop(); }, 100);
const startup = setTimeout(() => { if (!admitted) finish({ type: "error", message: "Supervisor admission was not received" }); }, SUPERVISOR_LEASE_MS);

function finish(message: unknown) {
  if (finished) return;
  finished = true; clearInterval(lease); clearTimeout(startup);
  if (process.connected && process.send) {
    process.send(message, () => { if (process.connected) process.disconnect?.(); });
  }
}

process.on("disconnect", () => { stop(); if (!admitted) finish(null); });
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
process.on("message", (raw: unknown) => {
  if (finished) return;
  const message = raw as { type?: unknown; input?: unknown } | null;
  if (message?.type === "pulse" && admitted) { lastPulse = Date.now(); return; }
  if (message?.type === "cancel") { stop(); return; }
  if (message?.type !== "start" || admitted || controller.signal.aborted) {
    stop(); if (!admitted) finish({ type: "error", message: "Invalid supervisor protocol" }); return;
  }
  const parsed = supervisorInput.safeParse(message.input);
  if (!parsed.success) { finish({ type: "error", message: "Invalid supervisor invocation" }); return; }
  admitted = true; lastPulse = Date.now(); clearTimeout(startup);
  const { env, ...invocation } = parsed.data;
  void executeKujo({ ...invocation, ...(env ? { env } : {}), signal: controller.signal }).then(
    result => finish({ type: "result", result }),
    error => finish(error instanceof KujoPluginError
      ? { type: "failure", code: error.code, message: error.message.slice(error.code.length + 2), details: error.details }
      : { type: "error", message: "Supervisor could not confirm the native outcome" }),
  );
});

if (!process.connected) { stop(); finish(null); }
