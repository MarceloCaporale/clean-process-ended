# Examples

These examples are copy-adaptable host configuration snippets. They use public package commands and explicit host binding.

Rules:

- Keep `CPE_HOST_PROFILE` set for the target host.
- Prefer `npx -y --package clean-process-ended clean-process-ended-mcp` for public installs.
- Use local `node /absolute/path/.../clean-process-ended-mcp.js` only when developing from source.
- Restart hosts that do not hot-load MCP tools after registration.

Host folders:

- `codex/`
- `claude-code/`
- `gemini-cli/`
