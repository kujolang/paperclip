# Compatibility policy

## Supported versions

| Dependency | Supported range | CI coverage |
| --- | --- | --- |
| Paperclip | `2026.824.1` and later in the current compatibility train | minimum host and latest compatible host |
| Paperclip SDK | `2026.1012.0` and latest compatible release | locked minimum and latest |
| Node.js | `24.11.0` through the latest Node 24 release | minimum and latest Node 24 |
| Kujo runtime | bundled `1.8.1` | five native targets |

The plugin supports macOS arm64/x64, Linux arm64/x64, and Windows x64. CI runs the full plugin suite on each target at the minimum Node version. A separate compatibility job tests the minimum and latest Paperclip SDK against the minimum and latest Node 24 release.

## Change rules

- Patch releases keep the same artifact schemas and minimum host train.
- Paperclip `2026.831.1` reports `0.0.0` to its plugin loader. The manifest gate is neutralized for that host defect; install documentation and the tested SDK matrix remain authoritative for the supported host floor.
- Before 1.0, a minor release may add fields or raise a minimum version. The changelog must call out either change.
- Readers accept additive fields but reject unknown schema versions.
- Context content requires the same company, project, workspace, and Git snapshot that produced the pack.
- Component and runtime updates require the full native matrix and clean-install smoke test.

Paperclip releases outside the tested train are not supported until the scheduled compatibility job passes and the table is updated.

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
