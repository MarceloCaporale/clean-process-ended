# clean-process-ended

<p align="center">
  <img src="docs/assets/clean-process-ended-social-preview.png" alt="clean-process-ended: local process hygiene for MCP agent workflows" width="100%">
</p>

Other languages: [Español](./README_ES.md) | [Deutsch](./README_DE.md) | [Português do Brasil](./README_PT_BR.md) | [中文](./README_ZH.md) | [日本語](./README_JA.md)

**Ownership-first local MCP process janitor for AI coding agents, built for Codex Desktop, Claude Code, Gemini CLI, Qwen Code CLI non-destructive tool workflows with Ollama-backed Qwen models, and MCP-compatible host workflows where subprocesses can outlive the useful work.**

`clean-process-ended` inspects local subprocesses related to agent and MCP sessions, separates session ownership from weak similarity signals, and produces reviewable dry-run cleanup plans backed by reproducible evidence before any environment action is considered.

`clean-process-ended` runs as a local stdio MCP server. Codex Desktop, Claude Code and Gemini CLI have dry-run validation; Qwen Code CLI has native non-destructive MCP tool-invocation validation with Ollama-backed Qwen models. Other MCP-compatible hosts can be tested through the generic MCP profile.

The project is designed for local MCP and coding-agent workflows where subprocesses, browser helpers, devtools, local servers or MCP servers can keep running after the host session or task has ended. It classifies processes by ownership evidence instead of process-name similarity, then reports what is actionable, blocked, related or unknown.

It does not send process evidence to a remote service, does not store full command lines by default, and does not treat beta diagnostics as permission to terminate processes.

## What you get

- **Agent process visibility**: see local subprocesses related to Codex Desktop, Claude Code, Gemini CLI, Qwen Code CLI non-destructive tool workflows with Ollama-backed Qwen models, generic MCP hosts and future validated runtimes without relying on process-name cleanup.
- **Ownership-first safety**: classify `owned_current_session`, `related_unowned` and `unknown_owner` before planning anything destructive.
- **Dry-run close checks**: give agents a concrete end-of-task protocol through `janitor_discovery`, `session_close_check`, reports, candidates and audit bundles.
- **Reproducible evidence**: generate sanitized receipts, SHA-256 evidence, audit bundles and support-matrix notes for review.
- **Managed lifecycle helpers**: wrap known local commands with `cpe-run` so later dry-run reconciliation has stronger evidence.
- **Optional memory pairing**: combine with `codex-agent-mem` ([GitHub](https://github.com/MarceloCaporale/codex-agent-mem)) so continuity and process hygiene can be closed together.

## Why this repository exists

- AI coding agents can leave MCP servers, browser drivers, local dev servers and helper processes behind.
- A process name like `node`, `python`, `chrome`, `mcp` or `codex` is not proof of ownership.
- Users need a safe close-task protocol before deciding whether any process should be cleaned up.
- Public tooling should make the conservative path easy: inspect, explain, dry-run, record evidence, then ask a human.
- `clean-process-ended` turns local process hygiene into an auditable workflow instead of an ad hoc task-manager guess.

## Status

- Version: `0.7.3` beta.
- Runtime: Node.js `>=18.17`.
- Transport: MCP stdio.
- Cleanup default: dry-run.
- Automatic cleanup default: disabled.
- Persistent watcher: not installed by default.

Do not treat beta results as a replacement for operator review. The public v0.7.3 CLI/MCP surface provides runtime-validated process hygiene, evidence and dry-run planning; it does not execute real termination from the public CLI/MCP surface.

## Validation Snapshot

Current v0.7.3 public-beta evidence separates runtime validation metrics from adoption metrics. It proves discovery, reports, evidence and dry-run planning paths; it does not claim cleanup-real validation:

| Area | Current evidence |
| --- | --- |
| MCP tool surface | Core close-check, report, explain, policy, audit and managed-lifecycle tools are exposed by the server. |
| Codex | Native local validation after restart; dry-run only. |
| Claude Code | Native local MCP validation completed; dry-run only; sanitized evidence summary available. |
| Gemini CLI | Native local MCP validation completed; dry-run only; sanitized evidence summary available. |
| Qwen Code CLI | Native local MCP tool-invocation validation completed with Ollama-backed Qwen models; non-destructive diagnostic workflow only; full dry-run close-check parity is not claimed. |
| Public cleanup real | `0` real cleanup executions are part of public validation. |
| Evidence privacy | Public receipts are designed to exclude full command lines, raw process output, env vars, tokens and secrets. |

## Public Validation Metrics

These are real validation metrics from the public beta line and release gate, not adoption metrics such as stars, forks, downloads or third-party production usage:

- Validated MCP host workflows: `4` (`codex`, `claude_code`, `gemini_cli`, `qwen_code`), including three dry-run close-check workflows and one Qwen Code CLI native non-destructive MCP tool-invocation workflow; Qwen dry-run close-check parity is not claimed.
- MCP stdio smoke surface: the shipped server exposes the close-check, report, explain, policy, audit and managed-lifecycle tool catalog.
- Local release gate: ESLint, syntax checks, Node tests, MCP stdio smoke, strict package validation, public-tree check, dependency audit, `npm pack --dry-run` and installed-tarball smoke.
- GitHub Actions matrix: configured for Windows, macOS and Linux across Node 18, 20 and 22.
- Public real-cleanup executions: `0`.
- Production dependency audit target: `0` moderate-or-higher vulnerabilities.
- Evidence privacy target: no full command lines, raw process output, env vars, tokens, secrets or live confirm tokens in public receipts.

## Install

Use with `npx`:

```bash
npx -y --package clean-process-ended clean-process-ended-mcp
```

Or install the package and run the binaries:

```bash
npm install -g clean-process-ended
cpe-scan report --json
clean-process-ended-mcp
```

## MCP Host Snippet

For Codex-style TOML configuration:

```toml
[mcp_servers.clean_process_ended]
command = "npx"
args = ["-y", "--package", "clean-process-ended", "clean-process-ended-mcp"]
env = { CPE_HOST_PROFILE = "codex" }
```

Host profile values currently exposed by the package are:

- `codex`
- `claude_code`
- `gemini_cli`
- `qwen_code`
- `generic_mcp_host`

Additional samples are in `samples/` and copy-adaptable examples are in `examples/`.

## Support Matrix

This matrix describes public profile intent and validation status for v0.7.3. It does not claim cleanup safety beyond the documented policy gates. See `docs/support-matrix.md` and `docs/validation/` for evidence levels and release status.

| Host | Profile | Public status |
| --- | --- | --- |
| Codex | `codex` | Current local validation completed after restart; dry-run only. |
| Claude Code | `claude_code` | Current local native validation completed; dry-run only. |
| Gemini CLI | `gemini_cli` | Current local native validation completed; dry-run only. |
| Qwen Code CLI | `qwen_code` | Current local native MCP tool-invocation validation completed with Ollama-backed Qwen models; non-destructive diagnostic workflow only. |
| Generic MCP Host | `generic_mcp_host` | Diagnostic profile only; host-specific ownership claims require separate evidence. |

## CLI

Common non-destructive commands:

```bash
cpe-scan report --json
cpe-scan candidates --json
cpe-scan cleanup --dry-run --scope owned_current_session --json
cpe-scan janitor-discovery --client codex --json
cpe-scan agent-protocol --client codex --json
cpe-scan session-close-check --project-key my-project --json
cpe-scan audit-bundle --output-dir ./evidence/cpe --json
cpe-scan smoke-stdio --json
```

Managed lifecycle evidence:

```bash
cpe-run --host codex --role mcp-server -- node ./server.js
cpe-scan managed-reconcile --json
cpe-scan managed-lifecycle --json
cpe-scan managed-cleanup-dryrun --json
```

`managed-cleanup-dryrun` is report-only in v0.7.3.

## Agent Close Protocol

Installing the MCP only makes its tools available to the host. It does not guarantee that an agent will call them.

Recommended agent behavior:

- use `janitor_discovery` to learn the non-destructive protocol;
- run `session_close_check` at the end of non-trivial tasks involving subprocesses, MCP servers, browsers/devtools, subagents, local servers or background jobs;
- never call `dry_run=false` or `--no-dry-run` autonomously;
- summarize any dry-run plan before asking a human about real cleanup.

## Optional codex-agent-mem Integration

`codex-agent-mem` v1.0.1 and `clean-process-ended` v0.7.3 work independently, but they are designed to complement each other. `codex-agent-mem` preserves task continuity and closure state; `clean-process-ended` records process-hygiene evidence and dry-run janitor receipts. Used together, the recommended close flow is:

1. recover and close continuity with `codex-agent-mem`;
2. run `clean-process-ended` as a dry-run close check;
3. store only a compact `process_janitor_receipt` summary or hash in memory.

The combined workflow improves user experience by reducing repeated context and adding a safer end-of-task hygiene check. This is an optional integration: neither MCP is a hard dependency of the other. Public receipt schemas and examples live in `schemas/` and `docs/fixtures/codex-agent-mem/`.

## Project Metadata

- Author: Marcelo Caporale.
- X: `https://x.com/MarceloCaporale`.
- Studio: `https://visualaimedia.com`.
- Lab: `https://visualsystemslab.com`.
- License: Apache-2.0.
- Repository: `https://github.com/MarceloCaporale/clean-process-ended`.
- MCP Registry name: `io.github.marcelocaporale/clean-process-ended`.
- Related optional MCP: `codex-agent-mem`.

## Cleanup Safety

By default, cleanup is dry-run and scoped to `owned_current_session`. In v0.7.3, the public CLI/MCP surface provides runtime-validated process hygiene, evidence and dry-run planning: real termination remains non-operable from public CLI/MCP because evidence inputs are intentionally not exposed. The internal real-cleanup gate remains stricter than the public surface and requires all of the following before any termination path:

- an eligible `managed_strong` or `managed_strong_expired` candidate in the current safety policy;
- trusted install config with `cleanup.realExecutionEnabled=true`;
- `--no-dry-run`;
- a fresh confirm token from a previous dry-run plan;
- valid SHA-256 evidence from a prior audit/receipt bundle;
- no policy blocker such as unknown ownership, browser/devtools guardrails, or host-root protection.

If future versions expose real cleanup publicly, they must expose evidence SHA-256 inputs explicitly and keep these gates intact.

`related_unowned` and `unknown_owner` are report-only by default.

Experimental auto-cleanup is opt-in only. It is disabled by default, must be explicitly acknowledged in trusted installation config, and should be treated as experimental even when enabled.

## Documentation

- `AGENTS.md`: repository guide for coding agents and maintainers.
- `docs/quickstart.md`: fastest safe setup and close-check flow.
- `docs/SAFETY_MODEL.md`: cleanup and auto-cleanup safety model.
- `docs/ARCHITECTURE.md`: scanner, ownership, managed lifecycle, and audit bundle architecture.
- `docs/design-decisions.md`: product and architecture decisions.
- `docs/HOSTS.md`: host profiles and validation status.
- `docs/support-matrix.md`: formal support matrix and evidence levels.
- `docs/INSTALL.md`: install and host binding notes.
- `docs/WHEN_TO_USE.md`: when to run close checks.
- `docs/AGENT_PROTOCOL.md`: instructions for agents and project prompts.
- `docs/INTEGRATION_CODEX_AGENT_MEM.md`: optional continuity integration with `codex-agent-mem`.
- `docs/MANAGED_LIFECYCLE.md`: managed process lifecycle commands.
- `docs/AUDIT_BUNDLE.md`: non-destructive evidence bundle contents.
- `docs/validation/`: validation levels and host evidence notes.
- `docs/verification/`: verification notes and release-gate summaries.
- `schemas/`: public JSON schemas for receipts and audit bundle summaries.
- `examples/`: copy-adaptable host configuration examples.
- `SECURITY.md`: security reporting and support policy.
- `SUPPORT.md`: public support matrix.
- `CHANGELOG.md`: release notes.
- `RELEASE_NOTES_v0.7.3.md`: release notes for v0.7.3.

## Release Checks

For maintainers preparing tags, GitHub Releases, MCP Registry submissions or npm publication, run:

```bash
npm run public-beta-candidate
```

This gate includes ESLint, syntax checks, tests, MCP stdio smoke validation, strict package validation, moderate-or-higher dependency audit, public-tree validation, `npm pack --dry-run` and installed-tarball smoke validation.

Then complete `docs/release-checklist.md`, refresh host evidence listed in `docs/verification/v0.7.3/README.md`, wait for GitHub Actions, run external static audit from the public GitHub URL, and proceed only after explicit human approval.

## Author

Created and maintained by Marcelo Caporale.

- X: [@MarceloCaporale](https://x.com/MarceloCaporale)
- Studio: [Visual AI Media](https://visualaimedia.com)
- Lab: [Visual Systems Lab](https://visualsystemslab.com)

## License

Apache-2.0.
