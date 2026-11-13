# Kujo for Paperclip 0.3.0

Version 0.3.0 adds opt-in execution assurance and an issue-level Verification Center while preserving the previous 21 tools and native Paperclip tasks, agents, runs and approvals. The package now exposes 22 tools and bundles 19 pinned component snapshots.

## Highlights

- Import RunLedger receipts, correlate them with native work, compare attempts and export retained evidence. Imported claims remain unverified.
- Run explicitly approved Workcell containers, Lens browser checks, Muzzle workflows and PackWrite validation or supplied-manifest compilation. Retain logs, screenshots, failures and cancellation outcomes.
- Review current-source acceptance with advisory, required or human-review policies and explicit human waivers. Acceptance metadata does not override Paperclip issue status.
- Inspect chronological attempts and delegated issue evidence in bounded 50-assignment pages. Changed tree membership requires restarting pagination.
- Import measured Watchdog metadata without inventing missing provider usage or cost.
- Include the audited Workcell and corrected Lens snapshots in component bundle 0.13.1.

## Install and upgrade

Use Paperclip 2026.1012.0 or later and patched Node.js 24.22.1 (24.x) or 26.12.1 and later. The integration was qualified against official Paperclip 2026.1106.0. Kujo runtime 1.8.1 is included through platform packages.

Back up Paperclip data, upgrade the host first, and install:

```bash
npx paperclipai plugin install @kujolang/paperclip
```

For an exact version on Paperclip 2026.1106.0:

```bash
npx paperclipai@2026.1106.0 plugin install @kujolang/paperclip --version 0.3.0
```

Restart the host and check runtime health on an issue. Review added capabilities through the administrator installation flow where the host upgrade action rejects capability expansion; retain existing plugin data. The 0.2.1-to-candidate rehearsal preserved evidence across installation and restart. See [Installation](INSTALLATION.md).

New assurance workflows are disabled by default. Configure their prerequisites and review exact human approval before explicitly starting work; approval alone never runs a command. See [Accountability configuration](ACCOUNTABILITY.md).

## Verified scope and limitations

The real-host demonstration uses four deterministic process agents, retained failed and corrected browser checks, human acceptance, cancellation and restart persistence. Pagination was exercised with 52 actual native issues, including browser navigation and stale-cursor rejection. [Test evidence](ACCOUNTABILITY_TESTS.md) records the qualification and earlier timing retries; it is not a claim of provider-driven autonomous agents.

Workcell admission is local Docker with fixed image and resource/network bounds; remote sandbox adapters and Podman are not exposed or qualified. Lens supports unauthenticated loopback targets; page specs accept only `main` and `body`, with other CSS assertions available through executed flows. Trusted-host Eval/source/Muzzle execution can affect host files or networks. Watchdog is metadata-only. PackWrite accepts supplied plans; it does not staff or autonomously execute them.

Official Paperclip 2026.1106.0 does not mount plugin run tabs. Use the issue Verification Center and scoped run-evidence tools. A separately tested host repair has not been released upstream. Checksums provide integrity, not producer authenticity. Native hierarchy limits, retention and manual private-storage cleanup remain documented in [Accountability](ACCOUNTABILITY.md).

## Release checks

Run `npm run release:dry-run` on the release candidate. The signed annotated version tag must match the package version and pass GitHub signature verification. The release workflow repeats verification, publishes with npm provenance, checks a clean registry installation and attaches checksums, an SBOM, component provenance and schemas to the GitHub release.

Assurance execution is admitted only on macOS and Linux. Windows retains the existing compatible tools and receipt imports; its assurance requests fail before preparation. CI exercises that rejection on every platform and runs the native assurance execution fixtures only on supported platforms.
