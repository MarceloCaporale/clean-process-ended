# Release Notes v0.7.2

`clean-process-ended` v0.7.2 is the GitHub public-beta source release for an ownership-first local MCP process janitor.

## Highlights

- MCP stdio server and CLI for agent process diagnostics.
- Dry-run-first cleanup workflow.
- Public real-cleanup surface is intentionally non-operable in v0.7.2 because evidence inputs are not exposed.
- Explicit host binding through `CPE_HOST_PROFILE`.
- Ownership model based on session baseline, host profile, parent-chain evidence, managed lifecycle metadata and safety policies.
- Managed lifecycle wrappers through `cpe-run`.
- `session_close_check` and `janitor_discovery` for agent close-task protocols.
- Audit bundle generation for reproducible, non-destructive evidence.
- Optional `codex-agent-mem` receipt fixtures with non-null SHA-256 evidence hashes.
- Public package metadata for npm/GitHub/MCP Registry preparation.

## Public Safety Position

The default behavior is diagnostic. The package reports, partitions and plans; it does not automatically terminate processes.

Real termination remains blocked from the public CLI/MCP surface in this release. Future releases that expose real cleanup must keep strict gates: trusted install config, explicit operator intent, confirm token, evidence SHA-256 and policy blockers.

## Validation State

Codex, Claude Code and Gemini CLI have current local/native MCP validation with their expected `CPE_HOST_PROFILE` values, dry-run only. Public sanitized summaries live in `docs/validation/evidence/`. Raw local bundles are intentionally not shipped in the package.

See `docs/support-matrix.md` and `docs/verification/v0.7.2/README.md`.

## Publication Gates

Maintainers should verify these gates before tag, GitHub Release, MCP Registry submission or npm publication:

- `npm run public-beta-candidate` passes on the public tree;
- host evidence is refreshed for the advertised support matrix;
- npm pack output and checksums are captured;
- the GitHub release checklist is complete;
- no private LAB paths, audit folders or generated evidence bundles are shipped.
