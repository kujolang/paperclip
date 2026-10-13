import { describe, expect, it } from "vitest";
import { sep } from "node:path";
import { validateComponentOutput } from "../src/components/validate-output.js";
import { componentsInfo, resolveComponent } from "../src/components/registry.js";

describe("component bundle", () => {
  it("contains exactly the curated canonical components", async () => {
    expect((await componentsInfo()).map((item) => item.id)).toEqual([
      "changebucket", "patchbrief", "failure-evidence", "context", "scout", "spec", "fence", "concord", "shipcheck", "eval", "kennel",
    ]);
  });

  it("rejects file contents or malformed metadata in Scent dry-run selection", () => {
    const summary = { output_dir: "unused", estimated_tokens: 10, budget: 100, included_files: 1,
      selected_files: [{ path: "main.kujo", reason: "task", score: 1, estimated_tokens: 10, truncated: false }], excluded_count: 0 };
    expect(validateComponentOutput("context", "pack", summary)).toEqual(summary);
    expect(() => validateComponentOutput("context", "pack", { ...summary,
      selected_files: [{ ...summary.selected_files[0], content: "must not cross this boundary" }] })).toThrow();
    expect(() => validateComponentOutput("context", "pack", { ...summary, excluded_count: -1 })).toThrow();
  });

  it("verifies every file before returning an entrypoint", async () => {
    for (const info of await componentsInfo()) {
      const resolved = await resolveComponent(info.id);
      expect(resolved.entrypointPath.split(sep).join("/")).toContain(`/bundled/components/${info.id}/`);
    }
  });
});
