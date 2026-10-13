# Architecture

```text
Paperclip issue/project/run context
  -> @kujolang/paperclip worker (typed validation and workspace resolution)
  -> @kujolang/kujo-runtime (configured, bundled, then optional PATH fallback)
  -> allowlisted pinned component (ChangeBucket, PatchBrief, CaseFile, Scent, Scout, Spec, Fence)
  -> bounded machine output
  -> normalized schema v1
  -> Paperclip namespaced evidence database and native detail tab
```

Paperclip remains the system of record for companies, projects, workspaces, issues, runs, approvals, budgets, and authentication. The plugin requests only project/workspace reads, agent-tool registration, plugin state, its detail tab, and its managed guidance skill.

All execution enters through `executeKujo()`. It uses `spawn`, never a shell, validates a real absolute working directory, passes a minimal allowlisted environment, caps stdout/stderr, and applies a timeout. Feature code can call only IDs in the compiled component registry. Registry resolution validates the complete bundle against the lock before returning an entrypoint. Context selection runs against a task-ranked temporary mirror of at most four Git-visible regular files, so ignored dependency trees and other ambient files never enter Scent's walk.

Artifacts use company/entity-scoped database rows: Review and Context Packs are stored against their project or issue; Failure Evidence is stored against its run. Generated CaseFile/Scent scratch output is created in a private temporary directory and removed after normalization. Project repositories remain read-only.

## Public contracts

- npm packages and runtime resolver API documented in the Kujo runtime repository
- Paperclip manifest API version 1 and minimum host version `2026.824.1`
- twelve namespaced agent tools declared in the manifest and worker
- component lock schema version 1
- Review Pack, Failure Evidence, and Context Pack schema version 1
- additive JSON compatibility within a plugin major version

Review generation captures a git snapshot before parallel read-only ChangeBucket/PatchBrief calls and checks it afterward. Partial PatchBrief failure preserves an accurate ChangeBucket footprint and records component status. Context cache identity combines workspace, HEAD/dirty fingerprint, normalized task, depth, and component version. The v0.1 worker records the key but intentionally regenerates instead of adding a second cache index.

Scout uses a private execution directory with an adapter-owned bounded config, a canonical host-resolved target, and fixed output paths. Its report schema strips raw source snippets and absolute paths before state/tool projection. Strict partial-scan exit 2 is represented as partial evidence; other nonzero exits and limits fail. No arbitrary target or output path is exposed to callers.

Language operations admit a Git-visible relative source path and use a fixed Kujo helper calling read_binary_prefix_beneath to read at most 65,537 bytes. Inputs above 65,536 bytes are rejected. The private copy is checked/linted/formatted without execution; formatted source is returned only by the explicit preview operation and is never persisted in plugin state. Original and formatted bodies are defensively redacted. Native source errors and infrastructure errors have distinct outcomes.


## Durable evidence storage

The host applies `migrations/001_evidence.sql` transactionally in the deterministic `plugin_kujo_evidence_c15d42de56` namespace. This name follows the host's slug/plugin-ID hash algorithm; migrations do not interpolate a namespace placeholder. Runtime SQL uses bound parameters and explicit company/entity predicates. Tests exercise the migration and SQL against embedded PostgreSQL (PGlite, test-only), and actual host SQL validators check the supported statement subset.

Stable evidence IDs combine company, entity, kind and artifact ID. Insert conflicts cannot replace payload, inputs, definition or parent provenance; there is no update API. Payload digests detect corruption on reads, but this is not protection against an administrator rewriting both data and digest. Appends and reads enforce bounded retention. Latest views read the retained rows rather than keeping an unbounded second copy. Legacy state is removed only after successful archival, with a migration marker preventing resurrection after clearing.

Issue documents require the additional `issue.documents.write` capability and a host-authenticated user action; generation never attaches records automatically. Database namespace read/write/migrate capabilities support evidence persistence. The SDK harness uses real PostgreSQL for SQL behavior; mocked host action tests and browser fixtures are not a substitute for final real-host install acceptance.


## Canonical Ability projections

`bundled/ability-sources.lock.json` pins the canonical Ability TypeScript contract and CMD catalog/profile snapshots. `scripts/sync-abilities.mjs` requires clean source checkouts at those commits; runtime never downloads definitions or component code. `scripts/generate-abilities.mjs` verifies source hashes, canonical definition digests, profile inheritance and host projection identities, then deterministically generates `src/abilities/generated.ts`. Build/verification reject drift.

`src/abilities/projections.json` owns Paperclip input schemas, adapter identities and storage effects. Exact canonical definitions are preserved separately, with canonical identities/digests linked from the host projection. This avoids falsely claiming that a canonical local-directory API and a tenant-scoped Paperclip tool share the same inputs, effects or idempotency behavior. Persisted evidence adds `kujoProjection` provenance; this additive metadata is not a canonical execution receipt or approval grant.

## Imported verification

The verification adapter validates the pinned Kujo evaluation-result JSON Schema using Ajv 2020 and date-time formats, then selects and redacts a small summary. Input is bounded to 64 KiB and 32 nested levels. Unknown fields, annotation bodies, raw logs and reference URIs are not retained; no references are fetched. The source-byte SHA-256 and schema provenance remain separate from the retained payload receipt. `verification-latest` is always labeled imported, with no observed execution or workspace freshness. Project/issue ownership comes from host-scoped APIs, not imported subject IDs. The adapter requires no native runtime and has its own feature/profile enforcement.

## Native task contracts

Spec is the sixth pinned executable component. The adapter discovers eligible
Git-visible contract paths, reads through the shared beneath-root text boundary,
and invokes only pinned converter/validator code against private files. It never
executes declared checks or imports workspace modules. The report separates input
admission from native validation and preserves not-run criteria/checks. Only
selected redacted summaries are retained as observed `spec-latest` records; this
is observed contract validation, not observed check execution. The existing
20-record/30-day limit spans all eight artifact kinds.


Fence is the seventh pinned component. A fixed host reader uses the native
whole-file beneath-root API, rejects symlinks and limits bytes, then stages a
private Git-visible snapshot. Canonical inventory selection, configuration
validation, import resolution and boundary analysis remain in Fence. A fixed
bridge refuses parser commands and escaping roots/aliases, uses isolated imports,
and runs without caching or project writes. Omitted policy files block fallback;
selected source omissions prevent a full-coverage pass. Snapshot hashes and
canonical provenance accompany redacted `fence-latest` records. See
[Verification workflows](VERIFICATION.md) for exact bounds and result semantics.

Concord is the eighth pinned component. Fence and Concord share the bounded
whole-file snapshot reader; their canonical discovery and analysis remain separate.
Concord's fixed bridge runs canonical reference admission before its six checks,
uses isolated imports, and removes duplicate report grouping before host validation.
Root artifacts receive copy priority; copy coverage never claims that every copied
file was inspected. Native discovery bounds or any host omission yield partial
coverage. The `concord-latest` kind uses the existing scoped receipt/retention store.
