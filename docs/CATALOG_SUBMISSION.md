# Paperclip catalog submission

**Name:** Kujo — Reviewable Agent Work  
**Package:** `@kujolang/paperclip`  
**Repository/support:** `https://github.com/kujolang/paperclip`  
**License:** MIT  
**Minimum host:** Paperclip `2026.824.1`  

**Description:** Add scoped context, change review, and reproducible evidence to Paperclip agent workflows.

## Requested capabilities

- `agent.tools.register`: four explicitly declared bounded tools
- `projects.read`, `project.workspaces.read`: canonical workspace resolution only
- `plugin.state.read`, `plugin.state.write`: normalized artifact persistence
- `ui.detailTab.register`: one shared Kujo tab on project/issue/run details
- `skills.managed`: optional Scoped Repository Context guidance

The plugin requests no HTTP, secret, issue-write, approval, budget, database, job, webhook, or arbitrary local-folder capability.

## UI walkthrough

The shared Kujo tab starts with runtime/artifact status. Issue/project views provide **Generate Review Pack**, **Generate Context Pack**, and **Capture Failure Evidence** actions. Review shows blast radius, explainable signals, and clearly labeled suggested verification. Failure Evidence shows bounded excerpts and redaction counts. Context shows selected paths, reasons, estimated tokens, depth, and stale/budget status. Run views show associated persisted evidence without exposing a terminal.

Catalog review should require the tagged cross-platform workflow, npm provenance for all six runtime packages and this plugin, install/upgrade/uninstall evidence on the declared minimum host, and the security assertions in `THREAT_MODEL.md`.
