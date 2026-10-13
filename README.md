# Kujo for Paperclip

[![Version](https://img.shields.io/badge/version-0.1.9-black)](https://github.com/kujolang/paperclip/releases/tag/v0.1.9)
[![npm](https://img.shields.io/npm/v/%40kujolang%2Fpaperclip?label=npm&color=black)](https://www.npmjs.com/package/@kujolang/paperclip)
[![CI](https://img.shields.io/github/actions/workflow/status/kujolang/paperclip/ci.yml?branch=main&label=CI&color=black)](https://github.com/kujolang/paperclip/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
[![built with Kujo](https://img.shields.io/badge/built%20with-Kujo-white.svg)](https://github.com/kujolang/kujo)

Kujo helps Paperclip agents choose useful context, review changes, and save clear
failure evidence. It runs locally inside Paperclip and works in the current task view.
You do not need the Classic Task Interface.

> Development documentation: the workflows below include the unpublished expansion
> on `main`. Public npm `0.1.9` provides Context Packs, Review Packs and Failure
> Evidence; it does not yet include the new Eval controls or broader adapters.

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
does not run `preinstall`, `install`, or `postinstall` scripts. Configured runtime
overrides require Kujo 1.8.1 or newer.

Use the package name exactly as shown for now. Current Paperclip releases mishandle a
scoped package with an exact version suffix. The upstream fix is open in
[paperclipai/paperclip#12745](https://github.com/paperclipai/paperclip/pull/12745).

See [Installation](docs/INSTALLATION.md) for upgrades, local development installs,
uninstall behavior, and release checks.

## First use

The Kujo panel checks the runtime and bundled components before enabling its
actions. **Needs attention** includes repair guidance when the configured binary
is missing, incompatible, or not Kujo. Correct the configuration, then select
**Check again**. Disabled features remain unavailable even when the runtime is healthy.

1. Open the Paperclip issue you want to work on. Kujo explains whether its workspace
   is missing, empty, clean, or ready to review. The context task starts with the
   issue title and description; edit it to narrow the work.
2. Select **Try the Kujo example** to check and run a small bundled program. It
   demonstrates structured data, a function, and JSON output without a repository,
   network access, or credentials. View its source and result in the panel.
3. Choose **Understand this repository** for a bounded Scout map, then generate a focused **Context Pack** before the agent reads the repository broadly.
4. Make and test the change with the project's normal tools.
5. Generate a **Review Pack** to inspect scope, risk, and suggested checks.
6. If a command fails, save its bounded output as **Failure Evidence**.

Kujo retains up to 20 results per company/entity for 30 days in its Paperclip database namespace. Inspect, compare, or download redacted records in **Evidence history**. On an issue, an authenticated human can explicitly attach a record as an issue document. Kujo does not write reports into the project repository. Bundled component imports are isolated from project modules.

## What Kujo adds

| Workflow | What it does | Kujo component |
| --- | --- | --- |
| **Release readiness** | Detects missing metadata and documentation signals with a native gate; tests and linters are not executed. | ShipCheck |
| **Artifact drift** | Compares documentation, metadata, examples and contracts; reports experimental drift leads and coverage. | Concord |
| **Architecture boundaries** | Checks import boundaries against Fence policy and reports findings, coverage and the configured failure threshold. | Fence |
| **Task contracts** | Validates a declared task contract and shows acceptance criteria and checks as not-run. | Spec |
| **Package inspection** | Validates Kennel declarations and parses adjacent lock records without resolving or installing dependencies. | Kennel |
| **Kujo source tools** | Checks and lints a selected source file; previews formatting without applying changes. | Kujo runtime |
| **Repository understanding** | Maps project structure, languages, dependencies, routes and heuristic observations; shows partial scans explicitly. | Scout |
| **Context Pack** | Selects a small, task-specific set of files before an agent reads broadly. | Scent |
| **Review Pack** | Measures change size, explains risk signals, and prepares a review handoff. | ChangeBucket and PatchBrief |
| **Failure Evidence** | Turns supplied command details and logs into a bounded, redacted record. | CaseFile |

The thirteen component snapshots are pinned, checksummed, and shipped with the plugin. The
plugin does not download component code while installing or running. The Eval snapshot
provides human-approved execution on issue workspaces.

## Build with Kujo

Select a Git-visible `.kujo` file in **Build with Kujo**, then choose **Check and lint source** or **Preview formatting**. Diagnostics identify the file and location. Formatting shows the redacted original and proposed output without applying changes. These are single-file source checks; they do not execute project code or establish that imports, project tests, or runtime behavior work. Files are limited to 64 KiB, and each source operation has a bounded runtime window.

Select a Git-visible `kennel.toml` in **Kujo packages**, then choose **Inspect packages**.
The panel shows canonical validation errors and warnings, declared sources and
selectors, and adjacent lockfile records. It does not install dependencies or
verify installed bytes, lock digests, source availability or dependency compatibility.
Local dependency paths remain declarations and are never followed. Missing,
unreadable, malformed or unsupported lockfiles are explicit. See [package inspection](docs/USAGE.md#inspect-kujo-packages) for bounds and retained evidence.

## Run or test Kujo

Enable **Human-approved Kujo run/test** in company settings and select Installed,
Build or Full. On an issue, choose a script, a test file, or the project's fixture
tests in **Run or test Kujo**. Preview the fixed native command, request approval,
accept its human-only issue card, then explicitly start it. Changing source or
settings invalidates the old approval.

Runs use a bounded temporary copy of Git-visible text. Ignored dependencies,
binary resources and credentials are not supplied; relative output is removed.
Code remains trusted and can affect host files, processes or the network. Native
exit/output and linked receipts are retained; exit zero alone does not establish
that tests ran or the whole project passed. These are one-shot commands capped at
27 seconds, not persistent API/MCP services or project creation. See
[run/test modes and limits](docs/EXECUTION.md#native-source-and-tests).

## Kujo starters

**Start building with Kujo** previews a local script, fixture-provider AI agent, SQLite CRUD API or MCP server
using the selected runtime's canonical generators or pinned application source. Review every proposed file and
download the review JSON, even without a configured workspace. Previews do not
create project files, install dependencies or execute the generated program.
The agent starter includes instructions, schemas, capability policy and evaluation;
its pinned Kennel dependencies must be installed before use. The API includes the canonical backend, loopback defaults, SQLite persistence, API contracts and setup guidance; previewing it never opens a port or creates a database. The MCP starter includes a local framework and contained demo files, with explicit root/auth settings and client setup. See [starter previews](docs/USAGE.md#preview-kujo-starters).

## Create an approved Kujo project

Enable **Human-approved Kujo project creation** and select Installed, Build or
Full. On an issue with a local workspace, choose a script, SQLite API, MCP server
or fixture AI agent in **Create a Kujo project**. Review its files and destination,
request approval, accept the human-only issue card, then select **Create approved
files**. An empty workspace works without Git.

Creation uses canonical preview bytes and native no-overwrite file copies. It
never installs dependencies, starts a server or runs the generated program.
Interrupted creation may leave files; inspect the receipt before another request.
After creation, run the script through **Run or test Kujo**, or read the generated
README for application setup. See [creation and recovery](docs/EXECUTION.md#approved-starter-creation).

## Evidence history

Terminal Eval and source/test requests retain linked request-plan and outcome records here. You
can select the related plan, compare outcomes, export both records, or explicitly
attach them to the issue. Pending history saves can be retried without rerunning
the suite. New requests include a portable Ability receipt with explicit native
classification and request-lifecycle timing; legacy records remain observed history;
see [execution history](docs/EXECUTION.md#retained-execution-history) for retention
and clear behavior.

The upcoming release requires Paperclip database namespace migrations and authenticated issue-document actions. Upgrade the host before installing it. Legacy latest records migrate on first access, with missing input/definition provenance explicitly marked unknown. Retained payloads have SHA-256 integrity checks; a redacted export carries its own digest. Suggested tests remain suggestions, and supplied failure logs remain supplied evidence.

## Run approved evaluations

Enable **Human-approved Eval execution** in company settings and select Installed,
Ship or Full. On an issue, **Run an evaluation** previews a Git-visible JSON Eval
suite. Select **Request approval**, review and accept its human-only confirmation
in the issue thread, then select **Start approved evaluation**. Approval never
starts a run automatically. Changed inputs or settings require a new request.

Suites can run commands, use the network and write files. Inputs are bounded
private copies of Git-visible text; ignored dependencies and external resources
are not frozen. Omitted inputs make a native pass explicitly partial. Receipts
preserve canonical failed/skipped checks and uncertainty; a successful process
exit alone is not evidence that the project passed. Use **Refresh requests** to
recover retained requests after reload, inspect their receipts or cancel active
work. Cancellation remains available after disabling execution.

Agents use `manage-evaluation` with an issue ID verified against their host-owned
assignment and current run. They can request approval but cannot accept it, and
can start/cancel only their own run's requests. See [Approved execution](docs/EXECUTION.md)
for inputs, limits and recovery behavior.

## Verification evidence

Enable **Verification** in company settings to review a Git-visible `.spec.json`, `.spec.yml`, `.spec.yaml` or `.spec.toml` task contract. The native Spec validator reports contract errors and warnings; strict mode treats warnings as failures. Acceptance criteria and declared checks remain **not-run**, and declared approval points do not grant approval. No workspace files or check commands are executed or changed.

Select **Inspect release readiness** to review ShipCheck’s 16 repository, code-quality, documentation and release metadata signals. Git detection uses the real workspace; artifact checks use private copies. The native gate can pass with warnings, and omitted inputs make coverage partial. Essentials exposes this adapter when Verification is enabled, while other verification tools retain their own profile restrictions.

Select **Inspect artifact drift** to compare README, manifests, changelog, task contracts, evaluation declarations, docs and examples with native Concord. Findings retain severity, confidence, source/target, expected/observed differences and suggested fixes. Omitted files and native discovery bounds produce partial results; these experimental leads require review.

Select **Inspect architecture** to evaluate the workspace root `fence.toml` or `fence.json` with native Fence. Findings show files, lines, zones and ownership. Partial coverage, policy exceptions and stale evidence remain visible; meeting `fail_on` does not mean the project or its tests passed. Configured parser commands are blocked.

The same setting lets you import `kujo.evaluation-result/v1` JSON, including Eval's `evaluation-result.json`. The panel distinguishes imported pass/fail claims, warnings, skipped-only or empty runs, partial runs, blocked evaluations and errors. It validates the pinned canonical schema and stores a redacted summary with the supplied-byte digest. It does not authenticate the producer, open evidence references, or establish that the result applies to this workspace. See [Verification imports](docs/VERIFICATION.md).

## Explore Kujo

**Explore Kujo** shows the installed Paperclip adapters, feature/profile selection, platform support, runtime readiness and call-time authorization boundary. Expand the canonical catalog to discover 38 reviewed Kujo Ability definitions. Entries marked **Not integrated yet** are discovery references; their presence does not install a tool or make it executable.

The default `installed` profile preserves all existing tools. Optional `essentials`, `review`, `ship` and `full` selections use the pinned canonical profile memberships; `build` selects Paperclip's source, package inspection, context and repository-understanding tools. Feature switches still apply. Change the company profile in plugin settings. No profile grants execution approval.

The plugin ships pinned, checksummed Ability contracts/catalogs and generates its manifest tool declarations from reviewed Paperclip projections. Canonical local path/output parameters are not passed through: Paperclip resolves company/workspace identity and retains its own evidence. See [Ability integration](docs/ABILITIES.md).

## Agent tools

Paperclip agents can call nineteen tools:

| Tool | Use |
| --- | --- |
| `kujolang.paperclip:manage-kujo-starter` | Preview and create approved canonical starter files in a new issue-workspace directory. No overwrite, dependency installation or generated-program execution. |
| `kujolang.paperclip:manage-kujo-execution` | Preview, request approval, start, inspect or cancel a fixed native run/test on the assigned issue/current run. Separate opt-in and human approval required. |
| `kujolang.paperclip:manage-evaluation` | Inspect, prepare, start, read or cancel an approved Eval suite on the assigned issue/current run. Human approval is required before execution. |
| `kujolang.paperclip:inspect-release-readiness` | Inspect native release metadata signals and coverage; never executes tests or certifies a release. |
| `kujolang.paperclip:inspect-artifact-drift` | Inspect artifact alignment with native Concord; no project commands, examples or tests run. |
| `kujolang.paperclip:inspect-architecture` | Inspect a bounded snapshot against the workspace Fence policy; no project commands or tests run. |
| `kujolang.paperclip:inspect-task-contract` | Validate one Git-visible Spec contract; inspect declared outcomes without executing checks. |
| `kujolang.paperclip:import-verification` | Retain a redacted, explicitly imported evaluation summary; never runs checks. |
| `kujolang.paperclip:list-capabilities` | Discover scoped tool readiness, profiles and optional ecosystem integrations. |
| `kujolang.paperclip:list-evidence` | List retained receipts in the current project or run. |
| `kujolang.paperclip:get-evidence` | Read one redacted export, bounded to 64 KiB. |
| `kujolang.paperclip:inspect-kujo-packages` | Inspect a Git-visible Kennel manifest and adjacent lockfile without resolution, installation or project execution. |
| `kujolang.paperclip:check-kujo-source` | Check and lint one eligible project-relative `.kujo` source. |
| `kujolang.paperclip:preview-kujo-format` | Explicitly read and preview redacted formatting without writing files. |
| `kujolang.paperclip:understand-repository` | Inspect the host-resolved repository without accepting a caller path or changing project files. |
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
| `@paperclipai/plugin-sdk` | `2026.1012.0` |
| `@kujolang/kujo-runtime` | `1.8.1` |
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

Development status: the [approved execution workflow](docs/EXECUTION.md)
includes company-scoped host admission, bounded suite previews, durable request limits
and an opt-in authenticated host acceptance harness. Public Eval and separately enabled run/test controls are available on issues; long-running workflow integrations remain unfinished.
