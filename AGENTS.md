# AGENTS

This repository is optimized for MCP-compatible AI agents, coding workflows and maintainers who need a fast, accurate map of the public surface.

## Public name vs package names

- Public repository name: `clean-process-ended`
- npm package name: `clean-process-ended`
- MCP Registry name: `io.github.marcelocaporale/clean-process-ended`
- Main MCP command: `clean-process-ended-mcp`
- Local CLI commands: `cpe-scan`, `cpe-run`

## What this project is

- A local-first MCP process janitor for coding-agent workflows.
- A diagnostic and dry-run-first close-session tool.
- An ownership-first classifier that separates `owned_current_session`, `related_unowned` and `unknown_owner`.
- A managed lifecycle wrapper for subprocesses that should carry explicit process evidence.
- A source of sanitized receipts and audit bundles that can optionally be referenced by `codex-agent-mem`.

## What this project is not

- Not an automatic process killer.
- Not a name-based cleanup script.
- Not a daemon or OS service by default.
- Not a guarantee that every MCP host will call its tools after installation.
- Not a tool that should clean `related_unowned` or `unknown_owner` by default.
- Not a secrets vault; command lines are not stored by default and should not be included in public evidence.

## Working rules for agents

- Preserve the dry-run-first public surface.
- Never make real cleanup, auto-cleanup terminate or `--no-dry-run` the default.
- Keep cleanup claims tied to explicit ownership evidence and policy gates.
- Keep compatibility with the optional `codex-agent-mem` receipt contract.
- Keep public docs free of private LAB paths, local audit dossiers and personal machine routes.
- Keep the language READMEs equivalent in content across languages.
- Do not tag, release, publish to npm or change GitHub release state from a dirty tree.

## Fastest commands

```powershell
npm ci
npm test
npm run check:syntax
npm run smoke:stdio
npm run validate:package:strict
npm run public-tree:check
npm run public-beta-candidate
node .\bin\cpe-scan.js janitor-discovery --client codex --json
node .\bin\cpe-scan.js session-close-check --project-key my-project --json
node .\bin\cpe-scan.js audit-bundle --output-dir .\evidence\cpe --json
```

## Repository map

- `bin/`
  Public CLI entrypoints.
- `src/`
  MCP server, scanner, classifier, ledger, policy and managed lifecycle code.
- `test/`
  Node test suite for ownership, cleanup policy, CLI, runtime and ledger behavior.
- `docs/`
  Public documentation, validation notes, release process and integration guides.
- `docs/validation/`
  Evidence-scoped host validation notes.
- `schemas/`
  Public JSON schemas for receipts and audit bundle contracts.
- `examples/`
  Copy-adaptable host configuration examples.
- `samples/`
  Minimal config snippets shipped with the package.

## Key files

- `src/mcp-server.js`
  MCP stdio tool registration and tool descriptions.
- `src/runtime.js`
  Runtime orchestration, audit bundle, session close checks and discovery.
- `src/classifier.js`
  Ownership, risk and candidate partitioning.
- `src/cleanup.js`
  Dry-run planning and real-cleanup gates.
- `src/policy.js`
  Report, dry-run, manual cleanup and auto-cleanup policy decisions.
- `src/ledger.js`
  Local ledger, session baseline, events and process memory.
- `src/managed-runner.js`
  `cpe-run` managed process launcher.
- `bin/cpe-scan.js`
  CLI commands, package validation and public-tree checks.

## Read this before editing

- Keep public wording conservative and evidence-based.
- Do not document deferred automation as implemented.
- Do not add command-line examples that encourage unattended real cleanup.
- Do not expose live confirm tokens in evidence bundles.
- Do not include full command lines, raw process output, env vars, tokens or secrets in public fixtures.
- Use temporary directories for tests and local smoke validation.

## Documentation map

- `README.md`
  Public English entry point.
- `README_ES.md`, `README_DE.md`, `README_PT_BR.md`, `README_ZH.md`, `README_JA.md`
  Equivalent localized entry points.
- `docs/quickstart.md`
  Fastest safe setup and close-check flow.
- `docs/INSTALL.md`
  Host binding and install notes.
- `docs/SAFETY_MODEL.md`
  Cleanup and auto-cleanup safety model.
- `docs/ARCHITECTURE.md`
  Scanner, classifier, ledger and managed lifecycle architecture.
- `docs/design-decisions.md`
  Product and architecture decisions.
- `docs/support-matrix.md`
  Evidence-scoped host support matrix.
- `docs/validation/`
  Runtime validation notes and host evidence.
- `docs/verification/`
  Release-gate and reproducibility notes.
- `docs/INTEGRATION_CODEX_AGENT_MEM.md`
  Optional receipt integration with `codex-agent-mem`.

## Contribution expectations

- Run `npm test`.
- Run `npm run check:syntax`.
- Run `npm run smoke:stdio` for MCP tool changes.
- Run `npm run validate:package:strict`.
- Run `npm run public-tree:check`.
- Run `npm run public-beta-candidate` before any public release discussion.
