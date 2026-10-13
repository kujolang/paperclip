# Approved execution foundation

The execution coordinator is an internal integration prototype. There is no
public run tool, execution button, background queue or Eval adapter yet. The
manifest does not request confirmation permissions until a reviewed adapter
needs them. The additive `002_execution.sql` migration reserves durable request
storage without changing existing evidence records.

## Authority and approval

A reviewed adapter supplies an `eval.run` plan containing the suite, project and
workspace identities, visible effects, time limit, and exact input, workspace,
definition, component, runtime and policy digests. The caller supplies host-owned
company/issue/requester context; none of these are agent-chosen command or path
parameters. The coordinator checks the issue and its current host workspace.
Production handlers must additionally enforce their capability profile and
feature settings before preparing or reading requests.

A submission ID identifies one immutable request within a company and issue.
The database insert happens before the host confirmation request. Reusing an ID
with different inputs or a different requester fails. Duplicate preparation does
not create another card. A lost host response is reconciled by exact card identity
and payload; missing or ambiguous evidence does not authorize execution.

The card requests `human_only` resolution and no automatic assignee continuation.
The exact preview, target digest, company, issue, requested/effective resolver
policy and card identity must match. Starting requires an accepted result with a
human resolver, no agent/run resolver, no workspace blocker and a resolution time
within the request lifetime. Additional effect-bearing payloads are rejected.
The plugin never responds to its own card. Only create/read interaction
capabilities will be needed; a generic approval ID is not accepted as authority.

Approval expires after 15 minutes according to database time. Before spawning,
the coordinator checks expiration, persistent cancellation and owner lease again.
An adapter must revalidate current admission and all approved digests, then freeze
its approved inputs. A changed plan requires a new preview and approval. Suite
execution in the original mutable workspace is not established by this prototype.

## Ownership and recovery

An atomic, scoped `UPDATE ... WHERE state = 'pending'` claims execution. Only its
single successful caller may spawn. The claim stores the human approver, worker
identity and unique claim token before any process is created. A lost claim
response never leads to a retry that could duplicate an effect.

Live owners renew a 10-second lease every 250 milliseconds. A persisted cancel
request is observed by the owner and passed to the existing process-tree
terminator. Local cancellation waits for termination; another coordinator reports
`cancel_requested` until the owner confirms it. Shutdown prevents new starts and
cancels owned work. A pre-aborted process request never spawns a child.

An expired owner lease produces `uncertain`, not a retryable failure. It does not
prove an orphaned process stopped. This prototype does not kill a process using a
stale PID after a worker restart, automatically repeat effects, or infer rollback
from cancellation. Cross-worker recovery needs an owned external runner or
verified process identity before long-running Dispatch/Workcell workflows can
make stronger promises.

Preparation is bounded to five seconds and receives an abort signal; late private
snapshots are disposed without being executed. The process runs shell-free with
at most 27 seconds, 500 KB stdout and 64 KB stderr. Result collection must remain
bounded by the reviewed adapter. Retained result JSON is redacted and capped
below 1 MB. A collection or persistence failure after process entry is uncertain.
Terminal outcomes cannot be replaced by a duplicate start or late lease owner.
A failed private snapshot cleanup may fail the caller while the already persisted
execution result remains available through status.

Normal Kujo execution remains trusted code, not a sandbox. Process-tree
termination is best effort against ordinary descendants; code can escape process
groups or create external effects. This foundation does not grant general shell
access or promise containment of adversarial project code.

## State and validation

States are `preparing`, `pending`, `running`, `cancel_requested`, `succeeded`,
`failed`, `cancelled`, `expired`, `rejected`, `stale` and `uncertain`. A successful
process exit does not by itself establish every declared acceptance criterion;
the future Eval adapter must retain and classify its canonical result separately.
Request digests are checked on every read, and all transitions use parameterized,
namespace-qualified, single-statement SQL scoped to company and issue. No
invented host transaction or compare-and-swap API is required.

Tests use real PostgreSQL semantics through PGlite, separate coordinator instances
and real child processes, including the released Kujo runtime. They cover duplicate
claims, approval changes/expiry/forgery, tenant boundaries, lost responses, stale
inputs, shutdown/cancellation, output/time limits, redaction and uncertain outcomes.
The development acceptance probe also checks host SQL validators and confirmation
schemas. These checks do not replace an authenticated approval in a running
Paperclip host.

Before exposing Eval: add the pinned canonical adapter and frozen input/effect
preview, bounded canonical result collection, durable failure/parent-child receipts,
retention/admission limits, UI and agent start/status/inspect/cancel flows, and
actual-host approval/restart/tenant acceptance. Preserve this foundation's tests
when integrating those surfaces; do not present the prototype as a shipped workflow.
