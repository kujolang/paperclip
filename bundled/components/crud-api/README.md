# CRUD API

[![Version](https://img.shields.io/badge/version-1.0.0-black)](https://github.com/kujolang/crud-api)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
[![built with Kujo](https://img.shields.io/badge/built%20with-Kujo-white.svg)](https://github.com/kujolang/kujo)
[![SQLite](https://img.shields.io/badge/database-SQLite-0f766e)](https://www.sqlite.org/)

A server-first showcase/proof app built with Kujo + SQLite, plus a minimal Next.js playground UI.

It boots from `main.kujo` at the repo root; there is no standalone CLI wrapper to validate.

This project is intentionally small so you can clone it and extend it quickly.

## What This Repo Is

- A working CRUD backend for `items` and `projects`
- Sample data seeded on startup
- Seed fixtures are data-driven and idempotent (restarts do not duplicate demo rows)
- Simple, practical request validation
- Pluggable write-route auth strategies (static bearer or custom header value)
- A single-page frontend playground that exercises the API

## What This Repo Is Not

- Not a full CMS
- Not a plugin/theme framework
- Not a turnkey deployment or production-certified platform

Use it as a clean starting point.

If you intentionally need a broader listener, set `KUJO_CRUD_API_HOST` explicitly and keep the reviewed showcase path loopback-local by default.

## Quick Start

### 1) Run the Kujo API

```bash
cd /path/to/crud-api
kujo run main.kujo
```

Or run the interpreter path directly:

```bash
kujo run main.kujo --interpreter
```

Default API URL: `http://127.0.0.1:4100`

Default bind host: `127.0.0.1`

Expected startup banner:

```text
Kujo CRUD API Showcase
Server: http://127.0.0.1:4100
Database: data/kujo_crud_api.db
```

Verify the API:

```bash
curl -s http://127.0.0.1:4100/health
```

Fresh database expected shape:

```json
{"status":"ok","database":"connected","items":5}
```

### 2) Run the frontend playground

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

The frontend reads `NEXT_PUBLIC_API_BASE_URL` from `.env.local` (default: `http://127.0.0.1:4100`) for both API requests and the topbar API root link.

Default frontend URL: `http://localhost:3000`

### 3) Root command orchestration

From repo root:

```bash
make run-api
make run-frontend
make lint
make test
```

The `Makefile` defaults to the installed `kujo` command. Set a custom runtime binary only when needed:

```bash
make test KUJO_BIN=/path/to/kujo
```

## CI And Contribution Workflow

- GitHub Actions workflow: `.github/workflows/ci.yml`
- Triggered on pushes to `main` and pull requests targeting `main`.
- CI uses pinned runner (`ubuntu-24.04`) and Node (`20.17.0`) for reproducible frontend and backend test runs. The backend suite expects a `kujo` binary on `PATH`.
- Contribution guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- Release checklist: `RELEASE.md`
- DR runbook: `docs/DR_RUNBOOK.md`
- Required quality gates:
  - Frontend lint and production build.
  - Backend regression suite (`make test`) with Kujo runtime installation in CI.
  - Security gates (`npm audit --audit-level=high`, secret pattern scan, and frontend SBOM artifact generation).
  - CodeQL static analysis on JavaScript/TypeScript code.

## Verified Launch Status

- Backend contract tests, smoke API checks, compatibility startup, frontend lint/build, and the repo test suite all pass on the verified local smoke path.
- Performance baseline and backup/restore drill checks are present as dedicated tests and pass in the suite.
- This repository is a showcase/proof app, not a production-certified CMS platform.

## Quality Commands

Run frontend lint directly:

```bash
cd frontend
npm run lint
```

Run the frontend production build directly:

```bash
cd frontend
npm run build
```

Or run the repo-level quality script:

```bash
./scripts/quality-check.sh
```

Or from root:

```bash
make lint
```

## Test Commands

Run the API smoke suite (health, CRUD flow, and auth-mode write checks):

```bash
./scripts/run-smoke-tests.sh
```

Run the full backend regression suite from root:

```bash
make test
```

Run the targeted performance baseline and DR restore drills directly:

```bash
bash tests/t5_01_performance_baseline.sh
bash tests/t5_02_backup_restore_drill.sh
```

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `KUJO_CRUD_PORT` | `4100` | API port |
| `KUJO_CRUD_API_HOST` | `127.0.0.1` | API bind host; override explicitly for a broader listener |
| `KUJO_CRUD_DB_PATH` | `data/kujo_crud_api.db` | SQLite DB path |
| `KUJO_CRUD_CORS_ORIGIN` | `*` | Allowed CORS origin |
| `KUJO_CRUD_AUTH_TOKEN` | _(empty)_ | If set, write routes require `Authorization: Bearer <token>` |
| `KUJO_CRUD_AUTH_STRATEGY` | `static_bearer` | Write-route auth strategy: `static_bearer` or `header_value` |
| `KUJO_CRUD_AUTH_HEADER_NAME` | `X-API-Key` | Header name used when `KUJO_CRUD_AUTH_STRATEGY=header_value` |
| `KUJO_CRUD_AUTH_HEADER_VALUE` | _(empty)_ | Required header value when `KUJO_CRUD_AUTH_STRATEGY=header_value` |
| `KUJO_CRUD_MIN_AUTH_SECRET_LENGTH` | `16` | Minimum production auth secret length |
| `KUJO_CRUD_MAX_BODY_BYTES` | `65536` | Max JSON body size |
| `KUJO_CRUD_SECURITY_PROFILE` | `demo` | Security mode: `demo` or `production` |
| `KUJO_CRUD_RATE_LIMIT_MAX_WRITES` | `30` | Max write requests per client key within one window |
| `KUJO_CRUD_RATE_LIMIT_WINDOW_SECONDS` | `60` | Window size (seconds) for write rate limiting |
| `KUJO_CRUD_TRUST_PROXY_HEADERS` | `false` | If true, write rate limiting uses `X-Forwarded-For`; leave false unless a trusted proxy controls that header |

## Security Profiles

- `demo` is the default and prioritizes local developer convenience.
- `production` enforces stricter startup validation.

When `KUJO_CRUD_SECURITY_PROFILE=production`, startup requires:

- If `KUJO_CRUD_AUTH_STRATEGY=static_bearer`, then `KUJO_CRUD_AUTH_TOKEN` must be set
- If `KUJO_CRUD_AUTH_STRATEGY=header_value`, then `KUJO_CRUD_AUTH_HEADER_VALUE` must be set
- Configured auth secrets must be at least `KUJO_CRUD_MIN_AUTH_SECRET_LENGTH` characters
- `KUJO_CRUD_CORS_ORIGIN` to be an explicit origin (not `*`)

Write routes (`POST`, `PUT`, `PATCH`, `DELETE`) are rate-limited and return `429` with a `Retry-After` header when the limit is exceeded. By default, the limiter ignores client-supplied proxy headers so callers cannot rotate `X-Forwarded-For` to bypass local limits. Set `KUJO_CRUD_TRUST_PROXY_HEADERS=true` only behind a trusted reverse proxy that overwrites inbound forwarding headers.

## Observability And Troubleshooting

- The API accepts optional inbound `X-Request-Id` and propagates it to responses.
- If no request ID is provided, the server generates one and includes it in `X-Request-Id`.
- Runtime logs are structured JSON lines with `event`, `request_id`, `method`, `path`, and status/security metadata.
- Security events (auth denied and write-rate-limit denied) are logged without sensitive header/token values.

## API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | API metadata |
| `GET` | `/health` | Health + record count |
| `GET` | `/items` | List items (`limit`, `offset`, `status`, `project_id`, `sort_by`, `sort_dir`, `q`) |
| `POST` | `/items` | Create item |
| `GET` | `/items/:id` | Get one item |
| `PUT` | `/items/:id` | Replace one item |
| `PATCH` | `/items/:id` | Patch one item |
| `DELETE` | `/items/:id` | Delete one item |
| `GET` | `/projects` | List projects with related item counts |
| `POST` | `/projects` | Create project |
| `GET` | `/projects/:id` | Get one project |
| `GET` | `/projects/:id/items` | List items for one project |

Write requests (`POST`, `PUT`, `PATCH`) must use `Content-Type: application/json`.

Creating a project with a duplicate `name` returns `409` with an error payload.

`PUT`, `PATCH`, and `DELETE` on `/items/:id` require `If-Unmodified-Since` set to the current item `updated_at` value. Missing headers return `428`; stale values return `409` with conflict details.

## Item Shape

```json
{
  "id": 1,
  "title": "First Sample Item",
  "content": "Use this record to test read and update flows.",
  "status": "published",
  "project_id": 1,
  "project_name": "Documentation",
  "created_at": "1777930859.0",
  "updated_at": "1777930859.0"
}
```

Allowed status values:

- `draft`
- `published`
- `archived`

## Project Shape

```json
{
  "id": 1,
  "name": "Documentation",
  "description": "API and developer documentation roadmap and examples.",
  "items_count": 2,
  "created_at": "1777930859.0",
  "updated_at": "1777930859.0"
}
```

## cURL Flow

```bash
curl -s http://127.0.0.1:4100/health
```

```bash
curl -s -X POST http://127.0.0.1:4100/items \
  -H "Content-Type: application/json" \
  -d '{"title":"My item","content":"Hello world","status":"draft"}'
```

```bash
curl -s 'http://127.0.0.1:4100/items?limit=20&offset=0'
```

```bash
curl -s 'http://127.0.0.1:4100/items?sort_by=updated_at&sort_dir=desc&q=draft'
```

```bash
curl -s 'http://127.0.0.1:4100/items?limit=20&sort_by=id&sort_dir=desc&cursor=id:120'
```

Cursor mode requires `sort_by=id` and `sort_dir=desc`. Response payloads include `next_cursor` when another page is available.

```bash
curl -s 'http://127.0.0.1:4100/projects'
```

```bash
curl -s 'http://127.0.0.1:4100/projects/1/items'
```

```bash
curl -s -X PATCH http://127.0.0.1:4100/items/1 \
  -H "Content-Type: application/json" \
  -H "If-Unmodified-Since: 1777930859.0" \
  -d '{"content":"Updated content"}'
```

## Concurrency Control

- Clients read an item and keep its `updated_at` token.
- Update/delete calls send `If-Unmodified-Since: <updated_at-token>`.
- Server responses:
  - `200` when token matches current record state.
  - `409` when token is stale (response includes `current_updated_at` and `provided_updated_at`).
  - `428` when the precondition header is omitted.

## Project Layout

- `main.kujo` thin API bootstrap entrypoint
- `src/config.kujo` environment and runtime config
- `src/db.kujo` SQLite connection, schema, and seed setup
- `src/validation.kujo` request/auth/field validation helpers
- `src/handlers.kujo` endpoint business logic
- `src/server/runtime.kujo` route registration and server runtime
- `frontend/` Next.js playground that calls the API
- `data/` default runtime SQLite location

The root `main.kujo` file intentionally remains as the public bootstrap. Runtime behavior lives under `src/`; generated SQLite and smoke-test artifacts are ignored under `data/` and `.tmp/`.

## API Contract

- OpenAPI contract: `docs/openapi.yaml`
- Canonical copyable endpoint examples: `docs/api-examples.md`
- Next-session hardening plan: `docs/next-session-hardening-plan.md`

Use the contract as the source of truth for integration clients. The validation script `tests/t4_03_contract_validation.sh` verifies that documented endpoints and live API behavior stay aligned.

## Agent And Contributor Notes

- Canonical examples live in `README.md` and `docs/api-examples.md`.
- Tests under `tests/` are executable contracts, not style examples to shorten aggressively.
- `docs/openapi.yaml` is generated-style API contract material; update it for endpoint behavior changes, but exclude it from readability-only sweeps.
- Exclude generated/bulk paths from broad searches unless they are the target: `frontend/package-lock.json`, `frontend/node_modules/`, `frontend/.next/`, `.tmp/`, and `data/*.db*`.

## Implementation Checklist

For the full, prioritized roadmap (security, refactors, testing, and DX), use:

- `docs/implementation-checklist.md`

The checklist is designed so an AI agent or developer can complete one item at a time, mark it done, update this README when behavior changes, and then continue to the next task.

## Extend It

Good first extensions:

1. Add a second resource (`projects`, `users`, etc.)
2. Add relation tables and joins
3. Add test coverage for each endpoint
4. Add CLI commands for seed/reset/export
