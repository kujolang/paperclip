# v0.1 release readiness

## Gates

| Gate | Local result |
| --- | --- |
| TypeScript strict typecheck | automated by `npm run verify` |
| Unit/contract tests | automated by Vitest |
| Official Paperclip SDK worker harness | automated by Vitest |
| Real ChangeBucket/PatchBrief fixture | automated by Vitest |
| Real CaseFile redaction fixture | automated by Vitest |
| Real Scent relevance/budget fixture | automated by Vitest |
| Component SHA-256/provenance | `components:verify` |
| Worker/manifest/UI bundles | esbuild with official SDK preset |
| npm tarball contents | `pack:verify` |
| Runtime resolver/package tests | owned by the Kujo runtime repository |

The release order is platform runtime packages, neutral `@kujolang/kujo-runtime`, component sync/verification, plugin tarball clean-install verification, then `@kujolang/paperclip`. Platform binaries and the resolver must use the same Kujo version. The resolver is published last among runtime packages so it never points to missing versions.

## Matrix

The runtime release workflows build/smoke macOS arm64/x64, Linux arm64/x64, and Windows x64. Local plugin feature execution is verified on macOS arm64. Other plugin clean-machine cells are represented by the runtime/Paperclip CI design but require GitHub-hosted runners during a real tagged release.

## Performance bounds

- default component timeout: 30 seconds; administrator maximum: 120 seconds
- stdout: 2 MB; stderr: 256 KB
- Failure Evidence input: 200 KB with explicit middle truncation
- Context presets: approximately 4K/16K/40K tokens and 12/40/100 files
- context file: 100 KB during selection and 1 MB hard read refusal
- Review file rows retained by canonical output; UI eagerly renders at most 20 context entries and 12 suggested tests

The v0.1 deterministic suite remains in Vitest because these contracts combine the Paperclip SDK harness, native-process bounds, filesystem escape checks, and JSON assertions directly. Kujo Spec/Eval would add a second runner without improving determinism for this release; the versioned schemas and fixture cases are ready to export into Eval when the plugin adds executable verification.

## Recommendation

SHIP after the tagged cross-platform workflow passes and the six runtime/plugin npm names are available. npm publication and catalog acceptance are operator release actions, not performed by the local rehearsal.
