# Dispatch

[![Version](https://img.shields.io/badge/version-1.3.0-black)](https://github.com/kujolang/dispatch/releases/tag/v1.3.0)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
[![built with Kujo](https://img.shields.io/badge/built%20with-Kujo-white.svg)](https://github.com/kujolang/kujo)

Dispatch 1.3 adds durable failure/review controls and restart-safe replay admission.
See [release notes](docs/RELEASE_1_3_0.md) and the [upgrade guide](docs/UPGRADING_TO_1_3.md).
Effect assurance beta and participant interoperability alpha remain experimental,
opt-in, and under a trusted local host. Separate participant SDK packages remain
unpublished. A correlation match never authorizes replay.

Dispatch is a workflow orchestration engine for reliable AI systems built in Kujo.

It routes structured work through repeatable workflow templates and produces reviewable run state, traces, reports, and handoff bundles.

Dispatch is strongest as a Control-layer primitive: workflow routing, run-state persistence, import/export, approval gates, and auditable orchestration evidence.

Dispatch is a showcase of Kujo's module system, typed workflow data, CLI runtime,
and testable agent orchestration—not an enterprise certification or a drop-in
multi-tenant service. Start with the credential-free fixture below, then use
[the deployment guide](docs/enterprise-deployment.md) for the production trust
model and [the 1.3 follow-up review](docs/audits/next-review-v1.3-2026-09-22.md) for open work.
For an existing deployment, read [the 1.3 upgrade guide](docs/UPGRADING_TO_1_3.md)
before changing the runtime or sharing an output root with older workers.
The supported release runtime is **Kujo 1.6.0 on Linux/macOS (POSIX)**.
`release/dispatch-v1.3.0.refs` pins the installer closure;
`release/dispatch-v1.3.0-validation.refs` pins the released companion integration
cohort. Older candidate manifests remain historical evidence. The runtime supplies
process-owned locks and confined directory durability. Quiesce old workers before
upgrading; never mix lock protocols on a run directory. Live provider and target
infrastructure certification remain deployment-specific.

[Try your first workflow](docs/first-workflow.md) for a credential-free
workflow-to-trace tour and an example of a plugin with a scoped tool allowlist.

Model execution is live and fail-closed by default, including the built-in planner and writer when routing is disabled. Deterministic offline fixtures are an explicit test/demo mode enabled with `DISPATCH_OFFLINE_FIXTURE=true`; live SDK integration requires AI SDK plus provider credentials.

## Why Dispatch

Single-step chat calls are rarely enough when work needs to be repeated, reviewed, and resumed. Dispatch provides:

- Declarative workflow steps and agent roles
- Deterministic tool orchestration
- Retry policies and failure semantics
- Optional deterministic or random jitter in retry backoff
- Human-in-the-loop approval controls
- Persisted, resumable run state
- Structured report outputs and trace artifacts
- Deterministic, policy-driven agent and model routing with persisted decisions

## Key Capabilities

- Workflow schema with typed step metadata
- Step lifecycle tracking (pending, running, paused, completed, failed, skipped)
- Optional steps that skip-and-continue on failure or policy denial
- Step input/output schema validation with actionable errors
- Hard model/retry deadlines plus fail-closed admission for reviewed bounded in-process tools
- Lifecycle event hooks via callback and webhook sink outputs (`--webhook-sink`)
- Approval decisions (approved, rejected, request_changes)
- DAG-style step dependencies (`depends_on`) with dependency-ordered scheduling and bounded concurrent execution for explicitly idempotent `parallel_safe` tool steps
- Agent-to-agent handoff events
- Run cataloging and filtering (`runs --status`, `--topic`, `--issues-only`, `--json`)
- Lossless, tombstone-based catalog cleanup with safe dry-run/apply modes (`cleanup`); physical artifact retention remains operator-managed
- Workflow template selection by ID (`demo/resume --workflow <template-id>`)
- Health diagnostics and repair (`doctor`, `doctor --write`)
- Report generation (`report.md`, `report.json`)
- Trace generation (`trace.json`, `trace.md`)
- Provider-neutral human-intervention events and validated `resume-decision`
  bridge handoff for Leash ChatOps routing
- Producer-neutral evaluation results, workflow policy mapping, durable control
  boundaries, and revision-bound intervention decisions
- Quality-first route selection with hard policy constraints, explicit fallback limits,
  resumable route evidence, and structured `no_route_available` failures

## Architecture Overview

Architecture and extension diagrams:

- `docs/architecture-and-extension-diagrams.md`

Core modules:

- `dispatch.kujo`: CLI entrypoint and command routing
- `src/cli/cli_args.kujo`: schema-driven CLI argument parsing
- `src/cli/bundled_workflow.kujo`: strict configuration paths and installed example allowlist
- `src/workflows/workflow.kujo`: workflow templates and template registry
- `src/workflows/loader.kujo`: declarative JSON workflow spec loader (`--workflow-file`)
- `src/plugins/builtin_plugins.kujo`: built-in plugin registry applied via `--plugin`
- `src/cli/output.kujo`: CLI output, version, and contract-metadata helpers
- `src/core/runner.kujo`: orchestration engine entrypoint
- `src/core/control.kujo`: portable result validation and workflow policy mapping
- `src/core/control_journal.kujo`: append-only hash-linked control event journal
- `src/core/intervention.kujo`: revision-bound continuation validation and retry safety
- `src/core/routing.kujo`: deterministic route filtering, ranking, evaluation, and fallback policy
- `src/agents/agent.kujo`: agent execution entrypoint and handler registry mapping
- `src/tools/tool.kujo`: tool registry, payload adapters, and tool invocation entrypoint
- `src/tools/source_lookup.kujo`: source search and lookup handlers
- `src/tools/content_processing.kujo`: claim/citation/report/timestamp handlers
- `src/tools/reliability_tools.kujo`: reliability simulation handlers
- `src/core/approval.kujo`: approval request/decision handling
- `src/core/retry.kujo`: retry policies and attempt tracking
- `src/core/state.kujo`: run persistence, summaries, filtering, diagnostics
- `src/core/trace.kujo`: trace event model and markdown rendering
- `src/core/hooks.kujo`: lifecycle event hook callback and webhook sink emission
- `src/core/report.kujo`: report payload and artifact writing
- `src/core/tool_policy.kujo`: centralized tool authorization policy parsing and builder
- `src/core/plugins.kujo`: plugin registration and runtime injection for external tools/agents
- `src/bridge/sdk_adapter.kujo`: external AI SDK bridge invocation
- `src/bridge/bridge_chat.kujo`: Kujo bridge script executed with `AI_SDK_PATH` as the working directory

Module layout:

- All implementation modules live under `src/`, including the tool handler layer (`src/tools/`).
- `dispatch.kujo` stays at the root as the CLI/package entrypoint; the bridge implementation lives in `src/bridge/`.
- New development should target `src/` modules directly.

## External AI SDK Integration (AI Chat Style)

Dispatch uses the same pattern as `ai-chat`:

1. Dispatch does not vendor `ai_sdk.kujo` or `providers.kujo`.
2. `src/bridge/sdk_adapter.kujo` invokes the `src/bridge/bridge_chat.kujo` bridge process.
3. The bridge runs with `AI_SDK_PATH` as module root and imports shared SDK modules from that external project.

This keeps SDK behavior centralized in one repository (`ai-sdk`) while allowing Dispatch to remain lightweight.

The bridge forwards AI SDK structured-output controls (`response_format`, `structured_output_schema`, and `structured_output_retryable`) when callers provide them. This keeps JSON-mode and schema validation policy in the SDK instead of reimplementing it in Dispatch.

## Deterministic Agent And Model Routing

For a complete setup, policy, live-provider, inspection, and troubleshooting guide,
see [`HOWTO.md`](HOWTO.md).

For a shareable introduction to the feature, its architecture, and installation
boundaries, see [`BLOG_ROUTER.md`](BLOG_ROUTER.md).

Routing is opt-in. Workflows without `routing.enabled: true` retain their configured
agent and model exactly. An enabled workflow supplies a versioned AI SDK model
catalog, workflow defaults, and optional step constraints. Dispatch validates the
catalog hash, rejects candidates that violate hard constraints, and applies a
stable quality-first ordering to the remainder. It persists the complete decision,
candidate rejections, attempts, catalog provenance, and evaluation outcome before
the model call.

Dispatch owns policy and run decisions. AI SDK owns provider/model catalog metadata.
Agents SDK defines the compatible agent vocabulary (`handler_id`, versioned
`execution_contract`, capabilities, model candidates, and risk metadata). Agent
substitution is permitted only when enabled and handler-compatible or when the
execution contracts match exactly.

Broader policy cannot be weakened by an agent or step. Allowlists intersect,
requirements and denylists accumulate, minimums increase, and maximums decrease.
Unknown providers are rejected unless they are one of the explicit adapters:
`fixture`, `openai`, `openrouter`, `deepseek`, or configured `custom`.

See [`docs/control-boundaries.md`](docs/control-boundaries.md) for evaluation,
policy, evidence, review, resume, and effect-aware retry contracts.

On resume, Dispatch reuses the persisted route. It will not silently reroute if the
catalog, model, agent, handler, execution contract, or plugin that supplied a route
is unavailable. Same-route retries remain distinct from bounded fallback to a new
route. Provider failures, evaluation failures, and fallback eligibility are
recorded as route lifecycle trace events.

Run the offline example without credentials:

```bash
DISPATCH_OFFLINE_FIXTURE=true kujo run dispatch.kujo demo "Routing review" \
  --workflow-file examples/workflows/routed-review.json \
  --yes --non-interactive
```

The example is intentionally fixture-backed. `state.json`, `report.json`, the
`inspect --json` envelope, and the runner result metadata expose `route_decisions`
and `route_attempts`. Secrets and raw provider output remain subject to Dispatch's
existing artifact redaction policy.

Validate configuration and explain the deterministic choice before execution:

```bash
dispatch validate --workflow-file examples/workflows/routed-review.json --json
dispatch explain-route --workflow-file examples/workflows/routed-review.json --json
```

Catalogs may be referenced with `routing.model_catalog_file`; Dispatch resolves
the path relative to the workflow and embeds the loaded catalog in persisted run
state. Declarative agents can use the built-in `handler_id: "model"` rather than
shipping custom runtime code. Evaluation outcome `request_human_review` uses the
native Dispatch pause/resume approval lifecycle.

Minimal workflow routing shape (the catalog fields and hash should come from AI
SDK's `create_model_catalog`/`provider_model_catalog`, not a copied routing table):

```json
{
  "routing": {
    "enabled": true,
    "policy_version": "1.0.0",
    "objective": "quality_first",
    "allow_agent_substitution": false,
    "constraints": {"quality_floor": "standard"},
    "fallback": {"max_fallbacks": 1, "max_evaluation_retries": 1},
    "model_catalog": {"schema_name": "ai-sdk-model-catalog", "schema_version": "1.0.0", "id": "approved", "version": "1", "catalog_hash": "...", "models": []}
  },
  "steps": [{
    "id": "write",
    "type": "agent",
    "agent_id": "writer",
    "routing": {"constraints": {"allowed_providers": ["openai"], "max_latency_ms": 2000}},
    "evaluation": {"required_fields": ["summary"], "on_failure": "upgrade_model"}
  }]
}
```

## Prerequisites

- Kujo 1.6.0 on Linux/macOS, pinned to released source `44af277848173664f72ca85f2a1b3b98d634ecdd`
- AI SDK installed by the Kujo `ai` profile, or a local clone for source development
- `dispatch` checked out locally

## Quick Start

The quick-start demo is explicitly fixture-backed, so it is safe to run without provider credentials:

```bash
cd /path/to/kujo-dispatch

DISPATCH_OFFLINE_FIXTURE=true kujo run dispatch.kujo demo "How do AI agent workflows differ from chatbots?" --yes --non-interactive
```

Dispatch runs on the default Kujo bytecode VM, which executes cleanly with no diagnostic output. The `--interpreter` flag (tree-walking interpreter) is supported for debugging; prefer the default VM path shown above for production and automation. Supported help/version paths are checked for unexpected diagnostics.

Expected output shape:

```text
Run ID: run-...
Status: completed
Run Directory: outputs/run-...
Report: outputs/run-.../report.md
State: outputs/run-.../state.json
Trace: outputs/run-.../trace.json
```

Dispatch child bridge calls use the installed `kujo` command by default; set `AI_SDK_PATH` only when validating live SDK behavior.

For a full offline tour (approval gate, resume, signed bundle export/import, a user-authored workflow, plugins, and event sinks), see `examples/quickstart-walkthrough.md`. Performance harnesses live in `docs/benchmarks.md`.

## Configuration

Dispatch reads the following environment variables:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `KUJO_BIN` | No | `kujo` | Kujo executable used to invoke bridge calls |
| `AI_SDK_PATH` | Yes (for live SDK integration) | `../ai-sdk` | Directory containing `ai_sdk.kujo` and `providers.kujo` |
| `DISPATCH_SDK_BRIDGE_SCRIPT` | No | `<DISPATCH_ROOT>/src/bridge/bridge_chat.kujo`, or `<PWD>/src/bridge/bridge_chat.kujo` from source | Override bridge script path |
| `DISPATCH_OFFLINE_FIXTURE` | No | `false` | Explicitly enables deterministic fixture-mode model calls for tests and demos; production fails closed without live configuration |
| `DISPATCH_ALLOW_ANY_SOURCES_DIR` | No | `false` | Allows non-default `--sources-dir` paths when explicitly set to `true` |
| `DISPATCH_ALLOW_ANY_OUTPUT_ROOT` | No | `false` | Allows unconstrained `--output-root` paths (absolute and broader targets) when explicitly set to `true` |
| `DISPATCH_ALLOW_ANY_CONFIG_PATH` | No | `false` | Allows absolute or otherwise unrestricted `--config` paths when explicitly set to `true` |
| `DISPATCH_CONFIG_MAX_BYTES` | No | `262144` | Maximum config file size in bytes accepted by `--config` |
| `DISPATCH_WORKFLOW_MAX_BYTES` | No | `1048576` | Maximum workflow file size |
| `DISPATCH_MODEL_CATALOG_MAX_BYTES` | No | `5242880` | Maximum external model-catalog size |
| `DISPATCH_ALLOWED_TOOLS` | No | empty | Comma-separated allowlist of tool names permitted during tool steps |
| `DISPATCH_DENIED_TOOLS` | No | empty | Comma-separated denylist of tool names blocked during tool steps |
| `DISPATCH_POLICY_PROFILE` | No | `production` live; `development` fixture | Named policy profile alias (`dev`, `development`, `staging`, `prod`, `production`) applied before explicit allow/deny overrides |
| `DISPATCH_BUNDLE_SIGNING_KEY` | Required for signed transfer | empty | Shared signing key used by `export-run --sign-bundle` and verified by default during import |
| `DISPATCH_BUNDLE_SIGNING_KEY_ID` | No | `default` | Key id label recorded in signed bundles, enabling key rotation |
| `DISPATCH_BUNDLE_SIGNING_KEYS` | No | empty | Trusted verification key set (`id1=key1,id2=key2`) used during signature verification for rotation windows |
| `DISPATCH_BUNDLE_MAX_BYTES` | No | `26214400` | Maximum bundle size accepted before import parsing |
| `DISPATCH_ALLOWED_CUSTOM_API_KEY_ENVS` | No | empty | Additional credential environment-variable names custom providers may select; `CUSTOM_API_KEY` is always allowed |
| `DISPATCH_ALLOWED_CUSTOM_PROVIDER_ORIGINS` | For custom live providers | empty | Exact comma-separated HTTPS base URLs allowed to receive custom-provider credentials |
| `DISPATCH_ALLOW_INSECURE_LOCAL_CUSTOM_PROVIDER` | No | `false` | Allows an explicitly allowlisted localhost HTTP custom provider for development only |
| `DISPATCH_ALLOW_ANY_WEBHOOK_SINK` | No | `false` | Allows absolute or otherwise unrestricted `--webhook-sink` paths when explicitly set to `true` |
| `DISPATCH_SDK_TIMEOUT_MS` | No | `240000` | Timeout in milliseconds for live SDK bridge subprocess calls |
| `DISPATCH_STATE_MAX_BYTES` | No | `5242880` | `state.json` size budget; `doctor` flags runs whose state exceeds it |
| `DISPATCH_STATE_BACKEND` | No | `filesystem` | Durable state authority: `filesystem` or SQLite (`sqlite`, WAL + revision compare-and-swap) |
| `DISPATCH_RUN_LOCK_TIMEOUT_MS` | No | `5000` | Maximum wait for the owner-bound per-run execution lock |
| `DISPATCH_WEBHOOK_OUTBOX` | No | `<output-root>/.dispatch-webhook-outbox.jsonl` | Durable webhook delivery ledger |
| `DISPATCH_WEBHOOK_MAX_ATTEMPTS` | No | `3` | Bounded webhook attempts before dead-lettering (1–10) |
| `DISPATCH_WEBHOOK_OUTBOX_MAX_BYTES` | No | `10485760` | Rotates the webhook outbox to one bounded backup before append |
| `DISPATCH_ALLOWED_WEBHOOK_ORIGINS` | For network webhooks | empty | Exact comma-separated HTTPS origins allowed for webhook delivery and replay |
| `DISPATCH_WEBHOOK_SIGNING_KEY` | For network webhooks | empty | Required HMAC-SHA256 key for webhook envelopes |
| `DISPATCH_WEBHOOK_SIGNING_KEY_ID` | No | `default` | Webhook signing-key identifier included in the envelope |
| `DISPATCH_ALLOW_INSECURE_LOCAL_WEBHOOK` | No | `false` | Allows an explicitly allowlisted localhost HTTP webhook for development only |
| `DISPATCH_STRICT_MUTATION_MODE` | No | `false` | When `true`, destructive commands require explicit confirmation |
| `DISPATCH_MUTATION_CONFIRM` | No | `false` | Global mutation confirmation guard used with strict mutation mode |
| `DISPATCH_MUTATION_AUDIT_MAX_BYTES` | No | `1048576` | Maximum active audit log size before rolling to a backup file |
| `DISPATCH_MUTATION_AUDIT_MAX_BACKUPS` | No | `5` | Maximum rotating backup slots used for `dispatch-mutations.<slot>.jsonl` |
| `DISPATCH_MUTATION_AUDIT_ROTATE_DAILY` | No | `false` | Enables daily rollover for mutation audit logs |
| `DISPATCH_TRACE_MAX_EVENTS` | No | `400` | Global default maximum number of trace events retained per run |
| `DISPATCH_TRACE_MAX_PAYLOAD_CHARS` | No | `2400` | Global default maximum payload characters retained per trace event |
| `DISPATCH_SDK_DEBUG_OUTPUT` | No | `false` | Includes raw bridge stdout/stderr in bridge parse and execution error details when set to `true` |

By default, Dispatch only allows fixture sources under `examples/research-report/sources` for demo/resume runs.

By default, Dispatch also restricts `--output-root` to safe relative directories and blocks absolute/traversal-like paths unless `DISPATCH_ALLOW_ANY_OUTPUT_ROOT=true` is set explicitly.

By default, Dispatch restricts `--config` to safe relative paths and enforces a maximum config size to reduce risky local path and oversized input scenarios.

## CLI Reference

```bash
kujo run dispatch.kujo demo "Research topic" [--config config.json] [--workflow research-report] [--workflow-file my-workflow.json] [--input-json '{"repo":"x"}'] [--plugin sample] [--policy-profile staging] [--tags prod,project-a] [--yes] [--non-interactive] [--output-root outputs] [--allow-tools timestamp_tool,citation_formatter] [--deny-tools flaky_reliability_tool] [--webhook-sink path.jsonl] [--webhook-url https-url] [--cancel-after-step step-id] [--trace-max-events 400] [--trace-max-payload-chars 2400]
kujo run dispatch.kujo show <run-id> [--output-root outputs] [--json]
kujo run dispatch.kujo inspect <run-id> [--output-root outputs] [--json]
kujo run dispatch.kujo resume <run-id> [--config config.json] [--workflow research-report] [--policy-profile staging] [--yes] [--non-interactive] [--output-root outputs] [--allow-tools timestamp_tool,citation_formatter] [--deny-tools flaky_reliability_tool] [--webhook-sink path.jsonl] [--webhook-url https-url] [--cancel-after-step step-id] [--trace-max-events 400] [--trace-max-payload-chars 2400]
kujo run dispatch.kujo templates [--json]
kujo run dispatch.kujo runs [--output-root outputs] [--status completed] [--workflow research] [--topic ai] [--tags prod] [--issues-only] [--limit 50] [--offset 0] [--json] [--diagnostics]
kujo run dispatch.kujo doctor [--output-root outputs] [--write] [--run-ids run-1,run-2] [--recent-count 20] [--json] [--strict-mutations] [--confirm-mutation]
kujo run dispatch.kujo cleanup [--output-root outputs] [--status completed] [--older-than-hours 24] [--max-count 50] [--apply] [--json] [--strict-mutations] [--confirm-mutation]
kujo run dispatch.kujo export-run <run-id> --bundle-path bundles/run.json [--output-root outputs] [--sign-bundle] [--signing-key key]
kujo run dispatch.kujo import-run --bundle-path bundles/run.json [--output-root outputs] [--signing-key key] [--allow-unsigned-bundle] [--strict-mutations] [--confirm-mutation]
```

When strict mutation mode is enabled (`--strict-mutations` or `DISPATCH_STRICT_MUTATION_MODE=true`), `doctor --write`, `cleanup --apply`, and `import-run` are blocked unless `--confirm-mutation` is present or `DISPATCH_MUTATION_CONFIRM=true` is set.

`doctor` supports incremental scope via `--run-ids` (explicit run selection) and `--recent-count` (most recently updated runs only), which helps reduce scan latency on large catalogs.

`show --json`, `inspect --json`, and `doctor --json` emit consistent machine-readable envelopes with shared metadata keys (`command`, `ok`, and `output_root`) plus command-specific payload data.

`runs --json --diagnostics` includes index diagnostics metadata such as `index_fallback_count` and `index_rebuild_count` to surface catalog/index health quickly.

`demo --tags` stores normalized per-run metadata labels and `runs --tags` filters to runs that include all requested tags.

Dispatch is template-driven: `demo` and `resume` select workflows by template ID through `--workflow <template-id>`. Direct Spec-file ingestion is not part of the verified command surface in this repository.

Dispatch supports `help`/`--help` and `version`/`--version`. The version is sourced from `kennel.toml` (`[package].version`).

Steps can be marked `optional` in a workflow template. When an optional step fails (including a tool blocked by policy), Dispatch records a `step_skipped` trace event and continues the run instead of failing it. The built-in `retry_probe` step is optional, so the `research-report` and `crud-reliability` templates complete even when `flaky_reliability_tool` is denied (for example under the `staging`/`production` policy profiles).

`demo` and `resume` accept lifecycle observability and control flags:

- `--webhook-sink <path.jsonl>` appends lifecycle events (one JSON object per line) to a local sink file. Absolute/traversal paths are blocked unless `DISPATCH_ALLOW_ANY_WEBHOOK_SINK=true`.
- `--webhook-url <https-url>` records each signed envelope in the durable outbox before bounded delivery. Failed deliveries are dead-lettered and can be inspected or replayed with `dispatch webhooks status|replay`; webhook failure does not fail the workflow.
- `--cancel-after-step <step-id>` cooperatively cancels the run after the named step completes, producing a `cancelled` lifecycle state.

Tool and agent steps can declare an `idempotency_key`; a successfully
checkpointed result is cached in run state and reused on resume. A process can
die after an external effect but before its checkpoint, so Dispatch provides
at-least-once replay in that window, not exactly-once effects. Tool handlers
receive a stable `context.effect_idempotency_key` (`run_id:step_id`) on retries
and resume; the external service must enforce it for consequential actions.

## Common Usage Flows

### 1. Run a workflow interactively

```bash
kujo run dispatch.kujo demo "How do AI workflows improve reliability?"
```

### 2. Run non-interactive and pause at approval

```bash
kujo run dispatch.kujo demo "How do AI workflows improve reliability?" --non-interactive
```

### 3. Resume a paused run

```bash
kujo run dispatch.kujo resume <run-id> --yes
kujo run dispatch.kujo resume-decision decision.json --output-root outputs --non-interactive
```

### 4. Inspect runs and diagnostics

```bash
kujo run dispatch.kujo runs --json
kujo run dispatch.kujo runs --tags env:prod,project:dispatch --json
kujo run dispatch.kujo inspect <run-id> --json
kujo run dispatch.kujo doctor --json
```

### 4b. Persist doctor repairs to state

```bash
kujo run dispatch.kujo doctor --write
```

### 5. Run the CRUD reliability template

```bash
kujo run dispatch.kujo demo "Orders API reliability" --workflow crud-reliability --yes
```

### 6. Use config-file driven runs with CLI precedence

```bash
kujo run dispatch.kujo demo --config ./dispatch-config.json --decision approve
```

### 3b. Inspect available workflow templates

```bash
kujo run dispatch.kujo templates
kujo run dispatch.kujo templates --json
```

### 6b. Enforce tool authorization policy from CLI

```bash
kujo run dispatch.kujo demo "Policy constrained run" --yes --allow-tools timestamp_tool,citation_formatter --deny-tools flaky_reliability_tool
```

### 7. Export and import run bundles

```bash
kujo run dispatch.kujo export-run <run-id> --bundle-path bundles/run.json --sign-bundle
kujo run dispatch.kujo import-run --bundle-path bundles/run.json --output-root outputs-imported
```

Dispatch verifies bundle signatures by default during import. Use `--allow-unsigned-bundle` only for an explicitly trusted local development transfer; production imports must remain authenticated. Verification failures return deterministic `invalid_bundle_signature` errors.

Signatures use standard HMAC-SHA256 (`hmac-sha256-v1`): each artifact is hashed, the per-artifact digests are bound to the run id, and the canonical message is authenticated with the shared key. Verification uses Kujo's constant-time HMAC tag verification. The signing key is required for both signing and verification.

Bundles record a `key_id` (default `default`, or `DISPATCH_BUNDLE_SIGNING_KEY_ID`/`--signing-key-id`). During a key rotation window, verification can trust multiple keys at once via `DISPATCH_BUNDLE_SIGNING_KEYS` (`id1=key1,id2=key2`): the verifier selects the key matching the bundle's `key_id`, falling back to the single signing key when no set entry matches.

Prefer `DISPATCH_BUNDLE_SIGNING_KEY` (env) over `--signing-key` (CLI flag) so the secret does not appear in process arguments or shell history.

`--signing-key` can be passed directly, but using `DISPATCH_BUNDLE_SIGNING_KEY` is recommended for non-interactive and managed environments.

## Demo Workflow Included

Built-in workflow templates:

- `research-report`: General evidence-backed research report workflow
- `crud-reliability`: CRUD API reliability review focused on contract checks, migration safety, auth checks, and error-budget notes
- `approval-handoff`: Minimal human-in-the-loop workflow (gather, pause at an approval gate, finalize); avoids the flaky reliability tool so it runs cleanly under the `staging` and `production` policy profiles

The baseline execution lifecycle demonstrates:

1. Planning
2. Source gathering
3. Retry probe
4. Claim extraction
5. Verification
6. Handoff to writer
7. Human approval gate
8. Report generation
9. Finalization and artifact write-out

## Output Artifacts

Each run is written to:

```text
outputs/<run-id>/
```

Artifacts:

- `state.json`: full run state snapshot
- `trace.json`: structured execution trace
- `trace.md`: human-readable trace timeline

Watchdog integration uses `render_watchdog_native_events` from
`src/core/trace.kujo`. It projects run/workflow/task correlation and lifecycle
status into `watchdog.native-event.v1` while excluding messages, step payloads,
inputs, outputs, and paths. Dispatch remains the orchestrator and state owner;
the embedding host owns fail-open delivery and Watchdog owns privacy,
persistence, retention, and export.
- `report.md`: human-readable report
- `report.json`: machine-readable report payload
- `dispatch-mutations.jsonl`: active mutation/policy audit log for `doctor --write`, `cleanup --apply`, bundle imports, and policy-denied tool attempts
- `dispatch-mutations.<slot>.jsonl`: rotated mutation audit backups controlled by `DISPATCH_MUTATION_AUDIT_MAX_BYTES` and `DISPATCH_MUTATION_AUDIT_MAX_BACKUPS`
- `.dispatch-run-index.json`: run metadata index used for faster run listing/filtering

All run artifacts (`state.json`, `trace.json`, `trace.md`, `report.*`, the run index, and signed bundles) are written atomically: content is staged to a temporary file and renamed into place, so a crash or a concurrent reader never observes a partially written file. The run index (`.dispatch-run-index.json`) is a cache that can be rebuilt from per-run `state.json` files; `runs` and `doctor` fall back to scanning state when the index is missing or malformed. For strict isolation under heavy concurrency, use a dedicated `--output-root` per service.

Protected assurance-aware state uses the guarded codec documented in [persisted negotiation](docs/persisted-assurance-negotiation.md); use the state loader instead of parsing its raw storage as JSON. Legacy state remains JSON. Contract metadata is embedded in persisted machine-readable artifacts: `state.json`, `trace.json`, and `report.json` include `artifact_contract_version`, `schema_name`, and `schema_version` fields to support schema-aware integrations and forward-compatible readers.

Dispatch redacts sensitive fields (for example keys containing `api_key`, `token`, `authorization`, `secret`, `password`) before writing persisted artifacts.

Policy-denied tool execution attempts are recorded in trace events (`policy_denied`) and mutation audit entries (`operation=policy_deny`) including run and command context.

Tool policy can be sourced from a reusable profile alias (`--policy-profile`, `policy_profile`, `DISPATCH_POLICY_PROFILE`) plus explicit allow/deny controls. Explicit `allow_tools` and `deny_tools` override profile defaults when provided. CLI flags take precedence over config and environment values.

Built-in policy profile aliases:

- `dev` / `development`: no allow/deny restrictions (open profile)
- `staging`: deny `flaky_reliability_tool`
- `prod` / `production`: allow `mock_web_search`, `local_source_lookup`, `claim_extraction`, `citation_formatter`, `markdown_report_writer`, `timestamp_tool`; deny `flaky_reliability_tool`

## Production execution controls

Workflow specifications can bound execution directly:

```json
{
  "max_parallel_steps": 4,
  "budgets": {
    "max_steps": 20,
    "max_total_tokens": 100000,
    "max_cost_usd": 10,
    "max_wall_time_ms": 900000
  }
}
```

Only tool steps marked `parallel_safe: true` are eligible for concurrent execution, and those steps must declare an `idempotency_key`. Dispatch uses `max_parallel_steps` as a hard concurrency bound and merges results in workflow order. Agent, approval, handoff, and report steps stay serialized so route persistence and human decisions remain deterministic.

Set `agent.model_options.stream: true` to persist incremental model events to `stream-<step-id>.jsonl` in the run directory while the AI SDK bridge is active. The final normalized model response remains the step result. Streaming step IDs must not contain path separators.

Run execution holds a process-owned POSIX advisory lock on `.dispatch-run.lock`.
The file is never unlinked, and the OS releases the handle when the worker exits;
lock age no longer grants ownership. Quiesce older workers before upgrading:
their age-based cleanup protocol does not coordinate with advisory locks. Run
directories on multiple hosts still need a distributed lock and storage layer.
State schema v1 artifacts migrate additively to schema v2 when loaded, with the
migration recorded in `state.json`. For a restart-sensitive single-host deployment,
use `DISPATCH_STATE_BACKEND=sqlite`; JSON artifacts remain human-readable mirrors
while SQLite is authoritative.

Operational commands:

```bash
dispatch doctor --output-root outputs --json
dispatch doctor --live --workflow-file workflow.json --output-root outputs --json
dispatch webhooks status --output-root outputs --json
dispatch webhooks replay --output-root outputs --url https://collector.example/events --destination lifecycle --json
```

## Testing

The external TypeScript adoption fixture requires Node 22 or newer. Install its
pinned development dependencies once; the release gate itself remains offline.

```bash
npm --prefix interop/typescript-participant ci --ignore-scripts
DISPATCH_OFFLINE_FIXTURE=true bash scripts/run_release_gate.sh
```

## CI Gate

Repository CI is enforced by GitHub Actions in `.github/workflows/ci-gate.yml`.

The gate builds the exact pinned Kujo revision on Linux and macOS, exports `KUJO_BIN` for test child processes, and runs the focused SDK, routing, SQLite, operational-control, policy, and sharded Dispatch suites.

```bash
kujo test-run tests/sdk_adapter_tests.kujo -v
kujo test-run tests/policy_precedence_tests.kujo -v
kujo test-run tests/dispatch_tests.kujo -v
```

Equivalent local validation:

```bash
export DISPATCH_OFFLINE_FIXTURE=true

kujo test-run tests/sdk_adapter_tests.kujo -v
kujo test-run tests/policy_precedence_tests.kujo -v
kujo test-run tests/dispatch_tests.kujo -v
```

## Engineering audit

The [repository hardening report](docs/audits/repository-hardening.md) records
verified changes, measurements, compatibility, and remaining operational risks.
The [release checklist](docs/release-checklist.md) remains the release authority.
The [1.3 follow-up backlog](docs/audits/next-review-v1.3-2026-09-22.md) tracks
the remaining readiness, portability, and verification work; a passing offline
fixture gate is not evidence of universal or enterprise production readiness.

## Agent And Contributor Guidance

For AI-agent and contributor search hygiene, canonical example labels, generated-path exclusions, and cleanup preferences, see:

- `AGENTS.md`

Prioritize copyable examples over tests: examples should model the most token-efficient idioms we want agents to imitate.

Exclude generated/bulk paths from the main sweep unless the task explicitly targets them; document the search exclusions you used.

## Release Process

Release governance artifacts:

- [Router HOWTO](HOWTO.md)
- [Dispatch 1.3 upgrade guide](docs/UPGRADING_TO_1_3.md)
- [Dispatch 1.2 upgrade guide](docs/UPGRADING_TO_1_2.md)
- [Dispatch 1.3 release checklist](docs/release-checklist.md)
- [Dispatch 1.2 historical checklist](docs/release-checklist-1.2.md)

- `CHANGELOG.md`: changelog format and versioning policy.
- `docs/release-checklist.md`: step-by-step release gate and tagging checklist.

Release versions are sourced from `kennel.toml` (`[package].version`) and should be updated together with the corresponding changelog release section. The repository also keeps a `kujo.toml` toolchain manifest; its `[package].version` must match `kennel.toml`, and CI fails the build on a mismatch.

For release walkthroughs, prefer the repository-root invocation pattern to avoid shell cwd drift:

```bash
pushd "$(git rev-parse --show-toplevel)"
export DISPATCH_OFFLINE_FIXTURE=true

kujo test-run tests/sdk_adapter_tests.kujo -v
kujo test-run tests/policy_precedence_tests.kujo -v
kujo test-run tests/dispatch_tests.kujo -v
popd
```

## Enterprise Deployment Guide

For production assumptions, hardening controls, monitoring expectations, upgrade strategy, and non-goals, see:

- `docs/enterprise-deployment.md`

Enterprise quickstart profile examples (copy-paste defaults):

```bash
# Development
export DISPATCH_POLICY_PROFILE=development
export DISPATCH_STRICT_MUTATION_MODE=false
kujo run dispatch.kujo demo "Development profile smoke" --policy-profile development --yes --non-interactive --decision approve --output-root tests/tmp/profile-dev-outputs

# Staging
export DISPATCH_POLICY_PROFILE=staging
export DISPATCH_STRICT_MUTATION_MODE=true
export DISPATCH_MUTATION_CONFIRM=false
kujo run dispatch.kujo runs --output-root tests/tmp/profile-staging-outputs --json --diagnostics

# Production
export DISPATCH_POLICY_PROFILE=production
export DISPATCH_STRICT_MUTATION_MODE=true
export DISPATCH_MUTATION_CONFIRM=true
kujo run dispatch.kujo doctor --output-root tests/tmp/profile-prod-outputs --strict-mutations --confirm-mutation
```

For environment hardening rationale and rollout policy, use the full deployment guide in `docs/enterprise-deployment.md`.

## Extension Guide

Dispatch is designed to be extended safely and incrementally:

- Add new workflow templates in `src/workflows/workflow.kujo`
- Add new tool handlers in `src/tools/` and register them in `src/tools/tool.kujo` with per-tool payload adapters instead of runner-specific branching
- Register project-specific plugins via `src/core/plugins.kujo` to inject tools and agents without core edits
- Extend decision policies in `src/core/approval.kujo` and `src/core/retry.kujo`
- Add reporting outputs in `src/core/report.kujo`
- Integrate observability sinks from trace events

## Troubleshooting

### AI SDK not found

Set `AI_SDK_PATH` to a directory that contains both `ai_sdk.kujo` and `providers.kujo`.

### Bridge execution errors

- Verify `KUJO_BIN` resolves to a valid Kujo command, usually `kujo`.
- Verify `DISPATCH_SDK_BRIDGE_SCRIPT` (if set) points to a valid file.
- Run with `--interpreter` during development.
- Bridge parse and execution failures redact raw stdout/stderr by default; set `DISPATCH_SDK_DEBUG_OUTPUT=true` only for local debugging.

### Sources validation errors in demo mode

Ensure your sources directory exists and includes markdown fixtures (`.md` files).

If you intentionally need a different sources directory, set `DISPATCH_ALLOW_ANY_SOURCES_DIR=true` explicitly.

### Command diagnostics

The supported VM and interpreter help/version paths are warning-free. Treat unexpected stderr output as a failed command-surface check and run the pinned release gate before shipping.

## Repository Layout

```text
dispatch/
  README.md
  src/
    bridge/
      sdk_adapter.kujo
      bridge_chat.kujo
    cli/
      cli_args.kujo
    workflows/
      workflow.kujo
    agents/
      agent.kujo
    tools/
      tool.kujo
      source_lookup.kujo
      content_processing.kujo
      reliability_tools.kujo
    core/
      approval.kujo
      decision.kujo
      handoff.kujo
      hooks.kujo
      plugins.kujo
      report.kujo
      retry.kujo
      runner.kujo
      state.kujo
      step.kujo
      trace.kujo
  dispatch.kujo
  examples/
    research-report/
      sources/
  outputs/
  tests/
    dispatch_tests.kujo
```

## Language-aware documentation queries

The optional `rag` plugin retrieves source-cited documentation from a configured Kujo RAG server. [Task preferences](docs/RETRIEVAL_PREFERENCES.md) select equivalent code examples upstream and persist across retries and approval resume. Use `examples/workflows/documentation-query.json` for a copyable workflow; no model-provider call is required by that workflow.

An experimental [Agents SDK → Ability interoperability slice](docs/agents-sdk-ability.md)
transports bounded evidence into the existing beta review/replay path. Dispatch
retains replay authority; standalone SDK tools remain independent.

Experimental Wave D: [controlled Workcell Git process interoperability](docs/git-process-participant.md) exercises a non-Ability effect with existing beta review/replay authority.

Experimental Wave D [interoperability correlation core](docs/interop-handoff.md)
retains SDK/MCP/HTTP/Workcell handoffs through explicit adapters. Correlation never
authorizes replay; existing persisted beta admission remains authoritative.

[Experimental participant packages](packages/README.md) provide unpublished npm
and Python artifacts for pure correlation/recording APIs. They contain no effect
executor, admission, assurance or replay authority.

### Trusted localhost provider development

An HTTP localhost custom provider requires an exact entry in
`DISPATCH_ALLOWED_CUSTOM_PROVIDER_ORIGINS`, plus both
`DISPATCH_ALLOW_INSECURE_LOCAL_CUSTOM_PROVIDER=true` and
`KUJO_AI_SDK_ALLOW_INSECURE_LOCALHOST=true`. The normal subprocess bridge also
retains Kujo's private-network denial. Only a trusted development host may set
`KUJO_ALLOW_PRIVATE_NETWORK_DESTINATIONS=1` for that process to opt out of the
private-address guard. This runtime override broadens private-network access;
it is not a producer/model option and should not be enabled for untrusted routes.
The default remains deny-private. The release localhost fixture uses no real
provider credentials and does not certify a remote deployment.

Experimental Wave C/D: [one selected local effect](docs/contracts/effect-set/one-effect-admission.md)
adds locked selection and one-use admission for a verified not-started SQLite
effect. The assessor remains read-only; parent replay and automatic remainder
execution remain prohibited.

Experimental follow-up: [bounded sequential continuation](docs/contracts/effect-set/sequential-continuation.md)
adds explicit unconsumed renewal/abandonment and separately admitted next effects
using the same Dispatch control model over SQLite and Workcell Git. Validation
status and the one-profile-per-run boundary are recorded in that contract.

### Retained-host reconciliation (experimental)

`recover inspect` and `recover plan` explain surviving local control evidence.
`recover apply` requires an exact plan and local operator attribution, rechecks
sources under the run lock, and performs only proven mechanical repairs. It never
resumes execution. See the [operator contract](docs/contracts/recovery/retained-host.md)
for supported publication gaps, immutable evidence, consumed-attempt protection,
unsupported recovery cases and the machine-readable output contract.

### Experimental parent finalization

Installed local controllers can separately assess and finalize the last unresolved
protected parent after verifying effects, outputs, evaluation and operator review.
See [the bounded contract](docs/contracts/parent-finalization/protocol.md) and
[Wave F crosswalk](docs/contracts/parent-finalization/wave-f-crosswalk.md).
Finalization does not schedule work, replay effects or change participant authority.

Experimental sourced resource accounting and bounded Eval reservation planning are
documented in [the resource contract](docs/contracts/resources/protocol.md). Existing
runtime/provider artifacts remain observations; Dispatch owns budget authority.

For the experimental typed-output, review, Eval and budget path, see the
[operator rehearsal](docs/operator-rehearsal.md).
