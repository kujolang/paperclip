# Usage

## Paperclip UI

Open an issue and Kujo appears inline in Paperclip's current task view. There is no Classic Task Interface prerequisite. Project, issue detail, and run pages also expose the **Kujo** detail tab where the host supports tabs.

- **Generate Review Pack** measures the current working tree and builds a handoff.
- **Generate Context Pack** selects files for a task at minimal, focused, or broad depth.
- **Capture Failure Evidence** stores supplied command details and logs after bounding and redaction.

Run views display saved evidence. They do not expose a terminal.

The inline workspace and detail tab use the same actions and persisted artifacts, so changing views does not create a second copy of Kujo data.

## Agent tools

### Review changes

```json
{
  "mode": "working_tree"
}
```

Use range mode only with valid Git refs:

```json
{
  "mode": "range",
  "base": "main",
  "head": "HEAD"
}
```

The result includes changed-file and churn counts, risk level, explainable signals, component status, stale state, and suggested tests. Suggested tests are not proof that a command ran.

### Capture failure evidence

```json
{
  "title": "Unit test failed",
  "command": "npm test",
  "exitCode": 1,
  "durationMs": 4200,
  "log": "bounded test output",
  "notes": "failure occurred after the parser change"
}
```

The tool does not execute `command`. It stores bounded, redacted evidence from the supplied fields.

### Get context

```json
{
  "task": "trace the OAuth callback and its tests",
  "depth": "focused",
  "includeContent": false
}
```

Depth controls the token and file budget:

| Depth | Token budget | File limit |
| --- | ---: | ---: |
| `minimal` | 4,000 | 12 |
| `focused` | 16,000 | 40 |
| `broad` | 40,000 | 100 |

Start without content. Review the selected paths and reasons, then request content only when needed.

### Get selected content

```json
{
  "contextPackId": "context-pack-id",
  "paths": ["src/oauth.ts", "tests/oauth.spec.ts"],
  "maxTokens": 8000
}
```

Each path must belong to the referenced Context Pack and remain inside the workspace. Omit `paths` to read all selected files within the token budget.

## Recommended agent sequence

1. Request a focused Context Pack for the task.
2. Read only the selected content needed for the change.
3. Make and test the change with the normal project tools.
4. Generate a Review Pack.
5. Capture Failure Evidence only for commands that actually failed.
6. Report completed checks separately from suggested checks.

## Stored artifacts

The plugin stores the latest normalized artifact in Paperclip plugin state for its project, issue, or run scope. It does not write reports into the project workspace.

Schemas are published in `schemas/`. Consumers should ignore unknown fields added by compatible future releases.
