-- Explicit start intent survives the submitting RPC; approval alone never queues work.
ALTER TABLE plugin_kujo_evidence_c15d42de56.executions
  ADD COLUMN start_requested_at timestamptz,
  ADD COLUMN start_requester jsonb,
  ADD CONSTRAINT execution_start_intent_pair CHECK
    ((start_requested_at IS NULL AND start_requester IS NULL) OR
     (start_requested_at IS NOT NULL AND start_requester IS NOT NULL AND jsonb_typeof(start_requester) = 'object' AND octet_length(start_requester::text) <= 2048));
CREATE INDEX executions_queued_start_idx ON plugin_kujo_evidence_c15d42de56.executions
  (start_requested_at, id) WHERE state = 'pending' AND start_requested_at IS NOT NULL;
