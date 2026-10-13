# Verification workflows

## Task contracts

With Verification enabled, select a Git-visible `.spec.json`, `.spec.yml`, `.spec.yaml` or `.spec.toml` contract and choose **Review task contract**. The pinned Spec 1.0.1 converter and validator operate on private copies; the source workspace and declared checks are never executed or changed. Strict mode promotes native warnings to a contract validation failure. Parse/type admission failures are identified separately from completed native validation.

The panel shows the goal, scope, acceptance criteria, declared check descriptions/types, non-goals and approval points. All criteria and checks remain **not-run**. A valid contract is not a completed task, a verified check, or an approval grant. The adapter does not infer links between individual criteria and checks. Command parameters, metadata and other unselected fields are not retained. Selected text is redacted, with the source-byte digest and component provenance retained in company/entity-scoped history.

Only the first 1,000 eligible Git-visible paths are listed. Reads use the native beneath-root filesystem boundary, reject sensitive/ignored paths and symlink escapes, and accept at most 64 KiB of UTF-8 text. Converted documents are limited to depth32; processes and output are bounded. No project code, hooks or workspace modules are imported. Results become stale when the observed workspace changes; immutable history preserves the original observation.

Agent input: `inspect-task-contract` with `{ "path": "specs/release.spec.yml", "strict": true }`. The host supplies company/workspace identity. Project and issue actions persist scoped evidence; run surfaces remain read-only.

## Imported evaluation claims

Enable `features.verification` in company settings. The installed/full/review/ship profiles expose **Import evaluation result** and the `import-verification` agent tool. Build and essentials profiles do not. The feature defaults off. Imports work without a local workspace or native Kujo runtime.

Paste `kujo.evaluation-result/v1` JSON into the project or issue panel. Eval 2.0.0 emits this format as `evaluation-result.json`; other producers must supply the same contract. The import adapter does not convert legacy tool reports or invoke native tools. Native Spec validation is described above; Eval, Fence, Concord and ShipCheck execution integrations remain separate work.

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
