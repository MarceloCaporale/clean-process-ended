# Validation Evidence

This directory records public, sanitized evidence summaries for host/runtime validation.

Rules:

- No real cleanup.
- No `--no-dry-run`.
- No full command lines.
- No raw process output.
- No env vars, tokens or secrets.
- No live confirm tokens.
- Additional hosts must not be described as native validated until direct MCP tool calls are observed.

Evidence levels are defined in `../VALIDATION.md`.

Current sanitized host notes:

- [Codex v0.7.2](./codex-v0.7.2.md)
- [Claude Code v0.7.2](./claude-code-v0.7.2.md)
- [Gemini CLI v0.7.2](./gemini-cli-v0.7.2.md)
- [Qwen Code CLI v0.7.3](./qwen-cli-v0.7.3.md)
