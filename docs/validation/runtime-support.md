# Runtime Support

`clean-process-ended` is a local MCP stdio server and CLI. The support matrix is about the host integration evidence level, not a guarantee that every agent will call the MCP automatically.

## Node.js

- Supported runtime: Node.js `>=18.17`.
- CI target matrix: Node.js 18, 20 and 22 on Ubuntu, Windows and macOS.

## MCP transport

- Public transport: stdio.
- The server must keep JSON-RPC stdout clean.
- Diagnostic logs should not be written to stdout while serving MCP.

## Hosts

| Host | Profile | Status |
| --- | --- | --- |
| Codex | `codex` | Native local validation completed. |
| Claude Code | `claude_code` | Native local validation completed. |
| Gemini CLI | `gemini_cli` | Native local validation completed. |
| Generic MCP Host | `generic_mcp_host` | Diagnostic profile only; validate concrete hosts separately. |

See `docs/support-matrix.md` and `docs/validation/evidence/`.
