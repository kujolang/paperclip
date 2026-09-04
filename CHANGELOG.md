# Changelog

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
