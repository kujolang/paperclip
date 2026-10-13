# Approved execution foundation

The issue panel and `manage-evaluation` tool expose the bounded canonical Eval
workflow. Execution defaults off, requires a compatible company profile and an
explicit human-only issue confirmation. This is synchronous bounded execution,
not a background queue or a durable long-running workflow runner. The manifest
requests confirmation create/read permissions only; it cannot accept its own card.
Migrations002/003 store immutable requests and enforce company admission limits.
Migration004 adds a durable history-publication acknowledgment.

## Public workflow

On an issue, preview a Git-visible JSON suite, request approval, accept the native
Paperclip confirmation in the issue thread, then explicitly start the request.
The panel never starts automatically on acceptance. Refresh requests after a
reload or ambiguous response; inspect the existing receipt before creating a new
request. Pending means not started, not necessarily approved. Uncertain outcomes
may have produced effects and must not be blindly retried. Cancellation does not
undo writes or external effects.

`manage-evaluation` accepts these strict operation variants:

| Operation | Required fields besides `operation` |
| --- | --- |
| `inspect` | `issueId`, `suite` |
| `prepare` | `issueId`, `suite`, `submissionId` |
| `start`, `status`, `cancel` | `issueId`, `id` |
| `list` | `issueId` |

Keep the same submission ID when retrying an ambiguous preparation; changing its
inputs is rejected. No workspace path, command, executable, requester or approval
ID is accepted. Agent requests require the actual host issue assignment, project,
company and current checkout/execution run. Starts/cancels also require the same
requesting agent and run; a human can manage requests on the authorized issue.
UI actions require immutable authenticated human context from the host.

List returns at most100 summaries without suite previews or result contents; it
remains available after disabling execution so outstanding work can be cancelled.
Status returns the approved plan and native receipt while execution is enabled.
Public results omit internal owner/claim tokens. Terminal requests also publish linked observed plan/outcome records in Evidence
history. These are execution-ledger records, not canonical Ability invocation receipts. Arbitrary issue selection by an agent does not grant access.

## Retained execution history

Each terminal request publishes two immutable records atomically: the requested
plan (explicitly not-run) and its child outcome. Outcomes preserve the execution
state, canonical Eval result, original input/definition digests and parent digest.
Rejected, expired, stale, cancelled, failed and uncertain outcomes stay distinct.
A requested plan alone is not proof of approval or execution.

Publication failure does not change the durable outcome or repeat execution.
Status/start/cancel and list/detail recovery retry publication. Each list/detail
refresh reconciles at most four pending terminal requests; the panel explains
when more evidence needs saving. History retains 20 records per issue for30 days,
shared with other evidence. These pairs use terminal completion time, so delayed
publication does not renew their retention. The independent execution ledger
retains up to100 terminal requests per company for30 days.

Clear Kujo data acknowledges existing terminal requests before removing their
history; retries cannot recreate cleared or already acknowledged/pruned records.
Active requests can still publish new outcomes when they finish. Parent records
can be pruned independently; the child retains its parent ID/digest and the UI
explains missing parents. Inspection, redacted export and explicit human issue
attachment include the parent when available. Comparisons include execution state
and native check counts. Attached issue documents are not removed by history clear.

Agents can list/read issue evidence with `scope: "issue"` and `issueId` only for
their assigned issue and current host run. Project/run scopes reject `issueId`.
Feature/profile gates and existing read-size limits still apply.

## Authority and approval

A reviewed adapter supplies an `eval.run` plan containing the suite, project and
workspace identities, visible effects, time limit, and exact input, workspace,
definition, component, runtime and policy digests. The caller supplies host-owned
company/issue/requester context; none of these are agent-chosen command or path
parameters. The coordinator checks the issue and its current host workspace.
The host service enforces capability profile and feature settings before
preparation, inspection, start and detailed receipt reads.

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
capabilities are requested; a generic approval ID is not accepted as authority.

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
the Eval adapter retains and classifies its canonical result separately.
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

Further expansion requires parent-child evidence integration, durable external
workflow runners and newcomer acceptance. Preserve these invariants when adding
those surfaces; bounded Eval is not the full expansion.

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
The worker uses the real coordinator and bundled runtime and executes fixed fixture programs and canonical Eval suites in a disposable
Git workspace. No user project or agent-supplied command is executed.
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

## Canonical Eval primitive

`prepareNativeEval` captures a supplied set of bounded UTF-8 files, validates its
selected JSON suite against the pinned canonical schema and binds exact input,
definition, component, runtime and adapter-policy digests. The caller cannot
change captured file bytes by mutating its original array. Materialization checks
the approved bindings and all four declared effect classes, rechecks component
and runtime integrity, and writes the inputs and canonical component into a new
private directory. The coordinator owns approval, the process, timeout and
cancellation; the primitive never creates or accepts its own approval.

All canonical check families and setup/teardown hooks remain native Eval code.
The primitive conservatively declares file reads, writes, project execution and
network access for every suite. Commands, HTTP checks and snapshot updates are
not silently omitted or reimplemented. A suite can access resources outside its
input copy, so this is trusted execution, not a sandbox or proof of a complete
project snapshot. Public admission must show the actual suite effects and frozen
input coverage before users can approve it. The public handler reaches this primitive only through the approved host service.

The native CLI receives an isolated component import root, controlled output
directory and generated subject identity. Collection reads only the fixed
`evaluation-result.json`, capped at64KiB; it rejects redirected directories,
nonregular files, symlinks, shared hard links, wrong subjects, changed definition
digests and exit/result contradictions. It reuses canonical result validation
and summary redaction, retaining a native execution label with exact provenance.
Referenced artifact URIs are not opened. Canonical failed checks remain failed;
skipped checks remain visible. Invalid or missing result evidence after process
entry is uncertain under the coordinator. Private files are disposed afterward.
Suite code remains capable of external side effects; cancellation does not undo
them and there is no filesystem quota or hostile-code containment promise.

The authenticated-host fixture also runs fixed passing and failing canonical
Eval suites after board-account acceptance, retains their native receipts and
checks that those receipts survive full host/database restart. This extends the
fixed-program acceptance above through a development fixture. Production mode below separately qualifies the
actual worker; manual user acceptance remains required.


## Host admission and review

The host service resolves the issue, company, project and canonical
workspace through Paperclip. Execution defaults off. Enabling
`features.execution` requires the installed/full profile or a canonical profile
containing `kujo.eval.suite.run` (currently Ship). No profile grants approval.
Public handlers derive requester identity from authenticated host context; no caller workspace, executable, file bytes or approval ID is accepted.

The service captures Git-visible text files into a private input copy, bounded to
1,000 files, 64 KiB per file and 16 MiB total. The review contains the redacted
suite definition, declared effects, output override and input coverage. Ignored
paths, dependencies and external resources are not frozen. Sensitive, binary,
unreadable and oversized files are omitted; omissions turn a native pass into a
partial result while preserving the native classification. Suite commands can
access resources outside the copy. This does not establish dependency isolation
or a complete executable project snapshot.

The plan binds copied bytes, omitted inventory, workspace identity, canonical
Ability definition, runtime and effective settings. Admission is checked again
before execution; changed inputs or settings cannot reuse approval. Reviews that
exceed the host confirmation size limit are rejected before allocating a request
or card. At most two captures and two starts run concurrently per worker service.
Cancellation remains available when execution is disabled. Current workspace
freshness after execution is explicitly not rechecked.

## Durable limits and retention

The additive `003_execution_limits.sql` migration adds company-scoped unique
slots: at most 20 active requests and two persisted running owners. Capacity is
shared across issues and workers. A third approved request remains pending;
there is no automatic queue. Concurrent slot contention can require an explicit
refresh/retry, but a lost ownership response never triggers an automatic retry.
Legacy active requests without slots conservatively block new admission until
they finish or expire; migration does not evict them.

Before admission, claim and list, maintenance expires abandoned pending requests,
marks expired owner leases uncertain, and prunes terminal requests older than
30 days or beyond the latest 100 per company. Active requests are preserved.
Retention is opportunistic: newly finished rows can temporarily exceed 100 until
the next maintenance operation. Listing returns at most 100 scoped requests,
active first. These limits constrain persisted ownership, not unknown orphan
processes after a crash; the recovery limits above still apply.

The authenticated fixture checks actual company settings, host workspace capture,
full review, native receipts, stale-input rejection, cancellation after disabling,
20-request capacity and two-owner admission using real PostgreSQL. The default fixture mode is distinct from production qualification below.


## Production worker qualification

Build the plugin, then set `KUJO_ACCEPTANCE_PRODUCTION=1` alongside the host/node
variables above. This mode installs the actual source worker and manifest into a
fresh disposable authenticated host. It exercises the public action/tool routes,
settings and identity checks, approval, native pass/fail, stale inputs, disabled
recovery, tenant isolation and full host/database restart. It uses automated board
accounts and fixed fixture suites; it is not manual UI or newcomer usability proof.
The browser suite separately exercises explicit action sequencing, responsive
layout and isolation of delayed results after company navigation.
