# Troubleshooting

- `KUJO_RUNTIME_NOT_FOUND`: reinstall with optional dependencies enabled, confirm the target is supported, or configure an absolute Kujo 1.2+ binary.
- `KUJO_RUNTIME_INCOMPATIBLE`: upgrade the configured/PATH runtime to 1.2 or remove the override to use the bundled version.
- `KUJO_COMPONENT_INTEGRITY_FAILED`: reinstall the plugin from npm; do not edit installed bundle files.
- `KUJO_WORKSPACE_NOT_FOUND`: attach a primary local workspace to the Paperclip project.
- `KUJO_EXEC_TIMEOUT` or `KUJO_OUTPUT_LIMIT`: narrow the change/context or raise the administrator limit within the schema maximum.
- Not a git repository: Review Pack requires a git-backed workspace with a valid `HEAD`; Context and Failure Evidence remain independently usable.
- Stale Review/Context Pack: regenerate after HEAD or the dirty working tree changes.
- Unsupported target: v0.1 supports macOS arm64/x64, Linux arm64/x64, and Windows x64.
- Worker crash: open plugin health, verify the exact Paperclip compatibility train, then reinstall. Component failures should normally appear as structured feature errors rather than crash the worker.

