# Verification Notes v0.7.2

This file tracks verification evidence for the v0.7.2 public-beta source line.

## Current Status

- Codex Desktop: locally revalidated after restart with version `0.7.2`, expected profile `codex`, watcher disabled and dry-run-only behavior.
- Claude Code: locally revalidated as a native MCP on this exact v0.7.2 package with expected profile `claude_code`, watcher disabled and dry-run-only behavior.
- Gemini CLI: locally revalidated as a native MCP on this exact v0.7.2 package with expected profile `gemini_cli`, watcher disabled and dry-run-only behavior.

Public sanitized summaries live in `docs/validation/evidence/`. Raw local bundles are intentionally excluded from the package.

## Codex Desktop Local Evidence Summary

- Result: PASS with dry-run candidates requiring human review.
- Tools exercised: `config_explain`, `session_status`, `watcher_status`, `process_scope_report`, `session_close_check`.
- Expected profile: `codex`.
- Watcher: `enabled=false`, `running=false`, `intervalSeconds=300`.
- `storeCommandLines`: `false`.
- Counts: `owned_current_session=314`, `related_unowned=350`, `unknown_owner=0`.
- `cleanupEligibleByDefault`: `257`.
- Dry-run planned cleanup count: `257`.
- Confirm token returned: `false`.
- Cleanup real executed: `NO`.
- `--no-dry-run` used: `NO`.
- Full command lines included: `NO`.
- Tokens, environment variables or secrets included: `NO`.
- Raw process output included: `NO`.
- Public evidence: sanitized summary in `docs/validation/evidence/codex-v0.7.2.md`.

## Claude Code Local Evidence Summary

- Result: PASS.
- Tools exercised: `config_explain`, `session_status`, `watcher_status`, `profile_list`, `process_scope_report`, `process_cleanup_candidates`, `process_cleanup`, `process_explain`, `session_close_check`, `janitor_discovery`, `audit_bundle`.
- Expected profile: `claude_code`.
- Watcher: `enabled=false`, `running=false`, `intervalSeconds=300`.
- `storeCommandLines`: `false`.
- Counts: `owned_current_session=0`, `related_unowned=441`, `unknown_owner=0`.
- `cleanupEligibleByDefault`: `0`.
- Dry-run cleanup count: `0`.
- Confirm token returned: `null`.
- Cleanup real executed: `NO`.
- `--no-dry-run` used: `NO`.
- Full command lines included: `NO`.
- Tokens, environment variables or secrets included: `NO`.
- Raw process output included: `NO`.
- Public evidence: sanitized summary in `docs/validation/evidence/claude-code-v0.7.2.md`.

## Gemini CLI Local Evidence Summary

- Result: PASS.
- Integration: native Gemini CLI MCP tools, not a manual Node harness.
- Tools exercised: `config_explain`, `session_status`, `watcher_status`, `profile_list`, `process_scope_report`, `process_cleanup_candidates`, `process_cleanup`, `process_explain`, `session_close_check`, `janitor_discovery`, `audit_bundle`.
- Expected profile: `gemini_cli`.
- Watcher: `enabled=false`, `running=false`.
- `storeCommandLines`: `false`.
- Counts: `owned_current_session=0`, `related_unowned=442`, `unknown_owner=0`.
- `cleanupEligibleByDefault`: `0`.
- Dry-run cleanup count: `0`.
- Confirm token returned: none / `confirmTokenReturned=false`.
- Cleanup real executed: `NO`.
- `--no-dry-run` used: `NO`.
- Full command lines included: `NO`.
- Tokens, environment variables or secrets included: `NO`.
- Raw process output included: `NO`.
- Entrypoint SHA-256: `b603f419f14f44689323a96c025ea26b2b57639d3b042aee30fa9fc3db220004`.
- Public evidence: sanitized summary in `docs/validation/evidence/gemini-cli-v0.7.2.md`.

Note: the public Gemini evidence summary is sanitized and does not ship raw JSON files for each tool. That is enough to mark local native validation PASS, but raw tool JSON should be captured before claiming external-audit parity with the Claude bundle.

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

For Gemini CLI, optionally repeat the validation to capture the same raw JSON bundle shape used for Claude Code.

## Authorization Gates

- Confirm GitHub Actions pass on the public repository before creating a tag or release.
- Run external static audit from the public GitHub URL before release/tag/npm publication.
- Confirm localized READMEs remain equivalent in content.
- Confirm `npm run public-beta-candidate` includes and passes ESLint and the installed-tarball smoke test.
- Do not run npm publication until GitHub CI, external audit and release notes are accepted.
