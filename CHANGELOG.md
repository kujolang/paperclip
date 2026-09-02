# Changelog

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
