import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_CLEANUP_ACKNOWLEDGEMENT,
  REAL_CLEANUP_ACKNOWLEDGEMENT,
  autoCleanupStatus,
  canAutoCleanupPlan,
  canAutoCleanupTerminate,
  canManualCleanup,
  planAutoCleanup,
} from "../src/policy.js";

const VALID_EVIDENCE_SHA256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function managedCandidate(overrides = {}) {
  return {
    pid: 4242,
    name: "node",
    isCandidate: true,
    ownership: "owned_current_session",
    risk: "safe",
    ageSeconds: 3600,
    blockers: [],
    toolProfiles: [],
    signals: {
      managedProcessMatched: true,
      managedHostMatchesExpected: true,
      hostBindingConfigured: true,
      observedInCurrentEpoch: true,
      previouslyOwnedWithExpectedHostChain: true,
      stableIdleSnapshots: 2,
      cpuIdle: true,
    },
    ...overrides,
  };
}

function trustedConfig(overrides = {}) {
  const config = {
    cleanup: {
      realExecutionEnabled: true,
      realExecutionAcknowledgement: REAL_CLEANUP_ACKNOWLEDGEMENT,
    },
    autoCleanup: {
      enabled: true,
      action: "plan_only",
      writeEvidenceBundle: true,
      allowedOwnershipLevels: ["managed_strong"],
      requireStableIdleSnapshots: 2,
      minAgeMinutes: 30,
      cooldownMinutes: 15,
      maxProcessesPerRun: 3,
    },
    ...overrides,
  };
  Object.defineProperty(config, "__configMeta", {
    value: {
      cleanupRealExecutionTrusted: true,
      autoCleanupTerminateTrusted: false,
      trustPolicy: {
        cleanupRealExecution: "trusted_install_config",
        autoCleanupTerminate: "blocked_unless_declared_in_install_config",
      },
    },
    configurable: true,
  });
  return config;
}

test("canManualCleanup requires trusted config, token, evidence, no force, no tree kill, and managed strong ownership", () => {
  const candidate = managedCandidate();
  const config = trustedConfig();

  assert.equal(canManualCleanup(candidate, config, {
    confirmToken: "token",
    evidenceSha256: VALID_EVIDENCE_SHA256,
    force: false,
    includeProcessTree: false,
  }).ok, true);

  const blocked = canManualCleanup(managedCandidate({ signals: {} }), config, {
    confirmToken: "token",
    evidenceSha256: VALID_EVIDENCE_SHA256,
    force: true,
    includeProcessTree: true,
  });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.blockedReasons.includes("manual_cleanup_requires_managed_strong_or_expired"));
  assert.ok(blocked.blockedReasons.includes("force_must_be_false"));
  assert.ok(blocked.blockedReasons.includes("tree_kill_must_be_false"));
});

test("canManualCleanup rejects untrusted or unauthenticated real cleanup config", () => {
  const config = trustedConfig({
    cleanup: {
      realExecutionEnabled: true,
      realExecutionAcknowledgement: null,
    },
  });
  Object.defineProperty(config, "__configMeta", {
    value: {
      cleanupRealExecutionTrusted: false,
      trustPolicy: { cleanupRealExecution: "blocked_unless_declared_in_install_config_with_acknowledgement" },
    },
  });

  const result = canManualCleanup(managedCandidate(), config, {
    confirmToken: "token",
    evidenceSha256: VALID_EVIDENCE_SHA256,
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockedReasons.includes("manual_cleanup_requires_canonical_trusted_install_config"));
  assert.ok(result.blockedReasons.includes("real_cleanup_acknowledgement_required"));
});

test("canManualCleanup rejects malformed evidence hashes", () => {
  const result = canManualCleanup(managedCandidate(), trustedConfig(), {
    confirmToken: "token",
    evidenceSha256: "abc",
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockedReasons.includes("cleanup_evidence_required"));
});

test("canManualCleanup rejects boolean evidence shortcuts", () => {
  const result = canManualCleanup(managedCandidate(), trustedConfig(), {
    confirmToken: "token",
    evidence: true,
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockedReasons.includes("cleanup_evidence_required"));
});

test("canManualCleanup rejects unresolved evidencePath shortcuts", () => {
  const result = canManualCleanup(managedCandidate(), trustedConfig(), {
    confirmToken: "token",
    evidencePath: "/path/that/does/not/exist/evidence.json",
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockedReasons.includes("cleanup_evidence_required"));
});

test("auto-cleanup plan_only allows only configured managed ownership with stable idle and evidence bundle", () => {
  const config = trustedConfig();
  const candidate = managedCandidate({ ownershipLevel: "managed_strong" });
  const planDecision = canAutoCleanupPlan(candidate, config);
  assert.equal(planDecision.ok, true);

  const weak = canAutoCleanupPlan(managedCandidate({
    ownershipLevel: "owned_current_session",
    signals: { stableIdleSnapshots: 1 },
  }), config);
  assert.equal(weak.ok, false);
  assert.ok(weak.blockedReasons.includes("auto_cleanup_ownership_owned_current_session_not_allowed"));
  assert.ok(weak.blockedReasons.includes("auto_cleanup_requires_stable_idle_snapshots"));

  const plan = planAutoCleanup([candidate, managedCandidate({
    ownershipLevel: "related_unowned",
    signals: {
      hostBindingConfigured: true,
      observedInCurrentEpoch: true,
      previouslyOwnedWithExpectedHostChain: true,
      stableIdleSnapshots: 2,
    },
  })], config);
  assert.equal(plan.mode, "auto_cleanup_plan_only");
  assert.equal(plan.plannedCleanupCount, 1);
  assert.equal(plan.writeEvidenceBundle, true);
});

test("auto-cleanup terminate remains blocked in v0.7 even with terminate acknowledgement", () => {
  const config = trustedConfig({
    autoCleanup: {
      enabled: true,
      action: "terminate",
      acknowledgement: AUTO_CLEANUP_ACKNOWLEDGEMENT,
      writeEvidenceBundle: true,
    },
  });
  Object.defineProperty(config, "__configMeta", {
    value: {
      cleanupRealExecutionTrusted: true,
      autoCleanupTerminateTrusted: true,
      trustPolicy: {
        cleanupRealExecution: "trusted_install_config",
        autoCleanupTerminate: "trusted_install_config",
      },
    },
  });

  const status = autoCleanupStatus(config, config.__configMeta);
  const terminate = canAutoCleanupTerminate(managedCandidate(), config);
  assert.equal(status.terminateAllowed, false);
  assert.ok(terminate.blockedReasons.includes("auto_cleanup_terminate_disabled_in_v0_7_plan_only"));
});
