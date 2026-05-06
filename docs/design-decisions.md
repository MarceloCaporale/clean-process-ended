# Design Decisions

This document records public decisions that should stay stable unless a future release explicitly changes scope.

## Ownership before cleanup

`clean-process-ended` classifies by ownership evidence, not process-name similarity. A process that merely looks like Codex, Claude, Gemini, Node, Python, `npx`, `uvx`, browser tooling or MCP is not enough for default cleanup.

Public ownership buckets:

- `owned_current_session`: the only default cleanup-planning scope.
- `related_unowned`: report-only.
- `unknown_owner`: report-only.

## Host binding is required

Each MCP host should pass `CPE_HOST_PROFILE`. Without host binding, the tool may report context but should not promote ambiguous processes into owned cleanup candidates.

## Baseline protects pre-existing work

The runtime records a session baseline. Processes that already existed at baseline are blocked from default cleanup even if they match related signals.

## Parent chains need temporal sanity

Parent-child relationships must be plausible. PID reuse and impossible parent timestamps should not create ownership.

## Weak signals stay report-only

Shells, wrappers, `node`, `python`, `npx`, `uvx` and broad command-line keywords are context. They do not prove ownership by themselves.

## Browser and devtools policy is conservative

Browser/devtools/playwright-like processes are never default cleanup targets. They require explicit policy handling and should remain outside autonomous cleanup.

## Public v0.7.2 is dry-run oriented

Public CLI/MCP v0.7.2 can inspect, explain, partition, generate dry-run plans and write sanitized evidence. Real cleanup evidence inputs are intentionally not exposed in the public surface.

## Auto-cleanup is experimental and off by default

Auto-cleanup planning exists for policy review. Terminate mode is not part of the public default. Any future real automation must remain opt-in, acknowledged and evidence-gated.

## Evidence must be reproducible and sanitized

Receipts and audit bundles should preserve enough structure for verification while excluding:

- full command lines by default;
- raw process output;
- env vars;
- tokens;
- secrets;
- live confirm tokens.

## codex-agent-mem integration is optional

`codex-agent-mem` can store compact continuity and closure receipts. `clean-process-ended` can provide process hygiene evidence. Neither project is a hard dependency of the other.

## GitHub first, npm later

GitHub public beta can expose source and CI for review. npm publication should wait until public CI, external static audit and release-gate evidence are accepted.
