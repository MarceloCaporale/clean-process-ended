import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG } from "../src/config.js";
import { planOrCleanupCandidates } from "../src/cleanup.js";
import { Ledger } from "../src/ledger.js";
import { buildAuditBundle, buildCleanupCandidates, buildScopeReport, createRuntime, executeCleanup, janitorDiscovery, managedCleanupDecision, primeRuntimeBaseline, sessionCloseCheck } from "../src/runtime.js";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cpe-runtime-"));
}

test("baseline can be created at MCP startup while watcher is disabled", async () => {
  const dir = tempDir();
  const runtime = createRuntime({ configPath: path.join(dir, "missing-config.json"), dataDir: dir });
  assert.equal(runtime.config.watcher.enabled, false);
  assert.equal(runtime.session.baselineSnapshotId, null);

  const baseline = await primeRuntimeBaseline(runtime);
  assert.ok(baseline.snapshotId);
  assert.equal(runtime.session.baselineSnapshotId, baseline.snapshotId);
  assert.equal(runtime.watcher.status().running, false);
});

test("audit bundle uses a single scan snapshot and does not return a live confirm token", async () => {
  const dir = tempDir();
  const runtime = createRuntime({ configPath: path.join(dir, "missing-config.json"), dataDir: dir });
  const bundle = await buildAuditBundle(runtime, { limit: 5 });

  assert.equal(bundle.version, "0.7.3");
  assert.equal(bundle.safety.singleSnapshot, true);
  assert.equal(bundle.processScopeReport.ledger.snapshotId, bundle.processCleanupCandidates.ledger.snapshotId);
  assert.equal(bundle.processCleanupDryRun.confirmToken, null);
  assert.equal(bundle.processCleanupDryRun.confirmTokenReturned, false);
});

test("managed cleanup dryrun decisions require expected host profile", () => {
  const base = {
    managedProcessId: "managed_test",
    pid: 123,
    status: "running",
    matchStatus: "strong",
    pidReuseMismatch: false,
    leaseState: "expired",
    shutdownPolicy: "terminate-on-expiry",
  };

  assert.equal(managedCleanupDecision({ ...base, hostProfile: "codex" }, { expectedHostProfile: "codex" }).ok, true);
  assert.equal(managedCleanupDecision({ ...base, hostProfile: null }, { expectedHostProfile: "codex" }).reason, "managed_record_missing_host_profile");
  assert.equal(managedCleanupDecision({ ...base, hostProfile: "claude_code" }, { expectedHostProfile: "codex" }).reason, "managed_host_profile_mismatch");
  assert.equal(managedCleanupDecision({ ...base, hostProfile: "codex" }, { expectedHostProfile: null }).reason, "missing_host_binding");
  assert.equal(managedCleanupDecision({ ...base, hostProfile: "codex", shutdownPolicy: "none" }, { expectedHostProfile: "codex" }).reason, "managed_requires_terminate_on_expiry_policy");
  assert.equal(managedCleanupDecision({ ...base, hostProfile: "codex", leaseState: "active" }, { expectedHostProfile: "codex" }).reason, "managed_lease_not_expired");
});

test("nearby report and candidates calls can reuse the scan cache", async () => {
  const dir = tempDir();
  const runtime = createRuntime({ configPath: path.join(dir, "missing-config.json"), dataDir: dir });
  const report = await buildScopeReport(runtime, { limit: 5 });
  const candidates = await buildCleanupCandidates(runtime, { limit: 5 });

  assert.equal(report.ledger.snapshotId, candidates.ledger.snapshotId);
});

test("real cleanup is blocked by default before any OS termination path", async () => {
  const dir = tempDir();
  const runtime = createRuntime({ configPath: path.join(dir, "missing-config.json"), dataDir: dir });
  const result = await executeCleanup(runtime, {
    dryRun: false,
    scope: "owned_current_session",
    confirmToken: "not-a-valid-token",
  });

  assert.equal(result.mode, "blocked");
  assert.equal(result.reason, "cleanup_real_execution_disabled");
  assert.equal(result.cleanupCount, 0);
  assert.equal(result.confirmTokenReturned, false);
});

test("dry-run with real execution disabled does not return live token or recommend execution", async () => {
  const dir = tempDir();
  const config = structuredClone(DEFAULT_CONFIG);
  Object.defineProperty(config, "__configMeta", {
    value: { cleanupRealExecutionTrusted: false },
    enumerable: false,
  });
  const ledger = new Ledger({ dataDir: dir, config }).load();
  const candidate = {
    pid: 12345,
    ppid: 1,
    name: "node",
    ageSeconds: 3600,
    age: "1h",
    cpuPercent: 0,
    hasVisibleWindow: false,
    risk: "safe",
    ownership: "owned_current_session",
    score: 90,
    commandHash: "hash_node_test",
    cwdHash: "cwd_test",
    cleanupAllowedByDefault: true,
    ownershipEvidence: {},
    hostProfiles: [],
    toolProfiles: [],
    reasons: ["test_owned"],
    blockers: [],
    isCandidate: true,
  };

  const result = await planOrCleanupCandidates([candidate], ledger, config, {
    dryRun: true,
    scope: "owned_current_session",
  });

  assert.equal(result.mode, "dry_run");
  assert.equal(result.plannedCleanupCount, 1);
  assert.equal(result.executedCleanupCount, 0);
  assert.equal(result.cleanupCount, 0);
  assert.equal(result.confirmTokenReturned, false);
  assert.equal(result.confirmToken, null);
  assert.equal(result.executionGate.realExecutionEnabled, false);
  assert.equal(result.executionGate.autonomousExecutionAllowed, false);
  assert.doesNotMatch(result.nextStep, /dry_run=false/);
  assert.match(result.nextStep, /Review this dry-run/);
});

test("janitor discovery and session close check are non-destructive agent protocol tools", async () => {
  const dir = tempDir();
  const runtime = createRuntime({ configPath: path.join(dir, "missing-config.json"), dataDir: dir });
  const discovery = janitorDiscovery(runtime, { client: "codex" });
  assert.equal(discovery.available, true);
  assert.ok(discovery.closeTaskProtocol.includes("process_cleanup(dry_run=true)"));
  assert.ok(discovery.neverDo.includes("dry_run_false_autonomously"));
  assert.equal(discovery.optionalIntegrations.codexAgentMem.hardDependency, false);

  const close = await sessionCloseCheck(runtime, { projectKey: "test-project", limit: 3 });
  assert.equal(close.mode, "close_check_dry_run");
  assert.equal(close.safety.nonDestructive, true);
  assert.equal(close.safety.confirmTokenReturned, false);
  assert.equal(close.dryRun.confirmToken, null);
  assert.equal(close.receipt.type, "process_janitor_receipt");
  assert.equal(close.receipt.projectKey, "test-project");
  assert.equal(close.receipt.evidenceSha256Scope, "receipt_payload_canonical");
  assert.match(close.receipt.evidenceSha256, /^[a-f0-9]{64}$/);
  assert.equal(close.externalReceipt.source, "clean-process-ended");
  assert.equal(close.externalReceipt.external_receipt_kind, "process_janitor");
  assert.equal(close.externalReceipt.mode, "close_check_dry_run");
  assert.equal(close.externalReceipt.cleanup_real_executed, false);
  assert.equal(typeof close.externalReceipt.summary, "string");
  assert.ok(close.externalReceipt.summary.length > 0);
  assert.deepEqual(Object.keys(close.externalReceipt.counts).sort(), [
    "candidates",
    "cleanup_eligible",
    "cleanup_executed",
    "cleanup_planned",
    "processes_seen",
  ]);
  assert.equal(close.externalReceipt.counts.cleanup_executed, 0);
  assert.equal(close.externalReceipt.host_profile, null);
  assert.equal(close.externalReceipt.project_key, "test-project");
  assert.equal(close.externalReceipt.session_epoch_id, runtime.session.sessionEpochId);
  assert.equal(close.externalReceipt.command_lines_included, false);
  assert.equal(close.externalReceipt.raw_process_output_included, false);
  assert.equal(close.externalReceipt.confirm_token_returned, false);
  assert.match(close.externalReceipt.evidence_sha256, /^[a-f0-9]{64}$/);
});
