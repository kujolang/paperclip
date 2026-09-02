import type { PluginContext, PluginStateScopeKind } from "@paperclipai/plugin-sdk";
import type { z } from "zod";

export type StateTarget = { entityType: "project" | "issue" | "run"; entityId: string; companyId: string };

function scope(target: StateTarget, namespace: string, stateKey: string) {
  return { scopeKind: target.entityType as PluginStateScopeKind, scopeId: target.entityId, namespace: `${namespace}:${target.companyId}`, stateKey };
}

export async function saveArtifact(ctx: PluginContext, target: StateTarget, kind: string, value: unknown): Promise<void> {
  await ctx.state.set(scope(target, "kujo-artifacts", kind), value);
}

export async function loadArtifact<T>(ctx: PluginContext, target: StateTarget, kind: string, schema: z.ZodType<T>): Promise<T | null> {
  const value = await ctx.state.get(scope(target, "kujo-artifacts", kind));
  if (value === null || value === undefined) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function clearArtifacts(ctx: PluginContext, target: StateTarget): Promise<void> {
  await Promise.all(["review-latest", "failure-latest", "context-latest"].map(
    (kind) => ctx.state.delete(scope(target, "kujo-artifacts", kind)),
  ));
}
