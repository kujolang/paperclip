import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginConfig } from "../../config/schema.js";
import { packageRoot } from "../../components/registry.js";
import { executeKujo } from "../../runtime/execute-kujo.js";
import { resolveKujo } from "../../runtime/resolve-kujo.js";
import { removeTree } from "../../runtime/files.js";
import { KujoPluginError } from "../../runtime/errors.js";

export type ExampleResult = {
  status: "passed";
  source: string;
  output: string;
  runtimeVersion: string;
  checked: true;
};

// Only the shipped example can run here. There is no user source/path/argument
// parameter. A private temporary directory keeps the project untouched.
export async function runBundledExample(config: PluginConfig): Promise<ExampleResult> {
  if (!config.features.examples) throw new Error("Bundled examples are disabled by configuration");
  const source = await readFile(join(packageRoot(), "examples", "first-run.kujo"), "utf8");
  const cwd = await mkdtemp(join(tmpdir(), "kujo-paperclip-example-"));
  try {
    const filename = join(cwd, "first-run.kujo");
    await writeFile(filename, source, { mode: 0o600 });
    const runtime = await resolveKujo(config, cwd);
    const invoke = async (args: string[]) => {
      const result = await executeKujo({
        executable: runtime.executable, cwd, args,
        timeoutMs: Math.min(config.limits.timeoutMs, 5_000),
        maxStdoutBytes: Math.min(config.limits.maxStdoutBytes, 16_384),
        maxStderrBytes: Math.min(config.limits.maxStderrBytes, 16_384),
      });
      if (result.exitCode !== 0) throw new KujoPluginError("KUJO_RUNTIME_EXEC_FAILED", "The bundled Kujo example did not pass. Check runtime health.");
      return result;
    };
    await invoke(["check", filename]);
    const result = await invoke(["run", "--untrusted", filename]);
    const value = JSON.parse(result.stdout);
    if (value.language !== "Kujo" || value.items !== 2 || value.total !== 36) {
      throw new KujoPluginError("KUJO_COMPONENT_SCHEMA_INVALID", "The bundled example returned unexpected output");
    }
    return { status: "passed", source, output: result.stdout.trim(), runtimeVersion: runtime.runtimeVersion, checked: true };
  } finally {
    await removeTree(cwd);
  }
}
