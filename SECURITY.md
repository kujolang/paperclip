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
- Workspace scans reject individual files over 25 MB and repositories with more than 100,000 Git-visible files before a component starts.
- Child processes use fixed entrypoints, argument arrays, `shell: false`, a small environment, timeouts, output limits, and whole-process-tree termination.
- Git runs without system or global configuration, hooks, external diff drivers, credential prompts, or file-system monitors.
- Component checksums are verified before execution.
- Context content is opt-in, restricted to selected files, bounded, and checked against traversal and symlink escape.
- Stored artifacts are isolated by company, validated on read, checked against their entity and workspace, and cleared on request.
- Disabled features cannot be invoked through tools, UI actions, or stored-artifact reads.
- Generation and content-read events are written to the Paperclip activity log when the host accepts them.
- Failure Evidence records supplied text and never runs the recorded command.
- Redaction covers common credential shapes but cannot guarantee that every secret format is removed.

The release pipeline audits production dependencies, verifies registry integrity and accepted licenses, emits a CycloneDX SBOM, attests the npm tarball, and publishes that exact tarball with npm provenance. Dependabot, dependency review, CodeQL, and the cross-platform compatibility matrix run in GitHub Actions.

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for assets, trust boundaries, abuse cases, and mitigations.
