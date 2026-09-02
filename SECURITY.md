# Security policy

## Report a vulnerability

Use GitHub Security Advisories for `kujolang/paperclip`. Do not open a public issue with exploit details, credentials, private source, logs, or workspace paths.

Include the affected version, impact, safe reproduction steps, and suggested mitigation when available.

## Supported versions

Security fixes apply to the latest tagged `0.1.x` release and `main`. Before `1.0`, a fix may require upgrading to the latest minor version instead of receiving a backport.

## Operating model

The plugin analyzes local Paperclip workspaces with bundled Kujo components. It requests no network, secret, issue-write, approval, budget, database, job, webhook, or arbitrary-folder capability.

The plugin does not provide a sandbox. Only install it in a trusted Paperclip host. Treat generated Review, Failure Evidence, and Context Packs as sensitive project data.

## Security boundaries

- Paperclip supplies canonical workspaces; tools cannot choose raw workspace paths.
- Child processes use fixed entrypoints, argument arrays, `shell: false`, a small environment, timeouts, and output limits.
- Component checksums are verified before execution.
- Context content is opt-in, restricted to selected files, bounded, and checked against traversal and symlink escape.
- Failure Evidence records supplied text and never runs the recorded command.
- Redaction covers common credential shapes but cannot guarantee that every secret format is removed.

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for assets, trust boundaries, abuse cases, and mitigations.
