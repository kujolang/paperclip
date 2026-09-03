# Paperclip maintenance handoff

Updated September 3, 2026.

## Current state

`@kujolang/paperclip` is ready for public use within its documented scope. Version
`0.1.6` is published on npm and GitHub. The released plugin:

- works in Paperclip's current task view without requiring the Classic Task Interface;
- provides Review, Context, and Failure Evidence workflows in the inline workspace and
  the shared Kujo detail tab;
- uses the official Kujo logomark;
- protects both UI surfaces with browser behavior, accessibility, responsive, and
  visual-regression checks;
- bundles checksummed Kujo components for every supported platform; and
- publishes through GitHub Actions with npm trusted publishing and provenance.

No known plugin defect blocks normal public use. The remaining work is upstream or
distribution work: the host-version change is waiting on Paperclip maintainers, and
catalog distribution is not available yet.

## Next-agent brief

There is no plugin-owned release work waiting. Start with
[paperclipai/paperclip#12745](https://github.com/paperclipai/paperclip/pull/12745):
it is open, ready for review, mergeable, and green as of September 3, 2026. Respond to
maintainer feedback, but do not raise this plugin's manifest minimum while that change
is absent from a public Paperclip release.

After Paperclip publishes the fix:

1. verify that `npx paperclipai plugin install @kujolang/paperclip@0.1.6` succeeds;
2. replace the temporary `MINIMUM_HOST_VERSION = "0.0.0"` value in
   `src/config/defaults.ts` with the real supported floor;
3. update the compatibility tests and documentation;
4. run `npm ci --ignore-scripts`, `npm run verify`, `npm run test:browser`, and the
   minimum/latest clean-install matrix; and
5. release a patch through the signed-tag workflow if the package changes.

Separately, check Paperclip's documentation for an official catalog or marketplace
submission path. None exists today, so catalog submission is parked rather than
failed. Do not create or use an unofficial listing process.

## At a glance

| Work | State | Next action |
| --- | --- | --- |
| Exact scoped-version install | Upstream PR ready and green | Get Paperclip PR #12745 reviewed and merged |
| Real minimum host version | Externally blocked | Wait for a Paperclip release containing PR #12745 |
| Browser/UI regression coverage | Complete | Maintain the approved baselines with UI changes |
| Dependency updates | Complete | Continue normal Dependabot review |
| Paperclip catalog listing | Not currently available | Recheck when Paperclip publishes a marketplace process |
| Kujo plugin release | Complete | Verify and retain the v0.1.6 release evidence |

## Work queue

### 1. Fix pinned scoped-package installs in Paperclip

**Priority:** High  
**Owner:** Paperclip host CLI, not this plugin

**State:** Implemented in a green upstream PR awaiting maintainer review

The Paperclip CLI currently misparses an exact scoped npm package reference:

```bash
npx paperclipai plugin install @kujolang/paperclip@0.1.6
```

It looks for a directory named `@kujolang/paperclip@0.1.6` after npm installs the
package. Installing the current version without a version suffix works:

```bash
npx paperclipai plugin install @kujolang/paperclip
```

The fix is implemented and pushed from the isolated worktree
`/Users/robertdevore/2026/paperclip-kujo-fixes` on branch
`codex/kujo-plugin-host-fixes`. The upstream pull request is
[paperclipai/paperclip#12745](https://github.com/paperclipai/paperclip/pull/12745).
It adds a shared npm-package-spec parser, CLI and server regression tests, and real
host-version detection. Local targeted verification passed 59 tests across four test
files, plus shared, CLI, and direct server TypeScript checks. The complete upstream CI
matrix, Greptile, Snyk, Socket, policy, and automated review checks passed. The PR is
ready for maintainer review.

Next steps:

1. Address any maintainer review request.
2. Merge through the upstream project's normal process.
3. Verify a clean exact-version install from the first Paperclip release containing
   the change.

Acceptance criteria:

- `@scope/name@version` installs the requested exact version;
- unscoped, scoped-without-version, file, and directory installs still work;
- regression tests cover scoped exact versions; and
- Kujo's upgrade and rollback documentation is retested and updated.

Tracking evidence: SignalBox capture
`cap_2bb9af3e-0a67-4b90-b242-d8edf54d3448` and signal
`sig_9bac6b5c-871d-42e0-91a2-7bd99f78f3c0`.

### 2. Restore the real minimum-host manifest constraint

**Priority:** High  
**Owner:** Paperclip host integration, followed by this plugin

**State:** Blocked until the upstream fix is released

Paperclip `2026.831.1` reported host version `0.0.0` to the plugin loader. The plugin
therefore keeps `MINIMUM_HOST_VERSION = "0.0.0"` in `src/config/defaults.ts` as a
temporary loader workaround. Documentation and CI enforce the actual supported floor,
Paperclip `2026.824.1`.

PR #12745 includes the host-version reporting fix, but the published Kujo plugin must
keep the temporary `0.0.0` manifest value until that change reaches a public Paperclip
release. Raising the floor earlier would reject users on the current host even though
their Paperclip version is otherwise supported.

After the upstream release:

1. set the manifest minimum to the real supported host floor;
2. update `tests/plugin.spec.ts` and `docs/COMPATIBILITY.md`;
3. run the full verification matrix;
4. install the packed plugin on the declared minimum and latest Paperclip versions; and
5. issue a patch release if the published manifest changes.

Acceptance criteria: a compatible host loads the plugin, an older host rejects it with
a clear message, and no `0.0.0` compatibility exception remains.

### 3. Add automated browser coverage for both UI surfaces

**Priority:** Medium  
**Owner:** Plugin repository

**State:** Complete in plugin PR #11

The UI has contract tests, manual browser evidence, and automated browser and visual
regression coverage for:

- the inline current-task workspace registered through `taskDetailView`;
- the shared `detailTab` on project, issue, and run pages;
- Review, Context, and Failure Evidence actions and result states;
- the official Kujo mark and accessible labels; and
- light and dark themes at desktop and narrow widths.

The implementation uses Playwright with a deterministic SDK fixture. It covers the
current-task surface, the project and issue detail tabs, the read-only run detail tab,
all three primary actions, the official mark, accessible labels, and approved
desktop-light and narrow-dark screenshots. The `browser-ui` CI job installs its own
Chromium build and uploads the Playwright report on failure.

The hosted Linux browser job passed before merge. Pull requests and releases fail if
either surface disappears, loses its primary actions, or exceeds the approved visual
baseline tolerance. Lens also passed its full desktop/mobile accessibility and link
check with no findings at warning or higher.

### 4. Review the open dependency pull requests

**Priority:** Medium  
**Owner:** Plugin maintainers

**State:** Complete

The four reviewed Dependabot pull requests were [artifact attestation
#1](https://github.com/kujolang/paperclip/pull/1), [the grouped development update
#2](https://github.com/kujolang/paperclip/pull/2), [Zod
#3](https://github.com/kujolang/paperclip/pull/3), and [dependency review
#4](https://github.com/kujolang/paperclip/pull/4). All four are merged.

The grouped TypeScript 7 update initially failed because compiler types were implicit.
The repaired branch declares Node and React types explicitly. Local verification and
the complete hosted compatibility matrix passed before merge.

### 5. Submit to the Paperclip catalog

**Priority:** Medium  
**Owner:** Release or ecosystem maintainer

**State:** Waiting for an upstream submission channel

Paperclip's current implementation specification explicitly keeps a public plugin
marketplace and packaged public distribution out of scope. No official catalog
submission path is present in the upstream repository as of this update. Do not invent
an unofficial submission process.

Keep [CATALOG_SUBMISSION.md](CATALOG_SUBMISSION.md) ready as the evidence brief. When
Paperclip publishes a submission channel, attach the tagged release, npm provenance,
cross-platform checks, permissions summary, and current UI screenshots.

This is a distribution task, not a prerequisite for installing the public npm package.

### 6. Cut the next release only after plugin-owned work lands

**Priority:** Medium

**Owner:** Plugin release maintainer

**State:** v0.1.6 released

Version 0.1.6 consolidates the browser coverage and dependency maintenance. Its tagged
workflow runs the full repository, browser, compatibility, supply-chain, packaging,
and clean-install gates before publication through npm trusted publishing.

## Recommended next-agent sequence

1. Monitor upstream PR #12745 through review and merge; do not change the published
   minimum-host constraint yet.
2. After an upstream Paperclip release contains the host fix, restore the real host
   floor and run minimum/latest clean-install tests.
3. Publish a follow-up patch only if restoring the manifest floor changes the package.

The catalog task stays parked until Paperclip exposes an official public submission
process.

## Optional business work

The repository documents secure operation and incident response, but it does not promise
an SLA. If the plugin will be sold as an enterprise-supported product, define support
ownership, response targets, vulnerability intake, data-processing posture, and any
required compliance evidence. These are commercial-operating commitments, not missing
plugin functionality.

## Guardrails

- Keep the plugin a thin integration over the pinned Kujo components. Do not duplicate
  their implementations in TypeScript.
- Do not add a generic command runner or accept arbitrary workspace paths.
- Preserve bounded output, redaction, canonical workspace checks, and the two-stage
  Context Pack read boundary.
- Do not add a Classic Task Interface requirement.
- Keep npm publishing tokenless through trusted publishing; do not add repository npm
  tokens.
- Do not claim suggested checks ran unless the plugin has execution evidence.

## Agent start checklist

1. Read `AGENTS.md`, `README.md`, this handoff, and the document for the selected task.
2. Confirm `git status --short --branch` is clean and create a focused branch.
3. Run `npm ci --ignore-scripts` and `npm run verify` before changing behavior.
4. Inspect current GitHub issues, pull requests, and workflow results.
5. Make small signed commits, push them, and use required pull-request checks.
6. For a release, follow [RELEASE_READINESS.md](RELEASE_READINESS.md), test a clean
   public install, and verify the npm and GitHub artifacts after publication.

## Completion standard

A maintenance item is complete only when its tests, documentation, compatibility
evidence, and hosted checks agree; the branch is merged; and the working tree is clean.
A version change is complete only after the signed tag, GitHub release, npm package,
provenance, and clean public install are all verified.

## Release evidence

- GitHub release: <https://github.com/kujolang/paperclip/releases/tag/v0.1.6>
- successful release workflow: <https://github.com/kujolang/paperclip/actions/runs/33716203158>
- npm package: <https://www.npmjs.com/package/@kujolang/paperclip/v/0.1.6>
- npm SLSA provenance: <https://registry.npmjs.org/-/npm/v1/attestations/@kujolang%2fpaperclip@0.1.6>
- signed tag commit: `924ae40cac2ba2447c235ae4d6ea033ea62b6361`
- npm integrity: `sha512-O1/V23rMyPvTe+akUn7CqG5WUj/GKg0Sf9krwSZQCcrcEQGm9OH1leLOmIc0Skb1qM94NV5n3XFFWgmg3WiJCg==`
