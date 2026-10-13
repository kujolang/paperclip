# Usage

## Paperclip UI

Open an issue and Kujo appears inline in Paperclip's current task view. There is no Classic Task Interface prerequisite. Project, issue detail, and run pages also expose the **Kujo** detail tab where the host supports tabs.

- **Generate Review Pack** measures the current working tree and builds a handoff.
- **Generate Context Pack** selects files for a task at minimal, focused, or broad depth.
- **Capture Failure Evidence** stores supplied command details and logs after bounding and redaction.

Run views display saved evidence. They do not expose a terminal.

The inline workspace and detail tab use the same actions and persisted artifacts, so changing views does not create a second copy of Kujo data.

## Agent tools

### Review changes

```json
{
  "mode": "working_tree"
}
```

Use range mode only with valid Git refs:

```json
{
  "mode": "range",
  "base": "main",
  "head": "HEAD"
}
```

The result includes changed-file and churn counts, risk level, explainable signals, component status, stale state, and suggested tests. Suggested tests are not proof that a command ran.

### Capture failure evidence

```json
{
  "title": "Unit test failed",
  "command": "npm test",
  "exitCode": 1,
  "durationMs": 4200,
  "log": "bounded test output",
  "notes": "failure occurred after the parser change"
}
```

The tool does not execute `command`. It stores bounded, redacted evidence from the supplied fields.

### Get context

```json
{
  "task": "trace the OAuth callback and its tests",
  "depth": "focused",
  "includeContent": false
}
```

Depth controls the token and file budget:

| Depth | Token budget | File limit |
| --- | ---: | ---: |
| `minimal` | 4,000 | 2 |
| `focused` | 16,000 | 3 |
| `broad` | 40,000 | 4 |

Start without content. Review the selected paths and reasons, then request content only when needed.

### Get selected content

```json
{
  "contextPackId": "context-pack-id",
  "paths": ["src/oauth.ts", "tests/oauth.spec.ts"],
  "maxTokens": 8000
}
```

Each path must belong to the referenced Context Pack and remain inside the workspace. Omit `paths` to read all selected files within the token budget.

## Recommended agent sequence

1. Request a focused Context Pack for the task.
2. Read only the selected content needed for the change.
3. Make and test the change with the normal project tools.
4. Generate a Review Pack.
5. Capture Failure Evidence only for commands that actually failed.
6. Report completed checks separately from suggested checks.

## Stored artifacts

The plugin retains normalized artifacts in a company/entity-scoped database history (up to 20 records for 30 days), and derives the latest cards from that history. It does not write reports into the project workspace.

Schemas are published in `schemas/`. Consumers should ignore unknown fields added by compatible future releases.

## First run without a repository

Open a project or issue and select **Try the Kujo example**. The plugin checks
the shipped source and executes it with Kujo host-effect capabilities disabled
in a temporary directory. The panel shows the source and actual JSON output;
it labels this as an example, not project evidence. No project files are changed.

For project work, connect a readable local Git workspace in Paperclip project
settings. Empty workspaces explain that source files are needed for context
selection. Clean workspaces suggest context selection before a change. Issue
titles/descriptions seed the editable task through company-scoped `issues.read`.
Upgrades need that read capability enabled by Paperclip; issue text is treated
as input text, not as instructions to the plugin.


## Understand a repository

Choose **Understand this repository** on an issue or project before selecting task context. Scout displays the project structure, language counts, discovered dependencies and routes, and heuristic observations. It works on clean or empty Git repositories. The agent equivalent is `kujolang.paperclip:understand-repository` with `{}`; Paperclip resolves the company-scoped project workspace.

Reports are created in private temporary storage, normalized into company-scoped plugin state, and removed from disk. No project code runs and no project files change. The adapter does not inherit the repository's `config.json`. Scan depth is six, with limits of 2,000 entries, 500 code files, 8 MB analyzed input, 100 KB per source file, and 250 analysis results. Sensitive filename patterns and common generated directories are excluded; Scout ignore/baseline rules still apply. A timeout is a failed operation, not a successful empty scan.

A partial scan preserves its diagnostics. Heuristic observations are leads for review, not proof of a vulnerability or a security certification. Dependencies/routes are observations, not a full semantic dependency graph. Raw source snippets and absolute report paths are omitted from results; returned strings are defensively redacted. Use a task-specific Context Pack and its separate content-read tool to investigate selected sources. Re-scan after the workspace changes. Clear Kujo data also removes the latest repository map.


## Kujo source checks and formatting previews

On an issue or project, select an eligible `.kujo` source in **Build with Kujo**. **Check and lint source** persists a company-scoped diagnostic record with separate check and lint states, locations, source digest and runtime version. Click a diagnostic file/line link to explicitly read the preview and highlight that original source line. Parse/compile errors are source failures; lint warnings remain warnings. Runtime failures, unknown diagnostic formats and oversized output fail instead of producing a passed record. Kujo lint is a lightweight rule set, not complete semantic or type validation.

**Preview formatting** explicitly reads that source and shows a redacted original and formatted proposal. It does not save a formatted file, apply lint fixes, or persist source bodies in plugin state. Redacted previews are unsuitable for automatic replacement. The agent tools accept only `{ "path": "src/main.kujo" }`: `kujolang.paperclip:check-kujo-source` and `kujolang.paperclip:preview-kujo-format`.

The source catalog lists at most 1,000 Git-visible `.kujo` paths and excludes sensitive filename patterns. Ignored/unlisted files, absolute/traversal paths, outside symlinks, binary text and files over 64 KiB are rejected. The native beneath-root reader admits a bounded file snapshot; check/lint/format run against a private copy. A digest re-read detects source changes during processing. The plugin never executes the user's source in these operations. Diagnostics have single-file lex/parse/compile scope: imports, tests and runtime behavior remain unverified. In Kujo 1.8.1, check success is JSON while failure diagnostics are text; the adapter validates the observed formats and fails closed on unknown output.


## Evidence history (upcoming release)

Choose a retained record to inspect its receipt and redacted payload, compare it with another record of the same kind, or download JSON. Inspection also reports current workspace freshness separately from the immutable payload; unavailable workspace state is unknown. The browser preview is bounded to 20,000 characters; downloads include the full redacted export.

Each receipt records source kind (observed, supplied, or migrated legacy), a result classification, payload digest and size, and input/operation-definition digests when available. The definition digest identifies the adapter's operation descriptor and provenance, not a cryptographic attestation of every executing instruction. Legacy receipts do not invent unavailable provenance. Original payload and export digests may differ because exports remove known workspace roots and defensively redact common secrets. Review exports before sharing; redaction cannot guarantee the absence of sensitive data.

**Attach to this issue** explicitly creates an issue document and requires a host-authenticated human in the same company. Agent calls cannot authorize attachment by passing actor or company fields. Only records retained against that exact issue can be attached. Documents above 400 KB are rejected; use the download instead. Attached documents are separate Paperclip records and remain governed by the host's retention policy.

Retention uses database insertion time (terminal completion time for Eval plan/outcome pairs): at most 20 records across all artifact kinds per company/entity, with records older than 30 days inaccessible and removed on the next history read or append. There is no background expiry sweep. Each payload is limited to 5 MB. **Clear Kujo data** removes retained history and legacy latest keys for the selected project/issue; it does not remove documents already attached to issues. No generic SQL or arbitrary file access is exposed.

Agents can use `kujolang.paperclip:list-evidence` with `{ "scope": "project" }` (default) or `{ "scope": "run" }`, then `kujolang.paperclip:get-evidence` with the same scope and an `evidenceId`. IDs for the project/run/company come from the authenticated host context. Reads above 64 KiB are rejected with a panel-download hint; the tools never attach documents.


## Discover capabilities

Use `kujolang.paperclip:list-capabilities` with `{}` for implemented Paperclip tools, or `{ "includeUnavailable": true }` to include canonical ecosystem references. Returned states separate installed adapter, company/profile enablement, platform support, runtime/component readiness and authorization checked on invocation. Missing adapters are not registered as agent tools. The full canonical input definitions remain in the packaged catalog; use the generated Paperclip schemas when calling Paperclip tools.

The **Explore Kujo** panel presents the same data and definition digests. Profile changes belong in company plugin settings. New retained work records link their Paperclip projection identity and exact canonical definition digests in `kujoProjection`; legacy records remain unchanged and do not invent that provenance.

## Import verification evidence

Enable `features.verification` in company settings, then paste a canonical `kujo.evaluation-result/v1` document into **Verification evidence**. Agent calls use `kujolang.paperclip:import-verification` with `{ "json": "<evaluation-result JSON text>" }`; the host supplies the project/company. The UI can also import against the current issue. A run view remains read-only. See [Verification imports](VERIFICATION.md) for classifications and limits. Imported summaries participate in the same history, comparison, export and explicit human attachment workflow.

## Review a task contract

Enable Verification, add a contract such as `specs/release.spec.yml` to the project,
and select it in **Task contract**:

```yaml
name: Release artifact
goal: Make the built package available for review.
acceptance_criteria:
  - A reviewer can inspect the built entrypoint.
eval_requirements:
  - description: Built entrypoint exists
    check_type: file_exists
    params:
      path: dist/index.js
human_approval_points:
  - A maintainer approves publication.
```

Choose **Review task contract** to validate its structure. This does not run the
file check or approve publication. Criteria and checks remain not-run. Agents can
call `inspect-task-contract` with the relative path and optional `strict: true`.
Use Evidence history for comparisons and redacted exports.


## Inspect architecture boundaries

Enable Verification, define the root `fence.json` or `fence.toml` policy, then select **Inspect architecture**. For example, this JSON policy prevents UI code from importing core implementation files:

```json
{
  "version": 1,
  "source_roots": ["src"],
  "fail_on": "error",
  "scan": { "include": ["src/**/*.ts"] },
  "zones": {
    "ui": { "paths": ["src/ui/**"], "cannot_depend_on": ["core"] },
    "core": { "paths": ["src/core/**"] }
  }
}
```

Agents call `kujolang.paperclip:inspect-architecture` with `{}`. Findings identify the file/line, dependency zones, declared owners and suggested remedy. Review the selected/inspected counts, omitted files, native skips and exceptions alongside the threshold result. The plugin never executes project commands or tests in this action. See [Verification workflows](VERIFICATION.md) for bounds and partial-result semantics. Results use the same scoped history, comparison, export and human-only attachment workflow as other evidence.

## Inspect artifact drift

Enable Verification and select **Inspect artifact drift** in a project or issue. Agents call `kujolang.paperclip:inspect-artifact-drift` with `{}`; the host supplies workspace and company identity. Concord compares recognizable project artifacts and retains severity, confidence, source/target, expected/observed differences and suggested fixes. Review partial coverage and stale indicators before using findings. It never executes examples or declared evaluations. See [Verification](VERIFICATION.md#native-artifact-drift) for limits and result classifications.

## Inspect release readiness

Enable Verification and select **Inspect release readiness** in a project or issue.
Agents call `kujolang.paperclip:inspect-release-readiness` with `{}`. Review missing
metadata signals, warnings and omitted inputs; expand passing signals for details.
Essentials can use this tool while other verification projections remain excluded.
ShipCheck detects test/lint/CI declarations but never executes them or certifies a
release. See [Verification](VERIFICATION.md#native-release-readiness).


## Approved Eval on issues

With execution enabled and Installed/Ship/Full selected, use **Run an evaluation**
on an issue. Preview `eval.json`, request approval, accept its native issue card,
then start explicitly. Refresh retained requests to inspect receipts or cancel.

Agents call `kujolang.paperclip:manage-evaluation` with `operation` and `issueId`.
`inspect` takes `suite`; `prepare` additionally takes a stable `submissionId`.
`start`, `status` and `cancel` take the returned request `id`; `list` takes no other
fields. The issue must belong to the current assigned host run. Preparation never
executes checks, and agents cannot approve their own requests. See
[Execution](EXECUTION.md) for coverage, retention and uncertainty limits.


Terminal Eval requests automatically add an observed request plan and linked outcome
to Evidence history. Select an outcome to navigate to its retained plan. Export and
explicit issue attachment include the parent when available; missing parents are
reported rather than reconstructed. Refresh pending history saves without rerunning
the evaluation. Clearing history suppresses republication of existing terminal
requests; active requests may still produce new outcomes. See
[execution history](EXECUTION.md#retained-execution-history) for exact limits and
agent issue-read authorization.

## Inspect Kujo packages

On a project or issue, **Kujo packages** lists up to 1,000 Git-visible
`kennel.toml` paths. Choose one and select **Inspect packages**. The agent tool
`kujolang.paperclip:inspect-kujo-packages` accepts:

```json
{"path": "kennel.toml"}
```

Omit `path` for the root manifest. Paperclip resolves the company/project workspace;
callers cannot supply an absolute workspace or a command. Run views cannot create
new package inspections. The Language feature must be enabled and the company
profile must be Installed, Build or Full.

The pinned Kennel validator checks declaration syntax on private manifest copies.
The canonical lock parser reads only an adjacent Git-visible `kennel.lock`.
Each input is UTF-8, at most 64 KiB, beneath the workspace, and cannot be a symlink.
The native interpreter uses isolated imports, a five-second maximum process window,
and bounded output. Local dependency paths are never resolved or followed; no
network access, install, update, project module or dependency code is invoked.

Results show package identity/entry, canonical errors and warnings, up to 200
declared dependencies and 200 lock records, and explicit truncation. A passed
inspection means those parsed declarations passed these checks; it does not prove
installed bytes, lock digests, source availability, compatible dependencies or a
working program. Missing/unreadable locks with dependencies produce warnings;
malformed, unsupported-version or invalid-shape locks fail inspection. Fields in a
parsed lock remain unverified claims, including resolved commits and versions.

Selected summaries are redacted and retained as `packages-latest` evidence with
manifest/lock byte digests, runtime/component/projection provenance and workspace
freshness. Shared history supports inspection, comparison, export and explicit
human issue attachment, with 20 records per entity for 30 days across all kinds.
Source files remain unchanged. Sensitive-pattern redaction is defense in depth,
not proof that arbitrary declarations contain no secrets. Kennel's bundled
unreleased declaration API is pinned by commit; the published Kennel version alone
does not identify those bytes.

## Preview Kujo starters

In a project or issue, select **Local script**, **AI agent project**, **SQLite API** or **MCP server** under
**Start building with Kujo**, enter a project name, and choose **Preview starter
files**. Names are 1–64 lowercase ASCII letters, digits, hyphens or underscores,
starting with a letter. Native reserved-name rules also apply. Inspect the
proposed file selector and download the review JSON with file contents and SHA-256
digests. Changing the name or starter clears the previous preview.

This calls canonical `kujo init` or `kujo agent new` in a private temporary
directory. Agent generation explicitly selects the basic profile and fixture
provider, disables Git creation, and never requests installation or credentials.
It includes pinned dependency declarations, instructions, schemas, capability
policy and an evaluation. The generated README explains subsequent use; those
commands have not run. Fixture generation needs no credentials, but running the
agent requires its Kennel dependencies. Live providers require separate explicit
configuration. Generator behavior is identified by the reported runtime version. API and MCP previews identify their exact canonical component versions and commits.

The Examples switch and Installed/Build/Full profiles govern this UI action.
No workspace is needed; run views remain read-only. Generation is capped at five
seconds, 64 files, 64 KiB per file, 256 KiB total and eight directory levels.
Symlinks, hardlinks, nonregular files, binary/invalid UTF-8 output, dependency
folders and generation-directory references fail closed. Outputs are returned to
the requesting company view and are not stored in Evidence history or written
into the user's workspace. They are proposed source files, not verification
receipts. The JSON download is a review document, not an automatic installer.

Approval-bound project creation, explicit project run/test, and repo-specific MCP
generation remain separate unfinished expansion requirements. The preview does not
replace those workflows.

### SQLite API starter

The API preview copies checksummed CRUD API backend files without executing them.
The proposed root `main.kujo` delegates to the canonical server implementation;
`data/.gitkeep` preserves the empty database directory in the file inventory.
The starter's README explains local startup and effect/auth prerequisites.
`UPSTREAM_README.md` preserves the full canonical guide; its frontend, scripts and
tests are not included. API examples and the OpenAPI contract are included.

After reviewing and materializing the files, a user can run
`kujo run main.kujo --interpreter` from the project root. That separate command
opens the loopback port (4100 by default), creates the SQLite database and seeds
demo data. The default demo permits unauthenticated writes unless configured;
review authentication, CORS and production settings before changing exposure.
No Node.js/frontend build or provider credentials are needed for the backend.
The plugin preview does not run that command, certify deployment readiness or
claim project tests passed. A pinned source snapshot is distinct from the
selected runtime version, and both are recorded in the review JSON.

### MCP server starter

The MCP preview includes the canonical local framework, JSON configuration, tool
and resource registries, a contained demo workspace, license, reference and
security guide. Its entrypoint is `server.kujo`; after reviewing/materializing
files, the separate command `kujo run server.kujo --interpreter` opens loopback
port 8931. Health is at `/mcp/v1/health`, and JSON-RPC uses POST `/mcp/v1`.

The default demo roots are relative (`./demo`), making these files portable.
Authentication is disabled for local demonstration; tools may write permitted
files within the configured roots, while read-only patterns restrict selected
file types. Review `mcp-server.json` and the bundled security guide before
connecting a client or changing exposure. No credentials or dependency install
are needed to run the local demo. Preview never starts/registers a server,
connects a client or invokes a generated tool. This is the canonical framework
starter, not a claim of certification for every external MCP client.

The full upstream guide is retained as `UPSTREAM_README.md`; optional Ability,
Watchdog, deployment and repo-generation components it describes are not included.
The starter guide states that scope. Repository-specific `mcp make` integration
requires its own source/workspace admission and is not invoked by this preview.


## Run a Kujo workflow

This development feature is not yet in the published npm package. It requires a
Paperclip host with company local folders and scheduled plugin jobs, on macOS or
Linux. Existing Windows features remain available.

1. In company plugin settings, enable **Human-approved Dispatch workflows** and
   choose Installed, Build or Full. Configure **Kujo workflow state** to an existing
   private directory owned by the Paperclip OS user (permissions `0700`). Use a
   dedicated folder, not a project workspace. An unhealthy or non-private folder
   blocks readiness and preparation; the plugin does not repair permissions or
   adopt missing state automatically.
2. Open an issue and **Run a Kujo workflow**. Choose Approval handoff, Research
   report or CRUD reliability, enter a topic, then **Preview workflow**. These are
   shipped offline fixtures: no API key, live research, provider call or project
   code execution is implied. An issue does not need a project workspace.
3. Request approval. Accept the matching human-only decision card in the issue,
   then **Queue approved operation**. Approval alone never starts work. The host
   checks its queue about once a minute, and each effect has a two-minute limit.
4. Refresh the operation status. **Succeeded** describes that command; use
   **Inspect native workflow** to see whether the workflow paused or completed.
   At a supported paused checkpoint, a human can request approval or rejection.
   Accept the new exact-checkpoint confirmation and explicitly queue that decision.
5. Requests and native state survive panel reload and host restart. Cancel an
   outstanding operation from the panel. Cancellation stops the owned command;
   it does not erase the workflow or establish that prior effects were rolled back.

Agents use `kujolang.paperclip:manage-kujo-workflow` with the current assigned
issue/run. Operations are `inspect`, `prepare`, `start`, `status`, `list`, `observe`
and `cancel`; agents cannot supply paths, actor identity or executable arguments.
Checkpoint `decide` requests are human-only. `start` submits durable intent and
returns immediately; it does not wait for native completion.

Terminal control requests have portable host receipts and linked plan/outcome
Evidence records. An uncertain command stays uncertain even when later native
inspection is available. No effect is automatically retried to discover its outcome.
Unsupported native checkpoints, changed revisions and changed storage bindings
must be resolved before a new approved operation.

There are twenty retained started workflows per company, separate from the
ordinary active-request limit. Parents are not pruned with thirty-day command
receipts because they own native state. Never-started cancellation/expiry releases
its reservation allowance. Automated archive/retirement, live providers, Muzzle,
Workcell and definitive lost-decision reconciliation are still expansion work;
do not treat this slice as the complete durable workflow pack.
