# Agent workflow

Ask the agent to select context before broad reading:

```text
Use kujolang.paperclip:get-context with task "trace the OAuth callback" and depth "focused".
Read only the selected files needed for the task.
```

After the change, request a Review Pack:

```text
Use kujolang.paperclip:review-changes. Report suggested checks as suggestions unless you ran them.
```

If a command fails, save bounded evidence without rerunning it:

```text
Use kujolang.paperclip:capture-failure with the command, exit code, and relevant log excerpt.
```
