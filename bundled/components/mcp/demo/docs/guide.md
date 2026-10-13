# MCP Demo Quick Start

## Goal

Run a full demo loop in a few minutes: discover capabilities, read docs, search content, write a safe patch, and verify logs.

## 1. Start the Server

From repository root:

```bash
bash scripts/run_server.sh
```

In another shell:

```bash
MCP_URL=http://127.0.0.1:8931/mcp/v1
mcp_post() { curl -s -X POST "$MCP_URL/$1" -H 'Content-Type: application/json' -d "$2"; }
```

Health check:

```bash
curl -s "$MCP_URL/health"
```

Expected:

```json
{"status":"ok","server":"mcp-demo","version":"1.0.0"}
```

## 2. Discover Capabilities

List tools:

```bash
mcp_post tools/list '{}'
```

List resources:

```bash
mcp_post resources/list '{}'
```

## 3. Read and Search Docs

Read demo docs:

```bash
mcp_post tools/call '{"params":{"name":"read_project_docs","arguments":{"file_name":"README"}}}'
```

Search for content:

```bash
mcp_post tools/call '{"params":{"name":"search_files","arguments":{"pattern":"guardrail","mode":"content","directory":"docs","recursive":true}}}'
```

## 4. Write Safely

Create a patch file inside the writable sandbox:

```bash
mcp_post tools/call '{"params":{"name":"write_safe_patch","arguments":{"file_path":"patches/demo_update.kujo","content":"demo content","description":"demo write"}}}'
```

Expected: a JSON-RPC `result` containing `patches/demo_update.kujo`.

Read a line range from that file:

```bash
mcp_post tools/call '{"params":{"name":"read_text_range","arguments":{"file_path":"patches/demo_update.kujo","start_line":1,"end_line":1}}}'
```

## 5. Validate Safety Behavior

Try an out-of-scope write (should fail):

```bash
mcp_post tools/call '{"params":{"name":"write_safe_patch","arguments":{"file_path":"../escape.kujo","content":"blocked","description":"path escape attempt"}}}'
```

Expected: a JSON-RPC `error` response.

## 6. Inspect Logs

```bash
curl -s "$MCP_URL/logs"
```

## Next Steps

- Continue with `walkthrough.md` for a complete end-to-end sequence.
- See `scenarios.md` for practical examples of developer and agent workflows.
