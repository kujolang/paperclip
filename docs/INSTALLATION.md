# Installation

## Requirements

- Paperclip `2026.824.1` or later
- Node.js `24.11.0` or later
- a Paperclip project with a local Git workspace for Review and Context Packs

## Install from npm

```bash
npx paperclipai plugin install @kujolang/paperclip
```

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
