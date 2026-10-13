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
schemas. The opt-in authenticated host qualification below tests the actual worker bridge,
host confirmation and PostgreSQL persistence using a disposable board account.
It does not replace manual UI approval or newcomer usability validation.

Before exposing Eval: add the pinned canonical adapter and frozen input/effect
preview, bounded canonical result collection, durable failure/parent-child receipts,
retention/admission limits, UI and agent start/status/inspect/cancel flows, and
actual-host approval/restart/tenant acceptance. Preserve this foundation's tests
when integrating those surfaces; do not present the prototype as a shipped workflow.

## Reproduce authenticated host qualification

From a source checkout with plugin dependencies installed, use a prepared
Paperclip source checkout with its server dependencies, `cli`'s `tsx` dependency
and embedded PostgreSQL platform package already installed:

```bash
KUJO_ACCEPTANCE_HOST=/absolute/path/to/paperclip npm run test:host:execution
```

Use a Node version supported by that host checkout. To select the host executable
explicitly, set `KUJO_ACCEPTANCE_NODE=/absolute/path/to/node`. This is an opt-in
development test, separate from the portable unit and browser suites. It requires
free loopback ports and disk space for a fresh embedded database. It does not
install host dependencies or download component code.

The harness creates a new private temporary instance with separate configuration,
ports, database, storage and secrets. It never accepts an existing server URL or
database. It signs up a disposable authenticated test board user, creates fixture
company/project/issue/workspace records, and installs a development-only worker.
The worker uses the real coordinator and bundled runtime but executes only two
fixed fixture programs. No project code or agent-supplied command is executed.
The fixture uses the production plugin ID only inside this isolated database;
never install it over an existing Kujo plugin. Neither the harness nor fixture is
in the npm package.

Checks cover duplicate confirmation preparation; unauthenticated, nonmember and
unapproved starts; human-only rejection for an agent with real host run
attribution; forged actor context; cross-company status/start/cancel; native
execution after host-recorded board acceptance; immutable terminal replay;
cancellation before and during execution; worker reload; and full host/database
restart with pending and terminal records. The agent API key is revoked after
the actor checks. These are automated test-account approvals, not manual human
review, production Eval qualification or proof of orphan cleanup after a crash.

The harness stops its own server gracefully and prints its private evidence
directory. `result.json` records the source commits, completed checks and shutdown
result; `receipts.json` contains fixture outcomes. Inspect a failure using the
private `server.log`. Do not publish the database, logs or secrets directory.
The temporary directory is retained for local diagnosis and may be removed after
confirming the owned host stopped. Existing Paperclip instances remain untouched.
