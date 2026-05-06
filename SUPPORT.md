# Support

`clean-process-ended` is local-first beta software for MCP and agent subprocess diagnostics.

## Before Opening An Issue

Run:

```bash
node ./bin/cpe-scan.js doctor --json
node ./bin/cpe-scan.js smoke-stdio --json
node ./bin/cpe-scan.js audit-bundle --output-dir ./evidence/clean-process-ended --json
```

Review the bundle before sharing it. Do not publish secrets, private paths, raw command lines or live confirm tokens.

## Host Profiles

Include the host profile used:

| Host | Profile | Status |
| --- | --- | --- |
| Codex | `codex` | Current local validation completed after restart; dry-run only. |
| Claude Code | `claude_code` | Current local native validation completed; dry-run only. |
| Gemini CLI | `gemini_cli` | Current local native validation completed; dry-run only. |

See `docs/support-matrix.md` for evidence levels.

## Cleanup Reports

Never attach evidence from a real cleanup run unless you intentionally executed it and reviewed the output. Dry-run evidence is preferred.
