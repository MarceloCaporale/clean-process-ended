import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planOrCleanupCandidates } from "../src/cleanup.js";
import { Ledger } from "../src/ledger.js";
import { REAL_CLEANUP_ACKNOWLEDGEMENT } from "../src/policy.js";

const VALID_EVIDENCE_SHA256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cpe-cleanup-"));
}

function trustedConfig(overrides = {}) {
  const config = {
    host: { expectedProfile: "codex" },
    cleanup: {
      defaultScope: "owned_current_session",
      defaultSignal: "SIGTERM",
      realExecutionEnabled: true,
      realExecutionAcknowledgement: REAL_CLEANUP_ACKNOWLEDGEMENT,
      requireConfirmToken: true,
      allowTreeKill: false,
      tokenTtlSeconds: 900,
      graceMs: 1,
      maxProcessesPerRun: 5,
      cooldownMinutes: 10,
    },
    autoCleanup: {
      maxProcessesPerRun: 5,
      cooldownMinutes: 10,
    },
    ledger: {
      maxSnapshots: 120,
      maxEvents: 400,
    },
    scan: {
      maxCommandLineLength: 420,
    },
    ...overrides,
  };
  Object.defineProperty(config, "__configMeta", {
    value: {
      cleanupRealExecutionTrusted: true,
      trustPolicy: { cleanupRealExecution: "trusted_install_config" },
    },
  });
  return config;
}

function candidate(pid, overrides = {}) {
  return {
    pid,
    ppid: 1,
    name: "node",
    ageSeconds: 3600,
    age: "1h",
    cpuPercent: 0,
    hasVisibleWindow: false,
    risk: "safe",
    ownership: "owned_current_session",
    score: 90,
    commandHash: `hash_${pid}`,
    cwdHash: `cwd_${pid}`,
    cleanupAllowedByDefault: true,
    ownershipEvidence: {},
    hostProfiles: [],
    toolProfiles: [],
    reasons: ["test_owned"],
    blockers: [],
    isCandidate: true,
    signals: {
      managedProcessMatched: true,
      managedHostMatchesExpected: true,
    },
    ...overrides,
  };
}

test("real cleanup is blocked without evidence even when config and token are trusted", async () => {
  const config = trustedConfig();
  const ledger = new Ledger({ dataDir: tempDir(), config }).load();
  const item = candidate(49991);
  const dryRun = await planOrCleanupCandidates([item], ledger, config, {
    dryRun: true,
    requestConfirmToken: true,
  });

  assert.equal(dryRun.confirmTokenReturned, true);
  const result = await planOrCleanupCandidates([item], ledger, config, {
    dryRun: false,
    confirmToken: dryRun.confirmToken,
  });

  assert.equal(result.mode, "blocked");
  assert.equal(result.reason, "cleanup_evidence_required");
  assert.equal(result.cleanupCount, 0);
});

test("dry-run reports planned count without implying executed cleanup", async () => {
  const config = trustedConfig();
  const ledger = new Ledger({ dataDir: tempDir(), config }).load();
  const item = candidate(49990);
  const dryRun = await planOrCleanupCandidates([item], ledger, config, {
    dryRun: true,
    requestConfirmToken: true,
  });

  assert.equal(dryRun.mode, "dry_run");
  assert.equal(dryRun.plannedCleanupCount, 1);
  assert.equal(dryRun.executedCleanupCount, 0);
  assert.equal(dryRun.cleanupCount, 0);
  assert.equal(dryRun.cleanupCountDeprecated, true);
  assert.equal(dryRun.confirmTokenReturned, true);
});

test("real cleanup is blocked for inferred ownership even with token and evidence", async () => {
  const config = trustedConfig();
  const ledger = new Ledger({ dataDir: tempDir(), config }).load();
  const item = candidate(49992, { signals: {} });
  const dryRun = await planOrCleanupCandidates([item], ledger, config, {
    dryRun: true,
    requestConfirmToken: true,
  });

  const result = await planOrCleanupCandidates([item], ledger, config, {
    dryRun: false,
    confirmToken: dryRun.confirmToken,
    evidenceSha256: VALID_EVIDENCE_SHA256,
  });

  assert.equal(result.mode, "blocked");
  assert.equal(result.reason, "manual_cleanup_requires_managed_strong_or_expired");
  assert.equal(result.cleanupCount, 0);
});

test("real cleanup rejects malformed evidence hash before any termination path", async () => {
  const config = trustedConfig();
  const ledger = new Ledger({ dataDir: tempDir(), config }).load();
  const item = candidate(49995);
  const dryRun = await planOrCleanupCandidates([item], ledger, config, {
    dryRun: true,
    requestConfirmToken: true,
  });

  const result = await planOrCleanupCandidates([item], ledger, config, {
    dryRun: false,
    confirmToken: dryRun.confirmToken,
    evidenceSha256: "abc123",
  });

  assert.equal(result.mode, "blocked");
  assert.equal(result.reason, "cleanup_evidence_required");
  assert.equal(result.cleanupCount, 0);
});

test("real cleanup blocks missing evidencePath before any termination path", async () => {
  const config = trustedConfig();
  const ledger = new Ledger({ dataDir: tempDir(), config }).load();
  const item = candidate(49996);
  const dryRun = await planOrCleanupCandidates([item], ledger, config, {
    dryRun: true,
    requestConfirmToken: true,
  });

  const result = await planOrCleanupCandidates([item], ledger, config, {
    dryRun: false,
    confirmToken: dryRun.confirmToken,
    evidencePath: path.join(tempDir(), "missing-evidence.json"),
  });

  assert.equal(result.mode, "blocked");
  assert.equal(result.reason, "cleanup_evidence_required");
  assert.equal(result.cleanupCount, 0);
  assert.equal(result.executedCleanupCount, 0);
});

test("real cleanup enforces maxProcessesPerRun and cooldown before termination", async () => {
  const config = trustedConfig({ cleanup: { ...trustedConfig().cleanup, maxProcessesPerRun: 1, cooldownMinutes: 10 } });
  const ledger = new Ledger({ dataDir: tempDir(), config }).load();
  const first = candidate(49993);
  const second = candidate(49994);
  const dryRun = await planOrCleanupCandidates([first, second], ledger, config, {
    dryRun: true,
    requestConfirmToken: true,
  });

  const maxResult = await planOrCleanupCandidates([first, second], ledger, config, {
    dryRun: false,
    confirmToken: dryRun.confirmToken,
    evidenceSha256: VALID_EVIDENCE_SHA256,
  });
  assert.equal(maxResult.mode, "blocked");
  assert.equal(maxResult.reason, "max_processes_per_run_exceeded");

  ledger.data.events.push({ at: new Date().toISOString(), type: "cleanup", terminated: [] });
  const cooldownResult = await planOrCleanupCandidates([first], ledger, config, {
    dryRun: false,
    confirmToken: dryRun.confirmToken,
    evidenceSha256: VALID_EVIDENCE_SHA256,
  });
  assert.equal(cooldownResult.mode, "blocked");
  assert.equal(cooldownResult.reason, "cleanup_cooldown_active");
});
