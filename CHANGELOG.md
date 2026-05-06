# Changelog

## 0.7.3 - Validation Metrics And Public Framing

- Reframed the public beta as runtime-validated process hygiene, evidence and dry-run planning instead of "diagnostics only".
- Added public validation metrics language so agents and reviewers can distinguish real runtime validation metrics from adoption metrics.
- Documented Qwen Code CLI validation with Ollama-backed Qwen models without adding unverified host claims.
- Hardened the Windows `CPE_POWERSHELL` override so it only accepts `powershell.exe` or `pwsh.exe` executables, without shell-like arguments.
- Documented Windows scanner latency from the CPU-sample interval and kept it outside the cleanup safety decision.
- Added regression tests for the PowerShell override resolver.
- Hardened macOS/POSIX scanning by supporting BSD `ps etime` output in addition to Linux/procps `etimes`.
- Added filesystem realpath identity checks so macOS `/var` and `/private/var` aliases do not break trusted project config detection.
- Split GitHub Actions gates into explicit lint, syntax, test, smoke, validation, audit and package steps, with macOS diagnostics on failure.

## 0.7.2 - Public Beta Ownership Hardening

- Split host path evidence into executable path versus cwd/working-directory context.
- Kept parent executable path as strong host lineage, while parent cwd/working-directory markers are weak report-only context.
- Blocked unresolved `evidencePath` from satisfying real-cleanup evidence policy.
- Changed dry-run `cleanupCount` to `0`; `plannedCleanupCount` is now the plan size and `executedCleanupCount` is the execution count.
- Added the `janitor-discovery` CLI alias for the MCP `janitor_discovery` tool.
- Removed historical/prototype docs from the public tree and added public-tree checks.
- Normalized `mcpName` to lowercase reverse-DNS form.
- Clarified that public v0.7.x CLI/MCP is diagnostic/dry-run oriented and does not expose real-cleanup evidence inputs.

## 0.7.1 - Public Repo Hardening

- Switched the public license metadata and root license text to Apache-2.0 with a NOTICE file.
- Hardened public tree guardrails so LAB state, audit docs, baselines and audit packages stay out of the GitHub tree even when checks run from a ZIP extracted without `.git`.
- Prevented parent `command_line` markers from creating strong host-chain ownership without stronger process/path evidence.
- Aligned `session_close_check.externalReceipt` with the public `codex-agent-mem` receipt schema.
- Required concrete SHA-256 or evidence path evidence for manual cleanup policy; `evidence=true` is no longer accepted.
- Added recursive syntax checking across `bin`, `src`, `test` and `scripts`.

## 0.7.0 - Managed Cleanup Experimental Beta

- Added internal ownership levels for managed, inferred, cross-host, preexisting and tool-context process evidence.
- Added `policy_explain`, `resource_impact_report`, `auto_cleanup_status`, `auto_cleanup_dryrun` and managed lifecycle MCP tools.
- Added `cpe-run` signal/orphan lifecycle recording and managed reconciliation reports.
- Kept auto-cleanup terminate disabled in v0.7; auto-cleanup is plan-only by default.
- Limited any real cleanup path to trusted install config, human authorization, action-bound confirm token, managed strong ownership and valid SHA-256 evidence.
- Rejected malformed evidence hashes before any real cleanup path.
- Preserved optional `codex-agent-mem` receipt interoperability with non-null evidence hashes and no command lines or tokens.

## 0.6.1 - Hardening Before Public Beta

- Blocked real cleanup by default behind trusted install config plus explicit acknowledgement.
- Made confirm tokens mandatory for real cleanup even if config attempts to disable them.
- Made browser/devtools cleanup a hard blocker, including explicit PID flows in this beta.
- Hardened managed POSIX identity matching by tolerating `ps etimes` start-time drift only when the loose command identity still matches.
- Kept Windows managed identity strict against start-time drift.
- Added package validation against personal LAB paths across all shipped allowlist files.
- Added regression tests for cleanup gates, browser blockers, POSIX managed drift and package portability.

## 0.6.0 - Public Beta Candidate

- Prepared public GitHub/npm package metadata.
- Added public documentation for install, configuration, safety model, managed lifecycle, host support and audit bundles.
- Added root `SECURITY.md` and `SUPPORT.md`.
- Documented the public beta validation command for tests, syntax, stdio smoke, strict package validation, audit and npm pack dry-run.
- Kept real cleanup opt-in, dry-run gated and confirm-token bound.
- Marked POSIX platform validation as unclaimed where not yet validated.

## 0.5.1 - Safety/Publicability Hardening

- Bound cleanup confirm tokens to the full action envelope.
- Made identity and process-safety blockers absolute.
- Required exact managed `hostProfile` for managed ownership.
- Limited managed cleanup dry-run planning to the current expected host.
- Updated `server.json` for the MCP Registry schema.
- Added strict public package validation and portable audit bundle checksums.

## 0.5.0 - Managed Ownership

- Added `cpe-run` managed lifecycle ownership.
- Added managed reconcile, lifecycle, stale and cleanup dry-run reports.
- Added strong managed identity checks based on PID, create time and scanner command hash.

## 0.4.x - Safety And Evidence Hardening

- Added audit-bundle single-snapshot evidence.
- Added package doctor and package validation.
- Hardened host evidence, config trust and secret redaction.
