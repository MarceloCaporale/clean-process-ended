# Publication Readiness

Before publishing, run:

```bash
npm run public-beta-candidate
```

This includes syntax checks, tests, MCP stdio smoke validation, strict package validation, public-tree checks, production dependency audit at moderate-or-higher severity, `npm pack --dry-run`, and an installed-tarball smoke test.

For tagged releases, registry submissions or npm publication, do not rely on local evidence alone. Validate the installed package in each intended MCP host first. The release checklist is `docs/release-checklist.md`; the release sequence is `docs/release-process.md`.

## Public Documentation Checklist

- `README.md` exists at the package root.
- `README_ES.md`, `README_DE.md`, `README_PT_BR.md`, `README_ZH.md` and `README_JA.md` exist and are equivalent in content to `README.md`.
- Public docs and samples contain no personal paths.
- Beta status is explicit.
- Dry-run default is explicit.
- No automatic cleanup by default is explicit.
- Public v0.7.x CLI/MCP real cleanup execution is described as non-operable because evidence inputs are not exposed.
- Auto-cleanup is documented as experimental opt-in behavior.
- Historical prototype docs are not part of the public tree.
- The support matrix lists only hosts with current public evidence plus generic MCP-host behavior.
- `AGENTS.md`, `docs/quickstart.md`, `docs/design-decisions.md`, `docs/validation/`, `schemas/` and `examples/` are present.

## Current Host Evidence For v0.7.2

- Codex: current local validation completed after restart against v0.7.2, dry-run only.
- Claude Code: current local native MCP validation completed against v0.7.2, dry-run only.
- Gemini CLI: current local native MCP validation completed against v0.7.2, dry-run only. Public evidence is summary-level; capture raw tool JSON before external-audit parity claims.

Do not upgrade any host status in `docs/support-matrix.md` without a matching evidence bundle or report.

## Required Publication Files

- `README.md`
- `README_ES.md`
- `README_DE.md`
- `README_PT_BR.md`
- `README_ZH.md`
- `README_JA.md`
- `AGENTS.md`
- `CHANGELOG.md`
- `RELEASE_NOTES_v0.7.2.md`
- `SECURITY.md`
- `SUPPORT.md`
- `docs/support-matrix.md`
- `docs/quickstart.md`
- `docs/design-decisions.md`
- `docs/validation/VALIDATION.md`
- `docs/release-checklist.md`
- `docs/release-process.md`
- `docs/public-positioning.md`
- `docs/verification/README.md`
- `docs/verification/v0.7.2/README.md`
- `docs/verification/v0.7.2/release-gate-summary.md`
- `schemas/process_janitor_receipt.schema.json`
- `schemas/audit_bundle.schema.json`
- `examples/README.md`
- `scripts/smoke-packed-tarball.mjs`
