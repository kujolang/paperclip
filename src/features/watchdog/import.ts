import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { hostBindingSchema, type HostBinding } from "../runledger/import.js";
import { redactText } from "../failure/redact.js";
const id = z.string().min(1).max(160), name = z.string().min(1).max(120), status = z.string().max(32);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
// Watchdog kujo.telemetry.v1 metadata projection. Strip attributes and all
// unknown fields: producer schemas permit arbitrary data there, including bodies.
const trace = z.object({ trace_id: id, name, status, started_at_ms: count, ended_at_ms: count.optional(), duration_ms: count.optional(), input_tokens: count.optional(), output_tokens: count.optional(), cached_input_tokens: count.optional(), cache_write_input_tokens: count.optional() });
export const telemetrySchema = z.object({ schema_version: z.literal("kujo.telemetry.v1"), source_app: z.string().min(1).max(80), trace_id: id, session_id: id,
  trace: trace.optional(), spans: z.array(z.object({ span_id: id, parent_span_id: z.string().max(160).optional(), span_kind: z.enum(["workflow", "model", "tool", "shell", "persistence", "internal"]), name, status, started_at_ms: count, ended_at_ms: count, duration_ms: count })).max(128).default([]),
  events: z.array(z.object({ event_id: id, event_name: name, sequence: count, occurred_at_ms: count, span_id: id.optional() })).max(512).default([]),
  tool_calls: z.array(z.object({ tool_call_id: id, tool_name: name, status, latency_ms: count })).max(64).default([]),
});
export function importWatchdog(json: string, host: HostBinding) {
  if (Buffer.byteLength(json) > 65536) throw new Error("Watchdog import exceeds 64 KiB");
  const record = telemetrySchema.parse(JSON.parse(json));
  if (record.trace && record.trace.trace_id !== record.trace_id) throw new Error("Telemetry trace identity mismatch");
  for (const span of [record.trace, ...record.spans]) if (span?.ended_at_ms !== undefined && span.ended_at_ms < span.started_at_ms) throw new Error("Telemetry timestamps are reversed");
  const clean = (value: unknown): unknown => typeof value === "string" ? redactText(value).text : Array.isArray(value) ? value.map(clean) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key,item])=>[key,clean(item)])) : value;
  return { schemaVersion: 1, id: `watchdog_${randomUUID()}`, generatedAt: new Date().toISOString(), sourceKind: "imported", producer: "Watchdog", classification: "unverified", executionObserved: false,
    host: hostBindingSchema.parse(host), record: telemetrySchema.parse(clean(record)), sourceDigest: createHash("sha256").update(json).digest("hex"), sourceBytes: Buffer.byteLength(json),
    notice: "Imported metadata, not authenticated producer telemetry. Host identity identifies the importer. Missing usage stays missing; no cost is inferred. Attributes, prompts, responses and tool arguments are discarded. Correlation IDs are claims, not access grants." };
}
