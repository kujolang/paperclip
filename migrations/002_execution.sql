CREATE TABLE IF NOT EXISTS plugin_kujo_evidence_c15d42de56.executions (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  issue_id text NOT NULL,
  request_digest text NOT NULL CHECK (length(request_digest) = 64),
  request jsonb NOT NULL CHECK (jsonb_typeof(request) = 'object'),
  state text NOT NULL CHECK (state IN ('preparing', 'pending', 'running', 'cancel_requested', 'succeeded', 'failed', 'cancelled', 'expired', 'rejected', 'stale', 'uncertain')),
  interaction_id text,
  approved_by text,
  owner_id text,
  claim_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '15 minutes',
  lease_until timestamptz,
  finished_at timestamptz,
  result jsonb,
  diagnostic text,
  CHECK (octet_length(request::text) <= 65536),
  CHECK (result IS NULL OR octet_length(result::text) <= 1000000)
);
CREATE INDEX IF NOT EXISTS executions_scope_time_idx ON plugin_kujo_evidence_c15d42de56.executions
  (company_id, issue_id, created_at DESC, id DESC);
