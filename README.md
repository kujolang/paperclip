# Kujo for Paperclip

[![Version](https://img.shields.io/badge/version-0.1.6-black)](https://github.com/kujolang/paperclip/releases/tag/v0.1.6)
[![npm](https://img.shields.io/npm/v/%40kujolang%2Fpaperclip?label=npm&color=black)](https://www.npmjs.com/package/@kujolang/paperclip)
[![CI](https://img.shields.io/github/actions/workflow/status/kujolang/paperclip/ci.yml?branch=main&label=CI&color=black)](https://github.com/kujolang/paperclip/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
[![built with Kujo](https://img.shields.io/badge/built%20with-Kujo-white.svg)](https://github.com/kujolang/kujo)

Kujo helps Paperclip agents choose useful context, review changes, and save clear
failure evidence. It runs locally inside Paperclip and works in the current task view.
You do not need the Classic Task Interface.

## Install in 30 seconds

You need Paperclip `2026.824.1` or later and Node.js `24.11.0` or later.

```bash
npx paperclipai plugin install @kujolang/paperclip
```

Restart Paperclip if it is already running, then open an issue. The Kujo workspace
appears in the task view. You can also open the **Kujo** tab on project, issue detail,
and run pages.

The npm package includes the right Kujo runtime for macOS arm64/x64, Linux arm64/x64,
and Windows x64. You do not need a separate Kujo install or Kujo API key. Installation
does not run `preinstall`, `install`, or `postinstall` scripts.

Use the package name exactly as shown for now. Current Paperclip releases mishandle a
scoped package with an exact version suffix. The upstream fix is open in
[paperclipai/paperclip#12745](https://github.com/paperclipai/paperclip/pull/12745).

See [Installation](docs/INSTALLATION.md) for upgrades, local development installs,
uninstall behavior, and release checks.

## First use

1. Open the Paperclip issue you want to work on.
2. Generate a focused **Context Pack** before the agent reads the repository broadly.
3. Make and test the change with the project's normal tools.
4. Generate a **Review Pack** to inspect scope, risk, and suggested checks.
5. If a command fails, save its bounded output as **Failure Evidence**.

Kujo stores the latest result in Paperclip plugin state. It does not write reports into
the project repository.

## What Kujo adds

| Workflow | What it does | Kujo component |
| --- | --- | --- |
| **Context Pack** | Selects a small, task-specific set of files before an agent reads broadly. | Scent |
| **Review Pack** | Measures change size, explains risk signals, and prepares a review handoff. | ChangeBucket and PatchBrief |
| **Failure Evidence** | Turns supplied command details and logs into a bounded, redacted record. | CaseFile |

The four component snapshots are pinned, checksummed, and shipped with the plugin. The
plugin does not download component code while installing or running.

## Agent tools

Paperclip agents can call four tools:

| Tool | Use |
| --- | --- |
| `kujolang.paperclip:get-context` | Select files for a task at minimal, focused, or broad depth. |
| `kujolang.paperclip:get-context-content` | Read safe content from files already selected by a Context Pack. |
| `kujolang.paperclip:review-changes` | Measure a working tree or Git range and create a review handoff. |
| `kujolang.paperclip:capture-failure` | Save supplied command output as redacted evidence. It never runs the command. |

Example requests:

```text
Use kujolang.paperclip:get-context with task "trace the OAuth callback" and depth "focused".
Read only the selected files needed for the change.
Use kujolang.paperclip:review-changes after the edit.
Report suggested tests as suggestions, not completed checks.
If a check fails, use kujolang.paperclip:capture-failure with the command, exit code, and bounded log.
```

The content tool reads only files selected by the matching Context Pack. It rejects
other paths, binary files, oversized files, traversal, and symlink escapes.

See [Usage](docs/USAGE.md) for all tool inputs, UI actions, artifact fields, and the
recommended agent sequence.

## Compatibility

| Package | Version |
| --- | --- |
| Paperclip host | `>=2026.824.1` |
| `@paperclipai/plugin-sdk` | `2026.824.1` |
| `@kujolang/kujo-runtime` | `1.2.3` |
| Node.js | `>=24.11.0` |

The npm package is `@kujolang/paperclip`. Its Paperclip manifest ID is
`kujolang.paperclip` because manifest IDs do not accept npm scope syntax.

The plugin tests the minimum supported Paperclip SDK and the latest compatible SDK in
CI. Its manifest temporarily accepts the host's `0.0.0` fallback until Paperclip ships
the host-version fix in PR #12745; the documented and tested support floor remains
`2026.824.1`.

## Configure

Paperclip builds the settings form from the plugin manifest. You can turn each feature
on or off, set an absolute Kujo binary override, allow or deny `PATH` fallback, and
change bounded process limits.

The defaults suit normal repositories: a 27-second timeout, 2 MB stdout limit, and
256 KB stderr limit. The timeout stays below Paperclip's bridge deadline so the worker
can return a structured result. See [Configuration](docs/CONFIGURATION.md) for every
setting and limit.

## How it runs

The worker looks for Kujo in this order:

1. a configured absolute binary;
2. the bundled `@kujolang/kujo-runtime` binary;
3. an absolute `kujo` found on `PATH`, when allowed;
4. a structured error with a repair hint.

Each child process receives an argument array with `shell: false`, a small environment,
a canonical Paperclip workspace, a timeout, and output caps. Review and Context Pack
commands are read-only. Failure Evidence records supplied text and never exposes a
command runner.

## Develop

```bash
npm ci --ignore-scripts
npm run verify
npx playwright install chromium
npm run test:ui
```

`npm run verify` checks repository conventions, types, contracts, hardening,
real-component behavior, component checksums, dependency integrity, licenses, the
SBOM, bundles, and the npm tarball. The Playwright suite covers both Paperclip UI
surfaces, their actions, responsive layouts, accessibility, and approved screenshots.

Read [AGENTS.md](AGENTS.md) before agent-assisted changes and
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

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

MIT. Bundled Kujo components keep their canonical MIT licenses and recorded
provenance.
