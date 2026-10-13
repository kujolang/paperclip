import { randomUUID } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { z } from "zod";
import { canonicalJson, evidenceDigest, EVIDENCE_NAMESPACE } from "../../storage/history.js";
import { knowledgeNamespace, validateRetainedKnowledge, type RetainedKnowledge } from "./native.js";

const identity = z.string().min(1).max(200);
export const knowledgeScopeSchema = z.object({ companyId: identity, projectId: identity, workspaceId: identity }).strict();
export type KnowledgeScope = z.infer<typeof knowledgeScopeSchema>;
const revisionSchema = z.uuid();
const rowSchema = z.object({ revision: revisionSchema, storedAt: z.string(), expiresAt: z.string(), digest: z.string(), payload: z.unknown() });
export type StoredKnowledge = { revision: string; storedAt: string; expiresAt: string; retained: RetainedKnowledge };
const columns = 'revision, stored_at::text AS "storedAt", expires_at::text AS "expiresAt", digest, payload';
const scoped = "company_id = $1 AND project_id = $2 AND workspace_id = $3";
function table(ctx: PluginContext) {
  if (ctx.db.namespace !== EVIDENCE_NAMESPACE) throw new Error("Private knowledge storage is unavailable; reapply plugin migrations");
  return `${EVIDENCE_NAMESPACE}.knowledge_indexes`;
}
function params(scope: KnowledgeScope) {
  const value = knowledgeScopeSchema.parse(scope);
  return [value.companyId, value.projectId, value.workspaceId];
}
function decode(raw: unknown, scope: KnowledgeScope): StoredKnowledge {
  const row = rowSchema.parse(raw);
  if (evidenceDigest(row.payload) !== row.digest) throw new Error("Private knowledge record failed integrity validation");
  const retained = validateRetainedKnowledge({ namespace: knowledgeNamespace(...params(scope) as [string, string, string]), retained: row.payload });
  return { revision: row.revision, storedAt: row.storedAt, expiresAt: row.expiresAt, retained };
}
export async function readKnowledge(ctx: PluginContext, scope: KnowledgeScope): Promise<StoredKnowledge | null> {
  const rows = await ctx.db.query(`SELECT ${columns} FROM ${table(ctx)} WHERE ${scoped} AND expires_at > clock_timestamp()`, params(scope));
  return rows[0] ? decode(rows[0], scope) : null;
}

async function observeWrite(ctx: PluginContext, scope: KnowledgeScope, revision: string): Promise<StoredKnowledge> {
  const current = await readKnowledge(ctx, scope);
  if (!current || current.revision !== revision) throw new Error("Knowledge write completed but changed before observation; refresh without replaying it");
  return current;
}

// CAS revisions are random identities, so deletion/recreation cannot resurrect a
// stale writer. Database uniqueness bounds each company's live rows under races.
export async function replaceKnowledge(ctx: PluginContext, scope: KnowledgeScope, expectedRevision: string | null, value: RetainedKnowledge): Promise<StoredKnowledge> {
  const ids = params(scope);
  const retained = validateRetainedKnowledge({ namespace: knowledgeNamespace(...ids as [string, string, string]), retained: value });
  const payload = canonicalJson(retained);
  if (Buffer.byteLength(payload) > 9_000_000) throw new Error("Private knowledge record exceeds its storage limit");
  const revision = randomUUID();
  const digest = evidenceDigest(retained);
  if (expectedRevision !== null) {
    revisionSchema.parse(expectedRevision);
    const updated = await ctx.db.execute(`UPDATE ${table(ctx)} SET revision = $5, digest = $6, payload = $7::jsonb,
      stored_at = clock_timestamp(), expires_at = clock_timestamp() + interval '30 days'
      WHERE ${scoped} AND revision = $4 AND expires_at > clock_timestamp()`,
    [...ids, expectedRevision, revision, digest, payload]);
    if (updated.rowCount !== 1) throw new Error("Knowledge index changed or expired; refresh before replacing it");
    return observeWrite(ctx, scope, revision);
  }
  await ctx.db.execute(`DELETE FROM ${table(ctx)} WHERE company_id = $1 AND expires_at <= clock_timestamp()`, [ids[0]]);
  for (let slot = 1; slot <= 20; slot++) {
    const inserted = await ctx.db.execute(`INSERT INTO ${table(ctx)} (company_id, project_id, workspace_id, slot, revision, digest, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) ON CONFLICT DO NOTHING`, [...ids, slot, revision, digest, payload]);
    if (inserted.rowCount === 1) return observeWrite(ctx, scope, revision);
    if (await readKnowledge(ctx, scope)) throw new Error("Knowledge index already exists; refresh before replacing it");
  }
  throw new Error("Company knowledge storage is full (20 indexes); delete an index before ingesting another");
}

export async function deleteKnowledge(ctx: PluginContext, scope: KnowledgeScope, revision: string): Promise<boolean> {
  revisionSchema.parse(revision);
  return (await ctx.db.execute(`DELETE FROM ${table(ctx)} WHERE ${scoped} AND revision = $4`, [...params(scope), revision])).rowCount === 1;
}
export function knowledgeSummary(record: StoredKnowledge) {
  const { index: _index, indexDigest: _indexDigest, ...metadata } = record.retained;
  return { revision: record.revision, storedAt: record.storedAt, expiresAt: record.expiresAt, ...metadata };
}

// Bounded metadata for the host-authorized project, including older workspaces.
// Do not fetch index payloads merely to render a list or release a retained slot.
export async function listKnowledge(ctx: PluginContext, project: { companyId: string; projectId: string }) {
  identity.parse(project.companyId); identity.parse(project.projectId);
  const rows = await ctx.db.query(`SELECT workspace_id AS "workspaceId", revision,
    stored_at::text AS "storedAt", expires_at::text AS "expiresAt" FROM ${table(ctx)}
    WHERE company_id = $1 AND project_id = $2 AND expires_at > clock_timestamp()
    ORDER BY stored_at DESC, workspace_id LIMIT 20`, [project.companyId, project.projectId]);
  return z.array(z.object({ workspaceId: identity, revision: revisionSchema, storedAt: z.string(), expiresAt: z.string() }).strict()).parse(rows);
}
