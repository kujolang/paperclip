import type { PluginContext } from "@paperclipai/plugin-sdk";
import { canonicalJson, evidenceDigest, EVIDENCE_NAMESPACE } from "../storage/history.js";
import { executionRecordSchema, type ExecutionRecord, type ExecutionRequest, type ExecutionScope, type ExecutionState } from "./contracts.js";

const columns = `id, request_digest AS "requestDigest", request, state, interaction_id AS "interactionId", approved_by AS "approvedBy",
  owner_id AS "ownerId", claim_id AS "claimId", created_at::text AS "createdAt", expires_at::text AS "expiresAt",
  lease_until::text AS "leaseUntil", finished_at::text AS "finishedAt", result, diagnostic`;
export const EXECUTION_LIMITS = { activeRequests: 20, running: 2, retainedTerminal: 100, retentionDays: 30 } as const;
const active = "('preparing', 'pending', 'running', 'cancel_requested')";
const running = "('running', 'cancel_requested')";
const scoped = "company_id = $1 AND issue_id = $2 AND id = $3";
function table(ctx: PluginContext) {
  if (ctx.db.namespace !== EVIDENCE_NAMESPACE) throw new Error("Execution database unavailable; reapply plugin migrations");
  return `${EVIDENCE_NAMESPACE}.executions`;
}
const params = (scope: ExecutionScope, id: string) => [scope.companyId, scope.issueId, id];

export function executionLedger(ctx: PluginContext) {
  const read = async (scope: ExecutionScope, id: string): Promise<ExecutionRecord | null> => {
    const rows = await ctx.db.query(`SELECT ${columns} FROM ${table(ctx)} WHERE ${scoped}`, params(scope, id));
    if (!rows[0]) return null;
    const record = executionRecordSchema.parse(rows[0]);
    if (evidenceDigest(record.request) !== record.requestDigest) throw new Error("Execution request integrity failed");
    return record;
  };
  const maintain = async (companyId: string) => {
    await ctx.db.execute(`UPDATE ${table(ctx)} SET state = 'expired', finished_at = clock_timestamp(), diagnostic = 'approval_expired'
      WHERE company_id = $1 AND state IN ('preparing', 'pending') AND expires_at <= clock_timestamp()`, [companyId]);
    await ctx.db.execute(`UPDATE ${table(ctx)} SET state = 'uncertain', finished_at = clock_timestamp(), diagnostic = 'owner_lease_expired'
      WHERE company_id = $1 AND state IN ${running} AND lease_until <= clock_timestamp()`, [companyId]);
    await ctx.db.execute(`DELETE FROM ${table(ctx)} WHERE company_id = $1 AND state NOT IN ${active}
      AND (finished_at < clock_timestamp() - interval '30 days' OR id IN
        (SELECT id FROM ${table(ctx)} WHERE company_id = $1 AND state NOT IN ${active}
          ORDER BY created_at DESC, id DESC OFFSET 100))`, [companyId]);
  };
  return {
    read, maintain,
    async list(scope: ExecutionScope) {
      await maintain(scope.companyId);
      const rows = await ctx.db.query(`SELECT ${columns} FROM ${table(ctx)} WHERE company_id = $1 AND issue_id = $2
        ORDER BY CASE WHEN state IN ${active} THEN 0 ELSE 1 END, created_at DESC, id DESC LIMIT 100`, [scope.companyId, scope.issueId]);
      return rows.map(row => {
        const record = executionRecordSchema.parse(row);
        if (evidenceDigest(record.request) !== record.requestDigest) throw new Error("Execution request integrity failed");
        return record;
      });
    },
    async insert(scope: ExecutionScope, id: string, request: ExecutionRequest) {
      await maintain(scope.companyId);
      // Slot uniqueness, not a racy COUNT, enforces admission across workers.
      // Legacy active rows without slots block new admission until they finish
      // or expire; migration never silently evicts an outstanding approval.
      for (let attempt = 0; attempt < EXECUTION_LIMITS.activeRequests; attempt++) {
        const inserted = (await ctx.db.execute(`INSERT INTO ${table(ctx)} (id, company_id, issue_id, request_digest, request, state, request_slot)
          SELECT $3, $1, $2, $4, $5::jsonb, 'preparing', slots.slot FROM generate_series(1, 20) AS slots(slot)
          WHERE NOT EXISTS (SELECT 1 FROM ${table(ctx)} existing WHERE existing.company_id = $1 AND existing.state IN ${active}
            AND (existing.request_slot = slots.slot OR existing.request_slot IS NULL))
          ORDER BY slots.slot LIMIT 1 ON CONFLICT DO NOTHING`,
        [...params(scope, id), evidenceDigest(request), canonicalJson(request)])).rowCount === 1;
        if (inserted) return true;
        if (await read(scope, id)) return false;
        const capacity = await ctx.db.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table(ctx)}
          WHERE company_id = $1 AND state IN ${active}`, [scope.companyId]);
        if (Number(capacity[0]?.count ?? 0) >= EXECUTION_LIMITS.activeRequests) break;
      }
      throw new Error("Company execution request capacity is unavailable; finish, cancel or expire outstanding requests before retrying");
    },
    async bind(scope: ExecutionScope, id: string, interactionId: string) {
      await ctx.db.execute(`UPDATE ${table(ctx)} SET interaction_id = $4, state = 'pending', diagnostic = NULL
        WHERE ${scoped} AND state = 'preparing' AND interaction_id IS NULL`, [...params(scope, id), interactionId]);
    },
    async expire(scope: ExecutionScope, id: string) {
      await ctx.db.execute(`UPDATE ${table(ctx)} SET state = 'expired', finished_at = clock_timestamp(), diagnostic = 'approval_expired'
        WHERE ${scoped} AND state IN ('preparing', 'pending') AND expires_at <= clock_timestamp()`, params(scope, id));
      // An expired owner lease proves only that observation was lost, not that
      // an effect failed or an orphaned process stopped. Never requeue it.
      await ctx.db.execute(`UPDATE ${table(ctx)} SET state = 'uncertain', finished_at = clock_timestamp(), diagnostic = 'owner_lease_expired'
        WHERE ${scoped} AND state IN ('running', 'cancel_requested') AND lease_until <= clock_timestamp()`, params(scope, id));
    },
    async claim(scope: ExecutionScope, id: string, interactionId: string, approvedBy: string, ownerId: string, claimId: string, approvedAt: string) {
      await maintain(scope.companyId);
      return (await ctx.db.execute(`UPDATE ${table(ctx)} SET state = 'running', approved_by = $5, owner_id = $6, claim_id = $7,
        lease_until = clock_timestamp() + interval '10 seconds', run_slot = available.slot
        FROM (SELECT slots.slot FROM generate_series(1, 2) AS slots(slot)
          WHERE NOT EXISTS (SELECT 1 FROM ${table(ctx)} existing WHERE existing.company_id = $1 AND existing.state IN ${running}
            AND (existing.run_slot = slots.slot OR existing.run_slot IS NULL)) ORDER BY slots.slot LIMIT 1) AS available
        WHERE ${scoped} AND state = 'pending' AND interaction_id = $4 AND expires_at > clock_timestamp()
        AND $8::timestamptz >= date_trunc('milliseconds', created_at) AND $8::timestamptz < expires_at AND $8::timestamptz <= clock_timestamp()`,
      [...params(scope, id), interactionId, approvedBy, ownerId, claimId, approvedAt])).rowCount === 1;
    },
    async heartbeat(scope: ExecutionScope, id: string, ownerId: string, claimId: string) {
      return (await ctx.db.execute(`UPDATE ${table(ctx)} SET lease_until = clock_timestamp() + interval '10 seconds'
        WHERE ${scoped} AND owner_id = $4 AND claim_id = $5 AND state = 'running' AND lease_until > clock_timestamp()`,
      [...params(scope, id), ownerId, claimId])).rowCount === 1;
    },
    async spawnAdmission(scope: ExecutionScope, id: string, ownerId: string, claimId: string) {
      const rows = await ctx.db.query<{ admission: string }>(`SELECT CASE WHEN state = 'cancel_requested' THEN 'cancelled'
        WHEN state <> 'running' OR lease_until <= clock_timestamp() THEN 'uncertain'
        WHEN expires_at <= clock_timestamp() THEN 'expired' ELSE 'ready' END AS admission
        FROM ${table(ctx)} WHERE ${scoped} AND owner_id = $4 AND claim_id = $5`, [...params(scope, id), ownerId, claimId]);
      return rows[0]?.admission ?? "uncertain";
    },
    async cancel(scope: ExecutionScope, id: string) {
      await ctx.db.execute(`UPDATE ${table(ctx)} SET state = 'cancelled', finished_at = clock_timestamp(), diagnostic = 'cancelled_before_execution'
        WHERE ${scoped} AND state IN ('preparing', 'pending')`, params(scope, id));
      await ctx.db.execute(`UPDATE ${table(ctx)} SET state = 'cancel_requested', diagnostic = 'cancellation_requested'
        WHERE ${scoped} AND state = 'running'`, params(scope, id));
    },
    async finishPending(scope: ExecutionScope, id: string, state: "rejected" | "uncertain", diagnostic: string) {
      await ctx.db.execute(`UPDATE ${table(ctx)} SET state = $4, finished_at = clock_timestamp(), diagnostic = $5
        WHERE ${scoped} AND state IN ('preparing', 'pending')`, [...params(scope, id), state, diagnostic]);
    },
    async finish(scope: ExecutionScope, id: string, ownerId: string, claimId: string, state: ExecutionState, result: Record<string, unknown> | null, diagnostic: string | null) {
      return (await ctx.db.execute(`UPDATE ${table(ctx)} SET state = $6, result = $7::jsonb, diagnostic = $8, finished_at = clock_timestamp()
        WHERE ${scoped} AND owner_id = $4 AND claim_id = $5 AND state IN ('running', 'cancel_requested') AND lease_until > clock_timestamp()`,
      [...params(scope, id), ownerId, claimId, state, result === null ? null : canonicalJson(result), diagnostic])).rowCount === 1;
    },
  };
}
