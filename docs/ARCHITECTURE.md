# Architecture

`clean-process-ended` is a local stdio MCP server and CLI that classifies agent-related subprocesses by evidence, not by process-name similarity.

## Pipeline

```text
scanner
  -> process graph and parent-chain validation
  -> host/tool profile matching
  -> ownership resolver
  -> risk and blocker partitioning
  -> policy planner
  -> evidence/audit bundle
```

## Ownership

Public ownership states:

- `owned_current_session`: the only default cleanup scope.
- `related_unowned`: related evidence exists, but ownership is not sufficient.
- `unknown_owner`: insufficient evidence.

Strong ownership requires host binding and evidence such as:

- valid parent chain from the expected host;
- prior observation in the same session with expected host chain;
- explicit managed process identity from `cpe-run`.

Keywords, process names and tool-looking command lines are not authorization to terminate a process.

## Managed Lifecycle

`cpe-run` records explicit child metadata:

- `managedProcessId`;
- PID and parent PID;
- host profile;
- role;
- cwd hash;
- argv hash;
- scanner command hash when observed;
- process create time when observed;
- lease and shutdown metadata.

Managed reconciliation compares ledger identity to the current process table and reports `running`, `missing`, `exited`, `pid_reuse_mismatch`, and lease state.

Managed cleanup planning requires exact PID, scanner command identity and host profile. Windows birth time matching is strict. POSIX `ps etimes` birth times may be tolerated within the scanner tolerance only when the loose command identity still matches. Real termination still goes through the normal cleanup confirmation gates and the trusted install-config execution gate.

## Audit Bundle

`audit-bundle` uses one scan snapshot for report, candidates, dry-run and selected explains. It writes `SHA256SUMS.txt` and does not return live confirm tokens.
