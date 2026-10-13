import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Declaration-only package workflow through the actual authenticated host bridge. */
export async function qualifyProductionPackages({ call, companyId, projectId, root, checks, json, stop, start, waitUntil }) {
  const route = "/plugins/kujolang.paperclip/bridge/action";
  const target = { entityType: "project", entityId: projectId };
  const action = async (key, params = {}, options = {}) => (await call(route, { method: "POST", body: { companyId, key, params: { ...target, ...params } }, ...options })).data;
  const detail = async () => (await call("/plugins/kujolang.paperclip/bridge/data", { method: "POST", body: { companyId, key: "detail", params: target } })).data.data;
  const config = async profile => call("/plugins/kujolang.paperclip/config", { method: "POST", body: { companyId, configJson: { capabilityProfile: profile } } });
  const manifest = '[package]\nname="host-package"\nversion="1.0.0"\n[dependencies.local]\nsource="file:../unavailable-dependency"\n';
  const lock = 'version=1\n[[package]]\nname="local"\nsource="file:../unavailable-dependency"\nresolved_commit="unverified-claim"\n';
  await writeFile(join(root, "workspace/kennel.toml"), manifest);
  await writeFile(join(root, "workspace/kennel.lock"), lock);
  await config("build");
  await waitUntil(async () => { try { return (await detail()).packageFiles?.files.includes("kennel.toml"); } catch { return false; } });
  const result = (await action("inspect-kujo-packages", { path: "kennel.toml" })).data;
  assert.equal(result.status, "passed");
  const report = (await detail()).packages;
  assert.equal(report.id, result.reportId); assert.equal(report.manifest.name, "host-package");
  assert.equal(report.dependencies[0].source, "file:../unavailable-dependency");
  assert.equal(report.lock.entries[0].resolvedCommit, "unverified-claim");
  assert.match(report.scope, /not verified/); assert.equal(report.stale, false);
  assert.equal(await readFile(join(root, "workspace/kennel.toml"), "utf8"), manifest);
  assert.equal(await readFile(join(root, "workspace/kennel.lock"), "utf8"), lock);
  const record = (await detail()).history.find(row => row.kind === "packages-latest"); assert.ok(record);
  const exported = (await action("export-evidence", { evidenceId: record.id })).data;
  assert.equal(exported.payload.id, report.id); assert.equal(exported.receipt.kind, "packages-latest");
  checks.push("production package inspection uses canonical declarations, preserves input bytes and retains scoped exportable evidence");
  await stop(); await start();
  await waitUntil(async () => { try { return (await detail()).packages?.id === report.id; } catch { return false; } });
  assert.deepEqual((await action("export-evidence", { evidenceId: record.id })).data, exported);
  checks.push("package evidence survives full authenticated host/database restart");
  const other = (await call("/companies", { method: "POST", status: 201, body: { name: "Unrelated package tenant" } })).data.id;
  await call("/plugins/kujolang.paperclip/config", { method: "POST", body: { companyId: other, configJson: { capabilityProfile: "build" } } });
  const rejected = await action("export-evidence", { evidenceId: record.id }, { status: 502, body: { companyId: other, key: "export-evidence", params: { ...target, evidenceId: record.id } } });
  assert.match(rejected.message, /unavailable/i);
  const wrongScope = await action("inspect-kujo-packages", {}, { status: 502, body: { companyId: other, key: "inspect-kujo-packages", params: target } });
  assert.match(wrongScope.message, /project|company|not found/i);
  await config("review");
  await waitUntil(async () => { try { return !(await detail()).catalog.capabilities.find(row => row.tool === "inspect-kujo-packages")?.enabled; } catch { return false; } });
  assert.match((await action("inspect-kujo-packages", {}, { status: 502 })).message, /disabled|profile/i);
  checks.push("package inspection enforces tenant ownership and company profile admission");
  const starter = async (kind, options = {}) => (await call(route, { method: "POST", body: { companyId, key: "preview-starter", params: { kind, name: "host-starter" } }, ...options })).data;
  assert.match((await starter("script", { status: 502 })).message, /disabled/);
  await config("build");
  await waitUntil(async () => { try { return (await detail()).starters?.length === 4; } catch { return false; } });
  for (const kind of ["script", "agent", "api", "mcp"]) {
    const preview = (await starter(kind)).data;
    assert.equal(preview.status, "preview"); assert.equal(preview.kind, kind);
    assert.ok(preview.files.some(file => file.path === preview.entrypoint));
    assert.ok(preview.files.every(file => !file.content.includes(root)));
  }
  assert.equal(await readFile(join(root, "workspace/kennel.toml"), "utf8"), manifest);
  checks.push("native script, fixture-agent and pinned API/MCP starter previews respect company profiles and preserve the project workspace");
  await json("packages.json", { report, exported, companyId, projectId });
}
