# Host Support

Each host should pass a specific `CPE_HOST_PROFILE`.

| Host | Profile | Status |
|---|---|---|
| Codex Desktop | `codex` | Current local validation completed after restart; dry-run only |
| Claude Code | `claude_code` | Current local native validation completed; dry-run only |
| Gemini CLI | `gemini_cli` | Current local native validation completed; dry-run only |
| Generic MCP Host | `generic_mcp_host` | Diagnostic profile only; host-specific claims require separate evidence |

For evidence levels and publication claims, see `docs/support-matrix.md`.

## Codex

Preview:

```bash
cpe-scan install-snippet --client codex --json
```

The generated command uses:

```bash
npx -y --package clean-process-ended clean-process-ended-mcp
```

with:

```text
CPE_HOST_PROFILE=codex
```

## Claude Code

Preview:

```bash
cpe-scan install-snippet --client claude --json
```

Expected profile:

```text
CPE_HOST_PROFILE=claude_code
```

## Gemini CLI

Preview:

```bash
cpe-scan install-snippet --client gemini --json
```

Expected profile:

```text
CPE_HOST_PROFILE=gemini_cli
```

## Platforms

| Platform | Status |
|---|---|
| Windows | Scanner implemented; run host-specific validation before real cleanup |
| macOS | POSIX scanner implemented; capture public beta validation before stronger claims |
| Linux | POSIX scanner implemented; capture public beta validation before stronger claims |
