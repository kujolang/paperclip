/** Real local producer demonstration. This is not a Paperclip multi-agent demo. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
const [sourceArg, binaryArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !binaryArg || !outputArg) throw new Error("Usage: node scripts/acceptance/runledger-demo.mjs RUNLEDGER_ROOT KUJO_BINARY OUTPUT_DIRECTORY");
const source = resolve(sourceArg), binary = resolve(binaryArg), output = resolve(outputArg);
const root = await mkdtemp(join(tmpdir(), "kujo-runledger-demo-"));
const ledger = join(root, "ledger");
const cli = (...args) => execFileSync(binary, ["run", join(source, "runledger.kujo"), "--", ...args, "--ledger", ledger], { cwd: root, encoding: "utf8", timeout: 30_000 });
try {
  await mkdir(output, { recursive: true });
  const module = join(root, "adapter.mjs");
  await build({ entryPoints: ["src/features/runledger/import.ts"], outfile: module, bundle: true, platform: "node", format: "esm" });
  const { importRunLedger } = await import(pathToFileURL(module).href);
  const proof = { schemaVersion: 1, scope: "Real RunLedger CLI and real Node assertions; local adapter only, no Paperclip host or agent delegation", producerCommit: execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), attempts: [] };
  for (const pass of [false, true]) {
    const started = cli("start", "--provider", "local", "--model", "node-assert", "--task", "searchable-task-list", "--repo", root);
    const id = started.match(/Started run: (.+)/)?.[1]?.trim(); assert.ok(id);
    const code = `const assert = require('node:assert/strict'); const tasks = ['write code', 'verify code']; const search = q => tasks.filter(t => ${pass ? 't.includes(q)' : 'true'}); assert.deepEqual(search('verify'), ['verify code']);`;
    const outcome = spawnSync(process.execPath, ["-e", code], { encoding: "utf8", timeout: 10_000 });
    assert.equal(outcome.status, pass ? 0 : 1);
    cli("test", id, "search filters task list", "--status", pass ? "pass" : "fail");
    cli("finish", id, "--status", pass ? "pass" : "fail", "--verdict", pass ? "Filtering assertion passed after correction" : "Intentional filter failure detected");
    const raw = cli("show", id, "--json");
    // Local demonstration has no host identifiers. Do not invent Paperclip runs.
    const imported = importRunLedger(raw, { companyId: "local-demo-only", projectId: null, issueId: null, parentIssueId: null, agentId: null, runId: null, attribution: "human-importer" });
    assert.equal(imported.classification, pass ? "unverified" : "failed");
    const filename = pass ? "corrected-attempt.json" : "failed-attempt.json";
    await writeFile(join(output, filename), JSON.stringify(imported, null, 2) + "\n");
    proof.attempts.push({ filename, assertionSource: code, actualExitCode: outcome.status, classification: imported.classification, artifactSha256: createHash("sha256").update(await readFile(join(output, filename))).digest("hex") });
  }
  await writeFile(join(output, "proof.json"), JSON.stringify(proof, null, 2) + "\n");
  console.log(JSON.stringify(proof));
} finally { await rm(root, { recursive: true, force: true }); }
