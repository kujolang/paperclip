import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { abilityDefinitionDigestV2 } from "../bundled/ability-contract/index.js";
import { canonicalDefinitions, canonicalProfiles, projections } from "../src/abilities/generated.js";
import { applyCapabilityProfile, capabilityCatalog, projectionReceipt } from "../src/abilities/catalog.js";
import { parsePluginConfig } from "../src/config/schema.js";
import { doctor } from "../src/health/doctor.js";
import { createTestHarness } from "./helpers/harness.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { appendEvidence, getEvidence, listEvidence } from "../src/storage/history.js";

describe("canonical Ability projection", () => {
  it("verifies pinned source bytes, deterministic projections and canonical definition digests", () => {
    execFileSync(process.execPath, ["scripts/generate-abilities.mjs", "--check"]);
    expect(canonicalDefinitions).toHaveLength(38);
    for (const entry of [...canonicalDefinitions, ...projections]) expect(abilityDefinitionDigestV2(entry.definition)).toEqual({ ok: true, value: entry.definitionDigest });
    expect(canonicalProfiles.find((item) => item.id === "kujo.profile.full")?.resolvedAbilityIds).toHaveLength(38);
    for (const entry of projections) {
      expect(entry.tool.parametersSchema).not.toHaveProperty("properties.workspacePath");
      expect(entry.definition.id).toMatch(/^kujo\.paperclip\./);
    }
  });

  it("registers exactly the generated tool declarations without adding unimplemented canonical handlers", async () => {
    const harness = createTestHarness({ manifest });
    const register = vi.spyOn(harness.ctx.tools, "register");
    await plugin.definition.setup(harness.ctx);
    expect(register.mock.calls.map(([name]) => name).sort()).toEqual(manifest.tools!.map((item) => item.name).sort());
    expect(manifest.tools).toHaveLength(10);
    await expect(harness.executeTool("kujo.rag.knowledge.ingest", {}, { companyId: "company" })).rejects.toThrow();
  });

  it("keeps default tools, applies inherited canonical profiles and honors explicit feature disables", () => {
    expect(applyCapabilityProfile(parsePluginConfig({})).features).toEqual(parsePluginConfig({}).features);
    const essentials = applyCapabilityProfile(parsePluginConfig({ capabilityProfile: "essentials" }));
    expect(essentials.features).toMatchObject({ understand: true, review: false, context: false, failureEvidence: false, language: false });
    const review = applyCapabilityProfile(parsePluginConfig({ capabilityProfile: "review" }));
    expect(review.features).toMatchObject({ understand: true, review: true, context: true, failureEvidence: false, language: false });
    const build = applyCapabilityProfile(parsePluginConfig({ capabilityProfile: "build", features: { language: false } }));
    expect(build.features).toMatchObject({ understand: true, context: true, language: false, review: false });
  });

  it("separates installed enabled supported runtime readiness and call-time authorization", async () => {
    const config = parsePluginConfig({ features: { review: false } });
    const report = await doctor(config);
    const catalog = capabilityCatalog(config, report, true);
    expect(catalog.capabilities.find((entry) => entry.tool === "review-changes")).toMatchObject({ installed: true, enabled: false, supported: true, status: "disabled", authorization: "checked-on-call" });
    expect(catalog.ecosystem.find((entry) => entry.id === "kujo.rag.knowledge.ingest")).toMatchObject({ installed: false, supported: false, status: "not-integrated", authorization: "unavailable", tools: [] });
    const unsupported = capabilityCatalog(config, { ...report, runtime: { status: "ok", platform: "linux", arch: "riscv64" } });
    expect(unsupported.capabilities.find((entry) => entry.tool === "check-kujo-source")).toMatchObject({ enabled: true, supported: false, status: "unsupported" });
    const broken = capabilityCatalog(config, { ...report, runtime: { ...report.runtime, status: "error" } });
    expect(broken.capabilities.find((entry) => entry.tool === "check-kujo-source")?.status).toBe("blocked");
    expect(broken.capabilities.find((entry) => entry.tool === "list-evidence")?.status).toBe("ready");
  });

  it("enforces company profile choices on UI and agent calls without accepting a caller override", async () => {
    const harness = createTestHarness({ manifest });
    harness.ctx.config.get = async (company) => ({ capabilityProfile: company === "limited" ? "essentials" : "installed" });
    await plugin.definition.setup(harness.ctx);
    const limited = await harness.executeTool("list-capabilities", { includeUnavailable: true }, { companyId: "limited" });
    expect(limited.error).toBeUndefined();
    expect((limited.data as ReturnType<typeof capabilityCatalog>).capabilities.find((entry) => entry.tool === "review-changes")?.enabled).toBe(false);
    const other = await harness.executeTool("list-capabilities", {}, { companyId: "other" });
    expect((other.data as ReturnType<typeof capabilityCatalog>).capabilities.find((entry) => entry.tool === "review-changes")?.enabled).toBe(true);
    expect((await harness.executeTool("list-capabilities", { companyId: "other" }, { companyId: "limited" })).error).toBeTruthy();
    expect((await harness.executeTool("review-changes", {}, { companyId: "limited" })).error).toContain("disabled");
    await expect(harness.performAction("generate-review", { entityType: "project", entityId: "project" }, { companyId: "limited" })).rejects.toThrow("disabled");
  });

  it("retains projection identity and canonical digests as additive evidence provenance", async () => {
    const harness = createTestHarness({ manifest });
    const projection = projectionReceipt({ name: "review-changes" });
    const target = { companyId: "company", entityType: "project" as const, entityId: "project" };
    await appendEvidence(harness.ctx, target, "review-latest", { id: "review", schemaVersion: 1 }, { projection });
    const [record] = await listEvidence(harness.ctx, target);
    const stored = await getEvidence(harness.ctx, target, record!.id);
    expect(stored?.payload.kujoProjection).toMatchObject({ id: "kujo.paperclip.changes.review", canonical: [expect.objectContaining({ id: "kujo.patchbrief.changes.summarize" }), expect.objectContaining({ id: "kujo.changebucket.changes.measure" })] });
    expect(JSON.stringify(stored)).not.toContain("approval_granted");
  }, 30_000);
});
