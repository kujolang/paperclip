# MCP Demo Workspace

This demo workspace is designed for first-time visitors to quickly see what the MCP server can do in realistic agent workflows.

It demonstrates:

- Tool discovery and invocation
- Resource discovery and reads
- Safe file reads and writes in an allowed workspace
- Search and grep workflows for agent context gathering
- Runtime safety behavior (path checks, read-only patterns, bounded operations)

## Demo Layout

- `docs/README.md` - Demo overview and architecture notes
- `docs/guide.md` - Hands-on quick start for local testing
- `docs/walkthrough.md` - End-to-end example workflow with request payloads
- `docs/scenarios.md` - Practical usage patterns for common agent tasks
- `patches/` - Writable sandbox for safe patch and write operations

## 5-Minute Demo Flow

1. Start server from repository root:

	`bash scripts/run_server.sh`

2. Set a compact endpoint helper:

	```bash
	MCP_URL=http://127.0.0.1:8931/mcp/v1
	mcp_post() { curl -s -X POST "$MCP_URL/$1" -H 'Content-Type: application/json' -d "$2"; }
	```

3. Check server health:

	`curl -s "$MCP_URL/health"`

	Expected: `{"status":"ok","server":"mcp-demo","version":"1.0.0"}`

4. List tools and resources:

	`mcp_post tools/list '{}'`

	`mcp_post resources/list '{}'`

5. Read and search docs:

	`mcp_post tools/call '{"params":{"name":"read_project_docs","arguments":{"file_name":"README"}}}'`

	`mcp_post tools/call '{"params":{"name":"search_files","arguments":{"pattern":"workflow","mode":"content","directory":"docs","recursive":true}}}'`

6. Write a safe patch in `patches/`:

	`mcp_post tools/call '{"params":{"name":"write_safe_patch","arguments":{"file_path":"patches/demo_note.kujo","content":"demo message","description":"demo write"}}}'`

	Expected: a JSON-RPC `result` containing the written file path.

7. Verify logs:

	`curl -s "$MCP_URL/logs"`

## Safety Boundaries In This Demo

- File operations are constrained to configured allowed directories.
- Markdown and common config extensions are read-only by default.
- Requests are protected by request-size and rate guardrails.
- Every tool call is logged for traceability.
