export const AUTO_CLEANUP_ACKNOWLEDGEMENT = "I_UNDERSTAND_AUTO_CLEANUP_IS_EXPERIMENTAL";
export const REAL_CLEANUP_ACKNOWLEDGEMENT = "I_UNDERSTAND_REAL_CLEANUP_TERMINATES_PROCESSES";
export const POLICY_VERSION = "policy-v0.7";

export const HARD_TARGET_BLOCKERS = Object.freeze([
  "own_process_or_parent_chain",
  "host_root_process_not_a_cleanup_target",
  "protected_process",
  "visible_window",
  "browser_process_requires_explicit_pid",
  "browser_process_cleanup_disabled",
  "preexisting_at_session_baseline",
  "invalid_parent_temporal_order",
  "managed_pid_reuse_mismatch",
  "managed_record_missing_host_profile",
  "managed_host_profile_mismatch",
  "command_hash_changed",
  "pid_reused",
  "missing_host_binding",
  "host_profile_mismatch",
  "cleanup_real_execution_disabled",
  "untrusted_config_real_cleanup",
]);

const DEFAULT_AUTO_ALLOWED_OWNERSHIP = Object.freeze(["managed_strong"]);

export function autoCleanupStatus(config, configMeta = config?.__configMeta || null) {
  const policy = config?.autoCleanup || {};
  const terminateRequested = policy.enabled === true && policy.action === "terminate";
  const terminateGate = canAutoCleanupTerminate(null, config, { configMeta, checkCandidate: false });
  const planGate = canAutoCleanupPlan(null, config, { checkCandidate: false });

  return {
    enabled: Boolean(policy.enabled),
    action: policy.action || "plan_only",
    mode: policy.mode || "manual_reconcile",
    policyVersion: POLICY_VERSION,
    terminateAllowed: terminateGate.ok,
    acknowledgementRequired: AUTO_CLEANUP_ACKNOWLEDGEMENT,
    blockedReasons: terminateRequested ? terminateGate.blockedReasons : [],
    blockersByLayer: {
      plan: planGate.blockers,
      terminate: terminateGate.blockers,
    },
    configTrust: {
      autoCleanupTerminateTrusted: Boolean(configMeta?.autoCleanupTerminateTrusted),
      policy: configMeta?.trustPolicy?.autoCleanupTerminate || "unknown_untrusted",
      installConfigPath: configMeta?.installConfigPath || null,
      sources: configMeta?.sources || [],
    },
    defaultSafe: !terminateGate.ok,
    gates: {
      allowedOwnershipLevels: allowedOwnershipLevels(policy),
      requireHostBinding: policy.requireHostBinding !== false,
      requireValidTemporalParentChain: policy.requireValidTemporalParentChain !== false,
      requirePreviousOwnedObservation: policy.requirePreviousOwnedObservation !== false,
      requirePreviousOwnedHostChain: policy.requirePreviousOwnedHostChain !== false,
      requireRisk: policy.requireRisk || "safe",
      requireStableIdleSnapshots: policy.requireStableIdleSnapshots ?? 2,
      minAgeMinutes: policy.minAgeMinutes ?? 30,
      cooldownMinutes: policy.cooldownMinutes ?? 15,
      excludeBrowsers: policy.excludeBrowsers !== false,
      excludeShells: policy.excludeShells !== false,
      excludeVisibleWindows: policy.excludeVisibleWindows !== false,
      excludeHostRoots: policy.excludeHostRoots !== false,
      excludeProtected: policy.excludeProtected !== false,
      maxProcessesPerRun: policy.maxProcessesPerRun ?? 3,
      allowForce: false,
      allowTreeKill: false,
      writeEvidenceBundle: policy.writeEvidenceBundle !== false,
    },
  };
}

export function planAutoCleanup(candidates, config, { scope = null } = {}) {
  const status = autoCleanupStatus(config);
  const policy = config?.autoCleanup || {};
  const max = maxProcessesPerRun(policy);
  const allowedLevels = allowedOwnershipLevels(policy);
  const considered = (candidates || []).filter((candidate) => {
    if (scope && candidate.ownership !== scope) return false;
    return allowedLevels.includes(ownershipLevel(candidate));
  });
  const planned = [];
  const skipped = [];

  for (const candidate of considered) {
    const decision = canAutoCleanupPlan(candidate, config);
    if (decision.ok && planned.length < max) {
      planned.push(candidate);
    } else {
      skipped.push({ pid: candidate.pid, name: candidate.name, reason: firstReason(decision) });
    }
  }

  return {
    mode: "auto_cleanup_plan_only",
    policyVersion: POLICY_VERSION,
    status,
    scope: scope || "allowedOwnershipLevels",
    allowedOwnershipLevels: allowedLevels,
    consideredCount: considered.length,
    plannedCleanupCount: planned.length,
    skippedCount: skipped.length,
    skipped,
    candidates: planned,
    writeEvidenceBundle: policy.writeEvidenceBundle !== false,
    notes: [
      "auto-cleanup is experimental and defaults to plan_only.",
      "This plan never terminates processes.",
      "Only configured managed ownership levels are eligible for auto-cleanup planning.",
    ],
  };
}

export function canReport(candidate) {
  const blockers = [];
  if (!candidate) blockers.push(blocker("target", "missing_candidate"));
  return decision(blockers);
}

export function canDryRun(candidate, { scope = "owned_current_session", pids = [] } = {}) {
  const blockers = [];
  if (!candidate?.isCandidate) blockers.push(blocker("target", "not_a_candidate"));
  addHardTargetBlockers(blockers, candidate);
  if (hasBlocker(candidate, "too_young")) blockers.push(blocker("temporal", "too_young"));
  if (hasBlocker(candidate, "cpu_unknown_neutral")) blockers.push(blocker("evidence", "cpu_unknown_neutral"));
  if (!blockers.length && candidate.ownership !== "owned_current_session" && !isManagedOwnership(candidate)) {
    blockers.push(blocker("ownership", `ownership_${candidate.ownership}_is_report_only`));
  }

  const explicit = scope === "explicit_pids" || (pids || []).map(Number).includes(Number(candidate?.pid));
  if (!blockers.length && candidate?.risk !== "safe" && !(candidate?.risk === "probable" && explicit)) {
    blockers.push(blocker("risk", `risk_${candidate?.risk}_requires_explicit_pid_or_scope`));
  }
  return decision(blockers);
}

export function canManualCleanup(candidate, config, options = {}) {
  const blockers = [...canDryRun(candidate, options).blockers];
  const configMeta = options.configMeta || config?.__configMeta || {};
  const cleanup = config?.cleanup || {};

  if (!manualCleanupConfigTrusted(config, configMeta)) {
    blockers.push(blocker("config", "manual_cleanup_requires_canonical_trusted_install_config"));
  }
  if (cleanup.realExecutionAcknowledgement !== REAL_CLEANUP_ACKNOWLEDGEMENT) {
    blockers.push(blocker("authorization", "real_cleanup_acknowledgement_required"));
  }
  if (!options.confirmToken) blockers.push(blocker("authorization", "confirm_token_required"));
  if (!hasEvidence(options)) blockers.push(blocker("evidence", "cleanup_evidence_required"));
  if (options.force === true) blockers.push(blocker("execution", "force_must_be_false"));
  if (options.includeProcessTree === true || options.treeKill === true) {
    blockers.push(blocker("execution", "tree_kill_must_be_false"));
  }
  if (!["managed_strong", "managed_strong_expired"].includes(ownershipLevel(candidate))) {
    blockers.push(blocker("ownership", "manual_cleanup_requires_managed_strong_or_expired"));
  }

  return decision(blockers);
}

export function canAutoCleanupPlan(candidate, config, options = {}) {
  const blockers = [];
  const policy = config?.autoCleanup || {};
  if ((policy.action || "plan_only") !== "plan_only") blockers.push(blocker("mode", "auto_cleanup_plan_requires_plan_only_action"));
  if (policy.writeEvidenceBundle === false) blockers.push(blocker("evidence", "auto_cleanup_plan_requires_evidence_bundle"));

  if (options.checkCandidate !== false) {
    if (!candidate?.isCandidate) blockers.push(blocker("target", "not_a_candidate"));
    addAutoTargetBlockers(blockers, candidate, policy);
    if (!allowedOwnershipLevels(policy).includes(ownershipLevel(candidate))) {
      blockers.push(blocker("ownership", `auto_cleanup_ownership_${ownershipLevel(candidate)}_not_allowed`));
    }
    addAutoEvidenceBlockers(blockers, candidate, policy);
  }

  return decision(blockers);
}

export function canAutoCleanupTerminate(candidate, config, options = {}) {
  const blockers = [];
  const policy = config?.autoCleanup || {};
  const configMeta = options.configMeta || config?.__configMeta || {};
  if (policy.enabled !== true) blockers.push(blocker("config", "auto_cleanup_disabled"));
  if (policy.action !== "terminate") blockers.push(blocker("mode", "auto_cleanup_terminate_not_requested"));
  if (policy.acknowledgement !== AUTO_CLEANUP_ACKNOWLEDGEMENT) {
    blockers.push(blocker("authorization", "acknowledgement_required"));
  }
  if (!configMeta.autoCleanupTerminateTrusted) {
    blockers.push(blocker("config", "auto_cleanup_terminate_requires_install_config"));
  }
  blockers.push(blocker("mode", "auto_cleanup_terminate_disabled_in_v0_7_plan_only"));

  if (options.checkCandidate !== false) {
    blockers.push(...canAutoCleanupPlan(candidate, { ...config, autoCleanup: { ...policy, action: "plan_only" } }).blockers);
  }
  return decision(blockers);
}

export function ownershipLevel(candidate) {
  const direct = candidate?.internalOwnershipLevel || candidate?.ownershipLevel || candidate?.ownership;
  if (direct === "managed_strong" || direct === "managed_strong_expired") return direct;
  if (candidate?.signals?.managedStrongExpired || candidate?.signals?.managedLeaseExpired || candidate?.managedExpired) {
    return "managed_strong_expired";
  }
  if (
    candidate?.signals?.managedProcessMatched &&
    candidate?.signals?.managedHostMatchesExpected &&
    !candidate?.signals?.managedPidReuseMismatch &&
    !candidate?.signals?.managedRecordMissingHostProfile &&
    !candidate?.signals?.managedHostProfileMismatch
  ) {
    return "managed_strong";
  }
  return direct || "unknown_owner";
}

export function manualCleanupConfigTrusted(config, configMeta = config?.__configMeta || {}) {
  return Boolean(
    config?.cleanup?.realExecutionEnabled &&
      configMeta?.cleanupRealExecutionTrusted &&
      config?.cleanup?.realExecutionAcknowledgement === REAL_CLEANUP_ACKNOWLEDGEMENT &&
      configMeta?.trustPolicy?.cleanupRealExecution === "trusted_install_config",
  );
}

function addAutoEvidenceBlockers(blockers, candidate, policy) {
  const level = ownershipLevel(candidate);
  const isManagedAllowed = ["managed_strong", "managed_strong_expired"].includes(level);
  if (policy.requireRisk !== false && candidate?.risk !== (policy.requireRisk || "safe")) {
    blockers.push(blocker("risk", `auto_cleanup_requires_risk_${policy.requireRisk || "safe"}`));
  }
  if (policy.requireValidTemporalParentChain !== false && candidate?.signals?.invalidParentTemporalOrder) {
    blockers.push(blocker("temporal", "auto_cleanup_requires_valid_parent_chain"));
  }
  if (policy.requireHostBinding !== false && !candidate?.signals?.hostBindingConfigured) {
    blockers.push(blocker("ownership", "auto_cleanup_requires_host_binding"));
  }
  if (!isManagedAllowed && policy.requirePreviousOwnedObservation !== false && !candidate?.signals?.observedInCurrentEpoch) {
    blockers.push(blocker("evidence", "auto_cleanup_requires_previous_owned_observation"));
  }
  if (!isManagedAllowed && policy.requirePreviousOwnedHostChain !== false && !candidate?.signals?.previouslyOwnedWithExpectedHostChain) {
    blockers.push(blocker("evidence", "auto_cleanup_requires_previous_owned_host_chain"));
  }
  const requiredSnapshots = Math.max(0, Number(policy.requireStableIdleSnapshots ?? 2));
  const observedSnapshots = Number(
    candidate?.signals?.stableIdleSnapshots ??
      candidate?.stableIdleSnapshots ??
      candidate?.signals?.sessionObservationCount ??
      0,
  );
  if (requiredSnapshots > 0 && !candidate?.signals?.cpuIdle) {
    blockers.push(blocker("evidence", "auto_cleanup_requires_idle_cpu"));
  }
  if (requiredSnapshots > 0 && observedSnapshots < requiredSnapshots) {
    blockers.push(blocker("evidence", "auto_cleanup_requires_stable_idle_snapshots"));
  }
  const minAgeSeconds = Math.max(0, Number(policy.minAgeMinutes ?? 30)) * 60;
  if (Number(candidate?.ageSeconds || 0) < minAgeSeconds) {
    blockers.push(blocker("temporal", "auto_cleanup_requires_min_age"));
  }
}

function addAutoTargetBlockers(blockers, candidate, policy) {
  addHardTargetBlockers(blockers, candidate);
  if (policy.excludeBrowsers !== false && (candidate?.signals?.browserProcess || hasTool(candidate, "playwright") || hasTool(candidate, "chrome_devtools"))) {
    blockers.push(blocker("target", "auto_cleanup_excludes_browser_tools"));
  }
  if (policy.excludeShells !== false && hasTool(candidate, "repl_shell")) {
    blockers.push(blocker("target", "auto_cleanup_excludes_shells"));
  }
  if (policy.excludeVisibleWindows !== false && candidate?.signals?.hasVisibleWindow) {
    blockers.push(blocker("target", "auto_cleanup_excludes_visible_windows"));
  }
  if (policy.excludeHostRoots !== false && candidate?.signals?.hostRootProcess) {
    blockers.push(blocker("target", "auto_cleanup_excludes_host_roots"));
  }
  if (policy.excludeProtected !== false && candidate?.signals?.protectedName) {
    blockers.push(blocker("target", "auto_cleanup_excludes_protected_processes"));
  }
}

function addHardTargetBlockers(blockers, candidate) {
  for (const reason of HARD_TARGET_BLOCKERS) {
    if (hasBlocker(candidate, reason)) blockers.push(blocker("target", reason));
  }
}

function allowedOwnershipLevels(policy = {}) {
  const configured = Array.isArray(policy.allowedOwnershipLevels) ? policy.allowedOwnershipLevels : DEFAULT_AUTO_ALLOWED_OWNERSHIP;
  return [...new Set(configured.map(String).filter(Boolean))];
}

function maxProcessesPerRun(policy = {}) {
  return Math.max(0, Number(policy.maxProcessesPerRun) || 3);
}

function isManagedOwnership(candidate) {
  return ["managed_strong", "managed_strong_expired"].includes(ownershipLevel(candidate));
}

function hasBlocker(candidate, reason) {
  return (candidate?.blockers || []).includes(reason);
}

function hasTool(candidate, id) {
  return (candidate?.toolProfiles || []).some((profile) => profile.id === id);
}

function hasEvidence(options = {}) {
  if (isSha256(options.evidenceSha256 || options.evidence_sha256)) return true;
  if (isSha256(options.evidenceBundle?.evidenceSha256 || options.evidenceBundle?.evidence_sha256)) return true;
  return false;
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || "").trim());
}

function blocker(layer, reason) {
  return { layer, reason };
}

function decision(blockers) {
  const unique = [];
  const seen = new Set();
  for (const item of blockers) {
    const key = `${item.layer}:${item.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return {
    ok: unique.length === 0,
    blockers: unique,
    blockedReasons: unique.map((item) => item.reason),
    reason: unique[0]?.reason,
  };
}

function firstReason(result) {
  return result.reason || "max_processes_per_run";
}
