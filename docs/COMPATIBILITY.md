# Compatibility policy

## Supported versions

| Dependency | Supported range | CI coverage |
| --- | --- | --- |
| Paperclip host | Minimum official npm `paperclipai@2026.1012.0`; tested stable `2026.1106.0` | Isolated authenticated host acceptance on Node 26.12.1; exact coverage and limits in the November 11 sweep report |
| Paperclip SDK | Locked `2026.1106.0` and latest stable release | locked (legacy `minimum` job label) and latest |
| Node.js | `>=24.22.1 <25` or `>=26.12.1` | SDK compatibility lanes both pin 24.22.1; their legacy required-status labels are not runtime versions |
| Kujo runtime | bundled `1.8.1` | five native targets |

The plugin supports macOS arm64/x64, Linux arm64/x64, and Windows x64. CI runs the plugin suite across native targets. A separate compatibility job tests the locked and latest Paperclip SDK on patched Node 24.22.1. These SDK tests do not establish compatibility with a running host.

The November 11 sweep pins the SDK to official stable Paperclip `2026.1106.0`
and tests that exact npm host using disposable authenticated instances. See
[the sweep evidence](COMPATIBILITY_SWEEP_2026_11_11.md) for the capability matrix,
migration results, retained workarounds and explicit qualification limits.
The existing separate host fork and persistent service were not replaced.

## Change rules

- Patch releases keep the same artifact schemas and minimum host train.
- The expansion raises the minimum host to official `2026.1012.0`. Its manifest rejects older hosts; the historical `0.0.0` fallback is removed.
- Before 1.0, a minor release may add fields or raise a minimum version. The changelog must call out either change.
- Readers accept additive fields but reject unknown schema versions.
- Context content requires the same company, project, workspace, and Git snapshot that produced the pack.
- Component and runtime updates require the full native matrix and clean-install smoke test.

The SDK matrix is separate from live-host acceptance. The selected minimum host
remains `2026.1012.0`; it is no longer the latest stable release. No fork
is required. Expansion requires database namespace migrations, authenticated
action actors, issue documents/interactions, scheduled jobs and local folders.
Earlier prepared-fork checks are supplementary regression evidence. Future host
releases need qualification; the new plugin still needs review, publication and
a post-publication registry upgrade check.

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
