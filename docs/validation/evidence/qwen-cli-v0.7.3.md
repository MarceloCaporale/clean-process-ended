# Qwen Code CLI Evidence v0.7.3

Evidence level: L3 native diagnostic tool invocation for Qwen Code CLI with an Ollama-backed Qwen model workflow.

## Summary

Qwen Code CLI `0.15.6` local validation completed with `CPE_HOST_PROFILE=qwen_code`. The server was registered as a native stdio MCP server and appeared as connected in `qwen mcp list`.

The validation used Qwen Code CLI with Ollama through the OpenAI-compatible endpoint. The host exposed the `clean-process-ended` MCP namespace, injected the expected tools into the Qwen Code CLI session and executed non-destructive diagnostic MCP calls in this workflow.

This evidence is limited to native MCP tool discovery and non-destructive diagnostic tool invocation. It does not claim full dry-run close-check parity with Codex Desktop, Claude Code or Gemini CLI evidence.

## Models checked

| Model/workflow | Result |
| --- | --- |
| Qwen Code CLI with Ollama-backed Qwen models | Native MCP server connected, tools were exposed and non-destructive diagnostic tool calls executed successfully in the validated workflow. Cleanup dry-run close-check parity is not claimed. |

## Tools exercised

The Qwen Code CLI session called:

- `janitor_discovery`
- `config_explain`
- `session_status`
- `watcher_status`

## Expected behavior

- `expectedProfile`: `qwen_code`
- watcher disabled by default
- default scope: `owned_current_session`
- `storeCommandLines`: false
- real cleanup disabled
- no `--no-dry-run`

## Observed safety result

No real cleanup was requested or executed. Validation only used diagnostic tools. `process_cleanup_candidates`, `process_cleanup` and full `session_close_check` dry-run cleanup planning were explicitly excluded from the parity claim for this evidence item.

## Evidence hygiene

Public notes do not include full command lines, raw process output, env vars, tokens, secrets or live confirm tokens.
