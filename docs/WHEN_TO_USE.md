# When to use clean-process-ended

`clean-process-ended` is a diagnostic and close-task tool. Installing it as an MCP server makes its tools available to an agent, but it does not force the agent to use them.

Use it when a task may have left local processes behind:

- a non-trivial coding task is ending;
- subagents were used;
- browser automation, Chrome DevTools or Playwright were used;
- local servers, MCP servers, scripts or background jobs were started;
- the machine feels slow and agent-related subprocesses are suspected;
- the user explicitly asks for process diagnostics or cleanup candidates.

Do not use it after every trivial prompt. Do not use it as a manual watcher loop.

## Safe close-task check

The recommended close path is non-destructive:

```bash
cpe-scan janitor-discovery --client codex --json
cpe-scan agent-protocol --client codex --json
cpe-scan session-close-check --project-key my-project --json
```

When using MCP tools directly, the equivalent flow is:

1. `janitor_discovery`
2. `session_status`
3. `process_scope_report`
4. `process_cleanup_candidates`
5. `process_cleanup` with `dry_run=true`
6. `process_explain` for representative PIDs only when needed

## Absolute rules

- Never call `dry_run=false` autonomously.
- Never use `--no-dry-run` autonomously.
- Never treat `related_unowned` or `unknown_owner` as cleanup targets.
- Never clean browser/devtools, shell or host-root processes.
- Never use CPU idle, process name or a keyword as proof of ownership.
