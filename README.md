# Kujo for Paperclip

[![Version](https://img.shields.io/badge/version-0.1.5-black)](https://github.com/kujolang/paperclip/releases/tag/v0.1.5)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
[![built with Kujo](https://img.shields.io/badge/built%20with-Kujo-white.svg)](https://github.com/kujolang/kujo)

Add scoped context, change review, and reproducible failure evidence to Paperclip.

## Install

You need Paperclip `2026.824.1` or later and Node.js `24.11.0` or later.

```bash
npx paperclipai plugin install @kujolang/paperclip
```

Restart Paperclip if it is already running. Kujo appears automatically inside Paperclip's current task view. On project and run pages, open the **Kujo** tab. You do not need to switch to the Classic Task Interface.

The npm package includes the correct Kujo runtime for macOS arm64/x64, Linux arm64/x64, and Windows x64. Installation does not run `preinstall`, `install`, or `postinstall` scripts.

See [Installation](docs/INSTALLATION.md) for upgrades, local development installs, and uninstall behavior.

## Use

Open an issue to use the inline Kujo workspace, or open the **Kujo** tab on a project, issue detail page, or run to:

- generate a **Review Pack** for the working tree;
- create a task-specific **Context Pack**;
- capture bounded, redacted **Failure Evidence**.

Agents can call four tools:

| Tool | Use |
| --- | --- |
| `kujolang.paperclip:review-changes` | Measure change size and create a review handoff. |
| `kujolang.paperclip:capture-failure` | Save supplied command output as redacted evidence. It never reruns the command. |
| `kujolang.paperclip:get-context` | Select a bounded set of files for a task. |
| `kujolang.paperclip:get-context-content` | Read safe content from files selected by an existing Context Pack. |

Example agent requests:

```text
Use kujolang.paperclip:get-context with task "trace the OAuth callback" and depth "focused".
Use kujolang.paperclip:review-changes after the edit and report the suggested tests as suggestions, not completed checks.
If a check fails, use kujolang.paperclip:capture-failure with the command, exit code, and bounded log.
```

The content tool only reads files selected by the matching Context Pack. It rejects other paths, binary files, oversized files, traversal, and symlink escapes.

See [Usage](docs/USAGE.md) for tool inputs, UI actions, artifact fields, and common workflows.

## What it adds

- **Review Pack** uses ChangeBucket to measure the change and PatchBrief to explain it.
- **Failure Evidence** uses CaseFile to turn supplied logs into a reviewable record.
- **Context Pack** uses Scent to select relevant files before an agent reads broadly.

All four component snapshots are pinned, checksummed, and shipped in the package. The plugin does not fetch component code at runtime.

## Compatibility

| Package | Version |
| --- | --- |
| Paperclip host | `>=2026.824.1` |
| `@paperclipai/plugin-sdk` | `2026.824.1` |
| `@kujolang/kujo-runtime` | `1.2.2` |
| Node.js | `>=24.11.0` |

The npm package is `@kujolang/paperclip`. Its Paperclip manifest ID is `kujolang.paperclip` because manifest IDs do not accept npm scope syntax.

## Configure

Paperclip builds the settings form from the plugin manifest. You can enable or disable each feature, set an absolute Kujo binary override, allow or deny `PATH` fallback, and change bounded process limits.

Defaults are safe for normal repositories: a 27-second timeout, 2 MB stdout limit, and 256 KB stderr limit. The timeout stays below Paperclip's bridge deadline so the worker can return a structured result. See [Configuration](docs/CONFIGURATION.md) for every setting and limit.

## How it runs

The worker resolves Kujo in this order:

1. configured absolute binary;
2. bundled `@kujolang/kujo-runtime` binary;
3. an absolute `kujo` found on `PATH`, when allowed;
4. a structured error with a repair hint.

Each child process uses an argument array with `shell: false`, a small environment, a canonical Paperclip workspace, a timeout, and output caps. Review and context commands are read-only. Failure Evidence records supplied text and never exposes a command runner.

## Develop

```bash
npm ci --ignore-scripts
npm run verify
```

`npm run verify` type-checks the source, runs contract, hardening, and real-component tests, verifies component checksums, audits dependency integrity and licenses, produces an SBOM, builds the worker/manifest/UI bundles, and inspects the npm tarball.

Read [AGENTS.md](AGENTS.md) before agent-assisted changes and [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Documentation

- [Documentation index](docs/README.md)
- [Installation](docs/INSTALLATION.md)
- [Usage](docs/USAGE.md)
- [Configuration](docs/CONFIGURATION.md)
- [Compatibility](docs/COMPATIBILITY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Threat model](docs/THREAT_MODEL.md)
- [Security policy](SECURITY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Release readiness](docs/RELEASE_READINESS.md)
- [Operations](docs/OPERATIONS.md)
- [Maintenance handoff](docs/MAINTENANCE_HANDOFF.md)
- [Agent workflow example](examples/agent-workflow.md)

## License

MIT. Bundled Kujo components keep their canonical MIT licenses and recorded provenance.
