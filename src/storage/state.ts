import type { PluginContext, PluginStateScopeKind } from "@paperclipai/plugin-sdk";

export type StateTarget = { entityType: "project" | "issue" | "run"; entityId: string };

function scope(target: StateTarget, namespace: string, stateKey: string) {
  return { scopeKind: target.entityType as PluginStateScopeKind, scopeId: target.entityId, namespace, stateKey };
}

export async function saveArtifact(ctx: PluginContext, target: StateTarget, kind: string, value: unknown): Promise<void> {
  await ctx.state.set(scope(target, "kujo-artifacts", kind), value);
}

export async function loadArtifact<T>(ctx: PluginContext, target: StateTarget, kind: string): Promise<T | null> {
  return (await ctx.state.get(scope(target, "kujo-artifacts", kind))) as T | null;
}

