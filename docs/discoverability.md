# Discoverability Metadata

This document captures metadata and phrasing for GitHub, npm, the MCP Registry and agent-driven discovery.

## Recommended GitHub description

`Ownership-first local MCP process janitor for AI coding agents: dry-run close checks, managed process evidence and conservative cleanup planning for Codex, Claude Code, Gemini CLI and generic MCP hosts.`

## Recommended GitHub topics

- `mcp`
- `model-context-protocol`
- `codex`
- `claude-code`
- `gemini-cli`
- `ai-agents`
- `ai-coding-agents`
- `process-management`
- `process-cleanup`
- `process-janitor`
- `session-close-check`
- `agent-tools`
- `local-first`
- `developer-tools`
- `nodejs`
- `stdio`

## Recommended release framing

`0.7.2` is a public beta candidate for local-first, ownership-first process diagnostics and dry-run close-session checks for AI coding-agent workflows.

The public release should be framed as a diagnostic, evidence and close-task protocol tool, not an automatic process killer. Public v0.7.x CLI/MCP is dry-run oriented; real cleanup evidence inputs are intentionally not exposed. Auto-cleanup remains disabled by default and experimental. The safe default workflow is `janitor_discovery`, `session_close_check`, report/dry-run review and optional storage of a sanitized `process_janitor_receipt` in `codex-agent-mem` v1.0.1.

Position the combined Visual Systems Lab line as two independent but complementary local MCP tools:

- `codex-agent-mem` v1.0.1: local-first continuity, memory packs and closure checks.
- `clean-process-ended` v0.7.2: local-first process hygiene, dry-run janitor receipts and managed process evidence.

Together, they improve end-of-task experience by reducing repeated context and adding a safe process-hygiene check before cleanup decisions.

## Search phrases this repo should naturally support

- MCP process janitor
- Agent process janitor
- AI agent process janitor
- AI coding agent process janitor
- MCP process cleanup
- Codex process cleanup
- Claude Code process cleanup
- Gemini CLI process cleanup
- AI agent subprocess diagnostics
- AI coding agent subprocess diagnostics
- local-first process diagnostics
- dry-run process cleanup
- MCP session close check
- agent session close check
- codex-agent-mem process receipt
- codex-agent-mem clean-process-ended integration
- managed process lifecycle for agents
- ownership-first process cleanup
- safe MCP process cleanup
- local MCP process janitor
- Visual Systems Lab MCP tools

## Rules for future docs

- Prefer concrete safety language over broad automation claims.
- Repeat important terms naturally: `MCP`, `local-first`, `process janitor`, `AI coding agents`, `dry-run cleanup`, `session close check`, `Codex`, `Claude Code`, `Gemini CLI`, and `codex-agent-mem`.
- Do not describe cleanup real or auto-cleanup terminate as generally available.
- Do not claim host validation without evidence for that host/runtime.
- Keep `codex-agent-mem` integration optional and receipt-based.
- Keep author metadata consistent: Marcelo Caporale, `https://x.com/MarceloCaporale`, `https://visualaimedia.com`, `https://visualsystemslab.com`.
- Keep private LAB routes, personal paths and audit dossiers out of public docs.
