import { z } from "zod";

// Private worker/supervisor protocol, never accepted by a Paperclip action or
// agent tool. Public adapters still bind their own lower limits to approval.
export const supervisorInput = z.object({
  executable: z.string().min(1).max(4096), cwd: z.string().min(1).max(4096),
  args: z.array(z.string().max(16384)).max(128),
  timeoutMs: z.number().int().min(100).max(3_600_000),
  maxStdoutBytes: z.number().int().min(1).max(500_000),
  maxStderrBytes: z.number().int().min(1).max(64_000),
  env: z.record(z.string().max(256), z.string().max(16384)).optional(),
}).strict().refine(value => Buffer.byteLength(JSON.stringify(value)) <= 65_536, "Invocation exceeds supervisor admission limit");

export const SUPERVISOR_LEASE_MS = 5_000;
export const SUPERVISOR_PULSE_MS = 250;
