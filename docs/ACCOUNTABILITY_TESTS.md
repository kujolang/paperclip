# Accountability verification report

The original RunLedger increment is preserved in
[its historical receipt](verification/accountability-2026-11-12.json).
This report preserves the initial opt-in assurance qualification. The subsequent upstream refresh is recorded in [the repin report](verification/upstream-repin-2026-11-12.json). Native execution,
mocked-host unit tests, browser fixtures and authenticated host qualification are
separate evidence classes. No release or protected-branch merge was performed.

| Feature | Test | Result | Evidence |
| --- | --- | --- | --- |
| Baseline original 21 tools | Original `npm run verify` | 328 passed / 2 platform skips before RunLedger; 333 passed / 2 skips after RunLedger | Historical verification receipt |
| Assurance schemas, provenance and bounds | `tests/assurance.spec.ts`, `assurance-config.spec.ts` | PASS (included in 346 passing tests) | Loopback/flow restrictions, no skipped-selector promotion, artifact limits/redaction, telemetry projection, schema parity |
| Approved execution and acceptance | `tests/assurance-host.spec.ts` | PASS (included in 346 passing tests) | Real native Muzzle with SDK/PGlite host fixture: approvals, stale inputs, waiver, child-scope rejection, script-preview binding |
| Native producers | `scripts/acceptance/assurance-native.mjs` | PASS | [Native proof](../examples/assurance/evidence/native-proof.json): PackWrite, Muzzle, Workcell, Lens, supplied pack generation and contained Muzzle |
| Failure and recovery | Same native script | PASS | Actual Workcell timeout exit 6 with receipt; process cancellation; repeated scoped cleanup without replay |
| PackWrite updated demo pack | Native validation against final pack | PASS: six phases, no errors or warnings | Final native receipt run-mCMguQ; checked-in agent/ fixture |
| Packaged host and native agent team | Published-prior reinstall, actual archive, four process agents, UI and restart | PASS | [Host](../examples/assurance/evidence/host-proof.json), [team](../examples/assurance/evidence/team-proof.json), [workflow](../examples/assurance/evidence/workflow-proof.json) |
| Plugin dependency audit | `npm run supply-chain:verify` | PASS: 0 vulnerabilities, 165 locked packages, 68 SBOM components | Pinned lockfile and package verifier |
| Bundled sources | `npm run components:verify` | PASS: 19 checksum-verified components | Historical bundle included Workcell patch 3a624b0; current pins are in the repin report |
| Upstream Workcell patch | Native workspace tests with external diff disabled/poisoned | PASS: 29 targeted assertions | Upstream commit 3a624b0 on codex/paperclip-patch-collection |
| Upstream remote adapter suite | Workcell full tests / npm audit | Historical failure: 6 advisories; fixed upstream at 15b3521, included in current pin 6f5445b | These adapters are not bundled or exposed by Paperclip; upstream pagination fix and passing audit evidence are recorded in the repin report |

## Final qualification

The unit suite covers 348 tests: 346 passed across the full run and focused
reruns, with two existing platform skips. The initial loaded-host run had six
deadline-related failures across four files; all 31 tests in those files passed
on rerun without changing assertions or product deadlines. All 60 UI cases passed
across the original run and five focused reruns after inspecting updated baselines
and restoring the matching browser. Packaged-host evidence is linked in the
[verification receipt](verification/assurance-2026-11-12.json). The authenticated
packaged-host scenario passed on official server 2026.1106.0, including four real
process agents and a visually inspected Verification Center screenshot. The host scenario exercises
native human-only approval rejection, exact approved execution, browser failure and
correction, stale evidence, explicit waiver, cancellation, Watchdog metadata,
ShipCheck metadata, delegated acceptance, real agent-run attribution and restart
inspection. Four process agents perform planning, implementation, testing and review;
this is deterministic real execution, not provider/LLM autonomy.

The packaged upgrade rehearsal starts from published plugin 0.2.1, retains a real
legacy failure observation, uses the host's non-purge administrator reinstall path
to admit added capabilities, and verifies old/new evidence after restart. A same
version branch build is a qualification artifact, not a published release.

## Environment and limitations

The first local Docker endpoint was unavailable. A task-owned Colima daemon made
local Docker qualification possible; no production daemon or global Docker context
was changed. Temporary disk exhaustion and missing pinned browser caches interrupted
initial runs. Only task-created disposable data was removed; after space was freed,
the official matching headless browser was restored. Loaded-host deadline failures
are retained in the verification record and rerun without weakening assertions.
Screenshot baseline changes add the real Verification Center catalog row; the
three changed images were inspected before acceptance.

Local execution is qualified on macOS x64 with a Linux Docker container. Windows
and other native architectures are not newly qualified here. Podman and remote
sandbox adapters are not exposed. Source snapshots cover admitted Git-visible text;
external server state and ignored dependencies are not frozen. Native ShipCheck is
metadata readiness, and imported RunLedger/Watchdog claims do not satisfy policy.
The official host's run-tab mounting limitation remains documented separately;
the real issue extension is the supported verification surface.

## Upstream refresh verification

Bundle 0.13.1 pins Workcell `6f5445b` and Lens `7f3ee8b`. All 346 unit tests
passed (two existing platform skips), all 60 UI tests passed, and all 11 native
scenarios passed. New selector cases verify exact exits 0/1/2 for supported,
failed, and unsupported assertions. The full `npm run verify` pipeline passed,
including 19 component checksums, the zero-vulnerability dependency audit, and
archive checks. The packaged official-host upgrade and four-agent workflow
passed with restart persistence and a visually inspected Verification Center.
The first host UI wait timed out; a fresh run passed unchanged assertions.
Historical receipts above remain intact; see the [refresh evidence](verification/upstream-repin-2026-11-12.json)
for pins, hashes, checks, and scope limits. Remote Workcell adapters remain outside
the plugin bundle; their upstream audit/pagination tests are distinct evidence.

## Original assignment follow-up review

The [requirement coverage review](ATTACHMENT_REVIEW.md) maps the original
attachment to implementation, observed evidence and explicit boundaries. It closes
attempt-attribution/chronology presentation and non-container recovery reporting
gaps, and adds retained Muzzle failure and running-cancellation proof.
The final stable-source `npm run verify` passed 347 tests with two existing platform
skips; 62 UI tests passed, followed by both changed-surface cases on the final
recovery guard. All 11 native scenarios passed. The final archive passed official
host upgrade, failed/corrected execution, four-agent delegation, acceptance and
restart checks. Earlier mixed-revision runs are documented separately in the
[review receipt](verification/attachment-review-2026-11-12.json), not substituted
for final verification. The new coverage does not expand live provider or platform
claims.

## Remaining-limits follow-up

Delegated evidence now supports bounded pages beyond the prior first-50-only view.
The 121-assignment integration fixture verifies 50/50/21 pages, at most 51 issue
reads per request (root plus page), scope/membership cursors and later-page access
checks. All 64 UI tests passed. The official packaged-host rehearsal verifies
52 actual issues across 50/2 API and browser pages, a return to the first page,
and rejection after membership changes, alongside the existing upgrade and
four-agent workflows.

The full unit run had 346 passes, two platform skips and four failures in existing
execution tests. All 26 tests in those three files passed on focused rerun without
changing assertions or deadlines, covering all 350 non-skipped cases. The initial
host run hit a native execution deadline; its fresh retry passed all four checks.
Component, audit, build and package checks passed separately after the initial
unit failure stopped the aggregate command. See the [exact review receipt](verification/limitations-review-2026-11-12.json).
