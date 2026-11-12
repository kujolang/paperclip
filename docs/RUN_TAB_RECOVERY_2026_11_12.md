# Run tab repair and plugin prefix recovery

Follow-up to the [November 11 compatibility sweep](COMPATIBILITY_SWEEP_2026_11_11.md).
Observed November 12 UTC (November 11 America/Detroit).

## Run tab repair

The official `2026.1106.0` UI still fails the live Kujo run-tab assertion.
The fix is a host UI change, based on official source
`d69631b01b9c658f80bf8bed389863dce82643e1`, in the
[host fork branch](https://github.com/robertdevore/paperclip/tree/codex/run-plugin-tabs-2026-11-11).
The signed repair commit is
[`a1f7a2d8b1fc1224c766ab5cf065437bdefd2a12`](https://github.com/robertdevore/paperclip/commit/a1f7a2d8b1fc1224c766ab5cf065437bdefd2a12).
It is not an upstream release or a plugin-only workaround.

`RunDetailTabs` uses the existing slot discovery and mounting code. It admits
`detailTab` contributions for `run`, supplies the API-resolved run/company and
parent agent, and preserves native Details as the default. Run/company changes
remount the contribution. Removed contributions fall back to Details; discovery
errors remain visible. Desktop tabs and the mobile selector are covered. No new
permission, API, migration, or arbitrary project identity is introduced.

The exact production UI build was served by an otherwise unchanged official
npm `@paperclipai/server@2026.1106.0` in a disposable authenticated instance.
The existing user host fork, databases and services were not deployed or changed.
Installing Kujo alone on the unpatched stable release does not add this host fix.

Live acceptance passes task UI/action, project tab/navigation, retained read-only
run evidence, cancellation/reload, an empty second run, and returning to the first
run without crossing evidence scopes. All browser requests outside the isolated
host are blocked. Test agent credentials are revoked and owned runs/server stopped.
The harness records the actual UI index digest because the server version cannot
identify a custom UI build.
The primary and independent live runs each passed all eight checks;
[sanitized evidence](verification/run-tab-repair-2026-11-12.json) preserves both
results, the released-host failure, and UI digests. The independent reviewer also
passed 23 related host tests and found no concrete source regression.

Host checks: six new component cases, 21 related slot/AgentDetail cases, UI
typecheck, production UI build, token gates and map validation passed. Full
recursive host typecheck/tests/build were not run: the bounded installation covers
the UI workspace graph, not the entire server/native runner graph. This is a
verified UI repair, not qualification of every host subsystem. Initial pnpm 11
lockfile rejection was resolved by using repository-pinned pnpm 9.15.4. Generated
SDK/Storybook prerequisites and existing locked runner dependency links were
prepared without changing dependency versions or the lockfile.

The plugin's final `TMPDIR=/private/tmp npm run verify` passed: 44 test files,
328 tests, two non-POSIX cases not applicable on macOS, typecheck/contracts,
15 component checksums, 163 locked packages/66 SBOM components, build and tarball.
An earlier run during concurrent host validation had 326 passes and two existing
source-execution tests exceed their unchanged five-second deadlines. The full
rerun passed after owned hosts were stopped and disposable installations removed;
no timeout, assertion, test or supported feature was weakened. Resource contention
is consistent with the observations, but its exact contribution was not measured.

## Prefix recovery verification

The recovered global npm plugin prefix is structurally consistent and functional
for its observed empty-manifest baseline. No additional repair was needed.
[Measured recovery evidence](verification/prefix-recovery-2026-11-12.json) records:

- Empty manifest, consistent root/hidden locks, no installed packages or bin links.
- Three backed-up metadata checksums, 13 quarantined package identities and two
  quarantined executable links verified against the recovery record.
- Seven offline disposable-copy checks: empty tree, clean install, local fixture
  install, Node resolution, bin execution, uninstall, and return to empty state.
- Global prefix inventory and hashes unchanged by verification.
- Six validation negatives rejected symlink roots/children, unexpected files or
  packages, and changed lock metadata before any package-manager probe.

The verifier reads the real prefix and backup, then passes only a disposable copy
to npm with isolated HOME/cache/config, offline mode and lifecycle scripts disabled.
It is specific to this recovery format and fails if the prefix has subsequently
changed; it is not a general repair command.

```sh
TMPDIR=/private/tmp python3 scripts/acceptance/verify-prefix-recovery.py \
  --prefix /absolute/recovered/plugins \
  --backup /absolute/global-prefix-recovery
```

Historical byte-exact restoration remains **unverifiable**. The original lockfiles
and complete pre-probe inventory were never captured, and no local snapshots were
available. `beforeSha256` in `recovery.json` means post-probe/pre-recovery, not
pre-probe. Present health does not prove an unknown historical state. Retain the
private recovery backup; no evidence supports deleting it or restoring quarantined
packages into the known empty prefix.

## Reproduce and roll back

Build the host branch using its pinned pnpm and UI instructions. Install the exact
official host into a **disposable prefix** with lifecycle scripts disabled; on
macOS prepare only its validated, contained embedded-Postgres library symlinks.
Preserve the published `@paperclipai/server/ui-dist` and replace it with the
branch's `ui/dist` only in that disposable prefix. Build this plugin, then run:

```sh
TMPDIR=/private/tmp KUJO_ACCEPTANCE_NPM_HOST=/absolute/disposable-host \
  KUJO_ACCEPTANCE_PRODUCTION=1 KUJO_ACCEPTANCE_PACK=ui \
  KUJO_ACCEPTANCE_RUN_UI=1 npm run test:host:execution
```

Use `KUJO_ACCEPTANCE_BROWSER` for an existing compatible Chromium executable when
the installed Playwright revision has not been downloaded. The qualification used
Chromium headless shell revision 1234. A first attempt without this override failed
before browser execution; it was not counted as a UI result.

Restore the published UI directory to roll back this repair; no schema/data
rollback is needed because this patch changes only UI mounting. Persistent host
promotion remains a separate deployment action: preserve its custom patches and
use a full prepared host build. The original host worktree was left intact.
