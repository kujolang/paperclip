import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveComponent } from "../../components/registry.js";

/** Assemble canonical server bytes plus a host-specific getting-started guide. Never run them here. */
export async function stageApplicationStarter(target: string, name: string, kind: "api" | "mcp") {
  const component = await resolveComponent(kind === "api" ? "crud-api" : "mcp");
  await mkdir(target, { mode: 0o700 });
  for (const relative of component.files) {
    const bytes = await readFile(join(component.root, relative));
    if (createHash("sha256").update(bytes).digest("hex") !== component.checksums[relative]) throw new Error("Application component changed during staging");
    const destination = relative === "README.md" ? "UPSTREAM_README.md" : relative;
    await mkdir(dirname(join(target, destination)), { recursive: true, mode: 0o700 });
    await writeFile(join(target, destination), bytes, { mode: 0o600 });
  }
  await writeFile(join(target, ".gitignore"), "data/*.db\ndata/*.db-*\n*.log\n.env.local\n", { mode: 0o600 });
  await writeFile(join(target, "README.md"), kind === "api" ? `# ${name}

A local Kujo + SQLite API starter using canonical CRUD API ${component.version}.
Source: ${component.repository}/tree/${component.gitCommit}

## Run locally

From this directory, after reviewing the files:

\`\`\`bash
kujo run main.kujo --interpreter
\`\`\`

The server listens on http://127.0.0.1:4100 and creates data/kujo_crud_api.db.
Use another terminal to request GET /health, GET /items or GET /projects.
Stop the foreground server with Ctrl+C. Restarting preserves the database and
seeds sample rows idempotently. No Node.js, frontend build or provider key is required.

This is a local demonstration: writes are unauthenticated unless you configure
KUJO_CRUD_AUTH_TOKEN or the alternate header strategy. Keep the default loopback
listener. Review UPSTREAM_README.md for security profiles, auth, CORS, rate limits,
configuration and production prerequisites before exposing any service.

See docs/api-examples.md and docs/openapi.yaml for request contracts. This starter
includes the canonical backend only; upstream frontend/scripts/test directories
referenced in UPSTREAM_README.md are not included. No dependencies were installed,
server started, port opened or database created while producing this preview.
` : `# ${name}

A local MCP server starter using canonical MCP framework ${component.version}.
Source: ${component.repository}/tree/${component.gitCommit}

## Run locally

After reviewing the files, run from this directory:

\`\`\`bash
kujo run server.kujo --interpreter
\`\`\`

The server listens on http://127.0.0.1:8931. GET /mcp/v1/health reports readiness.
The JSON-RPC endpoint is POST /mcp/v1, with initialize, tools/list, tools/call,
resources/list and resources/read. See docs/mcp-reference.md for request shapes.
Stop the foreground server with Ctrl+C. No provider credentials, Node.js or
Kennel dependency installation are required for this demo.

The default config grants access only to ./demo and disables authentication for
local demonstration. Tools can write permitted files inside that root; read-only
patterns protect selected file types. Review mcp-server.json and
src/tools/registry.kujo before changing roots or connecting a client. See
docs/security-model.md before changing exposure or auth. This starter does not
register any server with Paperclip, a public gateway or another client.

UPSTREAM_README.md describes the wider canonical project. Repo-specific generation,
Ability/Watchdog integrations, deployment scripts and upstream test suites are not
included here. Preview opened no port, ran no tool and created no log/database.
`, { mode: 0o600 });
  return { component: component.id, version: component.version, commit: component.gitCommit, repository: component.repository };
}
