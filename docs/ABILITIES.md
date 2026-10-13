# Kujo Abilities in Paperclip

The plugin uses two distinct contracts. Canonical Kujo definitions describe portable operations. Paperclip projections describe the actual host tools: company-owned workspace resolution, bounded arguments, private reports and retained evidence. Each projection has its own `kujo.paperclip.*` identity and definition digest, with explicit links to canonical IDs. Compound Review Pack links both PatchBrief and ChangeBucket.

## Pinned sources

- Ability contract: `kujolang/ability` at `bcbecb49b147023877e83d5f2ea647dfede030b5`.
- Canonical catalog/profiles: `kujolang/kujo-cmd` at `7cedc7758cfd5214ec28c2ba62a20bd5cc3d8988`.

The exact files, licenses and SHA-256 hashes are in `bundled/ability-sources.lock.json`. There are 38 canonical definitions and four canonical profiles in this snapshot. Source availability is not proof of an installed or released Paperclip integration. Canonical source pins are references; they do not replace the separately pinned executable component cohort.

## Company profiles

| Profile | Implemented behavior |
| --- | --- |
| `installed` (default) | Preserve all installed projections, subject to feature switches. |
| `essentials` | Canonical Essentials membership; currently Scout plus catalog/history discovery. |
| `review` | Inherit Essentials and add implemented Scent and compound change review. |
| `ship` | Inherit Review and add implemented supplied Failure Evidence. It does not establish that tests ran. |
| `full` | All implemented projections; unavailable ecosystem adapters remain unavailable. |
| `build` | Paperclip source diagnostics/format preview, Scout and Scent. |

Catalog/history discovery and the separately configured bundled example are available independently of canonical profile membership. History payload reads still honor the effective feature selection. Explicit feature disables always win. The worker enforces profile selection on UI and agent paths; UI disabling alone is insufficient.

## Readiness and authority

`installed` means the Paperclip adapter is bundled, not that every prerequisite is healthy. `enabled` includes company profile and feature settings. `supported` describes the included adapter/platform. `ready`, `blocked`, `disabled` and `unsupported` explain the current runtime/component result. `authorization: checked-on-call` deliberately makes no preauthorization claim. Paperclip owns company access and plugin capabilities; future effectful workflows require their own human-bound admission. Neither a canonical profile nor an effects declaration grants permission.

Canonical definitions without an adapter are `not-integrated` and are never registered as executable tools. Discovery accepts no arbitrary command, workspace root or output directory. Redacted formatting is still an explicit content read. Catalog descriptions do not weaken the two-stage Context Pack boundary.

## Evidence

New work records include additive `kujoProjection` metadata with the host definition identity/digest and canonical bindings/digests. Retained payload integrity covers this metadata. These remain Paperclip evidence records, not canonical Ability execution receipts; they do not manufacture principal, approval or invocation attestations. The independent receipt adapter digest also covers its operation descriptor and provenance.

## Updating sources

From clean canonical checkouts at the commits declared in the sync script:

```bash
npm run abilities:sync
npm run abilities:generate
npm run abilities:verify
npm run verify
```

Review the source/projection diffs and effects before changing pins. Generated manifest declarations come from `src/abilities/projections.json`; do not edit `generated.ts`. Generation validates canonical contracts through the pinned Ability TypeScript SDK, detects profile cycles/missing IDs, and checks byte-for-byte output drift. There are no install-time or runtime catalog downloads.
