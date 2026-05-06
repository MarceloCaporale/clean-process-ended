# Verification Notes v0.7.3

This file tracks verification evidence for the v0.7.3 public-beta source line.

v0.7.3 is a public framing, validation-metrics and scanner-hardening release. It does not expand the public real-cleanup surface.

## Current Status

- Codex Desktop: current public beta evidence exists for native local validation with expected profile `codex`, watcher disabled and dry-run behavior.
- Claude Code: current public beta evidence exists for native MCP validation with expected profile `claude_code`, watcher disabled and dry-run behavior.
- Gemini CLI: current public beta evidence exists for native MCP validation with expected profile `gemini_cli`, watcher disabled and dry-run behavior.
- Qwen Code CLI: current public beta evidence exists for native diagnostic MCP tool calls with expected profile `qwen_code` and an Ollama-backed Qwen model workflow; cleanup dry-run close-check parity is not claimed.
- Generic MCP hosts: can be tested with `generic_mcp_host`, but host-specific ownership claims require separate evidence.

Public sanitized host summaries live in `docs/validation/evidence/`. Raw local bundles are intentionally excluded from the package.

## Public Runtime Validation Metrics

These are runtime validation metrics, not adoption metrics:

- Validated MCP host workflows in the current beta evidence line: `4` (`codex`, `claude_code`, `gemini_cli`, `qwen_code`), including three dry-run close-check workflows and one Qwen Code CLI native non-destructive MCP tool-invocation workflow; Qwen dry-run close-check parity is not claimed.
- MCP stdio smoke surface: expected to expose the shipped tool catalog through the installed package.
- Local Node test suite: expected to pass as part of `npm run public-beta-candidate`.
- GitHub Actions matrix: configured for Windows, macOS and Linux across Node 18, 20 and 22.
- Public real-cleanup executions: `0`.
- Production dependency audit: expected to report `0` moderate-or-higher vulnerabilities.
- Package smoke: generated tarball must install and expose the shipped CLI/MCP shims.
- Evidence privacy: public receipts and audit summaries must exclude full command lines, raw process output, env vars, tokens and secrets.

## v0.7.3-Specific Checks

- `package.json` and `server.json` report version `0.7.3`.
- `CPE_POWERSHELL` only accepts `powershell.exe`, `pwsh.exe`, or trusted full paths ending in those executable names.
- `CPE_POWERSHELL` rejects arbitrary binaries and strings containing command arguments.
- Windows scanner performance notes document the CPU-sampling delay used for resource impact.
- Public docs frame the release as process hygiene, evidence and dry-run cleanup planning, not as "diagnostics only".
- Public docs do not claim native validation for unverified hosts.
- Public docs mention Qwen only as Qwen Code CLI non-destructive MCP tool-invocation validation with Ollama-backed Qwen models.

## Required Host Revalidation Template

For each additional host added after publication, collect:

- host version;
- Node.js and npm version;
- OS version;
- `mcp list` or equivalent host registration output;
- sanitized host config entry;
- entrypoint SHA-256;
- tool catalog;
- `config_explain`;
- `session_status`;
- `watcher_status`;
- `profile_list`;
- `process_scope_report`;
- `process_cleanup_candidates`;
- `process_cleanup` with dry-run only;
- `process_explain` for representative PIDs;
- explicit statement: cleanup real executed `NO`;
- explicit statement: `--no-dry-run` used `NO`.

## Authorization Gates

- Confirm GitHub Actions pass on the public repository before creating a tag or release.
- Run external static audit from the public GitHub URL before release/tag/npm publication.
- Confirm localized READMEs remain equivalent in content.
- Confirm `npm run public-beta-candidate` includes and passes ESLint, tests, stdio smoke and installed-tarball smoke.
- Do not run npm publication until GitHub CI, external audit and release notes are accepted.
