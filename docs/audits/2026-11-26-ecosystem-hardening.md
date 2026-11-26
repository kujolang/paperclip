# Paperclip hardening on 2026-11-26

The review starts at public main commit `d082064acc8455c6976bdf23284652be3464a34a`. It covers the installed plugin, native component invocation and provenance, workspace and Context Pack admission, execution and artifact file handling, retained evidence, and the offline browser and package gates.

| Priority | Finding | Correction |
|---|---|---|
| P0 | Context selection checked only the final file component before reading a workspace through its normal filesystem path. Reveal separately resolved a pathname and then read it. | Both stages use the pinned runtime’s bounded, beneath-root file opens. Only paths copied by the worker can appear in a pack, and the host checks snapshot freshness after revealing content. |
| P1 | Content was clipped before redaction, which could expand the returned byte count or split UTF-8. | Redact and apply the final byte cap without breaking a code point. Read each approved path once. |
| P1 | Child output repeatedly copied the entire capture as chunks arrived. | Keep bounded chunks and combine once when the child closes. |
| P1 | An unexpected nonregular owner receipt or artifact could block its reader. | Open with nonblocking flags and validate the opened descriptor. Reject hardlinked artifacts. |

Context ranking reuses the bounded Git inventory and keeps only the highest-scoring eligible paths. Existing tool contracts, host approval boundaries, bundle pins, and package versions are preserved.

## Verification

- Baseline Node 24.22.1 repository verification passed with 351 tests and two expected skips. The published host matrix and browser checks passed at the baseline commit.
- Focused tests with the bundled Kujo 1.8.1 cover rooted two-stage context, linked ancestors, redaction and UTF-8 budgets, process capture, and private workflow storage. Both supported Node release lines passed type checking.
- The browser fixture ran on Chromium Headless Shell 156. Two first-attempt screenshot timeouts passed retry and a separate serial rerun. The other 62 UI cases passed in the full run.
- Full local candidate verification passed with 354 tests and two expected skips. The final ranking adjustment was checked again through the real context and contract suites, type check, build, and npm tarball gate.
- In the same Node 24 process, 80,000 sorted paths with an unchanged top-four digest took a median 156.43 ms with full candidate sorting and 101.52 ms with bounded ranking. For 2,048 1 KiB chunks, the old repeated copies took 2,324.07 ms and the new single copy took 1.79 ms. These are isolated workloads with identical outputs. They do not measure end-to-end workspace or child latency.
