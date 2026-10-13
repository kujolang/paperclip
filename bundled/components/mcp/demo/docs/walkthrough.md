# End-to-End Demo Walkthrough

This walkthrough demonstrates a realistic MCP session using the MCP server and the demo workspace.

## Step 1: Start Server

From repository root:

```bash
bash scripts/run_server.sh
```

In another shell:

```bash
MCP_URL=http://127.0.0.1:8931/mcp/v1
mcp_post() { curl -s -X POST "$MCP_URL/$1" -H 'Content-Type: application/json' -d "$2"; }
```

## Step 2: Confirm Health

```bash
curl -s "$MCP_URL/health"
```

Expected: `{"status":"ok","server":"mcp-demo","version":"1.0.0"}`

## Step 3: Discover Tools

```bash
mcp_post tools/list '{}'
```

Expected: tool metadata including search, read, write, tree, and grep operations.

## Step 4: Discover Resources

```bash
mcp_post resources/list '{}'
```

Expected: resources like project docs, file tree, and log stream.

## Step 5: Read Documentation

```bash
mcp_post tools/call '{"params":{"name":"read_project_docs","arguments":{"file_name":"guide"}}}'
```

Expected: guide content returned in tool result payload.

## Step 6: Search For Context

```bash
mcp_post tools/call '{"params":{"name":"search_files","arguments":{"pattern":"runtime","mode":"content","directory":"docs","recursive":true}}}'
```

Expected: one or more matches in demo docs.

## Step 7: Write A Safe Patch

```bash
mcp_post tools/call '{"params":{"name":"write_safe_patch","arguments":{"file_path":"patches/walkthrough_note.kujo","content":"walkthrough output","description":"demo walkthrough write"}}}'
```

Expected: successful write result.

## Step 8: Confirm File Content

```bash
mcp_post tools/call '{"params":{"name":"read_text_range","arguments":{"file_path":"patches/walkthrough_note.kujo","start_line":1,"end_line":1}}}'
```

Expected: first line of the file is returned.

## Step 9: Trigger A Safety Rejection

```bash
mcp_post tools/call '{"params":{"name":"write_safe_patch","arguments":{"file_path":"../blocked_escape.kujo","content":"should fail","description":"escape attempt"}}}'
```

Expected: error response due to path boundary checks.

## Step 10: Inspect Audit Logs

```bash
curl -s "$MCP_URL/logs"
```

Expected: entries for invoked operations.

## Cleanup

```bash
rm -f demo/patches/walkthrough_note.kujo
```
