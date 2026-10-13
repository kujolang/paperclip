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

## Native artifact drift

Select **Inspect artifact drift**, or call `kujolang.paperclip:inspect-artifact-drift` with `{}`. Paperclip resolves the company and project workspace. Verification must be enabled and the company profile must include the adapter (`installed`, `review`, `ship` or `full`). The feature defaults off. Run views do not execute this action.

Concord 1.0.0 is pinned at `767b28dec5532639c01259eb47d1b19af995e552`. All six canonical checks run on a private snapshot: CLI/docs, Spec/Eval declarations, manifests/docs, versions, examples and source-of-truth cues. Commands are read from source, never executed. Results remain experimental drift leads, with native severity, confidence, artifact references, expected/observed text and suggested fixes. They do not establish that evaluations or example commands passed.

The shared snapshot reader admits at most 1,000 Git-visible paths, 64 KiB per file and 16 MiB aggregate. Root artifacts are copied before docs/tests/eval_results/examples and other files. This is admission priority, not a replacement for canonical discovery. Nonportable paths, sensitive filenames, symlinks, unreadable, oversized and non-text files are omitted. Every omission conservatively makes coverage partial, even if the artifact may not have been relevant to a canonical check. Copied-file counts are not inspected-artifact counts. Native discovery limits also make results partial.

Canonical reference preflight runs before native checks and blocks manifest entry/name fallbacks or README example inputs that escape the snapshot. It is not a sandbox for arbitrary directories. Source copies and fixed isolated bridge code are removed after inspection. No cache, project imports or workspace writes occur. A second bounded snapshot detects changes; later workspace observations mark retained evidence stale without rewriting receipts.

`failed` means high/critical drift; `warnings` means low/medium leads; `passed` means no leads in the admitted scope. `not-run` means no recognizable artifacts were admitted, `blocked` means unsafe references, and `partial` takes precedence over findings when coverage is incomplete. Runtime or malformed-output failures return an error, never a pass. Common-secret redaction applies before company/entity-scoped history is saved. Exports retain the complete bounded result; the panel shows the first100 items per list.

## Native release readiness

Select **Inspect release readiness**, or call `kujolang.paperclip:inspect-release-readiness` with `{}`. Paperclip supplies company and workspace identity. Enable Verification; installed/essentials/review/ship/full profiles select this adapter. Build does not. Selecting ShipCheck through Essentials does not authorize Spec, Fence, Concord or evaluation imports: tool calls, panel sections and evidence reads enforce each projection independently.

ShipCheck 1.0.0 is pinned at `0a9f5795e9498f3698d5da6bb66642544251dd37`. Its 16 native checks cover Git, README, license/ignore files, tests/lint/format/CI presence, installation/usage guidance, examples/docs, versions, changelog, Kennel metadata and entry declarations. A passing check is a detected signal. Tests, linters, examples, declared entry paths and release artifacts are not executed or validated.

All artifact checks run against the same bounded private snapshot used by Concord/Fence:1,000 Git-visible paths,64KiB per text file,16MiB aggregate, no symlink traversal. Root files have admission priority, followed by conventional test/docs/example/CI directories. The snapshot has no fabricated Git repository: the fixed bridge replaces only its `git-repo` result with ShipCheck's bounded native Git check of the actual host workspace. Native report formatting, metadata parsing and gate calculations remain canonical. Host validation checks the exact16 unique check identities and summary consistency. Source copies are removed finally, and a second bounded snapshot plus Git observation detects stale inputs.

Missing error-level signals produce `failed`; warning-only results produce `warnings` while the native metadata gate remains passed. All signals present produce `passed` only within this metadata scope. Any omitted, unreadable, sensitive, non-text or oversized candidate, rejected path or truncated inventory produces `partial`, even when the copied subset meets the native gate. A Git checkout with no artifacts fails the missing metadata checks; it does not claim that project tests were attempted. Runtime or malformed report failures are errors. The UI prioritizes blockers and warnings, with passing signals expandable. Retained, redacted `shipcheck-latest` records use the existing company/entity-scoped history, export and retention controls. A passing metadata gate does not certify or publish a release.

## Imported evaluation claims

Enable `features.verification` in company settings. The installed/full/review/ship profiles expose **Import evaluation result** and the `import-verification` agent tool. Build and essentials profiles do not. The feature defaults off. Imports work without a local workspace or native Kujo runtime.

Paste `kujo.evaluation-result/v1` JSON into the project or issue panel. Eval 2.0.0 emits this format as `evaluation-result.json`; other producers must supply the same contract. The import adapter does not convert legacy tool reports or invoke native tools. Native Spec, Fence, Concord and ShipCheck inspection are described above; approval-backed Eval execution remains separate work.

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
