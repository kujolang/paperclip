# Kujo for Paperclip

Make Paperclip agent work easier to scope, review, reproduce, and verify.

```bash
npx paperclipai plugin install @kujolang/paperclip
```

The plugin gives Paperclip projects three local, read-only-by-default features:

- **Review Pack** measures change footprint with ChangeBucket and creates a structured implementation handoff with PatchBrief.
- **Failure Evidence** converts bounded logs into persistent, defensively redacted CaseFile evidence without rerunning a command.
- **Context Pack** uses Scent to select task-relevant files before an agent spends tokens reading content.

Kujo powers the features but is not a prerequisite. `@kujolang/kujo-runtime` installs the correct native runtime as an optional platform package. No package uses `preinstall`, `install`, or `postinstall`; Paperclip's `--ignore-scripts` installation remains fully supported.

## Compatibility

| Package | Supported version |
| --- | --- |
| Paperclip host | `>=2026.824.1` |
| `@paperclipai/plugin-sdk` | `2026.824.1` |
| `@kujolang/kujo-runtime` | `1.2.0` |
| Node.js | `>=24.11.0` |

Supported native targets are macOS arm64/x64, Linux arm64/x64, and Windows x64.

The npm package is `@kujolang/paperclip`; the manifest ID is `kujolang.paperclip` because Paperclip manifest IDs must be lowercase identifiers and do not accept npm scope syntax. Explicit CLI installation supports the requested package name even though Paperclip's automatic discovery convention prefers scoped names beginning with `plugin-`.

## Use

Open an issue, project, or run and select the **Kujo** detail tab. Issue/project tabs can generate Review and Context Packs. Agents can call:

- `kujolang.paperclip:review-changes`
- `kujolang.paperclip:capture-failure`
- `kujolang.paperclip:get-context`
- `kujolang.paperclip:get-context-content`

The second context tool can only read files already selected by the first. Suggested tests are always labeled suggestions; the plugin never claims they ran.

## Runtime resolution

The worker resolves Kujo in this order:

1. administrator-configured absolute binary;
2. bundled `@kujolang/kujo-runtime` binary;
3. an absolute `kujo` on `PATH`, if enabled;
4. a structured diagnostic error.

Every child process uses argument arrays with `shell: false`, a minimal environment, time and output limits, and a canonical Paperclip workspace path.

## Component bundle

`npm run components:sync` copies exact files from clean local canonical repositories at pinned commits. `npm run components:verify` recalculates every SHA-256 before release and runtime execution. The lock records repository, commit, version, license, entrypoint, files, checksums, and output contracts. The installed plugin performs no network fetch.

Scent is the canonical Context Pack component because it is task-specific, bounded, deterministic, and redaction-aware. Scout is a broader repository intelligence scanner and is intentionally not shipped in v0.1.

## Development and release rehearsal

```bash
npm install --ignore-scripts
npm run components:verify
npm run verify
```

`npm run verify` type-checks, runs the official Paperclip SDK harness and real Kujo fixture tests, checks component integrity, builds all entrypoints, and inspects the npm tarball. `npm run release:dry-run` is the same release gate. Runtime platform packages must be published first, the neutral runtime second, and this plugin last.

## Privacy and security

All analysis is local. The plugin does not send source or diffs to a model or remote service, expose a generic command runner, inherit arbitrary environment variables, or accept workspace paths from tools. Context file content is opt-in, bounded, restricted to selected files, protected against traversal/symlink escape, and redacted again before return. Failure Evidence never stores original values that were redacted.

See [architecture](docs/ARCHITECTURE.md), [threat model](docs/THREAT_MODEL.md), [release readiness](docs/RELEASE_READINESS.md), and [troubleshooting](docs/TROUBLESHOOTING.md).

## Upgrade and uninstall

Schema version 1 artifacts remain readable across compatible 0.1 patch releases. A future breaking normalized schema requires a major plugin version. Paperclip's ordinary uninstall retains plugin data for its host-defined recovery window; an explicit purge removes plugin data. Neither operation writes to or deletes project source.

## License

MIT. Bundled components retain their canonical MIT license and provenance.

