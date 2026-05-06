# Audit Bundle

`cpe-scan audit-bundle` creates a reproducible evidence folder for review.

```bash
cpe-scan audit-bundle --output-dir ./evidence/clean-process-ended --json
```

## Contents

Typical files:

- `AUDIT_BUNDLE.json`
- `CONFIG_EXPLAIN.json`
- `SESSION_STATUS.json`
- `WATCHER_STATUS.json`
- `PROFILE_LIST.json`
- `PROCESS_SCOPE_REPORT.json`
- `PROCESS_CLEANUP_CANDIDATES.json`
- `PROCESS_CLEANUP_DRYRUN.json`
- `PROCESS_EXPLAIN_SELECTED/*.json`
- `METRICS.json`
- `SAFETY.json`
- `NODE_ENVIRONMENT.json`
- `PACKAGE_INFO.json`
- `ENTRYPOINT_HASH.txt`
- `COMMANDS_RUN.md`
- `EVIDENCE.md`
- `SHA256SUMS.txt`

## Safety

- No real cleanup is executed.
- The internal dry-run is generated with no live confirm token.
- Full command lines are not included by default.
- Paths in `SHA256SUMS.txt` are relative POSIX-style paths.
- Local audit bundles can still contain machine-specific metadata such as PIDs,
  host names, user-local install paths or project paths. Treat local bundles as
  private until reviewed and sanitized.
- Do not attach local bundles to public issues or external audits unless you
  have checked that they contain no secrets, environment variables, full command
  lines, raw process output or private paths.

## Use In Reviews

Attach the audit bundle with the source package when asking another reviewer to evaluate behavior. The bundle should support answering:

- what host profile was active;
- whether watcher and auto-cleanup were off by default;
- how many processes were actionable, blocked or report-only;
- whether any cleanup token was returned;
- whether evidence is reproducible by hash.
