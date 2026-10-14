import { afterAll, afterEach, beforeAll } from "vitest";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createTestHarness as createSdkHarness } from "@paperclipai/plugin-sdk/testing";
import { EVIDENCE_NAMESPACE } from "../../src/storage/history.js";

let database: Promise<PGlite> | undefined;
const sqlCalls: Array<{ type: "query" | "execute"; sql: string }> = [];
export async function testDatabase() {
  database ??= (async () => {
    const db = new PGlite();
    await db.exec(`CREATE SCHEMA ${EVIDENCE_NAMESPACE}`);
    const migrations = new URL("../../migrations/", import.meta.url);
    for (const name of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(name, migrations), "utf8"));
    return db;
  })();
  return await database;
}
// Initialize PostgreSQL/WASM once per test file before operation assertion deadlines.
// Cold startup can exceed 30 seconds on a loaded developer host.
beforeAll(async () => { await testDatabase(); }, 60_000);

export function createTestHarness(options: Parameters<typeof createSdkHarness>[0]) {
  const harness = createSdkHarness(options);
  harness.ctx.db.namespace = EVIDENCE_NAMESPACE;
  harness.ctx.db.query = async <T>(sql: string, params?: unknown[]) => {
    sqlCalls.push({ type: "query", sql });
    return (await (await testDatabase()).query<T>(sql, params)).rows;
  };
  harness.ctx.db.execute = async (sql: string, params?: unknown[]) => {
    sqlCalls.push({ type: "execute", sql });
    const result = await (await testDatabase()).query(sql, params);
    return { rowCount: result.affectedRows ?? 0 };
  };
  return harness;
}
afterEach(async () => {
  if (database) {
    await (await database).exec(`DELETE FROM ${EVIDENCE_NAMESPACE}.knowledge_indexes`);
    await (await database).exec(`DELETE FROM ${EVIDENCE_NAMESPACE}.artifacts`);
    await (await database).exec(`DELETE FROM ${EVIDENCE_NAMESPACE}.executions`);
  }
});
afterAll(async () => {
  if (process.env.KUJO_SQL_CAPTURE_FILE) await writeFile(process.env.KUJO_SQL_CAPTURE_FILE, JSON.stringify(sqlCalls));
  if (database) await (await database).close();
});
