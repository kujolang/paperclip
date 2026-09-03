# v0.1 release readiness

## Gates

| Gate | Local result |
| --- | --- |
| TypeScript strict typecheck | automated by `npm run verify` |
| Unit/contract tests | automated by Vitest |
| Browser behavior and visual baselines | automated by Playwright in `browser-ui` CI |
| Official Paperclip SDK worker harness | automated by Vitest |
| Real ChangeBucket/PatchBrief fixture | automated by Vitest |
| Real CaseFile redaction fixture | automated by Vitest |
| Real Scent relevance/budget fixture | automated by Vitest |
| Component SHA-256/provenance | `components:verify` |
| Dependency audit, integrity, licenses, and SBOM | `supply-chain:verify` |
| Tenant isolation and stored-state validation | automated by Vitest |
| Feature-policy enforcement on tools and UI bridges | automated by Vitest |
| Hostile Git configuration suppression | automated by Vitest |
| Timeout, cancellation, and descendant-process cleanup | automated by Vitest |
| Oversized workspace rejection | automated by Vitest |
| Worker/manifest/UI bundles | esbuild with official SDK preset |
| npm tarball contents | `pack:verify` |
| Runtime resolver/package tests | owned by the Kujo runtime repository |

The release order is platform runtime packages, neutral `@kujolang/kujo-runtime`, component sync/verification, plugin tarball clean-install verification, then `@kujolang/paperclip`. Platform binaries and the resolver must use the same Kujo version. The resolver is published last among runtime packages so it never points to missing versions.

## Matrix

The runtime release workflows build and smoke macOS arm64/x64, Linux arm64/x64, and Windows x64. Paperclip CI tests those five targets. A separate compatibility matrix tests Node.js 24.11 and current Node.js 24 against the minimum, locked, and latest compatible Paperclip SDK versions. Local plugin feature execution is verified on the developer host; every supported target is exercised during a tagged release.

The tag workflow accepts only an annotated tag with a GitHub-verified SSH or PGP signature whose name matches `package.json`. It verifies the repository, packs once, attests that tarball, publishes that exact file through npm trusted publishing with short-lived OIDC credentials, and attaches its checksum, CycloneDX SBOM, component lock, and JSON schemas to the GitHub release. Package settings require two-factor authentication and disallow traditional token publishing.

## Performance bounds

- component timeout: 27 seconds, below the Paperclip bridge deadline
- stdout: 2 MB; stderr: 256 KB
- Failure Evidence input: 200 KB with explicit middle truncation
- Git-visible workspace: 100,000 files and 25 MB per file before component execution
- Context presets: approximately 4K/16K/40K tokens and 2/3/4 files
- context file: 2 KB during selection and 1 MB hard read refusal
- Review file rows retained by canonical output; UI eagerly renders at most 20 context entries and 12 suggested tests

The v0.1 deterministic contract suite remains in Vitest because these contracts combine the Paperclip SDK harness, native-process bounds, filesystem escape checks, and JSON assertions directly. Playwright separately renders both registered UI surfaces in a deterministic SDK fixture, exercises every primary action, verifies the project, issue, and read-only run states, and compares desktop-light and narrow-dark screenshots. Kujo Spec/Eval would add a second contract runner without improving determinism for this release; the versioned schemas and fixture cases are ready to export into Eval when the plugin adds executable verification.

## Release decision

SHIP only after the protected-branch checks, browser UI suite, and compatibility workflow pass; the signed-tag workflow succeeds; the seven runtime/plugin npm names are available; a clean-room npm install passes; and a real Paperclip host loads the published package and exercises its tools.
