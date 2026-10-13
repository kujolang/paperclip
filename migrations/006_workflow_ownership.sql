-- Retained workflow parents own their native reservations independently of the
-- lifetime of a single execution. Never prune a parent as an ordinary receipt.
ALTER TABLE plugin_kujo_evidence_c15d42de56.executions
  ADD COLUMN workflow_slot integer CHECK (workflow_slot BETWEEN 1 AND 20);
CREATE UNIQUE INDEX executions_workflow_slot_idx ON plugin_kujo_evidence_c15d42de56.executions
  (company_id, workflow_slot) WHERE workflow_slot IS NOT NULL;
-- Competing decisions for one retained native run cannot both acquire owners.
CREATE UNIQUE INDEX executions_workflow_owner_idx ON plugin_kujo_evidence_c15d42de56.executions
  (company_id, issue_id, (request->'plan'->'workflow'->>'parentId'))
  WHERE state IN ('running', 'cancel_requested') AND request->'plan'->'workflow' IS NOT NULL;
