# Paperclip compatibility sweep — 2026-11-11

## Qualification status

**Upgrade verified with an unresolved host UI limitation.** Baseline
plugin commit: `c6fa287`, clean `main`; plugin `0.2.1`, SDK `2026.1012.0`.
The SDK and disposable official host now use stable `2026.1106.0`. The independent
verifier observed core host acceptance and 57 focused tests pass. The full gate
passed 328 tests; packaged production acceptance passed 35 checks including a
backed-up 2026.1012.0 → 2026.1106.0 database migration. Target run pages do not mount
the Kujo tab. No persistent user service was upgraded and no release was published.

Initial `npm ci --ignore-scripts` failed with `ENOSPC`. After space recovery the
locked install passed; early incomplete-dependency results are not source failures.

## Reproducible baseline and target

- Repository: `kujolang/paperclip`, local sibling directory `kujo-repos/paperclip`,
  branch `main`, HEAD `c6fa2874b2e66ad7650e8669ca076638f7c20a3f`, matching remote
  `refs/heads/main` at inspection. No pre-existing tracked or untracked changes.
- Plugin `0.2.1`; exact SDK pin `2026.1012.0`; Kujo runtime pin `1.8.1`;
  fifteen component snapshots and their source commits in `components.sources.json`
  and `bundled/kujo-components.lock.json`. No component changes in this sweep.
- Existing source host is a separate fork at `~/2026/paperclip`, clean branch
  `codex/goal-issue-tracker-plugin`, commit
  `edc9bbbba12029a9f055d94d58c5a545bb2aaaba`. Its source package says `0.3.1`,
  while `git describe --tags --always` says
  `canary/v2026.1012.1-canary.1-14-gedc9bbbba1`; neither establishes the latest
  stable runtime. Remotes are `robertdevore/paperclip` and `paperclipai/paperclip`.
  Recalled local goal/starred UI patches are leads, not changes to discard.
- Default instance configuration selects local-trusted loopback port 3100 and
  embedded PostgreSQL port 54329. Neither port appeared in the listener inventory.
  No running Paperclip version was established. The global plugin prefix has an
  empty package manifest and no `@kujolang/paperclip/package.json`; do not infer
  installation state from the older Strata record. Database installation records
  were not inspected because no host was started.
- Node `26.12.1`, npm `11.20.0`. Disk was 119 MiB free immediately after ENOSPC;
  later recovery allowed locked dependencies and both official host packages.
  The failed install affected ignored dependencies; restoration completed.
- [Official latest release](https://github.com/paperclipai/paperclip/releases/tag/v2026.1106.0):
  `2026.1106.0`, published `2026-11-06T22:31:53Z`, tag commit
  `d69631b01b9c658f80bf8bed389863dce82643e1`. Both `paperclipai` and
  `@paperclipai/plugin-sdk` npm `latest` metadata agree. Beta/nightly/canary are
  excluded. Metadata was fetched at execution time on November 11.

### Intervening release review

[2026.1023.0](https://github.com/paperclipai/paperclip/releases/tag/v2026.1023.0)
(published October 24 UTC) adds migrations 0306–0333, expanded Operator grants,
budget holds for unpriced usage and enforced task/project privacy. Plugins are
non-member principals and cannot read private tasks. This affects Kujo's
`ctx.issues.get` admission; the sweep added and passed explicit privacy negatives.

The November target adds migrations 0334–0374, defaults new qualified agents to
the native Runner, bounds run-history queries, removes Pipelines and changes
workspace cleanup and run-failure reporting defaults. Existing agents retain their
runner. Kujo does not invoke removed Pipeline APIs; its agent-run and workspace
bindings were exercised with the process adapter; the new provider-backed Runner
was not independently qualified. Some migrations backfill rows or
build concurrent indexes; never downgrade a migrated database in place by assumption.
New durable lifecycle hooks and distribution catalogs do not automatically replace
Kujo's approved workflow jobs or provide a public marketplace submission process.

Target source [plugin host services](https://github.com/paperclipai/paperclip/blob/v2026.1106.0/server/src/services/plugin-host-services.ts#L774)
explicitly filters private issues. [Plugin install routes](https://github.com/paperclipai/paperclip/blob/v2026.1106.0/server/src/routes/plugins.ts#L1144)
restrict managed-cloud installs to bundled catalog paths. Qualification must use
the intended deployment mode and must not disable those authorization boundaries.
Private-task/project denials were exercised through real target actions. Managed
cloud distribution was not exercised; the qualification uses isolated self-hosted mode.

## Independent verification evidence

The following dependency-free commands passed on the unchanged baseline:

```sh
node scripts/verify-components.mjs
node scripts/generate-abilities.mjs --check
node scripts/verify-verification-contract.mjs
node scripts/verify-repository.mjs
```

Observed results: 15 component snapshots and all checksums valid; 38 canonical
definitions, four canonical profiles and 21 Paperclip projections valid; pinned
evaluation-result contract/example valid; repository conventions valid.

An independent `npm run typecheck` overlapped dependency restoration and used an
incompatible compiler: it rejected NodeNext, `exactOptionalPropertyTypes` and modern
type syntax. The subsequent `npm test -- --reporter=dot` failed with
`vitest: command not found` (exit 127). These are unusable dependency-state checks,
**not evidence of a source regression or a successful baseline**. Dependencies were
subsequently restored before the runtime results below.
The observed shell runtime was Node `v26.12.1`.

After the documentation corrections, `npm run verify` passed repository,
Ability and verification-contract checks, then exited 2 at typecheck with the
same incompatible-toolchain diagnostics. It did not reach unit tests, build,
supply-chain or package verification. The independent agent also reran repository
conventions and `git diff --check` successfully. These documentation-only changes
did not repair the dependency installation; the later successful install did.

Independent baseline representative tests passed 35/35 (`plugin`, `eval-public`,
`knowledge-public`, `hardening`). Installed Chrome 157 ran all 59 SDK-fixture UI tests
and existing visual baselines successfully with a temporary Playwright configuration;
no browser download or baseline regeneration was used. This is not actual-host UI
qualification and predates the SDK update. A separate independent actual-host
browser run on target `2026.1106.0` subsequently passed four checks: fresh install,
real task-inline bridge rendering, Capture Failure through the UI with retained
result, and project Kujo tab/navigation isolation. External browser requests were
blocked. Evidence: `actual-host-ui.json`; run-detail rendering remains fixture-only.

After the fixes, `TMPDIR=/private/tmp npm test -- tests/plugin.spec.ts
tests/eval-public.spec.ts tests/knowledge-public.spec.ts tests/hardening.spec.ts
tests/workspace-authorization.spec.ts tests/integration.spec.ts --reporter=dot`
passed **57/57 tests in six files (50.99 seconds)**. The 19 authorization cases cover
private/foreign/missing entities, private parent projects, retained evidence and
list/cancel denial before DB access for all four execution management tools.

The independent real-host core run passed five checks: board core operations and
redacted exports; restart continuity; private issue/project denial; malformed,
traversal and anonymous denial; authenticated agent execution of all 15 initial core tools
and disabled-feature negatives. `production-core.mjs` supplies reproducible fixtures.
Sanitized `core-target-pass.json` and `core-target-details.json` were preserved in
the task evidence directory; its database, tokens and stopped process resources
were removed. Earlier sanitized failures preserve the discovered privacy and
self-stale-context regressions. The subsequent packaged run passed recovery denials. An independent extended core
run passed seven checks, exercising 18 unique public tools plus revoked-key denial.
Together with the Eval/source/starter agent journeys, all 21 tools have live coverage.

Environment qualification: `TMPDIR=/private/tmp` avoids an observed `EPERM` on
directory fsync under the Codex document root. The native RAG suite also failed
under that root and passed representative tests under `/private/tmp`; the exact RAG
cause is not established. Do not disable host durability checks. An ignore-scripts
host install required only its inspected, path-confined embedded-Postgres dylib
symlink hydration; `initdb --version` then reported PostgreSQL 18.1.

## Installer isolation incident and recovery

The first registry probe exposed an upstream environment assumption: the npm
loader resolves its install directory from `os.homedir()/.paperclip/plugins`, not
`PAPERCLIP_HOME`. It therefore wrote the user-global npm prefix despite the
otherwise disposable database/configuration. No existing host service or database
was connected and no credentials were overwritten. This first result is not counted
as isolated qualification.

The harness now sets the host child `HOME` to its own fresh root and asserts that
the installed package is actually beneath that root. The repeated CLI probe passed
four checks, including the fixed bundled example. A further packaged core run
passed all seven checks with the isolated host HOME. `npm ls --depth=0` confirms
the restored global prefix is empty. This is a justified retained
isolation measure; setting only `PAPERCLIP_HOME` is insufficient on the target.

Recovery restored the observed pre-run empty `package.json` and absence of Kujo.
Thirteen probe-installed package directories and two executable links were moved
reversibly into the private task-owned `global-prefix-recovery` backup, with the
modified manifests/locks and checksums preserved. Existing parent directories were
retained. Both npm lockfiles were reconstructed for the empty manifest; their
original bytes were not captured, so byte-for-byte restoration is **unverified**.
Do not discard that recovery backup as routine test cleanup. This exception is also
recorded in the Strata handoff.

Remote CI initially cancelled its macOS ARM lane before any steps with
`macos-14-arm64-us-default is not supported`. GitHub [retired macOS 14 on November 2](https://github.com/actions/runner-images/blob/main/README.md).
The workflow now runs macOS 15 ARM while retaining the protected status label;
no platform lane or assertion was removed.

## Capability matrix

### Final local verification

Sanitized timestamps, observed versions, artifact hashes and per-run assertions are
committed in [verification evidence](verification/paperclip-2026-11-11.json).
The tested archive retains development version `0.2.1`; it is not a newly published
registry release. Its worker SHA-256 is
`a2af470dbf91b17c2c491050cca33c62b76206be12e923b3c4ce93f7663cde0d`.
Implementation commits: SDK `6567b1f`, context freshness `e470222`, privacy `224214b`.

| Check | Observed result |
| --- | --- |
| `TMPDIR=/private/tmp npm run verify` | PASS: 44 files, 328 tests; two non-POSIX negative cases N/A on macOS; typecheck, 15 component checksums, contracts, build and tarball pass |
| Supply chain / `npm audit --omit=dev --json` | PASS: zero vulnerabilities; 163 locked packages, 66 SBOM components |
| Baseline full suite | 305 passed, four Eval failures during disk exhaustion, two platform skips; all eight Eval tests passed after space recovery; representative 35 tests and baseline browser 59 passed |
| Earlier target suite under Codex-root TMPDIR | 312 passed, ten native knowledge failures and one changed denial-message expectation; exact expectation corrected, final suite passes under `/private/tmp`; no assertions weakened |
| Packed host migration + all production packs | PASS: 35 checks; authenticated health reports both exact versions; offline DB backup, 69 host migrations, retained evidence/session/identity and repeated restart |
| Published `0.2.1` → working-tree archive reinstall | PASS: five checks; identity and prior evidence survive non-purge reinstall and restart |
| Execution/admission/crash fixture | PASS: 17 checks; old delete/enable sequence failed, corrected to actual non-purge reinstall; pending approvals and terminal receipts survive |
| Independent extended core | PASS: seven checks, 18 tools; other production packs exercise the remaining three tools; revoked key returns HTTP 401 |
| Target-SDK browser fixture | PASS: all 59 cases; two screenshot-stability timeouts passed unchanged serial retry; no screenshot baselines updated |
| Target CLI installer / bundled example | PASS: four isolated checks; separate version pin succeeds, combined suffix still fails; exact example output verified |
| Actual target browser | PASS: task/project render, real UI action and scope navigation; FAIL: run tab absent despite successful run evidence tool |

The full gate ran before implementation commits. Subsequent changes are acceptance
harnesses and documentation; their syntax, repository and package checks are rerun
before the final evidence commit. No secrets, raw server logs or database files are
included in the committed evidence.

Statuses distinguish real target host acceptance from unit/fixture coverage.
PASS means the cited checks passed, not that every possible host adapter or
deployment was exercised. The run-tab failure and nonlocal platform limits remain
explicit; no SDK-harness pass substitutes for live host behavior.

Common preconditions: host-authenticated company identity, manifest capability
admission, the selected company profile and feature switch. Workspace operations
use host-resolved canonical local paths; agents cannot supply arbitrary roots.
Read-only run panels do not authorize project/issue mutations. Native operations
also require a compatible Kujo runtime and intact pinned components.

### All 21 agent tools

Names are prefixed with `kujolang.paperclip:`. Entries are declared by
`src/abilities/generated.ts` and registered by `src/worker.ts` or the feature bridge.

| Tool / entry point | Additional preconditions | Expected behavior and side effects | Existing verification / this-run outcome |
| --- | --- | --- | --- |
| `list-capabilities` | Company configuration | Reports integrated/profile-enabled/readiness state; catalog references do not grant execution | `abilities.spec.ts`, `plugin.spec.ts`; target core PASS |
| `list-evidence` | Host-owned project/run, or assigned issue for execution history | Lists only scoped retained metadata with retention bounds | `history.spec.ts`, `eval-history.spec.ts`, production Eval acceptance; target core PASS |
| `get-evidence` | Matching scoped evidence ID; bounded output | Validates integrity and returns redacted records; no document attachment | `history.spec.ts`, `eval-public.spec.ts`, production Eval acceptance; target core PASS |
| `check-kujo-source` | Git-visible admitted `.kujo` file | Native check/lint; retains diagnostics; never runs project code | `language.spec.ts`; target core PASS |
| `preview-kujo-format` | Git-visible admitted `.kujo` file | Retains redacted original/proposed formatting; no source writes | `language.spec.ts`; target core PASS |
| `understand-repository` | Local project workspace | Scout map with explicit partial coverage, bounded retained evidence | `understand.spec.ts`; target core PASS |
| `review-changes` | Git workspace; review enabled | ChangeBucket/PatchBrief review and suggested checks; no test execution | `integration.spec.ts`, `hardening.spec.ts`; target core PASS |
| `capture-failure` | Failure evidence enabled; bounded supplied details | Redacts supplied logs, retains scoped evidence; never runs supplied command | `integration.spec.ts`, `history.spec.ts`; target core PASS |
| `get-context` | Context enabled; nonempty task; Git workspace | Scent selection metadata; scoped snapshot binding; optional content only under configured policy | `integration.spec.ts`, `hardening.spec.ts`; target core PASS |
| `get-context-content` | Matching pack/company/project/workspace/Git snapshot; selected file paths | Separate bounded read; rejects unselected paths, escapes, binary/oversize/stale input | `hardening.spec.ts`, `contracts.spec.ts`; target core PASS |
| `import-verification` | Verification enabled; canonical JSON | Stores explicitly imported, unauthenticated claims with digest; no referenced-resource access | `verification.spec.ts`; target core PASS |
| `inspect-task-contract` | Verification enabled; admitted Spec file | Native validation; strict warnings fail; declared checks remain not-run | `spec-contracts.spec.ts`; target core PASS |
| `inspect-architecture` | Verification/profile enabled; admitted root Fence policy | Snapshot import-boundary findings; rejects command parsers; no project execution | `fence.spec.ts`, `fence-snapshot.spec.ts`; target core PASS |
| `inspect-artifact-drift` | Verification/profile enabled; admitted artifacts | Concord drift leads, partial coverage and provenance; no commands/tests run | `concord.spec.ts`; target core PASS |
| `inspect-release-readiness` | Verification/profile enabled, including Essentials | Sixteen ShipCheck metadata signals, explicit partial scope; does not certify release | `shipcheck.spec.ts`; target core PASS |
| `manage-evaluation` | Separate execution opt-in; assigned issue/current run; fresh human-only approval for start | Inspect/prepare/start/status/list/cancel; copied bounded inputs, retained plan/outcome, no automatic replay | `eval-*.spec.ts`, `execution*.spec.ts`, `production-eval.mjs`; target production acceptance PASS |
| `inspect-kujo-packages` | Admitted Git-visible `kennel.toml`; selected profile | Declaration/adjacent-lock inspection and retained evidence; no install/resolution | `packages.spec.ts`, `production-packages.mjs`; target production acceptance PASS |
| `manage-kujo-execution` | Separate source-execution opt-in; assigned issue/current run; fresh human approval | Fixed run/test-file/fixture-test commands, temporary inputs, bounded supervised execution and receipts | `source-execution.spec.ts`, `preparation-error.spec.ts`, `production-source.mjs`; target production acceptance PASS |
| `manage-kujo-starter` | Creation opt-in; assigned issue/workspace; new destination; fresh human approval | Canonical script/agent/API/MCP files copied without overwrite; no install or generated-program execution | `starters.spec.ts`, `starter-creation.spec.ts`, `starter-publication.spec.ts`, `production-starters.mjs`; target production acceptance PASS |
| `manage-kujo-workflow` | Workflow opt-in; macOS/Linux; private company folder; assigned issue/run; human approval | Offline template preview/queued start, inspect/observe/cancel; human checkpoint decisions separately approved; durable job/state/receipts | `workflows.spec.ts`, `workflow-storage.spec.ts`, `dispatch-*.spec.ts`, `production-workflows.mjs`; target production acceptance PASS |
| `manage-project-knowledge` | Knowledge opt-in; explicit admitted local text selection | Index/query/freshness/delete offline snapshots and citations; retains private indexes and redacted evidence | `knowledge-*.spec.ts`, `production-knowledge.mjs`; target production acceptance PASS |

### UI and host integration surfaces

| Surface / host calls | Preconditions and expected effects | Existing verification / this-run outcome |
| --- | --- | --- |
| Install, manifest validation, configuration, worker setup/health/shutdown | Official SDK/host, supported runtime; register 21 tools, managed skill, two UI slot types, job and folder declaration; doctor reports missing/incompatible dependencies | `plugin.spec.ts`, `doctor.spec.ts`, `contracts.spec.ts`, `execution-host.mjs`; target production acceptance PASS |
| `taskDetailView` issue workspace; `detailTab` project/issue/run | Host UI supplies scoped identity; run tab read-only; late responses cannot cross company navigation | 59 target-SDK fixture cases PASS (57 initial + 2 unchanged serial retries); real task/project browser PASS; actual run tab FAIL: host mount absent |
| `doctor` and `detail` bridge data | Scoped readiness, selected paths, existing evidence, workflow/execution recovery; no automatic execution | Focused plugin tests PASS; baseline UI fixture PASS; core detail target PASS |
| `generate-review`, `generate-context`, `capture-failure`, `understand-repository` | Feature/profile/workspace admission; expected native or supplied-evidence behavior as above | `production-core.mjs`: target core PASS; baseline UI fixture PASS |
| `check-kujo-source`, `preview-kujo-format`, `inspect-kujo-packages` | Explicit selection, runtime, bounded reads; diagnostics/previews only | Language/package tests; packages have production acceptance; target production acceptance PASS |
| `inspect-task-contract`, `inspect-architecture`, `inspect-artifact-drift`, `inspect-release-readiness`, `import-verification` | Independent verification/profile admission; honest not-run/partial/imported classifications | `production-core.mjs`: target core PASS; baseline UI fixture PASS |
| `run-example`, `preview-starter` | Runtime readiness, selected profile; bundled example is safe fixed code; script/agent/API/MCP previews write no project files | PASS: public onboarding tests, four live starter previews and exact live bundled example output `{language: Kujo, items: 2, total: 36}` |
| `inspect-evidence`, `export-evidence`, `compare-evidence`, `attach-evidence`, `clear-artifacts` | Exact company/entity scope; attachment requires authenticated human and issue-owned record; clear does not rerun execution | `history.spec.ts`, `eval-history.spec.ts`, production Eval acceptance; target production acceptance PASS |
| Evaluation, source, creation, workflow and knowledge management actions | Same feature boundaries as tools; board-authenticated actions and agent-run identity remain distinct | Public feature tests and respective production acceptance modules; target production acceptance PASS |
| `config.get`, `projects.get`, `issues.get`, `getPrimaryWorkspace`, `getWorkspaceForIssue` | Host authorization supplies tenant, assignment and canonical workspace; deny missing/foreign objects | 19 authorization tests PASS; target private issue/project action denial PASS |
| `db.query/execute`, namespace migrations, legacy `state.get/set/delete` | Exact namespace, parameterized scope, additive migrations; retain old evidence and restart continuity | PGlite harness/history/ledger/store tests, live restart acceptance; target production acceptance PASS |
| Issue interaction creation/read and human decision inspection | Fresh accepted human card bound to immutable plan/current settings/source; agents cannot self-approve | Eval/source/starter/workflow public tests and production auth negatives; target production acceptance PASS |
| `issues.documents.upsert` | Explicit human attachment, exact issue and bounded Markdown; host document persists separately | Production Eval history attachment; target production acceptance PASS |
| `localFolders.status`, `jobs.register` / `dispatch-workflows` scheduled pickup | Private configured company storage, installation/root binding; queue only explicit approved work; enforce ownership/budgets | Workflow storage tests, production workflow restart/job acceptance; target production acceptance PASS |
| `activity.log`, logger, health/doctor and native receipts | Bounded sanitized observability; audit failures do not invent operation success | Worker tests and production receipts; target production acceptance PASS |

### Lifecycle, negative cases and supported modes

| Capability | Expected contract / existing evidence to rerun | This-run outcome |
| --- | --- | --- |
| Fresh install, startup, stop/restart, plugin reload | `execution-host.mjs` creates its own authenticated home/database and loopback ports; no existing service URL accepted | PASS: production/fixture host and full suite |
| Upgrade/migrations with retained data | Published plugin `0.2.1` → working-tree archive preserves identity/data; official host `2026.1012.0` → `2026.1106.0` applies 69 migrations from an offline-backed-up DB | PASS: 5 reinstall and 35 migration/production checks |
| Agent registration, task assignment and execution/result retrieval | Production Eval/source/starter harness creates isolated agent/run and assignment; tests board/agent distinction and actual tool endpoint | PASS: production/fixture host and full suite |
| Invalid arguments, unknown fields, path traversal, stale/foreign context | Strict schemas, beneath-root admission, tenant scope; `contracts`, `hardening`, public feature tests | PASS: production/fixture host and full suite |
| Denied operations, forged actor, changed/rejected approval, stale source/settings | Production authenticated harness and public admission tests; no operation may self-authorize | PASS: production/fixture host and full suite |
| Unavailable runtime, unsupported platform, missing workspace/private folder | Doctor/admission errors and repair guidance; no false readiness | PASS: unit admission/doctor checks |
| Cancellation, timeout, worker crash, interrupted prep and recovery | `execution`, `execution-limits`, `supervisor`, `preparation-error` tests and host fixture; uncertain outcome never authorizes replay | PASS: production/fixture host and full suite |
| Duplicate submissions, concurrent owners and resource bounds | Ledger tests cover idempotent requests, two owners/twenty active requests; workflow parents retain bounded ownership | PASS: production/fixture host and full suite |
| Retained sessions/context across restart | Core evidence, approvals, native outcomes, private knowledge and workflow state survive target restarts; selected context content and stale denial verified | PASS |
| Background scheduling | Only explicit `dispatch-workflows` minute job; production workflow acceptance observes queued pickup after restart | PASS: production/fixture host and full suite |
| macOS arm64/x64, Linux arm64/x64, Windows x64 | Five CI runtime targets; Dispatch specifically macOS/Linux only | PASS: macOS x64, Linux arm64/x64, Windows x64 in CI 43113027656; macOS ARM BLOCKED by retired runner, replacement verification pending |
| Bundled runtime, configured absolute override, allowed PATH fallback | `resolve-kujo`/doctor/integration contracts; require runtime >=1.8.1 | PASS: unit admission/doctor checks |
| Provider-backed agents, persistent API/MCP execution, generic command execution, webhooks, general v2 workflow recovery | Not supported integration modes; starter previews do not promise execution/deployment; no webhook registration exists | NOT APPLICABLE |
| Credential expiry and external API rate limits | Integration has no external-provider credentials or provider API; host session/token rejection still needs live auth negatives | Provider-specific NOT APPLICABLE; anonymous/nonmember/forged access and revoked agent key denied PASS; timed credential expiry not separately observed |

## Blocker and workaround reassessment

The target-source observations below are static evidence from official tag
`v2026.1106.0`, independently retrieved on 2026-11-11. They do not substitute for
executing replacement behavior in that release.

| Item / affected behavior | Target evidence and disposition | Required qualification |
| --- | --- | --- |
| Scoped exact-version npm install | [PR #12745](https://github.com/paperclipai/paperclip/pull/12745) remains open/unmerged. Actual target CLI `@kujolang/paperclip@0.2.1` fails path resolution, but `@kujolang/paperclip --version 0.2.1` succeeds and the host reports exact 0.2.1. Replace the unversioned-only advice with the validated separate flag; retain the combined-suffix restriction. | PASS: real CLI, authenticated target, isolated installed package metadata; local-path install also passed |
| Historical host `0.0.0` reporting and manifest floor | The manifest minimum remains `2026.1012.0` in `src/config/defaults.ts`; the SDK pin is now `2026.1106.0`. The September maintenance handoff describes obsolete plugin state. Retain the real minimum; do not restore the historical exception. | Target fixture and baseline-to-target migration PASS; manifest minimum assertions PASS, not an actual obsolete-host installation test |
| Added-capability plugin upgrade | [Target loader lines 1844–1858](https://github.com/paperclipai/paperclip/blob/v2026.1106.0/server/src/services/plugin-loader.ts#L1844) still throws on capability escalation before lifecycle approval handling. Retain administrator non-purge uninstall/reinstall path. | Existing plugin identity/evidence survives migration and restart; do not purge |
| Synchronous bridge duration | [Target manager](https://github.com/paperclipai/paperclip/blob/v2026.1106.0/server/src/services/plugin-worker-manager.ts#L76) keeps default RPC timeout 30,000 ms. Retain plugin 27-second synchronous budget and separate durable workflow job. | Timeout/cancel/crash tests and real host deadlines |
| Fixed database namespace | [Target derivation](https://github.com/paperclipai/paperclip/blob/v2026.1106.0/server/src/services/plugin-database.ts#L31) remains slug + first ten SHA-256 characters of plugin key. Current `plugin_kujo_evidence_c15d42de56` binding remains source-compatible; no namespace rewrite justified. | Real migrations, scope isolation and retained-data restart |
| Confirmation preview size | Plugin caps Eval preview at 12,000 characters and approval preview at 18,000. Retain bounds; no validated target replacement or larger safe contract established. | Boundary-size real issue-interaction tests |
| Company private storage and Windows Dispatch restriction | Plugin requires owned 0700 storage and native supervised workflow semantics; this is a deliberate local boundary, not established missing host functionality. Retain. | Correct/missing/unsafe/rebound folder and platform negatives |
| Catalog/marketplace submission | Older handoff says unavailable. The [official guide](https://github.com/paperclipai/paperclip-docs/blob/main/docs/administration/plugins.md) documents digest-verified custom-image catalogs, not a public marketplace submission workflow. Reconciled the stale four-tool/no-database review brief with the actual manifest. | Official administration guide documents bundled/npm/custom-image distribution; no official public submission process found. Retain review brief; no marketplace upload attempted |
| Workflow 20-parent retention, offline-only providers, general v2 recovery | Plugin/Dispatch limitations remain explicit in code/docs. A newer Paperclip release alone cannot establish native receipt reconciliation or safe retirement. Retain supported scope. | Native implementation changes and exact loss/replay tests before broadening |
| Private-task access in newer hosts | Target `issues.get` denies private tasks, but workspace getters and `projects.get` did not enforce the equivalent boundary. Real core acceptance reproduced private-task capture returning 200. FIXED locally: centralized entity/parent-project admission before workspace, evidence and management recovery access, including mismatched workspace IDs. Preserve denial even for board actors because plugin context is a non-member principal. | Target private task/project and management recovery negatives PASS; 19 focused authorization tests PASS |
| Managed-cloud installation | Target install route permits only bundled catalog paths in managed-cloud mode. A generic npm plugin install is not universally supported there. | Qualify intended self-hosted deployment; obtain official bundled distribution approval for managed-cloud use if required |
| Run-detail UI mount | Actual target browser has Details/Transcript/Events but no Kujo tab. [Target RunDetail source](https://github.com/paperclipai/paperclip/blob/v2026.1106.0/ui/src/pages/AgentDetail.tsx#L3452) contains no plugin-tab mount. The exported component still passes its read-only fixture; no evidence establishes when the host limitation began. | FAIL / upstream blocker. Preserve component; document scoped `list-evidence`/`get-evidence` as the available run interface; rerun `KUJO_ACCEPTANCE_RUN_UI=1` after a released host fix |

## Changes, reproduction and remaining qualification

The SDK pin is now `2026.1106.0`; the host floor remains `2026.1012.0`.
A narrow fast-uri patch addresses the
observed audit finding. Central entity authorization closes private workspace and
retained/recovery evidence bypasses. Explicit scoped test fixtures preserve denial
strength. New production core acceptance covers previously untested core interfaces.
Context preparation now copies bounded private inputs instead of hardlinking them:
creating/removing a hardlink changed source ctime and invalidated a freshly generated
context pack. The new regression checks snapshot freshness and separate content
retrieval; actual target agent content retrieval and stale-source rejection pass.
Pinned Kujo runtime and component bytes remain unchanged.

Run from the checkout with sufficient space and the official isolated host prefix:

```sh
TMPDIR=/private/tmp npm run verify
TMPDIR=/private/tmp KUJO_ACCEPTANCE_NPM_HOST=/absolute/disposable-host-prefix \
KUJO_ACCEPTANCE_PRODUCTION=1 KUJO_ACCEPTANCE_PACK=core \
npm run test:host:execution
```

Omit `KUJO_ACCEPTANCE_PACK` for all production packs. Set
`KUJO_ACCEPTANCE_PACKAGE_DIRECTORY` and `KUJO_ACCEPTANCE_PACKAGE_DEPENDENCIES`
to an installed built tarball to qualify published-package loading. Set
`KUJO_ACCEPTANCE_BASELINE_NPM_HOST` to the official old server prefix for the new
host migration rehearsal. The harness stops the baseline, copies its disposable
DB, upgrades, and checks the same retained evidence and IDs across target restarts.
A plugin capability-upgrade rehearsal is separate from the host DB migration.
Keep only sanitized result summaries; stop owned processes before deleting exact
owned disposable roots. Do not reuse existing service state or credentials.

For actual browser qualification, use `KUJO_ACCEPTANCE_PACK=ui` and optionally
`KUJO_ACCEPTANCE_BROWSER` with an installed Chromium executable. Add
`KUJO_ACCEPTANCE_RUN_UI=1` to reproduce the known run-tab failure; do not omit this
probe when reassessing that blocker. The ordinary UI pack covers task/project views.

Remaining limits: actual run-detail UI FAIL (missing host mount); nonlocal
macOS ARM qualification awaits the replacement runner. Node 24.22.1 locked/latest
SDK lanes all passed [Compatibility 43113027859](https://github.com/kujolang/paperclip/actions/runs/43113027859).
The other four platform lanes and browser passed [CI 43113027656](https://github.com/kujolang/paperclip/actions/runs/43113027656),
and [Security 43113027800](https://github.com/kujolang/paperclip/actions/runs/43113027800) passed.
These runs tested source commit `40e4d7b`; the runner/isolation follow-up is rechecked
through [PR 95](https://github.com/kujolang/paperclip/pull/95). Timed credential
expiry, managed-cloud distribution and backup restoration were not separately exercised. Revoked-key
and forged/anonymous/nonmember authorization negatives passed. No replacement
capability is claimed for retained workarounds without a validated target path.
No provider-backed adapter, webhook, arbitrary command or persistent generated
API/MCP execution capability is claimed by this plugin.

## Rollback and deployment boundary

No persistent host service or database was deployed. The registry probe temporarily
changed the global npm plugin prefix as described below; its known logical baseline
was restored. Disposable databases were removed after evidence preservation. Before a
future migration, record the exact running host build and fork patches, installed
plugin artifacts and config, then take a consistent database backup plus required
encryption-key/config backup through the established host process. Keep secrets
private and test restoration into disposable state first.

If qualification fails, stop only the disposable target and restore its copied
pre-upgrade state. For persistent deployment, retain the prior executable/artifact
and restore its matching database/config backup together; a host downgrade alone
is not proven safe after migrations 0306–0374. Keep plugin data on uninstall and
verify identity, evidence, approvals and knowledge after restart. Do not clear
retained data as a substitute for backup restoration. New records written after
the backup need a separately reviewed recovery plan.

The existing local host is a fork with other integrations. Replacing it with a
stable upstream package requires reviewing those patches and the deployment policy;
the isolated qualification does not authorize that deployment. The exact remaining
deployment action is an approved replacement of that fork/service with a backed-up,
reviewed stable host; neither service discovery nor local testing supplied approval.
