# Threat model

## Assets and trust boundaries

The protected assets are project source, credentials, Paperclip tenant identity, plugin state, and the integrity of generated evidence. Paperclip plugin code is trusted installed code; manifest capabilities gate worker host APIs but same-origin plugin UI is not an isolation boundary. Native runtime and bundled Kujo source are release inputs verified by package/component checksums.

## Attack surfaces and controls

| Surface | Control |
| --- | --- |
| Malicious filenames, refs, or tool parameters | Zod validation, bounded lengths, strict git-ref grammar, no shell interpolation |
| Workspace traversal or symlink escape | Host workspace lookup, `realpath`, containment checks, selected-path allowlist |
| Arbitrary Kujo scripts | Compile-time component ID union and locked registry; no user path parameter |
| Huge files, diffs, logs, or process output | Component budgets, file/byte limits, stdout/stderr caps, timeouts, bounded UI rows |
| Secrets in logs/files | Safe environment allowlist, CaseFile/Scent redaction, second defensive redaction, sensitive-path denylist |
| Package/component substitution | exact dependency versions, platform package selection, lock commit/version/license/SHA-256, runtime integrity verification |
| Cross-company spoofing | action company scope comes from immutable host context; tool scope comes from `ToolRunContext` |
| Stale or corrupt artifacts | schema version, provenance, git snapshot fingerprint, stale marker, component integrity check |
| Worker failure | structured errors returned from tools; component nonzero exit does not crash the host |

The plugin does not execute suggested tests, rerun failures, expose terminal access, mutate `PATH`, inherit arbitrary environment values, download code at runtime, or write artifacts into project source by default.

## Residual risks

Pattern redaction is defense in depth, not a mathematical guarantee. Operators should still review artifacts before external sharing. Paperclip UI code is trusted same-origin JavaScript in the current plugin architecture. Native package publication and cross-platform CI require supply-chain controls outside the running worker; release uses npm provenance and publishes the neutral resolver last.

