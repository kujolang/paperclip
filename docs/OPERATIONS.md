# Operations

## Health and audit trail

Paperclip reports worker health and component integrity in the plugin status view. A healthy worker has four verified components. Runtime compatibility is checked when a feature first runs.

Successful generation, Context content reads, and data clearing write company-scoped Paperclip activity events. Events contain the operation, entity, and artifact ID. They do not contain source, logs, commands, or file contents. Paperclip owns activity-log retention and export.

The plugin stores only the latest artifact of each type for an entity. State namespaces include the company ID. Use **Clear Kujo data** on a project or issue to remove its Review, Failure, and Context artifacts. Paperclip owns backup retention and deletion for run-scoped state.

## Upgrade

1. Read the changelog and compatibility table.
2. Back up Paperclip by using the host's normal backup process.
3. Install the exact target version: `npx paperclipai plugin install @kujolang/paperclip@<version>`.
4. Restart the worker.
5. Check plugin health, generate a Context Pack in a test project, and run a Review Pack against a small known change.

The reader validates stored artifact schemas. It ignores corrupt or unsupported artifacts instead of rendering them. Generate a new artifact after an upgrade if an older one no longer loads.

## Rollback

Install the previous exact version and restart the worker. Do not reuse a Context Pack across a rollback unless its schema, workspace ID, and Git snapshot still match. Generate a new pack when in doubt.

If a bad release affected stored data, clear the entity's Kujo data before regenerating it. A rollback does not restore artifacts that a newer version replaced.

## Rotate bundled components

Component updates must start from clean, reviewed source repositories at exact commits.

1. Update `components.sources.json` with the source commit and version.
2. Run `npm run components:sync`.
3. Review the full component diff and generated lock file.
4. Run `npm run verify` on every supported platform.
5. Release the plugin only after the referenced Kujo runtime is available on npm.

Never hand-edit a bundled file without updating its canonical source. Runtime checks reject any file that differs from the component lock.

## Release credentials

GitHub Actions publishes through the npm trusted publisher bound to `kujolang/paperclip`, `.github/workflows/release.yml`, and the `npm` environment. Keep `id-token: write`; do not add an npm access token or `NODE_AUTH_TOKEN`. The npm package requires two-factor authentication and disallows traditional token publishing, while trusted OIDC publishing remains available.

## Recover from corrupt state

If a detail view shows no artifact after an upgrade, inspect worker logs for schema or state errors. Clear the entity's Kujo data, then regenerate the artifact. Do not edit Paperclip's plugin-state tables directly.

If component integrity fails, reinstall the exact npm package. If runtime resolution fails, remove an invalid binary override or reinstall optional dependencies. Keep system `PATH` fallback disabled on tightly controlled hosts.

## Incident response

1. Disable the affected feature in company settings. Server-side checks block its tools, actions, reads, and Context content access.
2. Stop or restart the plugin worker. Shutdown cancels active Kujo process groups.
3. Preserve Paperclip activity records, worker logs, package version, component lock, and npm integrity metadata.
4. Clear affected artifacts if they may contain sensitive data.
5. Rotate any credential found in supplied logs. Redaction is a safeguard, not proof that a log contains no secret.
6. Report product vulnerabilities through the private channel in `SECURITY.md`.

Do not post private logs, workspace paths, or exploit details in public issues.

## Service expectations

Kujo for Paperclip is a local plugin. Availability follows the Paperclip host and local Kujo process. The project does not promise a response-time or uptime SLA. GitHub issues are the public support channel for reproducible non-security defects. Security reports use GitHub Security Advisories.

Each operation has a hard time and output budget. Review and Context reject Git-visible files larger than 25 MB or workspaces with more than 100,000 Git-visible files before starting a bundled analyzer. Split or exclude oversized inputs instead of raising this guard.
