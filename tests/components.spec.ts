import { describe, expect, it } from "vitest";
import { sep } from "node:path";
import { componentsInfo, resolveComponent } from "../src/components/registry.js";

describe("component bundle", () => {
  it("contains exactly the curated canonical components", async () => {
    expect((await componentsInfo()).map((item) => item.id)).toEqual([
      "changebucket", "patchbrief", "failure-evidence", "context",
    ]);
  });

  it("verifies every file before returning an entrypoint", async () => {
    for (const info of await componentsInfo()) {
      const resolved = await resolveComponent(info.id);
      expect(resolved.entrypointPath.split(sep).join("/")).toContain(`/bundled/components/${info.id}/`);
    }
  });
});
