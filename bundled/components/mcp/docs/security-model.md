# Security Model

This document defines trust boundaries, threat assumptions, and hardening defaults for the MCP server framework.

## Trust Boundaries

- The MCP server process is trusted to enforce path, request-shape, and tool-level input checks.
- The configured `allowed_directories` tree is the only writable/readable filesystem boundary for tool file operations.
- MCP clients are untrusted by default, including local clients, remote clients, and automated agents.
- Network traffic outside explicit local-only host policy should be treated as hostile unless auth is enabled.

## Threat Model

### In Scope

- Path traversal and sibling-prefix bypass attempts for read/write tool inputs.
- Unsafe writes to read-only targets (`read_only_patterns`) and oversized payload/file operations (`max_file_size`).
- Malformed JSON and malformed JSON-RPC envelope shapes.
- Unauthorized use of endpoints when auth is configured.
- Misconfiguration risks that could weaken defaults (invalid host/auth/tool/resource config values).

### Out of Scope

- Full sandboxing of arbitrary process execution outside the Kujo server process.
- Host-level compromise, kernel compromise, or compromised CI/CD runners.
- Cryptographic key management and secret rotation automation.

## Hardening Defaults

- Startup fails fast on invalid `mcp-server.json` structure or required key/value violations.
- Request-shape validation returns deterministic JSON-RPC errors for missing/invalid envelope fields.
- Canonical path boundary checks reject traversal and sibling-prefix bypasses.
- `read_only_patterns` enforce deny rules for write operations.
- `max_file_size` is enforced in both read and write helper paths.
- Configurable host policy and optional `bearer`/`api_key` auth checks are available.
- Tool timeout defaults are enforced from `tools.default_timeout_ms` where timeout-aware handlers are implemented.
- Request body size and per-minute request-rate guardrails are enforced from HTTP config.
- Generated servers constrain manifest-declared resource reads to the analyzed repository, generated server directory, and artifact directory.
- Generated servers enforce a bounded POST request body size in addition to the primary demo server's configurable request guardrails.
- Portable Ability projection is opt-in and effect-gated; read-only is the default exposure policy, and projection never grants runtime permission or registers a handler.

## Validation and Regression Coverage

- `tests/test_02_security_regression_suite.sh` aggregates Tier 0 regression checks.
- Security-related suites include:
  - `tests/sec_01_path_guard.kujo`
  - `tests/sec_02_read_only_patterns.kujo`
  - `tests/sec_03_tool_path_sanitization.sh`
  - `tests/sec_04_request_validation.sh`
  - `tests/sec_05_file_size_limits.sh`
  - `tests/sec_06_network_auth.sh`
  - `tests/sec_07_tool_argument_validation.sh`
  - `tests/feat_06_mcp_make.sh` verifies generated-server resource-root and request-size guardrail emission.
  - `tests/test_07_ability_projection.kujo` verifies explicit exposure, schema/identity preservation, and default denial of write effects.

## Operational Guidance

- Keep host binding local unless remote access is explicitly required.
- Enable auth whenever host policy permits non-local traffic.
- Treat read-only patterns as deny-first and keep them specific.
- Run `tests/test_02_security_regression_suite.sh` after any permission, parsing, or auth changes.

## Remote Deployment Baseline

This is hardening guidance for remote use, not a formal security audit or certification claim.

- Terminate TLS at a reverse proxy or ingress and only expose HTTPS to clients.
- Bind the Kujo server to an internal interface, and restrict direct network access to the proxy layer.
- Keep `auth.enabled` set to `true` with a strong secret token managed outside version control.
- Keep request guardrails enabled (`http.max_request_body_bytes` and rate-limit settings).
- For horizontal scaling, enforce shared/distributed rate limits at the gateway, load balancer, or API gateway layer.
