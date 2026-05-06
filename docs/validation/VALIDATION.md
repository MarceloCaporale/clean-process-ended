# Validation

Validation is evidence-scoped. A host is only described at the level actually observed.

## Evidence levels

- `L0 static`: profile or sample exists, with no host-specific validation claim.
- `L1 automated`: automated unit or CLI validation passes.
- `L2 stdio smoke`: MCP stdio smoke test passes outside a named host.
- `L3 native tools`: the named host session can call MCP tools directly with the expected profile.
- `L4 reviewed evidence`: external audit bundle or reproducible evidence package reviewed.

## Current v0.7.3 status

| Host | Profile | Evidence level | Status |
| --- | --- | --- | --- |
| Codex | `codex` | L3 native tools | Validated locally; dry-run only. |
| Claude Code | `claude_code` | L3 native tools | Validated locally; dry-run only. |
| Gemini CLI | `gemini_cli` | L3 native tools | Validated locally; dry-run only. |
| Qwen Code CLI | `qwen_code` | L3 native non-destructive tools | Validated locally through Qwen Code CLI with Ollama backend; non-destructive MCP tool-invocation workflow only, with no cleanup dry-run close-check parity claim. |
| Generic MCP Host | `generic_mcp_host` | L1-L2 automated/stdio smoke | Generic profile for MCP-compatible host testing; host-specific validation requires separate evidence. |

## Safety requirements for validation

- Do not execute real cleanup.
- Do not use `--no-dry-run`.
- Do not include full command lines in public evidence.
- Do not include raw process output, env vars, tokens or secrets.
- Keep `related_unowned` and `unknown_owner` report-only.

## Evidence files

Host notes live in `docs/validation/evidence/`. Release-gate notes live in `docs/verification/`.
