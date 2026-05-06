# Support Matrix

This matrix describes public support intent for `clean-process-ended` v0.7.2. It does not authorize real cleanup. Cleanup remains dry-run by default, and public CLI/MCP real termination is non-operable in v0.7.2.

## Evidence Levels

| Level | Meaning |
| --- | --- |
| L0 | Profile or sample exists, with no host-specific validation claim. |
| L1 | Automated unit or CLI validation passes. |
| L2 | MCP stdio smoke test passes outside a named host. |
| L3 | Named host exposes and runs MCP tools with the expected profile. |
| L4 | External audit bundle or reproducible evidence package reviewed. |

## Host Matrix

| Host | Profile | v0.7.2 status | Evidence level | Required before stronger claim |
| --- | --- | --- | --- | --- |
| Codex Desktop | `codex` | Current local validation completed after Codex restart; dry-run only. | L3 local | Capture publication evidence bundle and keep cleanup real untested. |
| Claude Code | `claude_code` | Current local native validation completed for v0.7.2; dry-run only. | L3 local with sanitized evidence summary | Keep evidence sanitized before any public release and keep cleanup real untested. |
| Gemini CLI | `gemini_cli` | Current local native validation completed for v0.7.2; dry-run only. | L3 local with sanitized evidence summary | Capture raw tool JSON before claiming external audit parity with Claude evidence. |
| Generic MCP Host | `generic_mcp_host` | Diagnostic profile only. | L1-L2 through generic smoke | Do not claim host-specific ownership beyond generic evidence. |

## Platform Matrix

| Platform | Scanner status | Validation status |
| --- | --- | --- |
| Windows | Implemented and used for current local development. | Primary local validation target. |
| macOS | POSIX scanner implemented. | CI/smoke required before stronger claim. |
| Linux | POSIX scanner implemented. | CI/smoke required before stronger claim. |

## Claims Not Made

- No claim of automatic cleanup safety by default.
- No claim that `related_unowned` or `unknown_owner` can be cleaned by default.
- No claim that host validation on one machine transfers to every user machine.
- No claim that browser/devtools cleanup is safe without explicit operator review.
- No claim that installing the MCP makes every agent call it automatically.
- No claim of native validation for additional hosts until a host session calls the MCP tools directly and evidence is captured.
