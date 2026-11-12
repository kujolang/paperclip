import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { redactText } from "../failure/redact.js";

const text = z.string().max(2_000);
const nullableText = text.nullable().default(null);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().default(null);
const money = z.number().finite().nonnegative().nullable().default(null);
const timestamp = z.string().datetime({ offset: true });
// Adapter admission contract for RunLedger 1.2.1's unversioned JSON records.
// Unknown fields are discarded; paths, commands and references are never followed.
export const runledgerRecordSchema = z.object({
  id: z.string().min(1).max(200), created_at: timestamp, updated_at: timestamp,
  status: z.enum(["in_progress", "pass", "partial", "fail", "abandoned"]),
  provider: text, model: text, task_name: text,
  start_commit: nullableText, end_commit: nullableText,
  git_dirty_start: z.boolean().nullable().default(null), git_dirty_end: z.boolean().nullable().default(null),
  changed_files: z.array(text).max(1_000).default([]),
  tests: z.array(z.object({ at: timestamp, name: text, status: z.enum(["pass", "fail", "skip"]), details: nullableText })).max(1_000).default([]),
  usage: z.object({ input_tokens: count, output_tokens: count, cache_read_tokens: count, cache_write_tokens: count }).default({ input_tokens: null, output_tokens: null, cache_read_tokens: null, cache_write_tokens: null }),
  cost: z.object({ currency: z.string().max(20), input_cost: money, output_cost: money, cache_cost: money, total_cost: money }).nullable().default(null),
  correlation: z.object({ watchdog_trace_id: nullableText, watchdog_run_id: nullableText, dispatch_run_id: nullableText, relay_run_id: nullableText, eval_run_id: nullableText }).nullable().default(null),
  verdict: nullableText,
});
export const hostBindingSchema = z.object({
  companyId: z.string(), projectId: z.string().nullable(), issueId: z.string().nullable(),
  parentIssueId: z.string().nullable(), agentId: z.string().nullable(), runId: z.string().nullable(),
  attribution: z.enum(["host-agent-importer", "human-importer"]),
});
export type HostBinding = z.infer<typeof hostBindingSchema>;
export const runledgerReportSchema = z.object({
  schemaVersion: z.literal(1), id: z.string(), generatedAt: timestamp,
  sourceKind: z.literal("imported"), producer: z.literal("RunLedger"),
  record: runledgerRecordSchema, host: hostBindingSchema,
  classification: z.enum(["failed", "incomplete", "unverified"]),
  verificationMethod: z.literal("schema-validation-only"), executionObserved: z.literal(false),
  sourceDigest: z.string(), sourceBytes: z.number(), redactedCount: z.number(), notice: z.string(),
});
export type RunLedgerReport = z.infer<typeof runledgerReportSchema>;
export function importRunLedger(json: string, host: HostBinding): RunLedgerReport {
  const sourceBytes = Buffer.byteLength(json);
  if (sourceBytes > 65_536) throw new Error("RunLedger JSON exceeds the 64 KiB import limit");
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new Error("Paste a valid RunLedger JSON record"); }
  const depth = (value: unknown, level = 0): void => {
    if (level > 32) throw new Error("RunLedger JSON exceeds the nesting limit");
    if (value && typeof value === "object") for (const child of Object.values(value)) depth(child, level + 1);
  };
  depth(raw);
  const parsed = runledgerRecordSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Invalid or unsupported RunLedger record");
  const original = parsed.data;
  if (Date.parse(original.updated_at) < Date.parse(original.created_at)) throw new Error("RunLedger update precedes creation");
  let redactedCount = 0;
  const sanitize = (value: unknown): unknown => {
    if (typeof value === "string") { const result = redactText(value); redactedCount += result.count; return result.text; }
    if (Array.isArray(value)) return value.map(sanitize);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
    return value;
  };
  const record = runledgerRecordSchema.parse(sanitize(original));
  return runledgerReportSchema.parse({
    schemaVersion: 1, id: `runledger_${randomUUID()}`, generatedAt: new Date().toISOString(), sourceKind: "imported", producer: "RunLedger", record, host,
    classification: original.status === "fail" || original.tests.some(test => test.status === "fail") ? "failed"
      : original.status !== "pass" || original.tests.length === 0 || original.tests.some(test => test.status === "skip") ? "incomplete" : "unverified",
    verificationMethod: "schema-validation-only", executionObserved: false,
    sourceDigest: createHash("sha256").update(json).digest("hex"), sourceBytes, redactedCount,
    notice: "Imported RunLedger claims. Host identity identifies the importer, not the producer. Tests, commits, usage, costs and correlation identifiers are supplied and unverified. No commands or references are opened. Checksums identify bytes, not authenticity. A reported pass never grants verified completion.",
  });
}
