# Public Positioning

`clean-process-ended` is not a process killer by name. It is an ownership-first process janitor for local AI coding-agent workflows.

## Short Description

Local MCP process janitor that helps AI agents and operators identify subprocesses tied to a work session, produce evidence and review dry-run cleanup plans before considering cleanup.

## Longer Description

Agent sessions often leave local MCP servers, devtools, browser helpers, local servers or subprocesses running after the useful work has ended. `clean-process-ended` gives the host and the operator a conservative close-task check: what is owned by this session, what is merely related, what is unknown, and what is blocked by policy.

The public beta emphasizes runtime-validated process hygiene, reproducible evidence and dry-run planning. It is intentionally not an automatic process killer.

It should be positioned as a practical developer-experience tool: less guesswork at the end of agent tasks, fewer stale local helpers, clearer evidence before cleanup decisions, and safer pairing with continuity tools such as `codex-agent-mem`.

## Differentiators

- Ownership-first classification instead of name-based cleanup.
- Explicit host binding with `CPE_HOST_PROFILE`.
- Baseline and session evidence to avoid touching pre-existing processes.
- Managed lifecycle wrappers for processes launched under janitor observation.
- Audit bundle and receipt outputs for reproducible evidence.
- Optional continuity pairing with `codex-agent-mem`.

## Compatibility Framing

- Codex Desktop, Claude Code and Gemini CLI have current local dry-run validation evidence.
- Qwen Code CLI with Ollama-backed Qwen models has current local native non-destructive MCP tool validation evidence.
- Additional hosts should be described only after a concrete profile, native MCP tool calls and an evidence bundle exist.
- Generic MCP compatibility is a protocol and configuration claim, not a guarantee that every host will invoke the janitor automatically.

## Metrics Framing

Use metrics that are tied to evidence. These are runtime validation metrics, not adoption metrics:

- `0` public real-cleanup executions in validation.
- dry-run-only host validation for the current Codex Desktop, Claude Code and Gemini CLI public beta evidence.
- L3 local evidence for Codex Desktop, Claude Code and Gemini CLI.
- L3 local non-destructive MCP tool evidence for Qwen Code CLI with Ollama-backed Qwen models.
- MCP stdio smoke, package validation, installed-tarball smoke and dependency-audit gates in `npm run public-beta-candidate`.
- sanitized receipts and audit bundles designed to omit command lines, raw process output, env vars, tokens and secrets.

Do not use stars, forks, downloads or third-party production usage as evidence before the package has had time in public. Those are adoption metrics and should be reported separately from runtime validation.

## Recommended Website Copy

`clean-process-ended` identifica procesos locales vinculados a sesiones de agentes y MCPs, separa ownership real de señales debiles y genera planes de cleanup en dry-run antes de cualquier accion sobre el entorno. Combinado con `codex-agent-mem`, permite cerrar continuidad y evidencia de higiene local en un mismo protocolo de fin de tarea.

## Not Recommended

Avoid calling the project:

- an automatic cleanup daemon;
- a universal process killer;
- a replacement for OS process management;
- a tool that can safely terminate every process that looks like Codex, Claude, Gemini or MCP.
- a tool with validated native support for hosts that have not yet produced evidence.

## Pairing With codex-agent-mem

`codex-agent-mem` v1.0.1 preserves continuity. `clean-process-ended` v0.7.3 closes the local process hygiene loop. They work independently, but together they create a safer end-of-task protocol: recover context, finish work, produce a dry-run janitor receipt, and store only compact evidence in memory.

## Author and Lab

Created and maintained by Marcelo Caporale.

- X: `https://x.com/MarceloCaporale`
- Studio: `https://visualaimedia.com`
- Lab: `https://visualsystemslab.com`
