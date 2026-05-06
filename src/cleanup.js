import crypto from "node:crypto";
import fs from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { filterCandidates, publicCandidate } from "./classifier.js";
import { normalizeScope } from "./config.js";
import {
  HARD_TARGET_BLOCKERS,
  POLICY_VERSION,
  canDryRun,
  canManualCleanup,
  manualCleanupConfigTrusted,
} from "./policy.js";

export const HARD_CLEANUP_BLOCKERS = HARD_TARGET_BLOCKERS;

export async function planOrCleanupCandidates(candidates, ledger, config, options = {}) {
  const scope = normalizeScope(options.scope || config.cleanup.defaultScope || "safe");
  const pids = Array.isArray(options.pids) ? options.pids.map(Number).filter((value) => Number.isInteger(value) && value > 0) : [];
  const dryRun = options.dryRun !== false;
  const includeCommandLine = Boolean(options.includeCommandLine);
  const signal = normalizeSignal(options.signal || config.cleanup.defaultSignal || "SIGTERM");
  const force = Boolean(options.force);
  const includeProcessTree = Boolean(options.includeProcessTree);
  const evidenceSha256 = resolveEvidenceSha256(options);
  const selected = filterCandidates(candidates, { scope, pids });
  const warnings = [];

  if (includeProcessTree && !config.cleanup.allowTreeKill) {
    warnings.push("include_process_tree was requested, but tree-kill is disabled in config; only direct PIDs are considered.");
  }

  const allowed = [];
  const skipped = [];
  for (const candidate of selected) {
    const decision = cleanupDecision(candidate, { scope, pids });
    if (decision.ok) allowed.push(candidate);
    else skipped.push({ pid: candidate.pid, name: candidate.name, risk: candidate.risk, reason: decision.reason });
  }

  if (dryRun) {
    const gate = executionGate(config);
    const shouldCreateConfirmToken =
      allowed.length > 0 &&
      options.createConfirmToken !== false &&
      (options.requestConfirmToken === true || options.createConfirmToken === true || gate.realCleanupAllowed);
    const plan = shouldCreateConfirmToken
      ? ledger.createCleanupPlan(allowed, cleanupActionMeta(config, {
          scope,
          sessionEpochId: options.sessionEpochId,
          signal,
          force,
          includeProcessTree,
          evidenceSha256,
        }))
      : options.createConfirmToken === false
      ? {
          token: null,
          createdAt: new Date().toISOString(),
          expiresAt: null,
          pids: allowed.map((candidate) => candidate.pid),
          commandHashes: Object.fromEntries(allowed.map((candidate) => [candidate.pid, candidate.commandHash])),
          risks: Object.fromEntries(allowed.map((candidate) => [candidate.pid, candidate.risk])),
          ownership: Object.fromEntries(allowed.map((candidate) => [candidate.pid, candidate.ownership])),
          scope,
          dryRunOnly: true,
        }
      : emptyDryRunPlan(allowed, scope);
    return {
      mode: "dry_run",
      scope,
      signal,
      force,
      executionGate: gate,
      matchedCount: selected.length,
      blockedCount: skipped.length,
      plannedCleanupCount: allowed.length,
      executedCleanupCount: 0,
      skippedCount: skipped.length,
      confirmTokenReturned: Boolean(plan.token),
      selectedCount: selected.length,
      cleanupCount: 0,
      cleanupCountDeprecated: true,
      skipped,
      warnings,
      confirmToken: plan.token,
      confirmTokenExpiresAt: plan.expiresAt,
      candidates: allowed.map((item) => publicCandidate(item, config, includeCommandLine)),
      nextStep: dryRunNextStep({ plan, allowed, options, gate }),
    };
  }

  if (!realCleanupAllowed(config)) {
    return {
      mode: "blocked",
      reason: "cleanup_real_execution_disabled",
      executionGate: executionGate(config),
      matchedCount: selected.length,
      blockedCount: skipped.length,
      plannedCleanupCount: allowed.length,
      executedCleanupCount: 0,
      skippedCount: skipped.length,
      confirmTokenReturned: false,
      selectedCount: selected.length,
      cleanupCount: 0,
      skipped,
      warnings: [
        ...warnings,
        "Real cleanup is disabled by default. Enable it only from trusted install config with acknowledgement.",
      ],
      candidates: allowed.map((item) => publicCandidate(item, config, includeCommandLine)),
    };
  }

  const batchGate = realCleanupBatchGate(allowed, ledger, config, options);
  if (!batchGate.ok) {
    return {
      mode: "blocked",
      reason: batchGate.reason,
      executionGate: executionGate(config, ledger),
      matchedCount: selected.length,
      blockedCount: skipped.length + batchGate.blockedCount,
      plannedCleanupCount: allowed.length,
      executedCleanupCount: 0,
      skippedCount: skipped.length,
      confirmTokenReturned: false,
      selectedCount: selected.length,
      cleanupCount: 0,
      skipped: [...skipped, ...batchGate.skipped],
      warnings,
      candidates: allowed.map((item) => publicCandidate(item, config, includeCommandLine)),
    };
  }

  const manualSkipped = [];
  const manualAllowed = [];
  for (const candidate of allowed) {
    const decision = canManualCleanup(candidate, config, {
      ...options,
      evidenceSha256,
      scope,
      pids,
      force,
      includeProcessTree,
      confirmToken: options.confirmToken,
    });
    if (decision.ok) manualAllowed.push(candidate);
    else {
      manualSkipped.push({
        pid: candidate.pid,
        name: candidate.name,
        risk: candidate.risk,
        reason: decision.reason,
        blockers: decision.blockers,
      });
    }
  }

  if (manualSkipped.length > 0) {
    return {
      mode: "blocked",
      reason: manualSkipped[0].reason,
      executionGate: executionGate(config, ledger),
      matchedCount: selected.length,
      blockedCount: skipped.length + manualSkipped.length,
      plannedCleanupCount: allowed.length,
      executedCleanupCount: 0,
      skippedCount: skipped.length + manualSkipped.length,
      confirmTokenReturned: false,
      selectedCount: selected.length,
      cleanupCount: 0,
      skipped: [...skipped, ...manualSkipped],
      warnings,
      candidates: allowed.map((item) => publicCandidate(item, config, includeCommandLine)),
    };
  }

  const validation = ledger.validateCleanupToken(options.confirmToken, manualAllowed, cleanupActionMeta(config, {
    scope,
    sessionEpochId: options.sessionEpochId,
    signal,
    force,
    includeProcessTree,
    evidenceSha256,
  }));
  if (!validation.ok) {
    return {
      mode: "blocked",
      reason: validation.reason,
      pid: validation.pid,
      matchedCount: selected.length,
      blockedCount: skipped.length,
      plannedCleanupCount: allowed.length,
      executedCleanupCount: 0,
      skippedCount: skipped.length,
      confirmTokenReturned: false,
      selectedCount: selected.length,
      cleanupCount: 0,
      skipped,
      warnings,
      candidates: manualAllowed.map((item) => publicCandidate(item, config, includeCommandLine)),
    };
  }

  const terminated = [];
  const errors = [];
  for (const candidate of manualAllowed) {
    try {
      const result = await terminatePid(candidate.pid, { signal, force, graceMs: config.cleanup.graceMs });
      terminated.push({
        pid: candidate.pid,
        name: candidate.name,
        risk: candidate.risk,
        signal,
        status: result.status,
      });
    } catch (error) {
      errors.push({ pid: candidate.pid, name: candidate.name, risk: candidate.risk, error: error.message });
    }
  }

  if (options.confirmToken) ledger.consumeCleanupToken(options.confirmToken);
  ledger.recordCleanupEvent({
    scope,
    signal,
    force,
    policyVersion: POLICY_VERSION,
    evidenceSha256,
    terminated,
    errors,
    skipped,
  });

  return {
    mode: "cleanup",
    scope,
    signal,
    force,
    matchedCount: selected.length,
    blockedCount: skipped.length,
    plannedCleanupCount: allowed.length,
    executedCleanupCount: manualAllowed.length,
    skippedCount: skipped.length,
    confirmTokenReturned: false,
    selectedCount: selected.length,
    cleanupCount: manualAllowed.length,
    terminated,
    skipped,
    errors,
    warnings,
  };
}

export function cleanupDecision(candidate, { scope, pids } = {}) {
  return canDryRun(candidate, { scope, pids });
}

function cleanupActionMeta(config, { scope, sessionEpochId, signal, force, includeProcessTree, evidenceSha256 }) {
  return {
    policyVersion: "cleanup-policy-v2",
    sessionEpochId: sessionEpochId || null,
    hostProfile: config?.host?.expectedProfile || null,
    scope,
    signal,
    force: Boolean(force),
    includeProcessTree: Boolean(includeProcessTree),
    evidenceSha256: normalizeEvidenceSha256(evidenceSha256),
    allowBrowsers: false,
    allowShells: false,
  };
}

function realCleanupAllowed(config) {
  return manualCleanupConfigTrusted(config, config?.__configMeta);
}

function emptyDryRunPlan(allowed, scope) {
  return {
    token: null,
    createdAt: new Date().toISOString(),
    expiresAt: null,
    pids: allowed.map((candidate) => candidate.pid),
    commandHashes: Object.fromEntries(allowed.map((candidate) => [candidate.pid, candidate.commandHash])),
    risks: Object.fromEntries(allowed.map((candidate) => [candidate.pid, candidate.risk])),
    ownership: Object.fromEntries(allowed.map((candidate) => [candidate.pid, candidate.ownership])),
    scope,
    dryRunOnly: true,
  };
}

function executionGate(config) {
  const realExecutionEnabled = Boolean(config?.cleanup?.realExecutionEnabled);
  const realExecutionTrusted = Boolean(config?.__configMeta?.cleanupRealExecutionTrusted);
  return {
    policyVersion: POLICY_VERSION,
    realExecutionEnabled,
    realExecutionTrusted,
    realCleanupAllowed: realCleanupAllowed(config),
    requiredConfigSource: "trusted_install_config",
    confirmTokenRequired: true,
    evidenceRequired: true,
    humanAuthorizationRequired: true,
    autonomousExecutionAllowed: false,
    allowForce: false,
    allowTreeKill: false,
    allowedOwnershipLevels: ["managed_strong", "managed_strong_expired"],
    maxProcessesPerRun: manualMaxProcessesPerRun(config),
    cooldownMinutes: manualCooldownMinutes(config),
    note: "Agents must not request real cleanup autonomously. Review dry-run output and ask the human before any real termination.",
  };
}

function realCleanupBatchGate(allowed, ledger, config, options = {}) {
  const skipped = [];
  const max = manualMaxProcessesPerRun(config);
  if (allowed.length > max) {
    skipped.push(...allowed.slice(max).map((candidate) => ({
      pid: candidate.pid,
      name: candidate.name,
      risk: candidate.risk,
      reason: "max_processes_per_run_exceeded",
    })));
  }
  const cooldownMinutes = manualCooldownMinutes(config);
  if (cooldownMinutes > 0 && cleanupInCooldown(ledger, cooldownMinutes, options.nowMs)) {
    skipped.push(...allowed.map((candidate) => ({
      pid: candidate.pid,
      name: candidate.name,
      risk: candidate.risk,
      reason: "cleanup_cooldown_active",
    })));
  }
  return {
    ok: skipped.length === 0,
    reason: skipped[0]?.reason,
    blockedCount: skipped.length,
    skipped,
  };
}

function manualMaxProcessesPerRun(config) {
  return Math.max(
    0,
    Number(
      config?.cleanup?.manualMaxProcessesPerRun ??
        config?.cleanup?.maxProcessesPerRun ??
        config?.autoCleanup?.maxProcessesPerRun ??
        3,
    ) || 3,
  );
}

function manualCooldownMinutes(config) {
  return Math.max(
    0,
    Number(
      config?.cleanup?.manualCooldownMinutes ??
        config?.cleanup?.cooldownMinutes ??
        config?.autoCleanup?.cooldownMinutes ??
        15,
    ) || 0,
  );
}

function resolveEvidenceSha256(options = {}) {
  const direct = normalizeEvidenceSha256(options.evidenceSha256 || options.evidence_sha256 || options.evidenceBundle?.evidenceSha256);
  if (direct) return direct;
  const evidencePath = options.evidencePath || options.evidence_path;
  if (!evidencePath) return null;
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(evidencePath)).digest("hex");
  } catch {
    return null;
  }
}

function normalizeEvidenceSha256(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : null;
}

function cleanupInCooldown(ledger, cooldownMinutes, nowMs = Date.now()) {
  const cutoff = Number(nowMs) - cooldownMinutes * 60 * 1000;
  return (ledger?.data?.events || []).some((event) => {
    if (event?.type !== "cleanup") return false;
    const at = Date.parse(event.at || "");
    return Number.isFinite(at) && at >= cutoff;
  });
}

function dryRunNextStep({ plan, allowed, options, gate }) {
  if (plan.token && gate.realCleanupAllowed) {
    return "Review this dry-run. Real cleanup is enabled by trusted install config, but execution still requires explicit human authorization and a fresh confirm token.";
  }
  if (plan.token) {
    return "A confirm token was returned only because request_confirm_token=true was explicitly requested. Real cleanup remains disabled unless trusted install config enables it and a human authorizes execution.";
  }
  if (allowed.length && options.createConfirmToken === false) {
    return "No confirm token was created because createConfirmToken=false was requested for audit evidence.";
  }
  if (allowed.length) {
    return "Review this dry-run. Real cleanup is disabled unless trusted install config enables it and a human explicitly authorizes execution.";
  }
  return "No confirm token was created because the cleanup plan is empty.";
}

async function terminatePid(pid, { signal, force, graceMs }) {
  if (!isAlive(pid)) return { status: "already_exited" };
  process.kill(pid, signal);
  await delay(Math.max(100, Number(graceMs) || 1200));
  if (!isAlive(pid)) return { status: "terminated" };

  if (force && signal !== "SIGKILL") {
    process.kill(pid, "SIGKILL");
    await delay(300);
    if (!isAlive(pid)) return { status: "force_terminated" };
  }

  return { status: "signal_sent_still_alive" };
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return true;
    return false;
  }
}

function normalizeSignal(signal) {
  const value = String(signal || "SIGTERM").toUpperCase();
  if (["SIGTERM", "SIGKILL", "SIGINT"].includes(value)) return value;
  return "SIGTERM";
}
