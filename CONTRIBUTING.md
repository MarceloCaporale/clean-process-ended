# Contributing

Thanks for contributing to `clean-process-ended`.

## Current scope

The current release line focuses on:

- local-first MCP process diagnostics;
- conservative ownership and policy evaluation;
- dry-run close-session workflows for AI agents;
- managed lifecycle evidence for processes launched through `cpe-run`;
- public package hygiene, security defaults and reproducible validation.

Please keep changes aligned with the local-first, ownership-first design. Larger automation or cleanup changes should start with an issue or discussion before a pull request.

## Local setup

```bash
npm ci
npm test
npm run public-beta-candidate
```

## Required checks

Run these before opening a pull request:

```bash
npm run check:syntax
npm test
npm run smoke:stdio
npm run validate:package:strict
npm run public-tree:check
npm audit --omit=dev --audit-level=high
npm pack --dry-run --json
```

If your change affects `session_close_check` or `codex-agent-mem` interoperability, also validate the public receipt fixtures under `docs/fixtures/codex-agent-mem/`.

## Coding expectations

- Keep real cleanup disabled by default.
- Never make `related_unowned` or `unknown_owner` cleanup-eligible by default.
- Do not use process-name or command-line keywords as ownership proof.
- Treat browser/devtools, visible windows, shells, host roots and protected processes as sensitive targets.
- Do not store full command lines, environment variables, secrets, raw process output or live confirm tokens in public receipts.
- Keep documentation aligned with actual implementation and validation evidence.

## Public/private boundary

The public repo should contain source, tests, public docs, samples, CI, package metadata and public fixtures.

The public repo should not contain LAB state, POITs, baselines, private audit dossiers, local evidence bundles, generated ZIPs, personal paths or installation data.

## Pull request guidance

- Explain what changed.
- Explain why it changed.
- Call out safety, policy and cleanup implications.
- Call out user-facing behavior differences.
- Include validation output for relevant checks.
