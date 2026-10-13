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

`features.execution` defaults to `false` and gates the approved Eval workflow. Installed, Full and canonical Ship profiles admit it; other profiles
do not. The issue panel and `manage-evaluation` tool require a separate human approval
for every immutable request. Scoped list metadata and cancellation remain
available when execution is disabled. Execution also clamps stdout/stderr
to 500 KB/64 KB. See [execution admission and limits](EXECUTION.md).

`features.sourceExecution` defaults to `false` and separately gates native Kujo
run/test in Installed, Build and Full. Enabling Eval does not enable source
execution. The issue panel and `manage-kujo-execution` tool require a human-only
approval for every immutable request and never start automatically. Source and
Eval share the company limit of20 active requests and two running owners;
metadata recovery and cancellation remain available after disabling. Output is
clamped to500 KB stdout/64 KB stderr and runtime to27 seconds. See
[native source and tests](EXECUTION.md#native-source-and-tests) for frozen-input
coverage and the absence of sandboxing or persistent services.

`features.projectCreation` defaults to `false`. Installed, Build and Full expose
approved script/API/MCP/fixture-agent creation through `manage-kujo-starter` and
the issue panel. It is independent of Eval, run/test and read-only example
previews; none of those settings grants write permission. Every creation requires
a separate human-only approval. Metadata/cancellation remain available while
disabled, and requests share existing company quotas and retention.

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

`features.language` defaults to `true` and controls source diagnostics, formatting previews and offline package inspection, including their three agent tools. Package inspection is available in Installed, Build and Full profiles. Previews return source text after defensive redaction; disable this feature when that explicit read workflow is not wanted.


## Capability profile

`capabilityProfile` defaults to `installed`, which preserves every implemented tool subject to its feature switch. `essentials`, `review`, `ship` and `full` follow canonical Kujo profile inheritance for projections with canonical bindings. A compound Review Pack requires both PatchBrief and ChangeBucket, so Essentials does not enable it. `build` selects source diagnostics/preview, Scout and Scent. `ship` adds implemented CaseFile evidence; it does not run project tests or install Eval. `full` enables all implemented projections but cannot activate missing adapters or override disabled features.

Catalog and retained-history discovery remain available under every profile; history still respects the effective feature selection. The bundled fixed example remains controlled by `features.examples`. Profile selection is company-scoped, enforced by the worker for both UI actions and agent tools, and is separate from the host's authorization decision.

`features.examples` also controls native script/fixture-agent and pinned API/MCP starter previews. These previews require Installed, Build or Full and never create files in the project workspace.
