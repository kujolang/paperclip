ALTER TABLE plugin_kujo_evidence_c15d42de56.executions ADD COLUMN IF NOT EXISTS history_published_at timestamptz;
CREATE INDEX IF NOT EXISTS executions_history_pending_idx ON plugin_kujo_evidence_c15d42de56.executions (company_id, issue_id, created_at DESC) WHERE history_published_at IS NULL AND state NOT IN ('preparing', 'pending', 'running', 'cancel_requested');
