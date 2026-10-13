# Changelog

## 0.1.8 — 2026-10-12

- Update the Paperclip SDK to 2026.1012.0, bundled Kujo runtime to 1.8.1, and Zod to 4.6.5.
- Refresh the source-map-js dependency to its patched release.
- Keep the four pinned components and existing Context Pack, Review Pack, and Failure Evidence contracts unchanged; broader Kujo feature expansion is a separate release.

## Unreleased

- Retain company/entity-scoped evidence history with integrity receipts, bounded retention, legacy migration, comparisons, redacted exports, current freshness inspection and explicit human-only issue-document attachment. Package the host database migration and test it with PostgreSQL.

- Add single-file Kujo source checking, lint diagnostics and explicit formatting previews through project/issue panels and two agent tools, with native bounded file admission and no project writes.

- Add pinned Scout 1.1.0 repository understanding to project/issue panels and an agent tool, with private bounded reports, tenant-scoped storage, partial diagnostics and a company feature switch.
- Detect edits to already-dirty files when checking workspace evidence freshness.

- Keep run detail read-only by hiding the unsupported clear-data action.

- Add first-use workspace guidance, company-scoped issue task defaults, and a
  checked/runnable bundled Kujo example with source and actual output.
- Add the `issues.read` capability and `features.examples` configuration switch.

- Fix Windows selection paths and CaseFile directory creation in the canonical component sources.

- Consume metadata-only Scent dry-run selection without writing temporary context artifacts.

- Refresh the pinned ChangeBucket, PatchBrief, CaseFile, and Scent sources, including
  bounded native Git processes, current file classification, and hardened artifact handling.
- Require Kujo 1.8.1 for the refreshed cohort; keep existing plugin output schemas unchanged.

- Probe the actual Kujo runtime during health checks and use company-specific
  readiness in the task/detail panels instead of an unconditional READY badge.
- Disable unavailable actions and offer repair guidance with a retry control.
- Reject relative executable overrides and non-Kujo version output.

- Update the Paperclip SDK, bundled Kujo runtime, Zod, browser and test tooling,
  React development stack, type definitions, and pinned GitHub Actions.

## 0.1.7 - 2026-09-04

- Rewrite the README in plain English with a 30-second install path, first-use steps,
  copyable agent requests, and clear compatibility notes.
- Add monochrome npm and CI badges alongside the standard Kujo version, license, and
  build badges.
- Correct the documented Context Pack file limits and reject unknown `npm run`
  commands in repository documentation.
- Upgrade the bundled Kujo runtime to 1.2.3 and refresh the Node and React DOM type
  definitions after full verification.

## 0.1.6 - 2026-09-03

- Add deterministic Chromium coverage for both Paperclip UI surfaces, all primary
  actions, project/issue/run states, accessible branding, responsive themes, and
  approved visual baselines.
- Gate pull requests and tagged releases on the browser suite, with failure reports
  retained for diagnosis.
- Upgrade Zod, React development types, Rollup, TypeScript, Vitest, build provenance,
  and dependency-review tooling after passing the full compatibility matrix.
- Make Node and React compiler types explicit for TypeScript 7.

## 0.1.5 - 2026-09-02

- Replace the temporary lettermark in the Paperclip workspace with the official adaptive Kujo SVG from kujolang.ai.

## 0.1.4 - 2026-09-02

- Show Kujo automatically in Paperclip's current issue view while keeping the shared detail tab for project, issue, and run pages.
- Replace the basic action list with a polished monochrome workspace, clearer action cards, stronger artifact states, and responsive controls.
- Correct the empty Context Pack state so it reports that a pack has not been generated.

## 0.1.3 - 2026-09-02

- Resolve the installed `@kujolang/kujo-runtime` package at worker runtime instead of inlining its package resolver into the ESM worker bundle.
- Add a package verification regression gate for the external runtime boundary.

## 0.1.2 - 2026-09-02

- Publish through npm trusted publishing with short-lived GitHub Actions identity tokens instead of a stored npm token.
- Verify the published package through a clean public-registry installation before creating the GitHub release.

## 0.1.1 - 2026-09-02

- Work around Paperclip `2026.831.1` reporting host version `0.0.0` to the plugin loader while retaining the documented `2026.824.1` support floor.
- Complete Windows component fallbacks and cross-platform npm verification.

## 0.1.0 - 2026-09-02

- Add Review Pack, Failure Evidence, and Context Pack tools and UI actions for Paperclip.
- Bundle and verify ChangeBucket, PatchBrief, CaseFile, and Scent component snapshots.
- Enforce company-scoped state, feature policy, stale-context rejection, workspace bounds, hostile Git configuration suppression, and process-tree cleanup.
- Add cross-platform compatibility, dependency review, CodeQL, SBOM, provenance, signed-tag, and exact-tarball release controls.
