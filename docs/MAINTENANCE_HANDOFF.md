# Paperclip maintenance handoff

Updated September 2, 2026.

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

No known plugin defect blocks normal public use. The remaining work is maintenance,
upstream Paperclip compatibility, automated UI coverage, and catalog distribution.

## Work queue

### 1. Fix pinned scoped-package installs in Paperclip

**Priority:** High  
**Owner:** Paperclip host CLI, not this plugin

The Paperclip CLI currently misparses an exact scoped npm package reference:

```bash
npx paperclipai plugin install @kujolang/paperclip@0.1.5
```

It looks for a directory named `@kujolang/paperclip@0.1.5` after npm installs the
package. Installing the current version without a version suffix works:

```bash
npx paperclipai plugin install @kujolang/paperclip
```

Continue the fix in the Paperclip repository at
`/Users/robertdevore/2026/paperclip`. Start with the plugin install command in
`cli/src/commands/client/plugin.ts`.

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

Paperclip `2026.831.1` reported host version `0.0.0` to the plugin loader. The plugin
therefore keeps `MINIMUM_HOST_VERSION = "0.0.0"` in `src/config/defaults.ts` as a
temporary loader workaround. Documentation and CI enforce the actual supported floor,
Paperclip `2026.824.1`.

First fix or verify host-version reporting on the latest Paperclip release. Then:

1. set the manifest minimum to the real supported host floor;
2. update `tests/plugin.spec.ts` and `docs/COMPATIBILITY.md`;
3. run the full verification matrix;
4. install the packed plugin on the declared minimum and latest Paperclip versions; and
5. issue a patch release if the published manifest changes.

Acceptance criteria: a compatible host loads the plugin, an older host rejects it with
a clear message, and no `0.0.0` compatibility exception remains.

### 3. Add automated browser coverage for both UI surfaces

**Priority:** Medium  
**Owner:** Plugin and Paperclip integration tests

The UI has contract tests and manual browser evidence, but it does not yet have an
automated end-to-end browser or visual-regression test. Add coverage for:

- the inline current-task workspace registered through `taskDetailView`;
- the shared `detailTab` on project, issue, and run pages;
- Review, Context, and Failure Evidence actions and result states;
- the official Kujo mark and accessible labels; and
- light and dark themes at desktop and narrow widths.

Keep visual assertions stable: test layout, visibility, accessible names, and a small
set of approved screenshots instead of brittle pixel checks for every element.

Acceptance criteria: CI fails when either surface disappears, loses its primary
actions, or regresses past approved visual baselines.

### 4. Review the open dependency pull requests

**Priority:** Medium  
**Owner:** Plugin maintainers

Dependabot currently has four open pull requests: [artifact attestation
#1](https://github.com/kujolang/paperclip/pull/1), [the grouped development update
#2](https://github.com/kujolang/paperclip/pull/2), [Zod
#3](https://github.com/kujolang/paperclip/pull/3), and [dependency review
#4](https://github.com/kujolang/paperclip/pull/4). Review current status on GitHub
rather than assuming this list is still current.

The grouped development update is failing because TypeScript 7 no longer discovers
the Node.js types under the current compiler configuration. Do not merge the group as
it stands. Split major upgrades when useful, make the TypeScript configuration explicit,
and run `npm run verify` plus the hosted compatibility matrix before merging.

### 5. Submit to the Paperclip catalog

**Priority:** Medium  
**Owner:** Release or ecosystem maintainer

Use [CATALOG_SUBMISSION.md](CATALOG_SUBMISSION.md) as the submission brief. Before
submitting, verify the current Paperclip catalog process and required evidence, then
attach the tagged release, npm provenance, cross-platform checks, permissions summary,
and current UI screenshots.

This is a distribution task, not a prerequisite for installing the public npm package.

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
