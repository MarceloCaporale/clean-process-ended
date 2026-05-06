# Client Behavior Notes

MCP hosts differ in how and when they load configured servers.

## Codex

Codex exposes configured MCP tools after the host starts with the server available. Restart may be required after adding a new MCP.

## Claude Code

Claude Code can show stdio health through `claude mcp list`, but tools may not be available in an already-running session. Restart the host session after registration before native validation.

## Gemini CLI

Gemini CLI can register and connect stdio MCP servers. Native validation should still call the injected MCP tools directly, not just a manual Node harness.

## Qwen Code CLI

Qwen Code CLI can register and connect stdio MCP servers. Current local evidence covers native non-destructive MCP tool calls through an Ollama-backed Qwen model workflow only; capture full close-check dry-run evidence before making stronger cleanup-planning claims.

## Agent behavior

Installing an MCP only makes tools available. It does not force agents to use them. Projects should add explicit instructions asking agents to run `janitor_discovery` and `session_close_check` at task close when subprocesses, browsers/devtools, MCP servers, local servers or background jobs were involved.
