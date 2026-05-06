# Claude Code Evidence v0.7.2

Evidence level: L3 native tools.

## Summary

Claude Code local native validation completed with `CPE_HOST_PROFILE=claude_code`. The MCP server was registered through Claude Code user configuration and native tools were available after session restart.

## Tools exercised

- `config_explain`
- `session_status`
- `watcher_status`
- `profile_list`
- `process_scope_report`
- `process_cleanup_candidates`
- `process_cleanup` with dry-run only
- `process_explain`
- `session_close_check`
- `janitor_discovery`
- `audit_bundle`

## Expected behavior

- `expectedProfile`: `claude_code`
- watcher disabled by default
- default scope: `owned_current_session`
- `storeCommandLines`: false
- no real cleanup
- no `--no-dry-run`

## Observed safety result

Processes related to other hosts were demoted to `related_unowned` and were not eligible for default cleanup. Browser/devtools-like processes were blocked by explicit policy.

## Evidence hygiene

Public notes do not include full command lines, raw process output, env vars, tokens, secrets or live confirm tokens.
