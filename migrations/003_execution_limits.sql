ALTER TABLE plugin_kujo_evidence_c15d42de56.executions ADD COLUMN IF NOT EXISTS request_slot integer CHECK (request_slot BETWEEN 1 AND 20);
ALTER TABLE plugin_kujo_evidence_c15d42de56.executions ADD COLUMN IF NOT EXISTS run_slot integer CHECK (run_slot BETWEEN 1 AND 2);
CREATE UNIQUE INDEX IF NOT EXISTS executions_active_request_slot_idx ON plugin_kujo_evidence_c15d42de56.executions (company_id, request_slot) WHERE state IN ('preparing', 'pending', 'running', 'cancel_requested');
CREATE UNIQUE INDEX IF NOT EXISTS executions_active_run_slot_idx ON plugin_kujo_evidence_c15d42de56.executions (company_id, run_slot) WHERE state IN ('running', 'cancel_requested');
CREATE INDEX IF NOT EXISTS executions_company_state_idx ON plugin_kujo_evidence_c15d42de56.executions (company_id, state, created_at DESC, id DESC);
