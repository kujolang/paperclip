# Contributing

Thanks for improving Kujo for Paperclip.

## Set up

Use Node.js `24.11.0` or later. Build Kujo `1.2.0` in the sibling `kujo` repository, then install dependencies without lifecycle scripts:

```bash
npm ci --ignore-scripts
npm run verify
```

Set `KUJO_INTEGRATION_BINARY` if the release binary is elsewhere.

## Work on one contract at a time

Keep changes focused. Preserve local, deterministic behavior and stable JSON shapes. Add a regression test for each bug fix and contract tests for manifest, schema, path, process, or redaction changes.

Do not edit `dist/` by hand. Do not update bundled component files directly. Change the canonical component repository, pin its clean commit in `components.sources.json`, then run:

```bash
npm run components:sync
npm run components:verify
```

## Security rules

- Resolve workspaces through Paperclip.
- Pass child-process arguments as arrays with `shell: false`.
- Keep time, output, file, and token limits bounded.
- Reject paths outside the selected workspace, including symlink escapes.
- Never store a value after redacting it from the returned artifact.
- Never expose arbitrary command execution through a tool or UI action.

Read [SECURITY.md](SECURITY.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) before changing a trust boundary.

## Pull requests

Describe the problem, user-visible change, test evidence, security effect, and any compatibility impact. Update `CHANGELOG.md` and user docs when behavior changes.

Run the full gate before pushing:

```bash
npm run verify
git diff --check
```
