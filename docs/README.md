# clean-process-ended docs

Public documentation included with the package.

## Index

- `quickstart.md`: fastest safe setup and dry-run close-check flow.
- `ARCHITECTURE.md`: v0.7.3 architecture.
- `design-decisions.md`: product and architecture decisions that should stay stable.
- `SAFETY_MODEL.md`: cleanup and auto-cleanup safety model.
- `MANAGED_LIFECYCLE.md`: `cpe-run` managed lifecycle.
- `PUBLICATION_READINESS.md`: package checks before publishing.
- `release-checklist.md`: checklist for GitHub/npm publication.
- `release-process.md`: release sequence and approval boundaries.
- `support-matrix.md`: host/platform evidence levels and validation status.
- `public-positioning.md`: public copy, positioning and claims to avoid.
- `HOSTS.md`: public host profiles and validation status.
- `INSTALL.md`: npm/npx and local source commands.
- `CONFIGURATION.md`: config sources, environment variables and trust boundaries.
- `AUDIT_BUNDLE.md`: non-destructive evidence bundle contents.
- `WHEN_TO_USE.md`: when agents and users should run a close-task check.
- `AGENT_PROTOCOL.md`: dry-run-only protocol snippets for agent instructions.
- `INTEGRATION_CODEX_AGENT_MEM.md`: optional continuity integration with `codex-agent-mem`.
- `validation/VALIDATION.md`: evidence levels and validation rules.
- `validation/runtime-support.md`: runtime and host support notes.
- `validation/client-behavior.md`: host-specific MCP loading notes.
- `validation/evidence/`: sanitized public host evidence summaries.
- `verification/README.md`: verification evidence hygiene.
- `verification/v0.7.3/README.md`: v0.7.3 publication validation notes.
- `verification/v0.7.3/release-gate-summary.md`: local gate summary and maintainer authorization gates.
- `fixtures/codex-agent-mem/`: public snake_case receipt schema and examples for `codex-agent-mem`.

## Public contracts and examples

- `../schemas/`: public JSON schemas for external receipts and audit bundle summaries.
- `../examples/`: copy-adaptable host configuration examples.
- `../samples/`: minimal configuration snippets used by package examples.

The npm package allowlist ships only the docs explicitly listed in `package.json`. Historical prototype notes and future watcher plans are intentionally not part of the public tree.
