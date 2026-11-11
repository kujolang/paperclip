import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

/** Registry installation probe; all credentials and CLI state belong to this fixture. */
export async function qualifyProductionInstall({ call, companyId, root, host, node, base, checks, json }) {
  const example = (await call("/plugins/kujolang.paperclip/bridge/action", { method: "POST", body: { companyId, key: "run-example", params: {} } })).data.data;
  assert.deepEqual(JSON.parse(example.output), { language: "Kujo", items: 2, total: 36 });
  checks.push("fixed bundled run-example executes through the authenticated board bridge with exact expected output");
  const cliPackage = JSON.parse(await readFile(join(host, "node_modules/paperclipai/package.json"), "utf8"));
  const serverPackage = JSON.parse(await readFile(join(host, "node_modules/@paperclipai/server/package.json"), "utf8"));
  assert.equal(cliPackage.version, serverPackage.version, "Probe CLI must match the selected official host");
  const key = (await call("/board-api-keys", { method: "POST", status: 201, body: { name: "Disposable install probe", requestedCompanyId: companyId } })).data;
  assert.ok(key.token);
  const cliHome = join(root, "cli-home"); await mkdir(cliHome, { mode: 0o700 });
  const context = join(cliHome, "context.json");
  await writeFile(context, JSON.stringify({ version: 1, currentProfile: "probe", profiles: { probe: { apiBase: base, apiKeyEnvVarName: "PAPERCLIP_API_KEY" } } }), { mode: 0o600 });
  const run = async args => {
    try {
      const value = await promisify(execFile)(node, [join(host, "node_modules/paperclipai/dist/index.js"), "plugin", "install", ...args,
        "--api-base", base, "--context", context, "--data-dir", cliHome, "--json"], {
        cwd: root, timeout: 180000, maxBuffer: 1048576,
        env: { PATH: process.env.PATH, HOME: cliHome, TMPDIR: root, PAPERCLIP_HOME: cliHome,
          PAPERCLIP_CONFIG: join(root, "config.json"), PAPERCLIP_API_KEY: key.token, PAPERCLIP_TELEMETRY_DISABLED: "1" },
      });
      return { exitCode: 0, output: value.stdout, diagnostic: value.stderr };
    } catch (error) { return { exitCode: error.code, output: error.stdout ?? "", diagnostic: error.stderr ?? "" }; }
  };
  try {
    await call("/plugins/kujolang.paperclip", { method: "DELETE" });
    const separate = await run(["@kujolang/paperclip", "--version", "0.2.1"]);
    assert.equal(separate.exitCode, 0, "CLI separate-version install failed; inspect sanitized probe outcome");
    const installed = (await call("/plugins/kujolang.paperclip")).data;
    assert.equal(installed.version, "0.2.1"); assert.equal(installed.pluginKey, "kujolang.paperclip");
    const npmPackage = JSON.parse(await readFile(join(root, "home/.paperclip/plugins/node_modules/@kujolang/paperclip/package.json"), "utf8"));
    assert.equal(npmPackage.version, "0.2.1", "Registry package must be present under the disposable host HOME");
    checks.push("official target CLI scoped package plus separate --version installs registry plugin 0.2.1 and host reports exact version");
    await call("/plugins/kujolang.paperclip", { method: "DELETE" });
    const suffixed = await run(["@kujolang/paperclip@0.2.1"]);
    const missingDirectory = /package\.json|ENOENT|not found|Cannot find|could not find/i.test(suffixed.output + suffixed.diagnostic);
    await json("install-probe.json", { cliVersion: cliPackage.version, example: { output: JSON.parse(example.output), runtimeVersion: example.runtimeVersion },
      separateVersion: { exitCode: separate.exitCode, observedVersion: installed.version, status: installed.status, isolatedPackageVersion: npmPackage.version },
      suffixedVersion: { exitCode: suffixed.exitCode, missingPackagePathDiagnostic: missingDirectory } });
    assert.notEqual(suffixed.exitCode, 0, "Suffix install unexpectedly succeeded; reassess workaround using installed metadata");
    assert.ok(missingDirectory, "Suffix failed for an unexpected reason; do not classify as known path bug");
    checks.push("official target CLI scoped name@version still fails package-path resolution; separate --version is the verified pinned workaround");
  } finally { await call(`/board-api-keys/${key.id}`, { method: "DELETE" }); }
}
