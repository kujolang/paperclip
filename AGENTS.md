# Paperclip plugin agent guide

The README is the user guide. Read it before changing the plugin.

## Purpose

`@kujolang/paperclip` adds local Review, Failure Evidence, and Context Packs to Paperclip. It is a thin host integration over pinned Kujo components. Do not replace those components with duplicate TypeScript implementations.

## Read first

1. `README.md` for install and user workflows.
2. `src/manifest.ts` for capabilities, tools, settings, and UI slots.
3. `src/worker.ts` for host registration and state scopes.
4. `src/runtime/` and `src/paperclip/` for process and workspace boundaries.
5. `bundled/kujo-components.lock.json` for component provenance.
6. `tests/` for contract and integration evidence.

## Canonical examples and search hygiene

- Keep copyable install and usage examples in `README.md` and `docs/USAGE.md`.
- Treat tests and `fixtures/` as contracts, not tutorial prose.
- Treat `dist/` as generated output. Build it; do not edit it.
- Exclude `.git/`, `node_modules/`, `dist/`, coverage, and temporary component output from broad searches unless the task targets them.

```bash
rg --files \
  -g '!.git/**' \
  -g '!node_modules/**' \
  -g '!dist/**' \
  -g '!coverage/**'
```

## Local commands

```bash
npm ci --ignore-scripts
npm run components:verify
npm run typecheck
npm test
npm run build
npm run pack:verify
npm run verify
```

The real-component integration suite expects a compatible Kujo binary at `../kujo/target/release/kujo`. Set `KUJO_INTEGRATION_BINARY` to an absolute or repository-relative alternative when needed.

## Boundaries

- Keep requested Paperclip capabilities at least privilege.
- Never accept a workspace path directly from an agent tool.
- Keep child processes shell-free, bounded, and attached to a canonical workspace.
- Do not add a generic command runner.
- Preserve the two-stage Context Pack read boundary.
- Treat redaction as defense in depth, not proof that input contains no secrets.
- Do not fetch component code during install or runtime.
- Sync components only from clean canonical repositories at the commits recorded in `components.sources.json`.
- Keep schema changes versioned and backward compatible within the `0.1.x` line.

## Change checklist

- Update tests for behavior, schema, manifest, or security changes.
- Update `README.md`, the relevant file in `docs/`, and `CHANGELOG.md` for user-visible changes.
- Run `npm run verify` before committing.
- Keep commits small and push a clean `main` branch.

## Release order

Publish the five native Kujo packages first, then `@kujolang/kujo-runtime`, then `@kujolang/paperclip`. Use the release workflows and confirm every published tarball and provenance record before continuing.
