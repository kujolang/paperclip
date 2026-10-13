import { spawn } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";
import { packageRoot } from "../components/registry.js";
import { safeChildEnv } from "./execute-kujo.js";
import { KujoPluginError, KUJO_ERROR_CODES } from "./errors.js";
import { supervisorInput, SUPERVISOR_PULSE_MS } from "./supervisor-protocol.js";
import type { ExecuteKujoInput, ExecuteKujoResult } from "./types.js";

const response = z.discriminatedUnion("type", [
  z.object({ type: z.literal("result"), result: z.object({ executable: z.string(), runtimeVersion: z.string(), exitCode: z.number().int(), stdout: z.string(), stderr: z.string(), durationMs: z.number().nonnegative(), timedOut: z.boolean() }).strict() }).strict(),
  z.object({ type: z.literal("failure"), code: z.enum(KUJO_ERROR_CODES), message: z.string(), details: z.record(z.string(), z.unknown()).optional() }).strict(),
  z.object({ type: z.literal("error"), message: z.string() }).strict(),
]);

/** Only reviewed adapters call this after persistent approval/ownership admission. */
export async function executeSupervisedKujo(input: ExecuteKujoInput): Promise<ExecuteKujoResult> {
  const { signal, ...raw } = input;
  const invocation = supervisorInput.parse(raw);
  if (signal?.aborted) throw new KujoPluginError("KUJO_EXEC_CANCELLED", "Execution cancelled before supervisor start");
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(packageRoot(), "dist/runtime-supervisor.js")], {
      env: safeChildEnv(),
      // An abrupt kill of the worker's process group must leave the guardian
      // alive long enough to stop its separately owned native process group.
      detached: true, windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    let settled = false;
    let received: z.infer<typeof response> | undefined;
    // A final response may already be buffered when a resumed worker gets an
    // EPIPE on its next pulse. Do not disconnect here and discard that response.
    const send = (value: unknown) => {
      if (child.connected) child.send(value as object, error => { if (error) clearInterval(pulses); });
    };
    const cancel = () => send({ type: "cancel" });
    const pulses = setInterval(() => send({ type: "pulse" }), SUPERVISOR_PULSE_MS);
    const watchdog = setTimeout(() => {
      // A timeout is loss of observation, not evidence of failed effects or
      // stopped descendants. Disconnect asks a live supervisor to abort.
      finish(new Error("Execution supervisor outcome is unconfirmed"));
      if (child.connected) child.disconnect();
    }, invocation.timeoutMs + 3_000);
    const finish = (error?: Error, result?: ExecuteKujoResult) => {
      if (settled) return;
      settled = true; clearInterval(pulses); clearTimeout(watchdog);
      signal?.removeEventListener("abort", cancel);
      if (error) reject(error); else resolve(result!);
    };
    signal?.addEventListener("abort", cancel, { once: true });
    child.once("error", () => finish(new Error("Execution supervisor could not start")));
    child.on("message", rawResponse => {
      const parsed = response.safeParse(rawResponse);
      if (received || !parsed.success || Buffer.byteLength(JSON.stringify(rawResponse)) > 4_000_000) {
        cancel(); finish(new Error("Invalid execution supervisor outcome")); return;
      }
      clearInterval(pulses);
      received = parsed.data;
    });
    child.once("close", (code) => {
      if (code !== 0 || !received) return finish(new Error("Execution supervisor exited without a confirmed outcome"));
      if (received.type === "error") return finish(new Error(received.message));
      if (received.type === "failure") return finish(new KujoPluginError(received.code, received.message, received.details));
      if (received.result.executable !== invocation.executable || Buffer.byteLength(received.result.stdout) > invocation.maxStdoutBytes * 3 || Buffer.byteLength(received.result.stderr) > invocation.maxStderrBytes * 3) return finish(new Error("Execution supervisor result does not match the invocation"));
      finish(undefined, received.result);
    });
    send({ type: "start", input: invocation });
    if (signal?.aborted) cancel();
  });
}
