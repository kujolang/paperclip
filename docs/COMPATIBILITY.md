# Compatibility policy

## Supported versions

| Dependency | Supported range | CI coverage |
| --- | --- | --- |
| Paperclip expansion host | Prepared `robertdevore/paperclip` checkout `edc9bbbba12029a9f055d94d58c5a545bb2aaaba` | Authenticated extracted-package acceptance on Node 24.20.0; official minimum/latest host releases not yet qualified |
| Paperclip SDK | `2026.1012.0` and latest compatible release | locked minimum and latest |
| Node.js | `24.11.0` through the latest Node 24 release | minimum and latest Node 24 |
| Kujo runtime | bundled `1.8.1` | five native targets |

The plugin supports macOS arm64/x64, Linux arm64/x64, and Windows x64. CI runs the full plugin suite on each target at the minimum Node version. A separate compatibility job tests the minimum and latest Paperclip SDK against the minimum and latest Node 24 release.

## Change rules

- Patch releases keep the same artifact schemas and minimum host train.
- The manifest accepts a `0.0.0` host-version fallback for the historical loader defect. This permissive gate is not evidence that an old host supports the expansion APIs. Qualify an official host release before publishing the expansion.
- Before 1.0, a minor release may add fields or raise a minimum version. The changelog must call out either change.
- Readers accept additive fields but reject unknown schema versions.
- Context content requires the same company, project, workspace, and Git snapshot that produced the pack.
- Component and runtime updates require the full native matrix and clean-install smoke test.

The SDK matrix does not install or exercise minimum/latest Paperclip host releases.
The historical `2026.824.1` maintenance floor must not be advertised as verified
expansion support. Expansion requires database namespace migrations, authenticated
action actors, issue documents/interactions, scheduled jobs and local folders.
The current live-host proof uses the prepared fork above; official host release
qualification and a fresh registry upgrade remain release gates.

## Upcoming component cohort

The expansion branch pins the four existing components to reviewed clean canonical
source commits recorded in `components.sources.json` and the checksum lock.
ChangeBucket is 1.1.0; PatchBrief is 1.0.1; CaseFile and Scent remain 1.0.0 with
post-release source fixes identified by commit. A component version alone does
not identify those fixes. No source is fetched at install or runtime.

This cohort requires Kujo 1.8.1, the bundled and tested runtime. The existing
Review, Context and Failure Evidence schema version remains 1. New ChangeBucket
v2 flags are not enabled implicitly.

Context selection uses Scent dry-run JSON metadata. File contents are retrieved
only through the separate bounded content operation; Scent does not need to
write private POSIX artifacts for this workflow.

CaseFile uses exclusive directory creation on all supported platforms. POSIX
directories use mode0700; Windows directories inherit the parent ACL. The plugin
captures into its temporary workspace under the host user's temporary directory,
which must be private to that user. It does not change workspace ACLs.
