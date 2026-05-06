# Security Policy

## Supported Status

`clean-process-ended` is a public beta candidate. Treat real cleanup as sensitive local system operation.

## Reporting Issues

Use GitHub Private Vulnerability Reporting when it is enabled on the public repository.

If private vulnerability reporting is not enabled yet, open a public issue that requests a private security contact without disclosing exploit details, secrets, private paths, raw ledger contents or full command lines.

Do not include secrets, full command lines, private paths or raw ledger files in public reports. Use `cpe-scan audit-bundle` and review generated evidence before sharing it.

## Security Defaults

- No automatic cleanup is enabled by default.
- Cleanup is dry-run by default.
- Real cleanup is disabled by default and can only be enabled from trusted install config with explicit acknowledgement.
- Real cleanup always requires a confirm token bound to the dry-run plan.
- `related_unowned` and `unknown_owner` are report-only.
- Project config is ignored by default.
- Full command lines are not stored by default.
- Browser/devtools, visible windows, protected processes and host roots are blocked by policy.

## Out Of Scope

This package does not attempt privilege escalation, service installation, system-wide process control or remote cleanup.
