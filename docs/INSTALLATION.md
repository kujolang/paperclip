# Installation

## Requirements

- Paperclip `2026.1012.0` or later; stable `2026.1106.0` is the November 11 tested target (see [coverage and limits](COMPATIBILITY_SWEEP_2026_11_11.md))
- patched Node.js `>=24.22.1 <25` or `>=26.12.1` (the package engine requirement)
- a Paperclip project with a local Git workspace for Review and Context Packs

## Install from npm

```bash
npx paperclipai plugin install @kujolang/paperclip
```

For a pinned plugin version, Paperclip 2026.1106.0 supports the separate option:

```bash
npx paperclipai@2026.1106.0 plugin install @kujolang/paperclip --version 0.2.1
```

That exact CLI path was verified against a disposable host. Combined scoped
references such as `@kujolang/paperclip@0.2.1` still fail package-path resolution;
[upstream PR #12745](https://github.com/paperclipai/paperclip/pull/12745) remains open.
The pinned example installs the published 0.2.1 archive, not this sweep's unreleased
working-tree changes. Use the established release process to publish those changes.

Restart Paperclip if it is running. Open an issue and confirm that the Kujo workspace appears in the current task view. On project pages, open the **Kujo** tab. No Classic Task Interface setting is required. Paperclip `2026.1106.0` does not mount plugin tabs on run pages: the Kujo run panel is unavailable in that host UI, although retained run evidence remains accessible through the agent tools. This is an observed host limitation, not removal of the plugin's read-only run component.

The package installs `@kujolang/kujo-runtime` and one matching optional native package. Supported targets are macOS arm64/x64, Linux arm64/x64, and Windows x64. No Kujo package uses `preinstall`, `install`, or `postinstall`.

## Upgrade

Use Paperclip's plugin upgrade command for `@kujolang/paperclip`, then restart the host. Keep the plugin, Paperclip host, and Kujo runtime within the versions listed in the main README.

Artifact schema version 1 stays readable across compatible `0.1.x` releases.

## Uninstall

Use Paperclip's normal plugin uninstall flow. A standard uninstall follows the host's retention policy for plugin state. An explicit purge removes plugin state. Neither operation changes project source.

## Develop from source

Clone `kujolang/kujo` and `kujolang/paperclip` as siblings. Build Kujo, then install and verify the plugin:

```bash
cd kujo
cargo build --release --bin kujo

cd ../paperclip
npm ci --ignore-scripts
npm run verify
```

Set `KUJO_INTEGRATION_BINARY` if the Kujo binary is not at `../kujo/target/release/kujo`.

## Verify a release

After publication:

```bash
npm view @kujolang/paperclip version dist.integrity dist.attestations
npm pack @kujolang/paperclip --dry-run
```

Install it in a clean Paperclip host, confirm the Kujo status panel, and exercise one Review, Failure Evidence, and Context Pack before promoting the release.

## Evidence-history upgrade

Version 0.2.0 added a plugin database namespace and `migrations/001_evidence.sql`, plus explicit issue-document writes. Paperclip must support database namespace migrations and authenticated action actors. Reapprove the new capabilities in the host if prompted. A missing or mismatched database namespace fails with repair guidance; do not manually substitute another schema. The host floor remains `2026.1012.0`; see the compatibility report for separate `2026.1106.0` acceptance. Database backup and explicit uninstall/purge behavior follow the host, independently of previously attached issue documents.

### Upgrading from 0.1.x

Back up Paperclip data. As an instance administrator, uninstall the existing Kujo plugin with **data retention enabled (do not purge)**, then immediately use the install command above to install the new release, then restart Paperclip. Review the expanded permissions: scheduled jobs, private database storage, local workflow folders and issue interaction/document actions support the new features. Both the 2026.1012.0 and 2026.1106.0 loaders reject added capabilities through the dedicated Upgrade action. Use the administrator install flow; Enable does not reinstall an uninstalled plugin. Do not select permanent data removal. The upgrade rehearsal preserves the existing plugin identity and retained failure evidence across restart.

Private tasks and projects are unavailable to the plugin's non-member identity,
including retained evidence and recovery metadata. Use an explicitly public test
project for qualification. On macOS, the host state and temporary directories
must permit the host's durable directory syncs; the sweep used `/private/tmp`
after a Documents workspace parent rejected fsync. Do not disable durability checks.
