// Separate-process acceptance for the internal coordinator, using persistent
// PGlite and a synthetic host card. This does not claim live-host authentication.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const [root, phase, pgliteModule, coordinatorModule] = process.argv.slice(2);
const { PGlite } = await import(pgliteModule);
const { createExecutionCoordinator } = await import(coordinatorModule);
const db = new PGlite(join(root, 'postgres'));
const namespace = 'plugin_kujo_evidence_c15d42de56';
const cardsFile = join(root, 'cards.json');
const scope = { companyId: 'company', issueId: 'issue' };
let cards = JSON.parse(await readFile(cardsFile, 'utf8').catch(() => '[]'));
const ctx = {
  db: {
    namespace,
    query: async (sql, params) => (await db.query(sql, params)).rows,
    execute: async (sql, params) => ({ rowCount: (await db.query(sql, params)).affectedRows ?? 0 }),
  },
  issues: {
    get: async (id, companyId) => ({ id, companyId, projectId: 'project' }),
    listInteractions: async () => cards,
    requestConfirmation: async (issueId, input, companyId) => {
      const card = { ...input, id: 'persisted-card', issueId, companyId, kind: 'request_confirmation', status: 'pending', requestedResolverPolicy: 'human_only', effectiveResolverPolicy: 'human_only' };
      cards.push(card); await writeFile(cardsFile, JSON.stringify(cards)); return card;
    },
  },
  projects: { getWorkspaceForIssue: async () => ({ id: 'workspace', projectId: 'project', path: root }) },
};
const marker = join(root, 'executed');
const adapter = {
  materialize: async () => ({
    invocation: { executable: process.execPath, cwd: root, args: ['-e', `require('node:fs').appendFileSync(${JSON.stringify(marker)}, 'once\\n')`] },
    collect: async (output) => ({ exitCode: output.exitCode }), dispose: async () => {},
  }),
};
const service = createExecutionCoordinator(ctx, adapter);
try {
  if (phase === 'prepare') {
    await db.exec(`CREATE SCHEMA ${namespace}`);
    await db.exec(await readFile(join(root, 'migration.sql'), 'utf8'));
    const request = JSON.parse(await readFile(join(root, 'request.json'), 'utf8'));
    const result = await service.prepare(scope, 'restart', request);
    assert.equal(result.state, 'pending'); await writeFile(join(root, 'id'), result.id);
  } else {
    const id = await readFile(join(root, 'id'), 'utf8');
    if (phase === 'execute') {
      await assert.rejects(service.start(scope, id), /human approval/);
      cards[0] = { ...cards[0], status: 'accepted', resolvedByUserId: 'human', resolvedAt: new Date().toISOString(), result: { version: 1, outcome: 'accepted' } };
      await writeFile(cardsFile, JSON.stringify(cards));
      assert.equal((await service.start(scope, id)).state, 'succeeded');
    } else {
      const record = await service.status(scope, id);
      assert.equal(record.state, 'succeeded'); assert.equal(record.approvedBy, 'human');
      assert.deepEqual(await service.start(scope, id), record);
      assert.equal(await readFile(marker, 'utf8'), 'once\n');
      await assert.rejects(service.status({ ...scope, companyId: 'other' }, id), /not found/);
      console.log('persistent approval, terminal receipt, no replay and tenant isolation passed across three processes');
    }
  }
} finally { await service.shutdown(); await db.close(); }
