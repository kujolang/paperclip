# Compatibility policy

## Supported versions

| Dependency | Supported range | CI coverage |
| --- | --- | --- |
| Paperclip | `2026.824.1` and later in the current compatibility train | SDK minimum and latest |
| Node.js | `24.11.0` through the latest Node 24 release | minimum and latest Node 24 |
| Kujo runtime | bundled `1.2.2` | five native targets |

The plugin supports macOS arm64/x64, Linux arm64/x64, and Windows x64. CI runs the full plugin suite on each target at the minimum Node version. A separate compatibility job tests the minimum and latest Paperclip SDK against the minimum and latest Node 24 release.

## Change rules

- Patch releases keep the same artifact schemas and minimum host train.
- Before 1.0, a minor release may add fields or raise a minimum version. The changelog must call out either change.
- Readers accept additive fields but reject unknown schema versions.
- Context content requires the same company, project, workspace, and Git snapshot that produced the pack.
- Component and runtime updates require the full native matrix and clean-install smoke test.

Paperclip releases outside the tested train are not supported until the scheduled compatibility job passes and the table is updated.
