# Qwen Code CLI Evidence v0.7.3

Evidence level: L3 native diagnostic tools for Qwen Code CLI with an Ollama-backed Qwen model workflow.

## Summary

Qwen Code CLI `0.15.6` local validation completed with `CPE_HOST_PROFILE=qwen_code`. The server was registered as a native stdio MCP server and appeared as connected in `qwen mcp list`.

The validation used Qwen Code CLI with Ollama through the OpenAI-compatible endpoint. The host exposed the `clean-process-ended` MCP namespace, injected the expected tools into the Qwen Code CLI session and executed non-destructive diagnostic MCP calls in this workflow.

## Models checked

| Model/workflow | Result |
| --- | --- |
| Qwen Code CLI with Ollama-backed Qwen models | Native MCP server connected, tools were exposed and non-destructive diagnostic tool calls executed successfully in the validated workflow. |

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

No real cleanup was requested or executed. Validation only used diagnostic tools. `process_cleanup` was explicitly excluded from the tool-call attempts.

## Evidence hygiene

Public notes do not include full command lines, raw process output, env vars, tokens, secrets or live confirm tokens.
