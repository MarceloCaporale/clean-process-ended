# Codex Evidence v0.7.2

Evidence level: L3 native tools.

## Summary

Codex local validation completed after restart with `CPE_HOST_PROFILE=codex`. Tools were available as native MCP tools and exercised in dry-run mode only.

Tools exercised for this evidence refresh:

- `config_explain`
- `session_status`
- `watcher_status`
- `process_scope_report`
- `session_close_check`

## Expected behavior

- `expectedProfile`: `codex`
- watcher disabled by default
- default scope: `owned_current_session`
- `storeCommandLines`: false
- no real cleanup
- no `--no-dry-run`

## Observed safety result

- `totalProcesses`: 920
- `candidates`: 664
- `owned_current_session`: 314
- `related_unowned`: 350
- `unknown_owner`: 0
- `cleanupEligibleByDefault`: 257
- `plannedCleanupCount`: 257
- `cleanupRealExecuted`: false
- `confirmTokenReturned`: false

Dry-run behavior found owned current-session candidates for human review, but no cleanup was executed and no live confirm token was returned. Real execution remained blocked by the public v0.7.2 execution gate. Pre-existing, cross-host, browser/devtools, protected and visible-window processes remained blocked or report-only according to policy.

## Evidence hygiene

Public notes do not include full command lines, raw process output, env vars, tokens, secrets or live confirm tokens.
