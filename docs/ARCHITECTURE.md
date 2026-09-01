# Architecture

```text
Paperclip issue/project/run context
  -> @kujolang/paperclip worker (typed validation and workspace resolution)
  -> @kujolang/kujo-runtime (configured, bundled, then optional PATH fallback)
  -> allowlisted pinned component (ChangeBucket, PatchBrief, CaseFile, Scent)
  -> bounded machine output
  -> normalized schema v1
  -> Paperclip plugin state and native detail tab
```

Paperclip remains the system of record for companies, projects, workspaces, issues, runs, approvals, budgets, and authentication. The plugin requests only project/workspace reads, agent-tool registration, plugin state, its detail tab, and its managed guidance skill.

All execution enters through `executeKujo()`. It uses `spawn`, never a shell, validates a real absolute working directory, passes a minimal allowlisted environment, caps stdout/stderr, and applies a timeout. Feature code can call only IDs in the compiled component registry. Registry resolution validates the complete bundle against the lock before returning an entrypoint.

Artifacts use Paperclip state scopes: Review and Context Packs are stored against their project or issue; Failure Evidence is stored against its run. Generated CaseFile/Scent scratch output is created in a private temporary directory and removed after normalization. Project repositories remain read-only.

## Public contracts

- npm packages and runtime resolver API documented in the Kujo runtime repository
- Paperclip manifest API version 1 and minimum host version `2026.824.1`
- four namespaced agent tools declared in the manifest and worker
- component lock schema version 1
- Review Pack, Failure Evidence, and Context Pack schema version 1
- additive JSON compatibility within a plugin major version

Review generation captures a git snapshot before parallel read-only ChangeBucket/PatchBrief calls and checks it afterward. Partial PatchBrief failure preserves an accurate ChangeBucket footprint and records component status. Context cache identity combines workspace, HEAD/dirty fingerprint, normalized task, depth, and component version. The v0.1 worker records the key but intentionally regenerates instead of adding a second cache index.

