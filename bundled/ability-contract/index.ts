import { createHash } from "node:crypto";

export const ABILITY_SCHEMA_ID = "kujo.ability/v1";
export const ABILITY_RECEIPT_SCHEMA_ID = "kujo.ability.receipt/v1";

export type AbilityEffect = { kind: "read" | "write" | "delete" | "external"; resource: string };
export type AbilityDefinition = {
  schema: typeof ABILITY_SCHEMA_ID;
  id: string;
  version: string;
  title?: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  effects: AbilityEffect[];
  semantics?: { open_world: boolean; destructive: boolean; executes_code: boolean };
  idempotency: { mode: "intrinsic" | "keyed" | "none" };
};
export type Validation<T> = { ok: true; value: T } | { ok: false; code: string; message: string; details: Record<string, unknown> };
export type AbilityHandler = (input: unknown, context: Record<string, unknown>) => unknown | Promise<unknown>;

const abilityId = /^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*){2,}$/;
const version = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const digest = /^[a-f0-9]{64}$/;
const definitionFields = new Set(["schema", "id", "version", "title", "description", "input_schema", "output_schema", "effects", "idempotency", "semantics"]);
const receiptFields = new Set(["schema", "receipt_id", "invocation_id", "ability_id", "ability_version", "definition_digest", "handler_id", "handler_version", "status", "result", "error", "policy_decision", "approval_id", "idempotency", "request_id", "trace_id", "surface", "principal", "started_at_ms", "completed_at_ms", "duration_ms", "audit", "metadata"]);

function failure<T>(code: string, message: string, details: Record<string, unknown> = {}): Validation<T> {
  return { ok: false, code, message, details };
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function validIdentity(value: unknown): boolean {
  if (!record(value) || Object.keys(value).some((key) => !["type", "id", "tenant_id", "claims"].includes(key))) return false;
  return typeof value.type === "string" && value.type.trim().length >= 1 && value.type.trim().length <= 64
    && typeof value.id === "string" && value.id.trim().length >= 1 && value.id.trim().length <= 256
    && typeof value.tenant_id === "string" && value.tenant_id.length <= 256 && record(value.claims ?? {});
}
function stable(value: unknown): unknown {
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("canonical JSON v2 supports only safe integers");
  if (Array.isArray(value)) return value.map(stable);
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
export function canonicalJson(value: unknown): string { return JSON.stringify(stable(value)); }

export function validateAbilityDefinition(value: unknown): Validation<AbilityDefinition> {
  if (!record(value)) return failure("invalid_ability_definition", "Ability definition must be an object");
  const unknown = Object.keys(value).find((key) => !definitionFields.has(key));
  if (unknown) return failure("unknown_ability_field", "Ability definition contains an unsupported field", { field: unknown });
  if (value.schema !== ABILITY_SCHEMA_ID) return failure("invalid_ability_schema_id", `schema must be ${ABILITY_SCHEMA_ID}`);
  if (typeof value.id !== "string" || value.id.length > 240 || !abilityId.test(value.id)) return failure("invalid_ability_id", "id must be a lowercase dotted identifier with at least three segments");
  if (typeof value.version !== "string" || !version.test(value.version)) return failure("invalid_ability_version", "version must be numeric major.minor.patch text");
  if (typeof value.description !== "string" || value.description.trim().length < 3 || value.description.trim().length > 1000) return failure("invalid_ability_description", "description must contain 3 to 1000 characters");
  if (value.title !== undefined && (typeof value.title !== "string" || value.title.trim().length > 160)) return failure("invalid_ability_title", "title must contain at most 160 characters");
  if (!record(value.input_schema) || !record(value.output_schema)) return failure("invalid_ability_schema", "input_schema and output_schema must be objects");
  if (!Array.isArray(value.effects) || value.effects.length < 1 || value.effects.length > 16) return failure("invalid_ability_effects", "effects must contain 1 to 16 declarations");
  for (const effect of value.effects) {
    if (!record(effect) || Object.keys(effect).some((key) => key !== "kind" && key !== "resource")) return failure("invalid_ability_effect", "Each effect must contain only kind and resource");
    if (!["read", "write", "delete", "external"].includes(String(effect.kind))) return failure("invalid_ability_effect_kind", "Effect kind must be read, write, delete, or external");
    if (typeof effect.resource !== "string" || effect.resource.length > 240 || !abilityId.test(effect.resource)) return failure("invalid_ability_effect_resource", "Effect resource must be a lowercase dotted identifier");
  }
  if (Object.hasOwn(value, "semantics")) {
    const semantics = value.semantics;
    if (!record(semantics) || Object.keys(semantics).length !== 3 || ["open_world", "destructive", "executes_code"].some((key) => typeof semantics[key] !== "boolean")) return failure("invalid_ability_semantics", "semantics must contain exactly open_world, destructive, and executes_code booleans");
    if ((value.effects.every((effect) => effect.kind === "read") && (semantics.destructive || semantics.executes_code)) || (value.effects.some((effect) => effect.kind === "delete") && !semantics.destructive)) return failure("inconsistent_ability_semantics", "semantics contradict declared effects");
  }
  if (!record(value.idempotency) || Object.keys(value.idempotency).some((key) => key !== "mode") || !["intrinsic", "keyed", "none"].includes(String(value.idempotency.mode))) return failure("invalid_ability_idempotency_mode", "idempotency.mode must be intrinsic, keyed, or none");
  return { ok: true, value: value as AbilityDefinition };
}

export function abilityDefinitionDigestV2(value: unknown): Validation<string> {
  const checked = validateAbilityDefinition(value);
  if (!checked.ok) return checked;
  try { return { ok: true, value: createHash("sha256").update(canonicalJson(value)).digest("hex") }; }
  catch { return failure("unsupported_canonical_json_number", "Canonical JSON v2 supports only safe integers; decimal-valued definitions require a later versioned algorithm"); }
}

export function validateAbilityReceipt(value: unknown): Validation<Record<string, unknown>> {
  if (!record(value)) return failure("invalid_ability_receipt", "Ability receipt must be an object");
  const unknown = Object.keys(value).find((key) => !receiptFields.has(key));
  if (unknown) return failure("unknown_ability_receipt_field", "Ability receipt contains an unsupported field", { field: unknown });
  if (value.schema !== ABILITY_RECEIPT_SCHEMA_ID) return failure("invalid_ability_receipt_schema", `receipt.schema must be ${ABILITY_RECEIPT_SCHEMA_ID}`);
  for (const field of ["receipt_id", "invocation_id", "ability_id", "ability_version", "handler_id", "handler_version", "status", "request_id", "trace_id", "surface"]) {
    if (typeof value[field] !== "string" || value[field].trim().length < 1 || value[field].trim().length > 240) return failure("invalid_ability_receipt", "Receipt field is required", { field });
  }
  if (!abilityId.test(String(value.ability_id)) || !version.test(String(value.ability_version)) || !version.test(String(value.handler_version))) return failure("invalid_ability_receipt_identity", "Receipt contains invalid versioned identity");
  if (typeof value.definition_digest !== "string" || !digest.test(value.definition_digest)) return failure("invalid_ability_receipt_digest", "Receipt definition_digest is invalid");
  if (!["succeeded", "rejected", "approval_required", "failed", "timed_out", "cancelled", "in_progress"].includes(String(value.status))) return failure("invalid_ability_receipt_status", "Receipt status is unsupported");
  const [started, completed, duration] = [value.started_at_ms, value.completed_at_ms, value.duration_ms];
  if (![started, completed, duration].every((item) => Number.isInteger(item) && Number(item) >= 0) || Number(completed) < Number(started) || Number(duration) !== Number(completed) - Number(started)) return failure("invalid_ability_receipt_timing", "Receipt timing is inconsistent");
  if (!validIdentity(value.principal)) return failure("invalid_ability_identity", "principal must be a valid identity", { field: "principal" });
  for (const field of ["policy_decision", "idempotency", "audit", "metadata"]) if (!record(value[field])) return failure("invalid_ability_receipt_metadata", "Receipt metadata fields must be objects", { field });
  return { ok: true, value };
}

export function reviewEffects(definition: AbilityDefinition): { readOnly: boolean; approvalRecommended: boolean; kinds: string[] } {
  const kinds = [...new Set(definition.effects.map((effect) => effect.kind))].sort();
  return { readOnly: kinds.every((kind) => kind === "read"), approvalRecommended: kinds.some((kind) => kind !== "read"), kinds };
}
