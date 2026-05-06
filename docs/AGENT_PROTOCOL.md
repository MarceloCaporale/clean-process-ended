# Agent protocol

This document is intended for `AGENTS.md`, `CLAUDE.md`, Gemini project instructions and similar agent guidance.

## Recommended instruction

```txt
When clean-process-ended is available, use it only as a non-destructive close-task protocol after non-trivial tasks involving subprocesses, MCP servers, subagents, browser/devtools automation, local servers or background jobs. Run only dry-run/report tools. Never call dry_run=false or --no-dry-run autonomously. If a cleanup plan exists, summarize PIDs, ownership, reasons, risk and blockers, then ask the human before any real cleanup.
```

## Machine-readable discovery

Agents should call `janitor_discovery` before assuming how the MCP should be used. This tool does not scan processes and does not terminate anything.

The response includes:

- `recommendedUse`
- `closeTaskProtocol`
- `neverDo`
- real execution gates
- optional integration notes

## Close check

`session_close_check` is the preferred agent-facing close tool. It uses a compact dry-run flow, does not return live confirm tokens and never terminates processes.

Store or report only its summary unless the user requests deeper process evidence.
