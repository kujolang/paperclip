CREATE TABLE IF NOT EXISTS plugin_kujo_evidence_c15d42de56.artifacts (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('project', 'issue', 'run')),
  entity_id text NOT NULL,
  kind text NOT NULL,
  artifact_id text NOT NULL,
  stored_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  source_kind text NOT NULL CHECK (source_kind IN ('observed', 'supplied', 'legacy', 'imported')),
  result text NOT NULL,
  digest text NOT NULL CHECK (length(digest) = 64),
  input_digest text,
  definition_digest text,
  parent_id text,
  payload_bytes integer NOT NULL CHECK (payload_bytes > 0 AND payload_bytes <= 5000000),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  UNIQUE (company_id, entity_type, entity_id, kind, artifact_id)
);
CREATE INDEX IF NOT EXISTS artifacts_scope_time_idx ON plugin_kujo_evidence_c15d42de56.artifacts
  (company_id, entity_type, entity_id, stored_at DESC, id DESC);
