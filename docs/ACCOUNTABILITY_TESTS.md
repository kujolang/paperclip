# Accountability verification report

The original RunLedger increment is preserved in
[its historical receipt](verification/accountability-2026-11-12.json).
This report covers the subsequent opt-in assurance integration. Native execution,
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
| Bundled sources | `npm run components:verify` | PASS: 19 checksum-verified components | Component lock includes upstream Workcell patch 3a624b0 |
| Upstream Workcell patch | Native workspace tests with external diff disabled/poisoned | PASS: 29 targeted assertions | Upstream commit 3a624b0 on codex/paperclip-patch-collection |
| Upstream remote adapter suite | Workcell full tests / npm audit | NOT PASS: optional remote-adapter audit reports 6 advisories | These adapters are not bundled or exposed by Paperclip; tracked separately for human review |

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
