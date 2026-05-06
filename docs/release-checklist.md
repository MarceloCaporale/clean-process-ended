# Release Checklist

Use this checklist before any GitHub or npm publication. It is intentionally stricter than a local smoke test.

## Metadata

- `package.json` name, version, license, author, repository, bugs, homepage and keywords are final.
- `server.json` name matches `package.json.mcpName`.
- `server.json` package identifier and version match `package.json`.
- `LICENSE` is Apache-2.0 and `NOTICE` is present.
- `README.md`, `README_ES.md`, `README_DE.md`, `README_PT_BR.md`, `README_ZH.md`, `README_JA.md`, `CHANGELOG.md`, `RELEASE_NOTES_v0.7.3.md`, `SECURITY.md` and `SUPPORT.md` are reviewed.
- The localized READMEs are equivalent in content; language changes, claims do not.
- `AGENTS.md`, `docs/quickstart.md`, `docs/design-decisions.md`, `schemas/`, `examples/` and `docs/validation/` are reviewed.

## Safety Claims

- README states beta status.
- README states dry-run default.
- README states automatic cleanup is disabled by default.
- README states v0.7.3 public CLI/MCP real cleanup is non-operable.
- `related_unowned` and `unknown_owner` remain report-only by default.
- Agent protocol says not to call `dry_run=false` autonomously.
- No documentation implies that installation alone makes agents use the MCP automatically.

## Public Tree Hygiene

- No private LAB paths in shipped docs or samples.
- No local evidence bundles in the public package.
- No `_AUDITORIA_DOCS`, `_BASELINE`, `_INFO_DOCS`, `90_ARCHIVO`, local zip packages or generated checksums in the public tree.
- `node_modules`, `.release`, `*.tgz`, `SHA256SUMS.txt`, evidence and audit bundles are ignored.
- Historical prototype docs are not part of the public tree.
- Public JSON schemas and examples contain no secrets, env vars, tokens, full command lines or local paths.

## Validation Gates

Run:

```bash
npm run public-beta-candidate
```

Expected sub-gates:

- ESLint;
- syntax check;
- test suite;
- MCP stdio smoke test;
- strict package validation;
- public-tree check;
- production dependency audit at moderate-or-higher severity;
- `npm pack --dry-run`.
- installed-tarball smoke test (`npm run package:smoke-tarball`).
- GitHub Actions on the public repository must pass before tag, release or npm publication.

## Host Evidence

Before upgrading support claims:

- Codex: refresh native validation after installing the exact publish candidate.
- Claude Code: revalidate native MCP tools with `CPE_HOST_PROFILE=claude_code`.
- Gemini CLI: revalidate native MCP tools with `CPE_HOST_PROFILE=gemini_cli`.
- Qwen Code CLI: revalidate native diagnostic MCP tools with `CPE_HOST_PROFILE=qwen_code` and an Ollama-backed Qwen model workflow; capture full dry-run close-check evidence before claiming parity with Codex, Claude or Gemini.
- Additional hosts: add to README, support matrix, validation evidence, examples, snippets, package keywords and discoverability only after native MCP tool validation and sanitized evidence are captured.

Each host evidence bundle should include:

- tool catalog;
- `config_explain`;
- `session_status`;
- `watcher_status`;
- `profile_list`;
- `process_scope_report`;
- `process_cleanup_candidates`;
- `process_cleanup` with dry-run only;
- `process_explain` for representative PIDs;
- command versions and entrypoint hash;
- explicit confirmation that no cleanup real was executed.

## Artifacts

- Capture `npm pack --dry-run --json`.
- Capture package tarball SHA-256 only if a real package artifact is created.
- Do not publish until the final artifact hash and release notes match.
- Do not push tags until the GitHub checklist and host evidence are accepted.
- Do not publish npm until public CI and external static audit from the GitHub URL are accepted.
