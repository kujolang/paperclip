import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { pluginManifestV1Schema } from "@paperclipai/shared";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { z } from "zod";
import { loadArtifact, saveArtifact } from "../src/storage/state.js";
import { SUPPORTED_HOST_VERSION } from "../src/config/defaults.js";

describe("Paperclip plugin contract", () => {
  it("validates against the host manifest schema", () => {
    expect(pluginManifestV1Schema.safeParse(manifest)).toMatchObject({ success: true });
    expect(manifest.minimumHostVersion).toBe("0.0.0");
    expect(SUPPORTED_HOST_VERSION).toBe("2026.824.1");
    expect(manifest.ui?.slots).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "detailTab", id: "kujo", entityTypes: ["project", "issue", "run"] }),
      expect.objectContaining({ type: "taskDetailView", id: "kujo-task-view", entityTypes: ["issue"] }),
    ]));
  });

  it("initializes against the official SDK harness and exposes doctor data", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    const health = await harness.getData<{ status: string; components: unknown[] }>("doctor");
    expect(health.status).toBe("ok");
    expect(health.components).toHaveLength(4);
  });

  it("rejects malformed tool parameters without reaching the workspace", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    const result = await harness.executeTool("get-context", { task: "", unknown: true });
    expect(result.error).toContain("KUJO_INVALID_CONFIG");
  });

  it("enforces feature switches on every UI generation action", async () => {
    const harness = createTestHarness({
      manifest,
      config: { features: { review: false, failureEvidence: false, context: false, verification: false } },
    });
    await plugin.definition.setup(harness.ctx);
    const options = { companyId: "company", actor: { type: "user" as const, userId: "user", companyId: "company" } };
    await expect(harness.performAction("generate-review", { entityType: "project", entityId: "project" }, options)).rejects.toThrow(/disabled/);
    await expect(harness.performAction("generate-context", { entityType: "project", entityId: "project", task: "task" }, options)).rejects.toThrow(/disabled/);
    await expect(harness.performAction("capture-failure", { entityType: "project", entityId: "project", title: "failure" }, options)).rejects.toThrow(/disabled/);
  });

  it("binds artifact state to a company and rejects corrupt values", async () => {
    const harness = createTestHarness({ manifest });
    const target = { entityType: "project" as const, entityId: "project", companyId: "company-a" };
    await saveArtifact(harness.ctx, target, "test", "valid");
    expect(await loadArtifact(harness.ctx, target, "test", z.string())).toBe("valid");
    expect(await loadArtifact(harness.ctx, { ...target, companyId: "company-b" }, "test", z.string())).toBeNull();
    expect(await loadArtifact(harness.ctx, target, "test", z.object({ id: z.string() }))).toBeNull();
  });
});
