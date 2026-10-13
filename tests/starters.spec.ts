import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { previewStarter, starterInputSchema } from "../src/features/starters/preview.js";
import { parsePluginConfig } from "../src/config/schema.js";
import { createTestHarness } from "./helpers/harness.js";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

describe("canonical starter previews", () => {
  it("generates portable deterministic script files with verified byte digests", async () => {
    const config = parsePluginConfig({});
    const input = { kind: "script", name: "hello-kujo" };
    const one = await previewStarter(input, config), two = await previewStarter(input, config);
    expect(one).toEqual(two);
    expect(one.files.find(file => file.path === "src/main.kujo")?.content).toContain('Hello from Kujo');
    for (const file of one.files) expect(file.sha256).toBe(createHash("sha256").update(file.content).digest("hex"));
    expect(one.notice).toContain("have not run");
  });
  it("uses the fixture agent generator without installation, credentials or local paths", async () => {
    const preview = await previewStarter({ kind: "agent", name: "hello-agent" }, parsePluginConfig({}));
    const file = (path: string) => preview.files.find(file => file.path === path)!.content;
    expect(JSON.parse(file("config/model.json")).provider).toBe("fixture");
    expect(file("kennel.toml")).toContain("commit =");
    expect(preview.files.some(file => file.path.startsWith("kennel_packages/") || file.path === ".env.local")).toBe(false);
    expect(preview.files.length).toBeGreaterThan(10);
    expect(preview.totalBytes).toBeLessThan(262144);
  });
  it("rejects custom commands, paths, invalid names and disabled profiles", async () => {
    for (const name of ["../escape", "/escape", "a/b", "a\\b", "-option", "x".repeat(65)]) expect(starterInputSchema.safeParse({ kind: "script", name }).success).toBe(false);
    expect(starterInputSchema.safeParse({ kind: "script", command: "unsafe" }).success).toBe(false);
    for (const config of [{ features: { examples: false } }, { capabilityProfile: "review" }, { capabilityProfile: "ship" }]) await expect(previewStarter({ kind: "script" }, parsePluginConfig(config))).rejects.toThrow(/disabled/);
  });
  it("requires host company scope and works without a project workspace", async () => {
    const h = createTestHarness({ manifest }); await plugin.definition.setup(h.ctx);
    await expect(h.performAction("preview-starter", { kind: "script" })).rejects.toThrow(/Company/);
    expect(await h.performAction("preview-starter", { kind: "script" }, { companyId: "company" })).toMatchObject({ status: "preview", kind: "script" });
    await plugin.definition.onShutdown?.();
  });
});
