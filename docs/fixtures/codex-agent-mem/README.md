# codex-agent-mem receipt fixtures

These fixtures define the public, sanitized receipt shape that `codex-agent-mem` can store after a non-destructive `clean-process-ended` close check.

## Stable tool names

Safe close-flow tools exposed by `clean-process-ended`:

- `session_status`
- `process_scope_report`
- `process_cleanup_candidates`
- `process_cleanup` with `dry_run=true`
- `session_close_check`

Preferred integration path:

1. Use `session_close_check` when available.
2. Store only a compact receipt in `codex-agent-mem`.
3. Do not store full command lines, tokens, environment variables, secrets, live confirm tokens or raw process output.

## Field naming

The native `clean-process-ended` MCP response uses camelCase.

The public interoperability receipt for `codex-agent-mem` uses snake_case.

## Evidence hash

`evidence_sha256` is always a 64-character lowercase SHA-256 string in this public interoperability contract.

When no separate evidence bundle is written, `evidence_sha256_scope` is `receipt_payload_canonical`. That means `evidence_sha256` is computed over the canonical JSON receipt payload excluding the `evidence_sha256` field itself. Consumers do not need to substitute `null`.

## Files

- `../../../schemas/process_janitor_receipt.schema.json`: canonical public JSON schema for the stored receipt.
- `process_janitor_receipt.schema.json`: compatibility alias that references the canonical schema.
- `process_janitor_receipt.empty.json`: dry-run fixture with no candidates.
- `process_janitor_receipt.with_candidates.json`: dry-run fixture with candidates but no cleanup execution.
- `SHA256SUMS.txt`: SHA-256 checksums for the fixture files.
