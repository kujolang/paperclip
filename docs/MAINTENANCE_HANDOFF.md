# Paperclip maintenance handoff

Updated September 3, 2026.

## Current state

`@kujolang/paperclip` is ready for public use within its documented scope. Version
`0.1.5` is published on npm and GitHub from commit
`459d76048cebdf9e532fc871a93a535b28dc677a`. The released plugin:

- works in Paperclip's current task view without requiring the Classic Task Interface;
- provides Review, Context, and Failure Evidence workflows in the inline workspace and
  the shared Kujo detail tab;
- uses the official Kujo logomark;
- bundles checksummed Kujo components for every supported platform; and
- publishes through GitHub Actions with npm trusted publishing and provenance.

No known plugin defect blocks normal public use. The remaining work is listed below.
Only the browser test suite is plugin functionality work. The host-version change is
waiting on upstream Paperclip, and catalog distribution is not available yet.

## At a glance

| Work | State | Next action |
| --- | --- | --- |
| Exact scoped-version install | Upstream PR open | Get Paperclip PR #12745 reviewed and merged |
| Real minimum host version | Externally blocked | Wait for a Paperclip release containing PR #12745 |
| Browser/UI regression coverage | Implemented on feature branch | Merge after the hosted browser job passes |
| Dependency updates | Partly ready | Merge #3 and #4; repair or split #1 and #2 |
| Paperclip catalog listing | Not currently available | Recheck when Paperclip publishes a marketplace process |
| Next Kujo plugin release | Not yet warranted | Release after the selected plugin-owned changes land |

## Work queue

### 1. Fix pinned scoped-package installs in Paperclip

**Priority:** High  
**Owner:** Paperclip host CLI, not this plugin

**State:** Implemented in draft upstream PR

The Paperclip CLI currently misparses an exact scoped npm package reference:

```bash
npx paperclipai plugin install @kujolang/paperclip@0.1.5
```

It looks for a directory named `@kujolang/paperclip@0.1.5` after npm installs the
package. Installing the current version without a version suffix works:

```bash
npx paperclipai plugin install @kujolang/paperclip
```

The fix is implemented and pushed from the isolated worktree
`/Users/robertdevore/2026/paperclip-kujo-fixes` on branch
`codex/kujo-plugin-host-fixes`. The draft upstream pull request is
[paperclipai/paperclip#12745](https://github.com/paperclipai/paperclip/pull/12745).
It adds a shared npm-package-spec parser, CLI and server regression tests, and real
host-version detection. Local targeted verification passed 59 tests across four test
files, plus shared, CLI, and direct server TypeScript checks. The upstream CI matrix
was still running when this handoff was updated; Greptile, Snyk, Socket, policy, and
the initial review checks had passed.

Next steps:

1. Wait for every required hosted check.
2. Address any review or CI failure in the upstream branch.
3. Mark the PR ready for review and obtain maintainer approval.
4. Merge through the upstream project's normal process.
5. Verify a clean exact-version install from the first Paperclip release containing
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

**State:** Implemented; awaiting hosted verification and merge

The UI has contract tests and manual browser evidence, but it does not yet have an
automated end-to-end browser or visual-regression test. Add coverage for:

- the inline current-task workspace registered through `taskDetailView`;
- the shared `detailTab` on project, issue, and run pages;
- Review, Context, and Failure Evidence actions and result states;
- the official Kujo mark and accessible labels; and
- light and dark themes at desktop and narrow widths.

Use a deterministic SDK fixture and a real browser runner. Keep visual assertions
stable: test layout, visibility, accessible names, and a small set of approved
screenshots instead of brittle pixel checks for every element. Run this suite in CI
and keep the fixture free of network and installed-Kujo dependencies.

The implementation uses Playwright with a deterministic SDK fixture. It covers the
current-task surface, the project and issue detail tabs, the read-only run detail tab,
all three primary actions, the official mark, accessible labels, and approved
desktop-light and narrow-dark screenshots. The `browser-ui` CI job installs its own
Chromium build and uploads the Playwright report on failure.

Acceptance criteria: merge only after the hosted Linux browser job proves that either
surface disappearing, losing its primary actions, or exceeding the approved visual
baseline tolerance fails CI.

### 4. Review the open dependency pull requests

**Priority:** Medium  
**Owner:** Plugin maintainers

**State:** In progress

Dependabot currently has four open pull requests: [artifact attestation
#1](https://github.com/kujolang/paperclip/pull/1), [the grouped development update
#2](https://github.com/kujolang/paperclip/pull/2), [Zod
#3](https://github.com/kujolang/paperclip/pull/3), and [dependency review
#4](https://github.com/kujolang/paperclip/pull/4).

Status on September 3, 2026:

- #3 and #4 are current, mergeable, and green across the hosted matrix.
- #2 is current but fails because the TypeScript 7 upgrade no longer discovers the
  required Node.js types under the existing compiler configuration. Make the type
  libraries explicit or split TypeScript 7 from the low-risk package updates.
- #1 is behind `main` and still shows failures from its older run. Update its branch,
  rerun the full matrix, and investigate only failures that reproduce on the updated
  head.

The grouped development update is failing because TypeScript 7 no longer discovers
the Node.js types under the current compiler configuration. Do not merge the group as
it stands. Split major upgrades when useful, make the TypeScript configuration explicit,
and run `npm run verify` plus the hosted compatibility matrix before merging.

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

**State:** No release is required for documentation or an upstream-only host change

Do not publish a version merely because PR #12745 exists. Cut the next patch release
after browser coverage or dependency changes land, or after the manifest floor can be
restored. Follow [RELEASE_READINESS.md](RELEASE_READINESS.md), use the existing trusted
publishing workflow, and verify GitHub, npm provenance, and a clean public install.

## Recommended next-agent sequence

1. Merge the browser/UI coverage after the complete hosted matrix passes.
2. Merge dependency PRs #3 and #4, then repair or split #1 and #2 without weakening
   compiler or security checks.
3. Monitor upstream PR #12745 through review and merge; do not change the published
   minimum-host constraint yet.
4. After an upstream Paperclip release contains the host fix, restore the real host
   floor and run minimum/latest clean-install tests.
5. Publish one consolidated patch release and refresh this handoff with permanent
   release evidence.

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

- GitHub release: <https://github.com/kujolang/paperclip/releases/tag/v0.1.5>
- npm package: <https://www.npmjs.com/package/@kujolang/paperclip/v/0.1.5>
- Release workflow: <https://github.com/kujolang/paperclip/actions/runs/33707750913>
