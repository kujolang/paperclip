# Installation

## Requirements

- Paperclip `2026.1012.0` or later
- Node.js `24.11.0` or later
- a Paperclip project with a local Git workspace for Review and Context Packs

## Install from npm

```bash
npx paperclipai plugin install @kujolang/paperclip
```

Use the package name without an exact version suffix until Paperclip ships
[paperclipai/paperclip#12745](https://github.com/paperclipai/paperclip/pull/12745).
Current hosts misparse exact scoped references such as
`@kujolang/paperclip@0.1.7`; the unversioned command above installs the current npm
release correctly.

Restart Paperclip if it is running. Open an issue and confirm that the Kujo workspace appears in the current task view. On project and run pages, open the **Kujo** tab. No Classic Task Interface setting is required.

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

## Upcoming evidence-history upgrade

The next release adds a plugin database namespace and `migrations/001_evidence.sql`, plus explicit issue-document writes. Paperclip must support database namespace migrations and authenticated action actors. Reapprove the new capabilities in the host if prompted. A missing or mismatched database namespace fails with repair guidance; do not manually substitute another schema. The documented historical host floor has not yet been revalidated for this expansion; minimum/latest real-host acceptance is a release gate. Database backup and explicit uninstall/purge behavior follow the host, independently of previously attached issue documents.

### Upgrading from 0.1.x

Back up Paperclip data. As an instance administrator, disable the existing Kujo plugin, use the install command above to install the new release, then restart Paperclip. Review the expanded permissions: scheduled jobs, private database storage, local workflow folders and issue interaction/document actions support the new features. The official 2026.1012.0 host's dedicated Upgrade action rejects added capabilities; use its administrator install flow for this release. Do not uninstall with data removal. The upgrade rehearsal preserves the existing plugin identity and retained failure evidence across restart.
