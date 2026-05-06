# Safety Model

`clean-process-ended` is conservative by default.

## Defaults

- No automatic cleanup is enabled by default.
- Cleanup is dry-run by default.
- The public v0.7.x CLI/MCP cleanup surface provides runtime-validated process hygiene, evidence and dry-run planning; real termination remains non-operable because evidence inputs are not exposed.
- Real cleanup always requires a fresh confirm token.
- `related_unowned` and `unknown_owner` are report-only.
- Project config is ignored unless explicitly trusted.
- Command lines are hashed/redacted by default.
- Browser/devtools and visible-window processes are blocked from default cleanup.
- Host root processes are never cleanup targets.

## Ownership States

- `owned_current_session`: may be considered for dry-run cleanup when all policy gates pass.
- `related_unowned`: related evidence exists but ownership is insufficient.
- `unknown_owner`: insufficient evidence.

Only `owned_current_session` is eligible by default.

## Hard Blockers

Some blockers are absolute and cannot be overridden by explicit PID selection, confirm token or force flags:

- current process or parent chain;
- host root process;
- protected process;
- visible window;
- browser/devtools cleanup;
- process present at session baseline;
- invalid parent temporal order;
- managed PID reuse mismatch;
- managed host profile mismatch;
- command hash change;
- PID reuse.

## Confirm Tokens

Confirm tokens are integrity bindings for a dry-run plan. They bind the action envelope: scope, host, session, signal, force, process tree flag, PID set, command hashes, ownership, risk and blockers.

They are not a substitute for human review.

Configuration cannot disable confirm-token validation for real cleanup.

## Auto-Cleanup

Experimental auto-cleanup can only be allowed from trusted install config and requires explicit acknowledgement. It remains off by default.

## Managed Cleanup

Managed lifecycle cleanup planning requires strong scanner identity and exact host profile. Real termination is not exposed as a public v0.7.x CLI/MCP workflow; if a future version exposes it, it must still require the standard cleanup confirmation flow plus valid SHA-256 evidence.

## Scanner Execution Notes

The Windows scanner may invoke `powershell.exe` or `pwsh.exe` to read process metadata. The optional `CPE_POWERSHELL` override is constrained to those executable names and rejects arbitrary binaries or inline shell arguments.

Windows resource-impact scans include a short CPU-sampling interval. This can add latency on process-heavy machines, but resource idleness is never treated as ownership proof or cleanup authorization.
