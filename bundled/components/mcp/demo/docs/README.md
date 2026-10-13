# Demo Documentation

## Purpose

This docs set supports the demo workspace for the MCP server. It is intentionally small, but complete enough to showcase modern MCP usage with runtime guardrails.

## What This Demo Covers

- Tool discovery and invocation flows
- Resource listing and reads
- Structured search and grep workflows
- Safe write operations in a bounded workspace
- Guardrail behavior for invalid and risky inputs

## Core Runtime Concepts Demonstrated

1. Transport layer MCP endpoints under `/mcp/v1/*`
2. Registry layer for tools and resources
3. Security layer for path validation, read-only enforcement, and file-size controls
4. Request guardrails for bounded body size and request rate

## Recommended Reading Order

1. `guide.md`
2. `walkthrough.md`
3. `scenarios.md`

## Related Project Docs

- See `../../docs/mcp-reference.md` for endpoint, tool, and resource reference.
- See `../../docs/security-model.md` for security boundaries and assumptions.
- See `../../docs/production-deployment.md` for deployment hardening guidance.
