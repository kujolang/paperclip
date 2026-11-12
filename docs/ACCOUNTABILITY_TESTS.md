# Accountability verification report

This report covers the partial RunLedger increment described in
[the engineering audit](ACCOUNTABILITY.md). Unit fixtures, browser fixtures,
real native producer execution and a real host are separate evidence classes.

| Feature | Test | Result | Evidence |
| --- | --- | --- | --- |
| Original 21 tools / baseline | `npm run verify` before implementation | PASS: 44 test files, 328 passed, two platform-specific skips | Existing unit/native suite, contracts, component checksums, build and package verifier |
| RunLedger admission and issue binding | `tests/runledger.spec.ts` plus `tests/verification.spec.ts` | PASS: 19 tests | Schema/depth/UTF-8 limits, malformed dates, unsafe counts, unknown vs zero, redaction, classification, forged/stale identity, tenant scope, worker restart and comparison |
| Full final regression | `TMPDIR=/private/tmp npm run verify` | PASS: 45 files, 333 passed, two platform skips; typecheck, contracts, components, supply chain, build and tarball | [Verification receipt](verification/accountability-2026-11-12.json) |
| UI regression | `npm run test:ui -- --workers=2` | PASS: 60 browser cases | Includes all existing screenshots and new RunLedger import/navigation isolation; mocked host bridge is explicitly a UI fixture |
| Real native receipt producer | `scripts/acceptance/runledger-demo.mjs` | PASS: intentional assertion exit 1, corrected assertion exit 0 | [Proof](../examples/accountability-evidence/proof.json), both retained native receipts and output hashes |
| Live host correlation | Official server 2026.1106.0, accountability acceptance pack | PASS: four agents, eight records, full host/database restart | [Host result](../examples/accountability-evidence/host-result.json), [real correlations](../examples/accountability-evidence/host-correlations.json) |
| Container execution | `docker info` | BLOCKED: daemon unavailable; Podman absent | Workcell adapter remains deferred; no host-execution fallback |
| Lens execution and browser artifacts | Not implemented in this increment | DEFERRED | Browser UI regression is not a Lens integration test |
| PackWrite/Muzzle/direct Watchdog integration | Source/interface research only | DEFERRED | Capability matrix distinguishes available upstream code from plugin support |
| Required verification / authorized waivers | Not implemented | DEFERRED | No native issue lifecycle or permissions overridden |
| Full autonomous multi-agent delivery | Not implemented | DEFERRED | Host scenario qualifies correlation of imported claims, not autonomous implementation or independent verification |

Environment setup observations: initial UI launch could not find the pinned
Playwright browser. Installing its official Chromium headless shell resolved that
setup problem; no assertions or screenshot baselines were weakened. The fresh
host prefix was installed with scripts disabled. Embedded PostgreSQL initialization
then failed because its package symlinks had not been hydrated. After inspecting
the package's hydration script and validating all 17 paths remained inside that
package, running it restored `initdb --version`. Neither failure was a plugin
assertion failure. No existing host or production infrastructure was modified.

No Windows/Linux runtime execution or upgrade rehearsal is newly qualified by
this increment. The prior platform/upgrade evidence remains historical evidence,
not a substitute for tests of new code. No release was published.
