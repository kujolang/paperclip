import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveKujoBinary } from "@kujolang/kujo-runtime";
import { describe, expect, it } from "vitest";
import { runComponent } from "../src/components/execute-component.js";
import { resolveComponent } from "../src/components/registry.js";
import { parsePluginConfig } from "../src/config/schema.js";
import { executeKujo } from "../src/runtime/execute-kujo.js";

const binary = process.env.KUJO_INTEGRATION_BINARY ? resolve(process.env.KUJO_INTEGRATION_BINARY) : resolveKujoBinary();
const config = parsePluginConfig({ runtime: { binary, allowSystemPathFallback: false } });

describe("component import boundary", () => {
  it.each([false, true])("keeps workspace modules out of canonical imports (interpreter=%s)", async (interpreter) => {
    const cwd = await mkdtemp(join(tmpdir(), "kujo-component-imports-"));
    try {
      await mkdir(join(cwd, "src"));
      for (const name of ["cli", "common", "git", "util"]) {
        await writeFile(join(cwd, "src", `${name}.kujo`), `write_file("${name}.executed", "fixture")\nthrow("workspace module selected")\n`);
      }
      const component = await resolveComponent("changebucket");
      const control = await executeKujo({ executable: binary, cwd,
        args: ["run", ...(interpreter ? ["--interpreter"] : []), component.entrypointPath, "--", "help"],
        timeoutMs: 5000, maxStdoutBytes: 4096, maxStderrBytes: 4096 });
      expect(control.exitCode).not.toBe(0);
      await expect(access(join(cwd, "cli.executed"))).resolves.toBeUndefined();
      await rm(join(cwd, "cli.executed"));

      for (const id of ["changebucket", "patchbrief"] as const) {
        const result = await runComponent({ component: id, cwd, args: ["help"], config, interpreter });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/ChangeBucket|PatchBrief/i);
      }
      for (const name of ["cli", "common", "git", "util"]) {
        await expect(access(join(cwd, `${name}.executed`))).rejects.toThrow();
      }
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }, 30_000);
});
