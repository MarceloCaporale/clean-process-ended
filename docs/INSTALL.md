# Install

## npm / npx

Use this command when configuring an MCP host:

```bash
npx -y --package clean-process-ended clean-process-ended-mcp
```

The package exposes three binaries:

- `clean-process-ended-mcp`: stdio MCP server.
- `cpe-scan`: local CLI for reports, dry-runs, audit bundles and diagnostics.
- `cpe-run`: managed lifecycle launcher for child processes.

## Source Development

```bash
npm install
npm test
npm run ci
```

## Default Local Home

- Windows: `%USERPROFILE%\.clean-process-ended`
- macOS/Linux: `$HOME/.clean-process-ended`

The default home stores config and ledger data. Do not put the ledger in a shared project folder.

## Host Binding

Every host should pass one explicit profile:

```text
CPE_HOST_PROFILE=codex
CPE_HOST_PROFILE=claude_code
CPE_HOST_PROFILE=gemini_cli
CPE_HOST_PROFILE=generic_mcp_host
```

Without host binding, cleanup planning remains conservative and related processes stay report-only.

## Snippet Generator

Preview install commands:

```bash
node ./bin/cpe-scan.js install-snippet --client codex --json
node ./bin/cpe-scan.js install-snippet --client claude --json
node ./bin/cpe-scan.js install-snippet --client gemini --json
```

The snippet generator does not edit host configuration.
