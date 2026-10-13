# Approved execution foundation

The issue panel exposes bounded canonical Eval through `manage-evaluation` and
native run/test through `manage-kujo-execution`, with separate opt-in settings. Execution defaults off, requires a compatible company profile and an
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
history. Newly prepared requests include the canonical-contract Ability receipt
described below; legacy records keep their original representation. Arbitrary issue selection by an agent does not grant access.

## Native source and tests

Enable `features.sourceExecution` in Installed, Build or Full. This is separate
from Eval's `features.execution`. The issue panel uses the same preview → request
human-only approval → explicit start flow and persistent ledger as Eval. The
`manage-kujo-execution` tool accepts these strict variants:

| Operation | Required fields besides `operation` |
| --- | --- |
| `inspect` | `issueId`, `mode`; `path` for run/test |
| `prepare` | `issueId`, `mode`, `submissionId`; `path` for run/test |
| `start`, `status`, `cancel` | `issueId`, `id` |
| `list` | `issueId` |

| Mode | Fixed native command | Input |
| --- | --- | --- |
| `run` | `kujo run --interpreter ./file.kujo` | Selected project-relative Git-visible source |
| `test` | `kujo test-run ./file.kujo` | Selected project-relative Git-visible test file |
| `fixtures` | `kujo test --runtime interpreter` | Native fixture discovery under `tests/`; omit `path` |

Windows run mode additionally supplies the runtime's Windows-only
`--kill-children-on-exit` flag. Commands, extra flags, workspace roots, executable
paths, requester identities and approval IDs cannot be supplied by callers.
Current host issue assignment/run checks and same-requester mutation restrictions
apply to agents. Neither UI nor tool can accept its own approval card.

All modes use the bounded frozen Git-visible text copy:1,000 files,64 KiB each,
16 MiB total. Inspect the preview's admitted files and omissions before approval.
The full redacted entry source is shown for run/test; fixture mode lists admitted
test files. A preview above12,000 characters is refused before creating a card.
The approved digest binds the entire admitted inventory, copied bytes, operation,
workspace, runtime and effective settings; changing any of them requires approval
again. Source and Eval records cannot be started through each other's adapter.

Ignored dependencies, binary resources, credentials and external services are
not supplied or frozen. This is not a complete executable copy of every project.
Relative output stays in the temporary copy and is removed. Trusted code can
still read/write/delete host files, start processes and use the network: input
copying is not a sandbox. Cancellation cannot roll back those effects. These
commands run once, within27 seconds and500 KB/64 KB stdout/stderr; persistent
servers, dependency installation and approved project creation remain separate
work. Source and Eval share the company request/owner and retention limits below.

Native exit status and bounded redacted output are observed. Results are labeled
`process-completed` or `process-failed`, never inferred test counts or full-project
passes. In particular, `test-run` can exit zero with no tests. Program output is
untrusted text; inspect it for actual coverage. Timeout, cancellation, stale input,
rejection and uncertainty retain their distinct coordinator states.

Preparation errors retain `source_preparation:<stage>:<reason>` in status,
portable receipts and linked history. Stages distinguish admission, temporary
storage, workspace snapshot, runtime lookup, inventory, input copying, source
selection, freshness, preview, runtime digest and cleanup. Filesystem reasons
are restricted to ENOSPC, EDQUOT, EACCES, EPERM, ENOENT, EIO, EMFILE, ENFILE and
EROFS; other unexpected failures use `unknown`. The panel gives repair guidance.
Raw exception messages, paths, stacks and causes are not retained. Existing Kujo
runtime timeout/cancellation/error codes remain unchanged. These failures occur
before native project execution and do not acquire a native result or retry
permission. Correct the cause and review a new request. Historical generic
`materialization_failed` receipts remain unchanged; new diagnostics cannot
reconstruct their original causes.

Terminal source requests publish linked `source-execution-plan` and
`source-execution-result` records with the same atomic publication, bounded
recovery, pruning, parent export and clear semantics as Eval. Portable
`kujo.ability.receipt/v1` receipts identify the host-owned
`kujo.paperclip.source.execute` adapter; this is not an invented canonical Kujo
catalog entry or a portable permission grant. Native result `durationMs` measures
the process; receipt timing measures the request lifecycle including approval
wait. Legacy Eval receipts and immutable history remain unchanged.

## Approved starter creation

`features.projectCreation` admits Installed/Build/Full to the issue-only
`manage-kujo-starter` workflow. `inspect` and `prepare` require `issueId`, `kind`
(`script`, `api`, `mcp`, `agent`) and a new directory `name`; `prepare` also requires
`submissionId`. `start`, `status` and `cancel` take `issueId`/`id`; `list` takes
`issueId`. Callers cannot supply roots, files, templates, commands or approval IDs.
Names are portable lowercase single components, up to64 characters; reserved
platform names are refused. The workspace comes only from Paperclip and must
remain a stable local root during creation. It need not be a Git repository.

Inspect returns canonical generated/pinned source for explicit file review.
Preparation binds its exact inventory/digests, destination, component/helper,
runtime binary, effective settings and host workspace identity (including root
inode/device) to a human-only card. The UI requires a preview before requesting
approval and never starts on acceptance. The agent route requires current host
assignment/run; only that requester/run or a human can start/cancel. Reusing a
submission ID with the same kind/name/requester returns its existing immutable
request, including after successful creation. It never generates another card or
repeats writes. Changed input/requester conflicts; a new request needs a new ID.

At start, revalidate the approved plan and absent destination. The fixed isolated
Kujo helper uses released `copy_file_beneath`: descriptor-relative parent creation,
symlink/reparse rejection and atomic no-replace publication for each file. No
project module, generated program, dependency installer, server or client setup
runs. A `.kujo-paperclip-starter.json` marker records the starter digest before
copying template files; it is included in the approval inventory and receipt.
The existing64-file/64KiB-per-file/256KiB template bounds apply, plus one small
marker. Source/output schemas and exact byte/digest receipts are validated.

This is **not an atomic directory transaction**. A concurrent conflict,
interruption, timeout or storage failure may leave files or parent directories,
including the path whose copy reported failure. Files are never overwritten or
automatically removed/resumed/retried. Native `created`, `conflict` and `incomplete`
results remain distinct; missing/contradictory post-entry evidence is uncertain.
Keep the trusted root stable: per-file confinement does not freeze the entire
workspace or prove the files remain unchanged after publication. Inspect retained
files before another request; choose a fresh destination rather than retrying
blindly. Persistent application servers remain separate workflow work.

Terminal creation publishes linked `starter-creation-plan` and
`starter-creation-result` evidence using the shared atomic publication/acknowledgment
and clear/prune rules. Portable receipts identify the host-owned
`kujo.paperclip.starter.create` adapter, not a canonical catalog entry. Existing
Eval/source receipts are unchanged. Creation shares company admission limits,
leases, cancellation and retention; no new migration or scheduler is introduced.

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

## Portable Ability receipt

New requests freeze the canonical `kujo.eval.suite.run` ID, version, definition
digest and host handler version in the immutable approval-bound plan. Terminal
responses and v2 Evidence history outcomes embed `kujo.ability.receipt/v1`,
validated by the pinned canonical TypeScript SDK. This is a Paperclip host-adapter
receipt; it does not claim that the canonical runtime's approval or audit stores
were used. Host assignment, confirmation and execution-ledger rules remain the
authority. Invalid input or unauthorized calls rejected before a durable request
remain transport errors, not invented authorized invocations.

`started_at_ms` means durable request creation, and `completed_at_ms` means terminal
settlement. Duration includes preparation, approval and queue wait; it is not a
process-runtime measurement. Receipt identity, definition, timing and payload
come only from the stored request/outcome, so replay after an upgrade does not
substitute newer catalog metadata. Receipt IDs are company/issue scoped; host
principal and trace identities are retained without internal claim/owner tokens.

| Execution outcome | Receipt status | Preserved detail |
| --- | --- | --- |
| succeeded | succeeded | Native check classification and coverage, including partial/skipped |
| failed | failed | Native failures or execution diagnostic |
| failed with observed timeout | timed_out | `KUJO_EXEC_TIMEOUT` diagnostic |
| cancelled | cancelled | Cancellation does not undo effects |
| rejected, expired, stale | rejected | Original execution state; no implied execution |
| uncertain | failed | `execution_outcome_uncertain`, original state and reconciliation-required idempotency |

The v1 canonical receipt contract has no uncertain status. Its failed status does
not assert that effects failed: the explicit uncertainty error and metadata must
be inspected before another request. A native pass with partial coverage remains
partial even if the receipt status is succeeded. No automatic retry is introduced.

Legacy requests without frozen receipt bindings remain v1 observed history and
return no canonical receipt. Existing history is never rewritten. Pending legacy
requests become stale at materialization because the admitted plan changed; review
and approve a new request. General invocation receipts for the other adapters
remain separate expansion work.

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

### Independent process supervisor

Approved Eval, source/test and starter creation run through the packaged
`dist/runtime-supervisor.js` process. The supervisor owns the native timeout,
bounded output and ordinary process-tree termination outside the plugin worker.
Its private IPC channel accepts one reviewed invocation, cancellation and a
250-millisecond heartbeat. Channel closure or five seconds without a heartbeat
aborts the native command. On POSIX the supervisor is outside the worker's process
group, so an abrupt worker-group kill does not prevent this cleanup. This is a
per-invocation child, with no daemon, port, runtime download or new host capability.

The worker accepts a terminal response only after the supervisor exits cleanly.
Missing, malformed or lost supervisor responses remain unconfirmed. Public
execution limits and human approval remain unchanged. The private supervisor's
larger bound is not a public long-running workflow API.

An expired database owner lease still produces `uncertain`, not a retryable
failure. It does not prove process termination. A worker crash can lose the
terminal response even when the supervisor stops the native process. Recovery
never kills a stale PID, repeats effects automatically or infers rollback. A
crash/kill of the supervisor itself, whole-host failure, deliberate process-group
escape and background processes that outlive a completed native command remain
outside this guarantee. Dispatch replay and durable external job reconciliation
still require their own integration and evidence.

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

Further expansion requires broader invocation receipts, durable external
workflow runners, approved project creation and newcomer acceptance. Preserve these invariants when adding
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

## Durable start submission foundation

Migration005 adds an immutable explicit start intent to the existing execution
ledger. Accepting a decision card does not create this intent. The internal
`enqueue` API checks the current human approval and persists the starter identity
and submission time before returning. A queued request remains `pending`, with
`startRequestedAt` and `startRequester` distinguishing it from an unsubmitted
approval. Retries preserve that identity and timestamp; a different starter
cannot replace them.

A later worker can drain at most four eligible submissions within a three-minute
pickup window per invocation. The window is rechecked before claim and native
spawn; it does not extend approval expiry. A host job observation timeout alone
is not proof that an execution stopped: the execution ledger and independently
bounded supervisor remain authoritative. Pickup must be awaited by the host job. It
rechecks company/issue/workspace authority, approval identity and expiry, input
freshness, cancellation and company run capacity before claiming native work.
An agent submission must belong to the requesting agent's still-current assigned
run at both submission and pickup; unverifiable identity rejects it without
execution. Caller identity must come from authenticated host context, never tool
arguments. Pending cancellation/expiry remains final. Lost claims and running
owner loss remain uncertain and are never returned to the queue.

The development-only authenticated fixture registers a manually triggered host
job to prove pickup after the original action returns and across a full
host/database restart. It uses a fresh host job context, not an orphaned promise
with an expired action invocation ID. Existing 27-second public limits and
company quotas remain unchanged. Production tools still use immediate start;
no production job or arbitrary queue tool is registered. Longer Dispatch/Muzzle/
Workcell adapters still require durable runner storage, canonical lifecycle and
replay reconciliation, scheduling qualification and their own approved public
controls. This foundation does not implement a second workflow replay engine.

### Persistent native workflow storage foundation

The internal `openWorkflowStorage` primitive reserves native runner data outside
both project workspaces and installed packages. It requires an existing absolute,
operator-owned directory with mode `0700` on Linux or macOS. It creates no default
location and is not yet connected to production settings, tools or jobs. The pinned Dispatch command foundation is described below; no production workflow
tool is exposed yet. Existing Windows features remain supported, while this
POSIX runner primitive explicitly rejects Windows.

Reservations are segregated by installation, company, issue and execution ID.
An exclusive directory creation admits one owner; a synced `0600` marker binds
that address to the immutable request digest. Recovery validates private directory
ownership, rejects symlinks and hardlinked/oversized/changed ownership metadata,
and detects replacement of an opened root. Identifiers are hashed into paths.
Callers must derive identities and the storage root from trusted host/operator
context. These filesystem checks do not grant company authorization or protect
against another process running as the same OS user.

A duplicate reservation never reinitializes existing files. Missing metadata or
native data, including a crash during reservation, requires reconciliation;
recovery does not recreate it. There is deliberately no automatic cleanup or
replay API. A recovered directory is only storage: the host execution ledger and
canonical runner must still establish the current boundary, outcome and authority
before any continuation. Native files remain private and require bounded,
validated, redacted reads before presentation. Canonical state durability remains
the runner's responsibility; this primitive syncs only its ownership metadata.

The opt-in qualification below uses a clean canonical Dispatch checkout at the
commit enforced by the script and an explicitly supplied Kujo binary. It uses
fixture tools, no live provider credentials, and separate native/controller
processes. It proves v2 intervention pause, storage recovery, stale-revision
rejection, one-boundary approval, a second gate remaining paused, and exact
identical/conflicting decision behavior. It does not qualify a Paperclip host
adapter, arbitrary customer workflows, long-running cancellation, retention,
provider authentication or production storage configuration.

```bash
node scripts/acceptance/dispatch-storage.mjs \
  --dispatch-root ../dispatch \
  --kujo /absolute/path/to/kujo \
  --evidence-root /absolute/path/to/qualification-evidence
```

The script removes its owned fixture after success and retains it on failure.
The required canonical pin and final state digest are included in `proof.json`.
Production integration still needs operator storage configuration,
scoped host approval and scheduled pickup, lifecycle reconciliation,
and retention of active/paused/uncertain runs without deleting their state.

### Pinned Dispatch native commands

Bundle `0.10.1` pins Dispatch `1.3.0` with the additive control-view contract at
`4c4d34b2979f6754a97a48d1da62e28fda14315d`: CLI, canonical source modules,
fixture sources, workflow examples, schemas, metadata and license. No external AI
SDK, provider credentials, container runtime or participant SDK is installed by
this snapshot. Dispatch native workflows are qualified on Linux/macOS only.
Existing plugin features retain their Windows support.

The internal `prepareDispatchInvocation` materializer recovers an existing owned
storage reservation, validates the bundled component, copies its exact checksummed
bytes into a private directory, and returns a shell-free isolated-import invocation.
The resulting binding includes command, component, runtime and policy digests.
The host must compare these with human approval and persistent ownership before
execution; the materializer grants no authority. Decision actors must come from
authenticated host context. Native output remains private input to later bounded,
validated and redacted host projections.

Its first command set lists templates/runs, starts an explicitly offline fixture,
inspects a run, and submits a typed v2 retained-evidence decision or a revision-bound
legacy approval/rejection. No arbitrary
command, path, provider, environment, `--yes`, retry or input amendment is passed
through. Native Dispatch validates current boundaries and decision replay; this
adapter does not reproduce that logic. Commands default to the existing 27-second
process ceiling. An internal caller may explicitly select `workflow-job` for a
fixed 120-second start/decision budget; read-only commands remain at 27 seconds.
The selection and deadline are bound into the policy digest. This requires a
durable job controller and human approval for that exact budget before production
use; it must not run as a synchronous public RPC. Current public execution-plan
contracts remain capped at 27 seconds. Timeout or lost observation does not
authorize another start.
Disposing the private code snapshot leaves native run state intact.

The internal control reader accepts only successful, bounded canonical inspect
responses for the expected run, preserving the complete control observation or
its explicit unavailable result. It never reads `state.json` as authority.
Legacy decision construction requires a paused/needs-changes v1 request with the
same run, a supported allowed action and no expiring-request contract. It binds
the observed revision, event, step and decision ID to the host-derived human
actor and response. A view is an observation, not authorization or journal
reconciliation. Host approval must still be fresh at execution; canonical
Dispatch rejects a stale revision under its run lock. New receipts distinguish
exact applied duplicates, changed payload conflicts and uncertain claims.

Bundled integration tests use distinct supervised native processes and private
storage for each operation and explicitly selects the internal job budget. The suite exercises canonical template discovery, offline
approval pause and completion of all three templates through an inspected legacy
revision, later inspection, workspace import exclusion, v1/v2 stale-revision
rejection, one-boundary approval, the next gate staying paused, identical decision
replay suppression and conflicting decision rejection. Test fixtures preserve the
canonical source pin; neither the canonical checkout nor live credentials are
needed for those tests. This is still an internal foundation: production host
storage readiness, approved start/resume/cancel controls, schedules, lifetime
reconciliation, retention and live-provider admission remain unfinished.
