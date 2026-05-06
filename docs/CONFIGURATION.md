# Configuration

`clean-process-ended` is designed to be safe when launched from arbitrary repositories.

## Config Sources

Default install config:

- Windows: `%USERPROFILE%\.clean-process-ended\config.json`
- macOS/Linux: `$HOME/.clean-process-ended/config.json`

Project config from the current working directory is ignored by default. It is loaded only when explicitly trusted.

## Environment Variables

Host profile:

```text
CPE_HOST_PROFILE=codex
CPE_HOST_PROFILE=claude_code
CPE_HOST_PROFILE=gemini_cli
CPE_HOST_PROFILE=generic_mcp_host
```

Custom home:

```text
CLEAN_PROCESS_ENDED_HOME=/path/to/home
```

PowerShell override on Windows:

```text
CPE_POWERSHELL=pwsh.exe
```

## Auto-Cleanup Trust

Terminate auto-cleanup is experimental and disabled by default.

It can only be enabled from the trusted install config and requires explicit acknowledgement. Arbitrary `--config` files, project config and environment variables cannot enable terminate mode by themselves.

## Real Cleanup Trust

Real cleanup is disabled by default. In the public v0.7.2 CLI/MCP surface, `dry_run=false` remains non-operable because evidence inputs required by the real-termination gate are not exposed to tools or CLI commands.

Future releases that expose a real-cleanup execution path must require at least a trusted install config with both fields:

```json
{
  "cleanup": {
    "realExecutionEnabled": true,
    "realExecutionAcknowledgement": "I_UNDERSTAND_REAL_CLEANUP_TERMINATES_PROCESSES"
  }
}
```

`cleanup.requireConfirmToken` is always enforced as `true`. Project config, arbitrary explicit config files and environment variables cannot disable the token gate or enable real cleanup by themselves. Config plus token is necessary but not sufficient for real cleanup; policy still requires evidence SHA-256, managed strong ownership and safety blockers to pass.

## Privacy

Command lines are hashed/redacted by default. Full command lines are not stored unless explicitly configured. Audit bundles do not include live confirm tokens.
