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
| `features.verification` | `false` | Reserve the experimental verification surface. Enabling it produces a warning in `0.1.x`. |

## Process limits

| Setting | Default | Allowed range |
| --- | ---: | ---: |
| `limits.timeoutMs` | 30,000 | 1,000–120,000 |
| `limits.maxStdoutBytes` | 2,000,000 | 1,024–10,000,000 |
| `limits.maxStderrBytes` | 256,000 | 1,024–2,000,000 |

Raising a limit increases the resources available to a local component and the amount of data the host may retain. Change limits only for a known repository need.

Other fixed bounds include a 200 KB Failure Evidence log input, 100 KB Context Pack selection limit per file, and 1 MB hard refusal for content reads.
