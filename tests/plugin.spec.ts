import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { pluginManifestV1Schema } from "@paperclipai/shared";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

describe("Paperclip plugin contract", () => {
  it("validates against the host manifest schema", () => {
    expect(pluginManifestV1Schema.safeParse(manifest)).toMatchObject({ success: true });
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
});
