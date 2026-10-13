# Verification workflows

## Task contracts

With Verification enabled, select a Git-visible `.spec.json`, `.spec.yml`, `.spec.yaml` or `.spec.toml` contract and choose **Review task contract**. The pinned Spec 1.0.1 converter and validator operate on private copies; the source workspace and declared checks are never executed or changed. Strict mode promotes native warnings to a contract validation failure. Parse/type admission failures are identified separately from completed native validation.

The panel shows the goal, scope, acceptance criteria, declared check descriptions/types, non-goals and approval points. All criteria and checks remain **not-run**. A valid contract is not a completed task, a verified check, or an approval grant. The adapter does not infer links between individual criteria and checks. Command parameters, metadata and other unselected fields are not retained. Selected text is redacted, with the source-byte digest and component provenance retained in company/entity-scoped history.

Only the first 1,000 eligible Git-visible paths are listed. Reads use the native beneath-root filesystem boundary, reject sensitive/ignored paths and symlink escapes, and accept at most 64 KiB of UTF-8 text. Converted documents are limited to depth32; processes and output are bounded. No project code, hooks or workspace modules are imported. Results become stale when the observed workspace changes; immutable history preserves the original observation.

Agent input: `inspect-task-contract` with `{ "path": "specs/release.spec.yml", "strict": true }`. The host supplies company/workspace identity. Project and issue actions persist scoped evidence; run surfaces remain read-only.

## Architecture boundaries

Enable Verification and choose **Inspect architecture** in a project or issue. The `inspect-architecture` agent tool accepts `{}`; Paperclip supplies company/workspace identity. The pinned Fence implementation loads the root Git-visible `fence.toml` or `fence.json` and checks declared zones/dependencies. Missing policy and empty source selection are **not-run**; malformed or unsupported configuration is **blocked**. No implicit policy is generated.

The result preserves native findings, file/line locations, zones, ownership, suggestions, ignored violations with reasons/expiry, and the project's `fail_on` threshold. A policy using `fail_on = "none"` can meet its threshold while containing errors; both facts remain visible. **Partial** means path/file admission or native skips limited coverage, even when the inspected subset met its threshold. A passed result is a best-effort import-boundary observation, not evidence that project tests passed or acceptance criteria were met.

The adapter copies at most 1,000 Git-visible paths, 64 KiB per file and 16 MiB total into private storage. Root policy files are prioritized. Sensitive filenames, binary text, symlinks/junctions, unsafe paths and oversized files are not read as analysis text. Omitted selected files and truncated inventories remain explicit. Canonical file selection and import resolution use host-supplied inventories; no ambient filesystem resolution occurs. Configuration aliases and roots must stay relative to the snapshot. Configured parser adapters are blocked because they would execute project commands. No cache, project imports, tests or workspace writes occur.

Copying considers the bounded inventory before native selection, so excluded files can consume the copy budget; use the coverage record to judge completeness. A second bounded snapshot detects changes during inspection. Later workspace observations mark retained results stale without rewriting immutable receipts. Common-secret redaction applies to retained native output. Source bytes are removed with temporary storage; their snapshot digest and component provenance remain in scoped history. The panel displays the first 100 items in each result list; exports retain all admitted items.

## Imported evaluation claims

Enable `features.verification` in company settings. The installed/full/review/ship profiles expose **Import evaluation result** and the `import-verification` agent tool. Build and essentials profiles do not. The feature defaults off. Imports work without a local workspace or native Kujo runtime.

Paste `kujo.evaluation-result/v1` JSON into the project or issue panel. Eval 2.0.0 emits this format as `evaluation-result.json`; other producers must supply the same contract. The import adapter does not convert legacy tool reports or invoke native tools. Native Spec validation and Fence inspection are described above; Eval, Concord and ShipCheck execution integrations remain separate work.

The plugin validates the exact canonical JSON Schema pinned at Kujo commit `6695bd9beac4787c9d2db768e9f61dfdb26a95a5`, including date formats and evidence-reference shapes. Build checks verify the bundled schema and example bytes against `bundled/verification-sources.lock.json`. Schema validation establishes structure, not authenticity or applicability.

| Imported classification | Meaning |
| --- | --- |
| passed | Producer claims pass, at least one passed check, no failed/warned/skipped checks. |
| failed | Producer claims fail or reports failed checks. |
| warnings | Producer claims warn or reports warned checks. |
| partial | Producer claims pass, with both passed and skipped checks. |
| not-run | Producer claims pass but reports no passed, failed or warned checks, including skipped-only and empty runs. |
| indeterminate | Producer could not establish a verdict. |
| blocked / error | Producer reports an evaluation that was blocked or encountered an error; canonical verdict must be indeterminate. |

Blocked/error and indeterminate states take precedence over check counts. The adapter rejects pass verdicts with failed checks, timestamps in reverse order, unsafe integer counts, invalid contracts and unsupported schema versions. A producer's `fail` or `warn` remains visible even with zero counted checks. None of these labels means Paperclip observed the execution. Readiness tools may report repository-policy observations rather than project tests; read the producer's own report for its scope.

Inputs are limited to 64 KiB UTF-8 and 32 nested levels. Only result ID, producer/version, claimed subject/verdict/severity/check counts/timestamps/status, reference count and provenance are retained, after common-secret redaction. Unknown extensions, annotation bodies, reference URIs, input evidence IDs, metrics and raw logs are omitted. References are neither opened nor verified. The original is not retained; keep it with the producer. Redaction is defense in depth, not a guarantee that supplied strings are public.

The source digest hashes the exact supplied UTF-8 JSON bytes. The history receipt hashes the retained redacted summary and adapter provenance. They identify different things. Report IDs and subject IDs are supplied metadata and never select a Paperclip company, project, issue or run. Each import gets a fresh host record identity; importing twice creates two history entries.

Imports share the 20-record/30-day company/entity history limits. Inspect, compare, download a redacted export, or explicitly attach issue-scoped evidence as an authenticated human. Workspace freshness and referenced-evidence integrity remain unknown. Clear Kujo data removes retained imports even when the project has no local workspace.
