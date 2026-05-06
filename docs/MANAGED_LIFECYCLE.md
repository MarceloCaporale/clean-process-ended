# Managed Lifecycle

`cpe-run` launches a child process and records explicit lifecycle metadata. This is stronger than inferred ownership from parent chains or tool profiles.

## Run A Managed Child

```bash
cpe-run --host codex --role mcp-server -- node ./server.js
```

For stdio children, do not use `--json` when the child protocol writes to stdout. `cpe-run` keeps launcher metadata on stderr in stdio wrapper mode so stdout remains reserved for the child protocol.

## Metadata

Managed records include:

- `managedProcessId`;
- PID;
- parent PID;
- host profile;
- role;
- cwd hash;
- argv hash;
- scanner command hash when observed;
- scanner loose hash when observed;
- process create time when observed;
- create-time source and tolerance metadata;
- lease and shutdown metadata.

## Reconcile

```bash
cpe-scan managed-reconcile --json
cpe-scan managed-lifecycle --json
cpe-scan managed-stale --json
```

Reconciliation detects:

- running child;
- exited child;
- missing process;
- PID reuse mismatch;
- lease expiration;
- weak or missing scanner identity.

On POSIX platforms, `ps etimes` can shift process birth-time estimates by a small amount. Managed identity tolerates that scanner drift only when the process name and loose command identity still match. Windows creation time matching remains strict.

## Dry-Run Cleanup Planning

```bash
cpe-scan managed-cleanup-dryrun --json
```

Managed cleanup dry-run plans only records owned by the current expected host profile, with strong scanner identity, `shutdownPolicy=terminate-on-expiry` and an expired lease. It never terminates processes by itself.

Public v0.7.x exposes managed cleanup as dry-run planning only. Real cleanup execution is not public-operable through CLI/MCP because evidence inputs are intentionally not exposed. If a future version exposes real cleanup, it must go through `process_cleanup` with dry-run, confirm token, trusted install-config execution gate, valid SHA-256 evidence and policy validation.
