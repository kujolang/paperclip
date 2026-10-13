import type { PluginConfig } from "../config/schema.js";
import type { DoctorReport } from "../health/doctor.js";
import { canonicalDefinitions, canonicalProfiles, projections } from "./generated.js";

type Feature = keyof PluginConfig["features"];
type Projection = {
  id: string; feature: Feature | null; canonicalIds: readonly string[]; components: readonly string[];
  requiresRuntime?: boolean; profiles?: readonly string[]; alwaysAvailable?: boolean; definitionDigest: string;
  definition: { id: string; version: string; title: string; description: string; effects: readonly { kind: string; resource: string }[] };
  tool: { name: string; displayName: string; description: string };
};
const entries: readonly Projection[] = projections;
export function projectionSelected(projection: Projection, profile: PluginConfig["capabilityProfile"]): boolean {
  if (projection.alwaysAvailable || profile === "installed" || profile === "full") return true;
  if (profile === "build") return ["language", "context", "understand", "sourceExecution"].includes(projection.feature ?? "");
  if (projection.profiles) return projection.profiles.includes(profile);
  const selected = canonicalProfiles.find((item) => item.id === `kujo.profile.${profile}`);
  const ids: readonly string[] = selected?.resolvedAbilityIds ?? [];
  return projection.canonicalIds.length > 0 && projection.canonicalIds.every((id) => ids.includes(id));
}
export function applyCapabilityProfile(config: PluginConfig): PluginConfig {
  const features = { ...config.features };
  for (const feature of new Set(entries.flatMap((entry) => entry.feature ? [entry.feature] : []))) {
    if (!entries.some((entry) => entry.feature === feature && projectionSelected(entry, config.capabilityProfile))) features[feature] = false;
  }
  return { ...config, features };
}
export function toolEnabled(config: PluginConfig, tool: { name: string }): boolean {
  const entry = entries.find((entry) => entry.tool.name === tool.name);
  return !!entry && projectionSelected(entry, config.capabilityProfile) && (!entry.feature || config.features[entry.feature]);
}
export function projectionReceipt(tool: { name: string }) {
  const entry = projections.find((item) => item.tool.name === tool.name);
  if (!entry) throw new Error(`Unknown Paperclip Ability projection: ${tool.name}`);
  return { schema: "kujo.paperclip.projection-receipt/v1" as const, id: entry.id, version: entry.definition.version,
    definitionDigest: entry.definitionDigest, canonical: entry.canonicalDefinitions.map((item) => ({ id: item.definition.id, version: item.definition.version, definitionDigest: item.definitionDigest })),
    notice: "Paperclip projection metadata, not a canonical Ability execution receipt or permission grant." };
}
export type ProjectionReceipt = ReturnType<typeof projectionReceipt>;
export function capabilityCatalog(config: PluginConfig, report: DoctorReport, includeUnavailable = false) {
  const supportedRuntime = ["darwin:arm64", "darwin:x64", "linux:arm64", "linux:x64", "win32:x64"].includes(`${report.runtime.platform}:${report.runtime.arch}`);
  const capabilities = entries.map((entry) => {
    const selectedByProfile = projectionSelected(entry, config.capabilityProfile);
    const enabled = selectedByProfile && (!entry.feature || config.features[entry.feature]);
    const requiresRuntime = entry.requiresRuntime ?? entry.feature !== null;
    const supported = !requiresRuntime || supportedRuntime;
    const componentsReady = entry.components.every((id) => report.components.some((component) => component.id === id && component.integrity === "ok"));
    const ready = supported && enabled && componentsReady && (!requiresRuntime || report.runtime.status === "ok");
    const status = !supported ? "unsupported" : !enabled ? "disabled" : !ready ? "blocked" : "ready";
    return { id: entry.id, title: entry.tool.displayName, description: entry.tool.description, tool: entry.tool.name,
      installed: true, enabled, selectedByProfile, supported, status,
      authorization: "checked-on-call" as const,
      authorizationNotice: "The host must authorize the company, tool or action at invocation. Catalog readiness is not permission.",
      canonicalIds: entry.canonicalIds, definitionDigest: entry.definitionDigest, effects: entry.definition.effects,
      reason: !supported ? "The bundled runtime does not support this platform." : !selectedByProfile ? "Not selected by the company's capability profile."
        : !enabled ? "Disabled in company feature settings." : !componentsReady ? "Repair the bundled component installation."
        : requiresRuntime && report.runtime.status !== "ok" ? "Repair the Kujo runtime in plugin settings." : "Available through the scoped Paperclip adapter." };
  });
  const ecosystem = includeUnavailable ? canonicalDefinitions.map((item) => {
    const adapters = capabilities.filter((entry) => entry.canonicalIds.includes(item.definition.id));
    return { id: item.definition.id, version: item.definition.version, title: item.definition.title, description: item.definition.description,
      definitionDigest: item.definitionDigest, effects: item.definition.effects, source: item.source,
      installed: adapters.length > 0, enabled: adapters.some((entry) => entry.enabled),
      supported: adapters.length > 0 ? adapters.some((entry) => entry.supported) : false,
      authorization: adapters.length ? "checked-on-call" : "unavailable",
      status: adapters.length ? "projected" : "not-integrated",
      tools: adapters.map((entry) => entry.tool),
      reason: adapters.length ? "Use the Paperclip projection; its inputs and storage effects differ from the canonical local-tool contract." : "Canonical Kujo capability; no Paperclip adapter is included yet. This catalog entry cannot execute it." };
  }) : [];
  return { schemaVersion: 1, profile: config.capabilityProfile, capabilities, ecosystem,
    profiles: canonicalProfiles.map((profile) => ({ id: profile.id, title: profile.metadata.label, description: profile.description, canonicalAbilityCount: profile.resolvedAbilityIds.length })),
    notice: "Installed is the backwards-compatible default. Canonical profiles select existing projections; they do not install or authorize missing tools. Build is a Paperclip language/context profile." };
}
export type CapabilityCatalog = ReturnType<typeof capabilityCatalog>;
