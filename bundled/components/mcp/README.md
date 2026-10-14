# MCP Server Framework

[![Version](https://img.shields.io/badge/version-1.3.2-black)](https://github.com/kujolang/mcp/releases/tag/v1.3.2)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
[![built with Kujo](https://img.shields.io/badge/built%20with-Kujo-white.svg)](https://github.com/kujolang/kujo)
[![CI](https://github.com/kujolang/mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/kujolang/mcp/actions/workflows/ci.yml)
![Protocol: MCP](https://img.shields.io/badge/protocol-MCP-0969da)

Build MCP (Model Context Protocol) servers in [Kujo](https://github.com/kujolang/kujo).

This project gives you a local MCP server foundation with configurable tools/resources, bounded file operations, and documented guardrails for controlled remote deployments.

## Readiness at a Glance

`mcp` is ready to use as a local MCP server framework, demo implementation, and guarded repo-specific server generator. It is not a universal enterprise certification package by itself; remote production use still needs environment-specific review of auth, network ingress, secret custody, observability, and capacity limits.

| Area | Current status |
|------|----------------|
| Local MCP server | Ready for local development and integration testing |
| File tools/resources | Guarded by configured roots, read-only patterns, size limits, and argument validation |
| `mcp make` generator | Ready for deterministic repo profiling, generated scaffolds, and review artifacts |
| Remote deployment | Baseline guidance and config template provided; operators must validate their own ingress, TLS, auth, and rate limiting |
| Enterprise operations | Strong foundation, but not a completed managed platform with SSO, centralized audit retention, distributed limits, or formal security certification |

## Why Use This

- Build MCP tools and resources directly in Kujo
- Start fast with a working server and demo workspace
- Ship safer defaults with path guards, request limits, and auth controls
- Scale from local development to reverse-proxy deployments
- Generate reviewable repo-specific MCP scaffolds that showcase Kujo's configuration, safety, and artifact-generation strengths

## Who This Is For

- Teams building MCP servers and agent tooling in Kujo
- Developers who want a practical starting point with deployment guardrails
- Projects that need secure file access patterns and configurable runtime controls

## Who This Is Not For

- Teams looking for a fully managed hosted MCP platform
- Workloads requiring built-in distributed/global rate limiting inside this service process
- Projects that cannot run a reverse proxy and external secret management for remote deployment

## Highlights

- Plugin-style tool/resource registration in dedicated modules
- Multi-root workspace support via `permissions.allowed_directories`
- Runtime endpoint gating via `tools.enabled` and `resources.enabled`
- Request guardrails with body-size and local or trusted-gateway rate limits
- Standard MCP initialize, ping, tools, resources, and prompts methods
- Bounded recursive traversal with explicit truncation metadata and optional caching
- Config-driven tool timeout controls
- Security and integration regression test suites
- Deployment baseline template included
- Explicit, effect-gated projection of portable `kujo.ability/v1` definitions into MCP tools
- Metadata-only Watchdog lifecycle helper for client/server tool correlation

## Watchdog telemetry helper

`src/telemetry/watchdog.kujo` maps MCP client or server tool lifecycles into the shared `watchdog.native-event.v1` ingestion contract. It is a pure adapter: it performs no network or database I/O, retains tool/server identity, timing, status, source correlation IDs, approval/risk classification, and input/output byte counts, and never accepts raw tool inputs or outputs. `watchdog_mcp_tool_lifecycle` emits a stable start/completion pair and `watchdog_mcp_trace_metadata` supplies bounded `_meta` propagation fields. The host owns fail-open delivery to Watchdog and should use one trace across the client request, server execution, and nested work while preserving source IDs as references. Propagated values are correlation only and must never select authorization, privacy, retention, tenant, or exporter policy.

## Portable Ability Projection

`src/abilities/projection.kujo` uses the exact canonical `ability` package
revision pinned by Kennel to validate a portable Ability and project it
into an MCP tool descriptor without turning MCP into the semantic source of
truth. Projection is opt-in (`enabled: true`), preserves input and output JSON
Schemas plus canonical Ability identity and definition digest, and defaults to
read-only effects. `ability_registry_to_mcp_tools` projects every enabled
canonical `mcp` exposure and rejects duplicate tool names.
Write, delete, and external effects require an explicit `allowed_effects`
exposure policy. `src/abilities/gateway.kujo` provides the executable bridge
for servers that own an Ability registry. It filters private discovery through
a server-supplied authorization callback, requires a server-resolved
principal, constructs a canonical MCP invocation, delegates policy, approval,
idempotency, and auditing to `execute_ability`, and maps the terminal receipt
into an MCP tool result. Authentication, durable stores, and transport
configuration remain application concerns and are never part of the Ability
definition.

[`integrations/kujo-ability`](integrations/kujo-ability) adds a tested STDIO
bridge plus Codex plugin, Cursor, VS Code, and generic MCP configuration. It
connects to an application's authenticated Ability gateway; it does not turn
the public `mcp.kujolang.ai` catalog into a privileged execution service.
Deployment profiles and the enterprise control checklist are documented in
[`docs/ability-host-deployment.md`](docs/ability-host-deployment.md).

The canonical definition contract is maintained in and consumed directly from
[`kujolang/ability`](https://github.com/kujolang/ability).

The repository-local `kujo.mcp.core@1.0.0` Ability Pack under [`packs/mcp_core`](packs/mcp_core) provides two bounded read-only workflows: a redacted repository-profile summary and validation of one contained generated MCP manifest. It never executes discovered commands or returns sensitive path names. Host projection remains opt-in through the canonical Ability runtime. Applications inspecting a separate project can call `create_mcp_core_ability_registry_for_project(source_root, project_root)`: canonical definitions come from the trusted MCP source, while reads are bound to the selected project. The existing one-root constructor remains supported. Project selection is application configuration, never model-supplied authority.

## Quick Start

### Local Run

```bash
bash scripts/run_server.sh
```

Default endpoint: `http://127.0.0.1:8931/mcp/v1`

Expected health response shape:

```json
{"status":"ok","server":"mcp-demo","version":"1.3.2"}
```

If you want to run the binary directly, resolve the runtime path first:

```bash
bash scripts/find_kujo_runtime.sh
```

### Copilot MCP Config (stdio)

```json
{
  "mcpServers": {
    "mcp": {
      "type": "stdio",
      "command": "kujo-runtime",
      "args": ["run", "/path/to/mcp/server.kujo", "--interpreter"]
    }
  }
}
```

The binary configured in `command` must be the Kujo language runtime binary that supports the `run` subcommand.

Wrapper note: the Kujo runtime exposes `mcp` as a first-party command group (`kujo mcp`), so `kujo mcp make --help` documents the generation flow directly. The legacy top-level `mcp.kujo` entrypoint remains available for development and diagnostics.

Release compatibility: Kujo 1.7.0 or newer contains the first-party `mcp` command group used by this release. The direct `mcp.kujo` invocation below remains available for development and diagnostics.

## Generate Repo-Specific MCP Server

`mcp make` analyzes a local repository and generates a safe, repo-specific MCP server plus review artifacts. The Kujo runtime provides this as a first-class command that resolves the canonical MCP package automatically:

```bash
cd my-project
kujo mcp make
```

To analyze a different repository without changing directories:

```bash
kujo mcp make ./my-project
# or
kujo mcp make /absolute/path/to/my-project
```

Run `kujo mcp make --help` for the full command surface.

Supported options:

```bash
kujo mcp make ./repo-folder --out ./repo-folder/.mcp/generated-server
kujo mcp make ./repo-folder --artifacts ./repo-folder/.mcp/artifacts
kujo mcp make ./repo-folder --profile-only
kujo mcp make ./repo-folder --artifacts-only
kujo mcp make ./repo-folder --no-ai
kujo mcp make ./repo-folder --validate
kujo mcp make ./repo-folder --dry-run
```

Development/diagnostic primitive (not the normal user experience):

```bash
kujo run mcp.kujo --interpreter make ./repo-folder
```

`--artifacts-only` skips the server scaffold and produces only the profile and review artifacts.

Default output layout:

```text
repo-folder/
  .mcp/
    generated-server/
      README.md
      mcp.manifest.json
      repo-profile.json
      mcp-server.json
      src/
        server.kujo
        tools/
        resources/
        prompts/
        safety/
      tests/
      examples/
    artifacts/
      README.md
      repo-map.md
      mcp-surface-plan.md
      safety-review.md
      validation-report.md
      fix-backlog.md
      fix-backlog.json
      agent-handoff.md
      patchbrief.md
      shipcheck.md
      howto.md
      mcp-findings.md
      mcp-findings.json
```

Safety defaults in generated servers:

- Read-only inspection tools are enabled.
- Safe commands are allowlisted and fixed in `mcp.manifest.json`.
- Arbitrary shell command input is not exposed.
- Risky commands are marked blocked/review-required in artifacts.
- Sensitive files are recorded by path only; secret values are not copied into generated outputs.
- Generated resource reads are constrained to the analyzed repository, generated server directory, and artifact directory.
- Generated POST endpoints enforce a bounded request body size.

See detailed command reference: `docs/mcp-make.md`.

## Remote Deployment Baseline

1. Copy `mcp-server.production.example.json` to your runtime `mcp-server.json`.
2. Set a strong value for `auth.token` outside source control.
3. Run behind a TLS-terminating reverse proxy.
4. Keep ingress restricted to trusted clients/services.
5. Use shared/distributed throttling at the gateway for multi-instance deployments.

See full deployment guidance: `docs/production-deployment.md`.

## Documentation

- `demo/README.md`: guided demo workspace for first-time users
- `docs/mcp-reference.md`: endpoint, tool, resource, and validation reference
- `docs/architecture.md`: runtime, generator, and trust-boundary overview
- `ROADMAP.md`: authoritative current and next work
- `docs/mcp-make.md`: repository analysis and generated-server command reference
- `docs/security-model.md`: trust boundaries, threat model, and hardening defaults
- `docs/ability-host-conformance.md`: Ability host support tiers and conformance evidence requirements
- `docs/ability-host-deployment.md`: local, customer-hosted, and managed Ability gateway profiles
- `docs/ability-pack-launch-catalog.md`: versioned CMS, SSG, and MCP launch-pack evidence and deferred-candidate boundary
- `docs/ability-platform-inventory-2026-09-02.md`: immutable cross-repository Ability baseline
- `docs/ability-platform-verification-2026-09-02.md`: cross-repository test evidence and current baseline failures
- `docs/adr/0001-universal-ability-platform.md`: Ability ownership, topology, compatibility, and support-tier decision
- `docs/release-evidence/kujo-ability-1.1.0-preview.md`: reproducible preview-package evidence and claim boundary
- `docs/example-integrations.md`: local and remote integration examples
- `docs/production-deployment.md`: operational deployment baseline and scaling notes
- `docs/contributing-agent-workflow.md`: contributor workflow and completion criteria
- `docs/release-versioning-policy.md`: release and versioning conventions
- `docs/MCP_REVIEW_BACKLOG_2026_06_19.md`: historical production-readiness review evidence

## Project Structure

```text
mcp/
├── server.kujo
├── mcp.kujo
├── mcp-server.json
├── mcp-server.production.example.json
├── src/
│   ├── core/framework.kujo
│   ├── abilities/projection.kujo
│   ├── server/runtime.kujo
│   ├── tools/registry.kujo
│   └── resources/registry.kujo
├── tests/
├── docs/
└── demo/
```

## Testing

```bash
bash tests/run_all_tests.sh
```

## Readiness

This repository is launch-honest as a local protocol-compatible MCP server foundation, repo-specific scaffold generator, and remote-deployment baseline. Production use still requires environment-specific validation, especially for auth, ingress, rate-limit, monitoring, backup, and incident-response settings described in `docs/production-deployment.md`, `docs/security-model.md`, and `ROADMAP.md`.

An experimental [controlled local STDIO Ability mode](docs/controlled-ability-stdio.md)
lets an operator transport bounded evidence into Dispatch review/replay. Standalone
behavior is unchanged; MCP does not become a verifier or replay controller.

## MCP 1.3.2 release scope

This patch corrects canonical file-boundary comparisons on Windows while retaining POSIX filename behavior, traversal rejection and read-only patterns. Kujo 1.7.0 remains the minimum. The separately packaged npm Ability bridge remains at 1.3.1; no bridge reinstall or new host certification is required for this framework-only patch.

## MCP 1.3.1 release scope

Use Kujo 1.7.0 or newer. This release completes the first-class `kujo mcp` handoff, standardizes the demo and generated HTTP transport, enforces generated configuration, bounds recursive scans, adds an optional short-lived index cache and trusted-gateway limiter hook, and strengthens audit-redaction and end-to-end protocol coverage. Historical editor and managed-gateway certificates retain their exact package versions and do not certify newer external hosts.
