# Configuration

Paperclip renders these settings from the plugin manifest.

## Runtime

| Setting | Default | Meaning |
| --- | --- | --- |
| `runtime.binary` | `null` | Absolute Kujo binary override. Relative paths are rejected. |
| `runtime.allowSystemPathFallback` | `true` | Allow a compatible absolute `kujo` found on `PATH` after bundled resolution fails. |

Bundled runtime resolution is the normal choice. Use an override only for controlled development or recovery.

## Features

| Setting | Default | Meaning |
| --- | --- | --- |
| `features.review` | `true` | Enable Review Pack tools and actions. |
| `features.failureEvidence` | `true` | Enable Failure Evidence tools and actions. |
| `features.context` | `true` | Enable Context Pack tools and actions. |
| `features.verification` | `false` | Enable native Spec/Fence/Concord/ShipCheck inspections and bounded evaluation-result imports. Defaults off. Installed/review/ship/full select these tools; Essentials selects only ShipCheck. Each tool and its retained evidence enforce profile admission independently. Native inspections require a runtime; imports do not. None executes project tests. |

## Process limits

| Setting | Default | Allowed range |
| --- | ---: | ---: |
| `limits.timeoutMs` | 27,000 | 1,000–27,000 |
| `limits.maxStdoutBytes` | 2,000,000 | 1,024–10,000,000 |
| `limits.maxStderrBytes` | 256,000 | 1,024–2,000,000 |

Raising a limit increases the resources available to a local component and the amount of data the host may retain. Change limits only for a known repository need.

Other fixed bounds include a 200 KB Failure Evidence log input, 100 KB Context Pack selection limit per file, and 1 MB hard refusal for content reads.

`features.examples` (default true) controls the fixed bundled first-run example.
Disable it to hide execution availability for that example. It does not enable
arbitrary source execution or change the Verification setting.

`features.understand` defaults to `true`; disable it to prevent repository maps through both the panel and agent tool. Doctor distinguishes disabled from blocked Scout readiness.

`features.language` defaults to `true` and controls both source diagnostics and formatting previews, including both agent tools. Previews return source text after defensive redaction; disable this feature when that explicit read workflow is not wanted.


## Capability profile

`capabilityProfile` defaults to `installed`, which preserves every implemented tool subject to its feature switch. `essentials`, `review`, `ship` and `full` follow canonical Kujo profile inheritance for projections with canonical bindings. A compound Review Pack requires both PatchBrief and ChangeBucket, so Essentials does not enable it. `build` selects source diagnostics/preview, Scout and Scent. `ship` adds implemented CaseFile evidence; it does not run project tests or install Eval. `full` enables all implemented projections but cannot activate missing adapters or override disabled features.

Catalog and retained-history discovery remain available under every profile; history still respects the effective feature selection. The bundled fixed example remains controlled by `features.examples`. Profile selection is company-scoped, enforced by the worker for both UI actions and agent tools, and is separate from the host's authorization decision.
