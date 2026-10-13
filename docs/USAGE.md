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

Retention uses database insertion time: at most 20 records across all five artifact kinds per company/entity, with records older than 30 days inaccessible and removed on the next history read or append. There is no background expiry sweep. Each payload is limited to 5 MB. **Clear Kujo data** removes retained history and legacy latest keys for the selected project/issue; it does not remove documents already attached to issues. No generic SQL or arbitrary file access is exposed.

Agents can use `kujolang.paperclip:list-evidence` with `{ "scope": "project" }` (default) or `{ "scope": "run" }`, then `kujolang.paperclip:get-evidence` with the same scope and an `evidenceId`. IDs for the project/run/company come from the authenticated host context. Reads above 64 KiB are rejected with a panel-download hint; the tools never attach documents.
