# MCP Reference

This page contains detailed protocol and capability reference material for the MCP server.

## Endpoint Reference

Base path: `/mcp/v1`

For generated servers produced by `mcp make`, the default generated endpoint is `http://127.0.0.1:8941/mcp/v1`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/` | Standard JSON-RPC MCP transport (`initialize`, `ping`, tools, resources, prompts) |
| POST | `/tools/list` | List available tools |
| POST | `/tools/call` | Call a tool with arguments |
| POST | `/resources/list` | List available resources |
| POST | `/resources/read` | Read a resource by URI |
| GET | `/logs` | Read recent call logs |

Server identity fields returned by `/` and `/health` (`server`, `version`) are sourced from `mcp-server.json` under `server.name` and `server.version`.

## Tool Reference (Demo Server)

| Tool | Description |
|------|-------------|
| `read_project_docs` | Read documentation files by safe base filename with in-scope fallback |
| `search_files` | Search by filename or file content with recursion, bounded results, and timeout control |
| `generate_summary` | Generate a summary of project documentation |
| `write_safe_patch` | Write safe patches under path/read-only/file-size guardrails |
| `read_text_range` | Read a specific line range from a text file |
| `write_text_safe` | Write text safely with optional create-if-missing behavior (existing files are overwritten) |
| `list_tree_recursive` | Recursively list files and directories with depth limits |
| `grep_text` | Recursively search file contents using literal or regex mode |

## Resource Reference (Demo Server)

| Resource | Description |
|----------|-------------|
| `project://docs` | List and read project documentation files |
| `files://tree` | File tree overview across configured allowed directories |
| `log://calls` | Recent tool call history |
| `prompt://onboarding` | Reusable onboarding prompt content |
| `workflow://checklist-loop` | Reusable one-loop checklist workflow template |

## Validation Model

- Request-shape validation is enforced for MCP envelopes.
- Tool parameter schemas are exposed for discoverability via `tools/list`.
- Detailed argument validation is enforced by tool handlers.
- Required tool arguments return deterministic, field-specific errors (for example, `file_name is required`).
- Request guardrails are controlled by:
  - `http.max_request_body_bytes`
  - `http.rate_limit_enabled`
  - `http.rate_limit_per_minute`
  - `http.rate_limit_strategy` (`local` or fail-closed `external` gateway attestation)

## Portable Ability Projection

`ability_to_mcp_tool` in `src/abilities/projection.kujo` accepts a strict
`kujo.ability/v1` definition and a separate MCP exposure policy. Its validator
comes from the exact canonical `ability` package revision pinned in
`kennel.lock`. It returns a protocol descriptor with `inputSchema`,
`outputSchema`, conservative MCP annotations, and canonical identity plus the
definition digest under `_meta`. `ability_registry_to_mcp_tools` projects all
enabled canonical `mcp` exposures and fails on duplicate tool names.

Projection is denied unless `enabled` is explicitly `true`. The default
`allowed_effects` is `["read"]`; any Ability declaring `write`, `delete`, or
`external` effects is rejected unless that effect is explicitly allowed. This
is an adapter boundary only: it does not register a handler, grant permission,
or bypass the server's authentication and request guardrails.

## Runtime Capability Controls

- `tools.enabled`: enable or disable tool endpoints at runtime.
- `resources.enabled`: enable or disable resource endpoints at runtime.
- `tools.default_timeout_ms`: default timeout budget for timeout-aware tools.
- `tools.scan_max_entries`, `tools.scan_max_files`, `tools.scan_max_bytes`: hard recursive traversal ceilings.
- `tools.tree_cache_enabled`: enable the process-local index cache, bounded to the current minute; `refresh_index` bypasses it.
- `permissions.allowed_directories`: one or more allowed roots for file traversal.

## Multi-Root Write Semantics

- For write tools that create missing files, the create target is the first entry in `permissions.allowed_directories`.
- Existing files are resolved by path across allowed roots and written in place.
- Integration coverage validates mixed read/search/tree/write sequences in multi-root mode.

## Notes

For remote deployment guidance, see `docs/production-deployment.md`.
For security model details, see `docs/security-model.md`.
For repo-specific server generation and artifact outputs, see `docs/mcp-make.md`.
