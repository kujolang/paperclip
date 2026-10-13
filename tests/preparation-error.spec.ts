import { describe, expect, it } from "vitest";
import { SourcePreparationError, sourcePreparationFailure, sourcePreparationGuidance } from "../src/execution/preparation-error.js";
import { KujoPluginError } from "../src/runtime/errors.js";

describe("safe source preparation diagnostics", () => {
  it("retains only the stage and allowlisted filesystem code", () => {
    const error = Object.assign(new Error("private/path/token=secret"), { code: "ENOSPC", path: "/private/token" });
    const safe = sourcePreparationFailure("copy_inputs", error);
    expect(safe).toBeInstanceOf(SourcePreparationError);
    expect(safe).toMatchObject({ diagnostic: "source_preparation:copy_inputs:ENOSPC" });
    expect(String(safe)).toContain("Free disk space");
    expect(JSON.stringify(safe)).not.toMatch(/private|secret/);
    expect(safe).not.toHaveProperty("cause");
    expect(sourcePreparationFailure("inventory", Object.assign(error, { code: "secret" }))).toMatchObject({ diagnostic: "source_preparation:inventory:unknown" });
    const getter = Object.defineProperty(new Error("secret"), "code", { get() { throw new Error("must not invoke getter"); } });
    expect(sourcePreparationFailure("inventory", getter)).toMatchObject({ diagnostic: "source_preparation:inventory:unknown" });
  });
  it("preserves existing runtime errors and known preparation reasons", () => {
    for (const error of [new KujoPluginError("KUJO_EXEC_TIMEOUT", "bounded timeout"), new KujoPluginError("KUJO_EXEC_CANCELLED", "cancelled"), new SourcePreparationError("freshness", "inputs_changed")]) expect(sourcePreparationFailure("copy_inputs", error)).toBe(error);
    expect(sourcePreparationGuidance("materialization_failed")).toBeNull();
    expect(sourcePreparationGuidance("source_preparation:inventory:source_missing")).toContain("Git-visible");
    expect(sourcePreparationGuidance("source_preparation:inventory:untrusted-secret")).not.toContain("untrusted-secret");
  });
});
