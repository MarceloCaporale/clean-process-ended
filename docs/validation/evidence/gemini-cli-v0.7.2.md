# Gemini CLI Evidence v0.7.2

Evidence level: L3 native tools.

## Summary

Gemini CLI local native validation completed with `CPE_HOST_PROFILE=gemini_cli`. Validation used the MCP tools injected into the Gemini CLI session, not only a manual stdio harness.

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

- `expectedProfile`: `gemini_cli`
- watcher disabled by default
- default scope: `owned_current_session`
- `storeCommandLines`: false
- no real cleanup
- no `--no-dry-run`

## Observed safety result

Dry-run returned no real cleanup execution. Related and cross-host signals stayed report-only or blocked by safety policy.

## Evidence hygiene

Public notes do not include full command lines, raw process output, env vars, tokens, secrets or live confirm tokens.
