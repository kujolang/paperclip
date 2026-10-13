import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { doctor } from "../src/health/doctor.js";
import { parsePluginConfig } from "../src/config/schema.js";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { getKujoRuntimeInfo } from "@kujolang/kujo-runtime";

describe("runtime readiness", () => {
  it("reports actual bundled runtime version and disabled features separately", async () => {
    const report = await doctor(parsePluginConfig({ features: { review: false } }));
    expect(report.runtime).toMatchObject({ status: "ok", source: "bundled" });
    expect(report.runtime.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(report.capabilities).toEqual({ review: "disabled", context: "ready", failureEvidence: "ready" });
  });

  it("returns actionable blocked state for a missing configured executable", async () => {
    const report = await doctor(parsePluginConfig({ runtime: { binary: join(tmpdir(), randomUUID()), allowSystemPathFallback: false } }));
    expect(report.status).toBe("error");
    expect(report.runtime).toMatchObject({ status: "error", code: "KUJO_RUNTIME_NOT_FOUND" });
    expect(report.runtime.repair).toContain("override");
    expect(Object.values(report.capabilities)).toEqual(["blocked", "blocked", "blocked"]);
  });

  it("does not mistake Node's version for a compatible Kujo runtime", async () => {
    const report = await doctor(parsePluginConfig({ runtime: { binary: process.execPath } }));
    expect(report.runtime).toMatchObject({ status: "error", code: "KUJO_RUNTIME_INCOMPATIBLE" });
  });

  it("honors a valid configured runtime and rejects relative overrides", async () => {
    const report = await doctor(parsePluginConfig({ runtime: { binary: getKujoRuntimeInfo().binaryPath, allowSystemPathFallback: false } }));
    expect(report.runtime).toMatchObject({ status: "ok", source: "configured" });
    const relative = await doctor(parsePluginConfig({ runtime: { binary: "kujo" } }));
    expect(relative.runtime).toMatchObject({ status: "error", code: "KUJO_RUNTIME_NOT_FOUND" });
  });

  it("uses company configuration for the Doctor bridge", async () => {
    const harness = createTestHarness({ manifest, config: { runtime: { binary: process.execPath } } });
    await plugin.definition.setup(harness.ctx);
    const report = await harness.getData<Awaited<ReturnType<typeof doctor>>>("doctor", { companyId: "company" });
    expect(report.runtime.status).toBe("error");
  });
});
