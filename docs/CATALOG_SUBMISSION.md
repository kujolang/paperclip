# Paperclip catalog submission

**Name:** Kujo — Reviewable Agent Work  
**Package:** `@kujolang/paperclip`  
**Repository/support:** `https://github.com/kujolang/paperclip`  
**License:** MIT  
**Minimum host:** Paperclip `2026.1012.0`

**Description:** Add scoped context, change review, and reproducible evidence to Paperclip agent workflows.

## Requested capabilities

- `agent.tools.register`: 21 explicitly declared tools; execution requires separate settings and human confirmation
- `projects.read`, `issues.read`, `project.workspaces.read`: current entity admission and canonical workspace resolution
- `database.namespace.read/write/migrate`, `plugin.state.read/write`: scoped evidence, approvals and private knowledge indexes
- `issue.documents.write`, `issue.interactions.create/read`: explicit evidence attachment and human confirmation cards
- `jobs.schedule`, `local.folders`: approved offline workflows in a configured private company folder
- `activity.log.write`: scoped operational events
- `ui.detailTab.register`: shared detail tab and inline task workspace slots
- `skills.managed`: optional Scoped Repository Context guidance

The exact capability strings and declarations are authoritative in `src/manifest.ts`.
No generic command runner, external provider credentials, webhook or arbitrary
caller-supplied workspace path is exposed.

## Distribution status — November 11, 2026

The [official plugin administration guide](https://github.com/paperclipai/paperclip-docs/blob/main/docs/administration/plugins.md)
documents bundled discovery, npm installation and digest-verified custom-image
distribution catalogs. These are available distribution mechanisms, not evidence
of an official public marketplace submission process. No such process was found
in the reviewed official documentation; this file is a review brief, not a listing.
Managed-cloud installs require the host's bundled catalog approval.

## UI walkthrough

Kujo appears in the current issue view and in supported project/issue detail tabs.
Paperclip 2026.1106.0 does not mount plugin tabs on run pages; the exported read-only
run component remains supported but unavailable in that host UI. Scoped agent
evidence tools remain usable. See the compatibility sweep for measured behavior.
Review, Context, Failure Evidence, native verification, approved execution and
knowledge workflows are described in the canonical README and usage guide.

Catalog review should require the tagged cross-platform workflow, npm provenance for all six runtime packages and this plugin, install/upgrade/uninstall evidence on the declared minimum host, and the security assertions in `THREAT_MODEL.md`.
