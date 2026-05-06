# Optional integration with codex-agent-mem

`codex-agent-mem` and `clean-process-ended` solve complementary problems:

- `codex-agent-mem` preserves operational continuity between agent sessions.
- `clean-process-ended` verifies local process state and produces non-destructive close evidence.

Used together, they form a local close-session protocol: memory plus process hygiene evidence.

## Recommended flow

```txt
Agent
  -> codex-agent-mem: recover context and check open work
  -> clean-process-ended: run session_close_check / dry-run diagnostics
  -> codex-agent-mem: store a compact process_janitor_receipt summary or hash
```

The integration is optional. Neither MCP should require the other to be installed.

## Receipt shape

`clean-process-ended` can emit a compact receipt summary:

```json
{
  "type": "process_janitor_receipt",
  "source": "clean-process-ended",
  "projectKey": "my-project",
  "hostProfile": "codex",
  "sessionEpochId": "epoch_...",
  "mode": "dry_run",
  "cleanupEligibleByDefault": 0,
  "cleanupRealExecuted": false,
  "evidenceSha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "evidenceSha256Scope": "receipt_payload_canonical",
  "createdAt": "2026-05-04T00:00:00.000Z"
}
```

`codex-agent-mem` should store only the compact receipt, a hash or a short summary. It should not store full command lines, live confirm tokens or secrets.

## Public fixtures

Public snake_case fixtures for `codex-agent-mem` validation live in:

- `docs/fixtures/codex-agent-mem/README.md`
- `docs/fixtures/codex-agent-mem/process_janitor_receipt.schema.json`
- `docs/fixtures/codex-agent-mem/process_janitor_receipt.empty.json`
- `docs/fixtures/codex-agent-mem/process_janitor_receipt.with_candidates.json`
- `docs/fixtures/codex-agent-mem/SHA256SUMS.txt`

The native MCP response remains camelCase. These fixtures define the public interoperability receipt shape expected by `mem_external_receipt_record`.

In the public interoperability receipt, `evidence_sha256` is never null. If there is no separate evidence bundle, use `evidence_sha256_scope="receipt_payload_canonical"` and hash the canonical JSON receipt payload excluding the `evidence_sha256` field itself.

## Non-goals

- No hard runtime dependency between the MCPs.
- No cross-MCP automatic termination.
- No cleanup real triggered by memory closure.
- No command-line capture by default.
