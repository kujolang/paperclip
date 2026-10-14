-- Private indexes never share the exportable evidence table.
CREATE TABLE IF NOT EXISTS plugin_kujo_evidence_c15d42de56.knowledge_indexes (
  company_id text NOT NULL,
  project_id text NOT NULL,
  workspace_id text NOT NULL,
  slot integer NOT NULL CHECK (slot BETWEEN 1 AND 20),
  revision text NOT NULL,
  stored_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '30 days',
  digest text NOT NULL CHECK (length(digest) = 64),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 10000000),
  PRIMARY KEY (company_id, project_id, workspace_id),
  UNIQUE (company_id, slot),
  CHECK (expires_at > stored_at)
);
CREATE INDEX IF NOT EXISTS knowledge_expiry_idx ON plugin_kujo_evidence_c15d42de56.knowledge_indexes (company_id, expires_at);
