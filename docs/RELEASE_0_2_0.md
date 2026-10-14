# Kujo for Paperclip 0.2.0

Kujo now brings repository understanding, private offline project knowledge, native quality checks and human-approved workflows into Paperclip.

## Highlights

- Ask your project: explicitly index selected local files and get answers with snapshot citations, freshness inspection and index deletion.
- Understand repositories with Scout and focused context; inspect architecture, artifact drift, task contracts, packages and release-readiness signals.
- Check/lint Kujo source and preview formatting. Preview script, AI-agent, SQLite API and MCP starters; create files through a separate human-approved action.
- Run opt-in evaluations and Kujo source/tests after exact human approval. Run shipped offline Dispatch examples with durable jobs and review checkpoints.
- Inspect, compare, export and explicitly attach retained redacted evidence to issues.

## Upgrade

Back up Paperclip data and upgrade to official Paperclip 2026.1012.0 or later before installing. Node.js 24.11.0 or newer is required. Install with `npx paperclipai plugin install @kujolang/paperclip`, restart and open an issue. No custom host fork, separate Kujo install or provider key is required. The package includes Kujo 1.8.1 and fifteen pinned components.

Start with Try the Kujo example, Understand this repository and Ask your project. Execution and project creation remain separately enabled and human-approved; approval does not automatically start work.

## Scope

Reports do not prove tests ran. Approved execution runs trusted code, not a sandbox. Starter previews do not install or start services. Dispatch supports the shipped offline examples, not general live-provider or external-effect recovery. Offline RAG integration is separately qualified; standalone RAG 1.1.0 remains unpublished pending its required review evidence. The broader ecosystem roadmap is not claimed complete.

### Upgrading from 0.1.x

Back up Paperclip data. As an instance administrator, uninstall the existing Kujo plugin with **data retention enabled (do not purge)**, then immediately use the install command above to install the new release, then restart Paperclip. Review the expanded permissions: scheduled jobs, private database storage, local workflow folders and issue interaction/document actions support the new features. The official 2026.1012.0 host's dedicated Upgrade action rejects added capabilities; use its administrator install flow for this release. Do not select permanent data removal. The upgrade rehearsal preserves the existing plugin identity and retained failure evidence across restart.
