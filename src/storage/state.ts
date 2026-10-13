import type { PluginContext, PluginStateScopeKind } from "@paperclipai/plugin-sdk";
import type { z } from "zod";
import { appendEvidence, ARTIFACT_KINDS, clearHistory, latestEvidence, type ArtifactKind, type ReceiptOptions } from "./history.js";
import { reviewPackSchema } from "../features/review/schema.js";
import { contextPackSchema } from "../features/context/schema.js";
import { failureEvidenceSchema } from "../features/failure/schema.js";
import { understandingSchema } from "../features/understand/schema.js";
import { languageReportSchema } from "../features/language/schema.js";

import { verificationReportSchema } from "../features/verification/import.js";
import { specReportSchema } from "../features/spec/inspect.js";

import { shipcheckReportSchema } from "../features/shipcheck/schema.js";
import { concordReportSchema } from "../features/concord/schema.js";
import { fenceReportSchema } from "../features/fence/schema.js";

export type StateTarget = { entityType: "project" | "issue" | "run"; entityId: string; companyId: string };
function scope(target: StateTarget, namespace: string, stateKey: string) {
  return { scopeKind: target.entityType as PluginStateScopeKind, scopeId: target.entityId, namespace: `${namespace}:${target.companyId}`, stateKey };
}
const schemas = { "review-latest": reviewPackSchema, "context-latest": contextPackSchema, "failure-latest": failureEvidenceSchema,
  "understand-latest": understandingSchema, "language-latest": languageReportSchema, "verification-latest": verificationReportSchema, "spec-latest": specReportSchema, "shipcheck-latest": shipcheckReportSchema, "concord-latest": concordReportSchema, "fence-latest": fenceReportSchema };
function isArtifactKind(kind: string): kind is ArtifactKind { return (ARTIFACT_KINDS as readonly string[]).includes(kind); }
const migrations = new WeakMap<PluginContext, Map<string, Promise<void>>>();

export async function ensureHistory(ctx: PluginContext, target: StateTarget): Promise<void> {
  const key = JSON.stringify(target);
  let pending = migrations.get(ctx);
  if (!pending) { pending = new Map(); migrations.set(ctx, pending); }
  const existing = pending.get(key);
  if (existing) return await existing;
  const task = (async () => {
    const marker = scope(target, "kujo-artifacts", "history-migrated-v1");
    if (await ctx.state.get(marker) === true) return;
    for (const kind of ARTIFACT_KINDS) {
      const oldKey = scope(target, "kujo-artifacts", kind);
      const value = await ctx.state.get(oldKey);
      const parsed = schemas[kind].safeParse(value);
      if (parsed.success) await appendEvidence(ctx, target, kind, parsed.data, { legacy: true });
      // Delete only after archive confirmation; corrupt old values are discarded.
      if (value !== null && value !== undefined) await ctx.state.delete(oldKey);
    }
    await ctx.state.set(marker, true);
  })();
  pending.set(key, task);
  try { await task; } finally { pending.delete(key); }
}

export async function saveArtifact(ctx: PluginContext, target: StateTarget, kind: string, value: unknown, receipt: ReceiptOptions = {}): Promise<void> {
  if (isArtifactKind(kind)) {
    await ensureHistory(ctx, target);
    await appendEvidence(ctx, target, kind, value, receipt);
  } else await ctx.state.set(scope(target, "kujo-artifacts", kind), value);
}

export async function loadArtifact<T>(ctx: PluginContext, target: StateTarget, kind: string, schema: z.ZodType<T>): Promise<T | null> {
  let value: unknown;
  if (isArtifactKind(kind)) {
    await ensureHistory(ctx, target);
    value = (await latestEvidence(ctx, target, kind))?.payload;
  } else value = await ctx.state.get(scope(target, "kujo-artifacts", kind));
  if (value === null || value === undefined) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function clearArtifacts(ctx: PluginContext, target: StateTarget): Promise<void> {
  await clearHistory(ctx, target);
  await Promise.all(ARTIFACT_KINDS.map((kind) => ctx.state.delete(scope(target, "kujo-artifacts", kind))));
  await ctx.state.set(scope(target, "kujo-artifacts", "history-migrated-v1"), true);
}
