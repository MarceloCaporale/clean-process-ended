# Quickstart

This quickstart uses the public dry-run-first path. It does not execute real cleanup.

## 1. Run a one-shot diagnostic

```bash
npx -y --package clean-process-ended cpe-scan report --json
```

## 2. Run the MCP server with host binding

Every MCP host should pass `CPE_HOST_PROFILE` so process ownership is scoped to the expected host.

```bash
CPE_HOST_PROFILE=codex npx -y --package clean-process-ended clean-process-ended-mcp
```

Profile values:

- `codex`
- `claude_code`
- `gemini_cli`
- `qwen_code`
- `generic_mcp_host`

## 3. Ask the agent to discover the safe protocol

```bash
npx -y --package clean-process-ended cpe-scan janitor-discovery --client codex --json
```

The discovery payload tells agents to use close checks only for non-destructive process hygiene and never to request `dry_run=false` autonomously.

## 4. Run a close-session dry-run

```bash
npx -y --package clean-process-ended cpe-scan session-close-check --project-key my-project --json
```

The close check returns a sanitized receipt summary. It does not include full command lines, raw process output, env vars, tokens, secrets or live confirm tokens.

## 5. Generate an audit bundle

```bash
npx -y --package clean-process-ended cpe-scan audit-bundle --output-dir ./evidence/cpe --json
```

Keep generated evidence local unless you have reviewed it. The default public fixtures are sanitized and compact; local evidence may still reveal machine-specific process metadata.

## 6. Use with codex-agent-mem optionally

When `codex-agent-mem` is also installed, store only the compact `process_janitor_receipt` or hash produced by `session_close_check`. Do not store command lines or raw process output.

## 7. Do not run real cleanup from quickstart

The public v0.7.3 CLI/MCP surface provides runtime-validated process hygiene, evidence and dry-run planning. Real termination remains non-operable from public CLI/MCP because evidence inputs are intentionally not exposed.
