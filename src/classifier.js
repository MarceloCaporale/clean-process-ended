import crypto from "node:crypto";
import { basenameSafe, humanAge, redactCommandLine } from "./format.js";
import { normalizeForMatching } from "./paths.js";
import { buildProcessIndex, getParentChain, getParentChainWithDiagnostics } from "./scanner.js";
import { matchHostProfiles, matchToolProfiles } from "./profiles.js";

export function commandHash(proc) {
  const startBucket = Number.isFinite(proc.createTimeMs) ? Math.floor(proc.createTimeMs / 1000) : "";
  const raw = `${proc.pid}|${startBucket}|${proc.name}|${proc.commandLine || proc.executablePath || ""}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export function looseCommandHash(proc) {
  const raw = `${proc.name}|${proc.commandLine || proc.executablePath || ""}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export function cwdHash(proc) {
  const raw = proc.cwd || proc.workingDirectory || "";
  if (!raw) return null;
  return crypto.createHash("sha256").update(String(raw)).digest("hex").slice(0, 16);
}

export function containsAny(haystack, needles) {
  const text = normalizeForMatching(haystack);
  return (needles || []).some((needle) => needle && text.includes(normalizeForMatching(needle)));
}

export function nameInList(name, list) {
  const normalized = normalizeForMatching(basenameSafe(name));
  return (list || []).some((item) => normalized === normalizeForMatching(item));
}

export function summarizeProcess(proc, config, { includeCommandLine = false } = {}) {
  const summary = {
    pid: proc.pid,
    ppid: proc.ppid,
    name: proc.name,
    ageSeconds: proc.ageSeconds,
    age: humanAge(proc.ageSeconds),
    cpuPercent: proc.cpuPercent,
    rssMb: proc.rssMb,
    hasVisibleWindow: proc.hasVisibleWindow,
    commandHash: commandHash(proc),
    cwdHash: cwdHash(proc),
  };

  if (includeCommandLine) {
    summary.commandLine = redactCommandLine(proc.commandLine || proc.executablePath || proc.name, {
      maxLength: config.scan.maxCommandLineLength,
    });
  }

  return summary;
}

export function analyzeSnapshot(snapshot, config, ledger, options = {}) {
  const minAgeMinutes = Number.isFinite(Number(options.minAgeMinutes))
    ? Number(options.minAgeMinutes)
    : config.scan.minAgeMinutes;
  const includeCommandLine = Boolean(options.includeCommandLine);
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 25;
  const sessionContext = options.sessionContext || null;
  const byPid = buildProcessIndex(snapshot.processes || []);
  const currentProc = byPid.get(process.pid);
  const ownProcessTree = new Set([process.pid]);
  if (currentProc) {
    for (const parent of getParentChain(currentProc, byPid)) ownProcessTree.add(parent.pid);
  }

  const analyses = [];

  for (const proc of snapshot.processes || []) {
    analyses.push(
      analyzeProcess(proc, byPid, config, ledger, {
        minAgeMinutes,
        includeCommandLine,
        ownProcessTree,
        sessionContext,
      }),
    );
  }

  const candidates = analyses
    .filter((item) => item.isCandidate)
    .sort(sortCandidates);

  const counts = {
    totalProcesses: analyses.length,
    candidates: candidates.length,
    safe: candidates.filter((item) => item.risk === "safe").length,
    probable: candidates.filter((item) => item.risk === "probable").length,
    risky: candidates.filter((item) => item.risk === "risky").length,
    ownedCurrentSession: candidates.filter((item) => item.ownership === "owned_current_session").length,
    relatedUnowned: candidates.filter((item) => item.ownership === "related_unowned").length,
    unknownOwner: candidates.filter((item) => item.ownership === "unknown_owner").length,
    cleanupEligibleByDefault: candidates.filter((item) => item.cleanupAllowedByDefault).length,
    visibleWindowBlocked: candidates.filter((item) => item.blockers.includes("visible_window")).length,
    protectedBlocked: analyses.filter((item) => item.blockers.includes("protected_process")).length,
  };
  const internalOwnership = countValues(candidates.map((item) => item.internalOwnershipLevel));
  const partitions = partitionCandidates(candidates, config, includeCommandLine, limit);
  const topBlockers = topValues(candidates.flatMap((item) => item.blockers || []));
  const topReasons = topValues(candidates.flatMap((item) => item.reasons || []));
  const resourceImpact = summarizeResourceImpact(candidates);

  const report = {
    scannedAt: snapshot.scannedAt,
    platform: snapshot.platform,
    scanErrors: snapshot.errors || [],
    minAgeMinutes,
    session: sessionContext ? sessionPublic(sessionContext) : null,
    counts,
    ownership: {
      owned_current_session: counts.ownedCurrentSession,
      related_unowned: counts.relatedUnowned,
      unknown_owner: counts.unknownOwner,
    },
    internalOwnership,
    hosts: countProfileIds(candidates, "hostProfiles"),
    toolProfiles: countProfileIds(candidates, "toolProfiles"),
    partitions,
    topBlockers,
    topReasons,
    resourceImpact,
    notes: buildReportNotes(counts, minAgeMinutes),
    topCandidates: candidates.slice(0, limit).map((item) => publicCandidate(item, config, includeCommandLine)),
  };

  return { analyses, candidates, counts, report };
}

export function analyzeProcess(
  proc,
  byPid,
  config,
  ledger,
  { minAgeMinutes, includeCommandLine = false, ownProcessTree = new Set([process.pid]), sessionContext = null } = {},
) {
  const text = `${proc.name || ""} ${proc.executablePath || ""} ${proc.commandLine || ""}`;
  const chainInfo = getParentChainWithDiagnostics(proc, byPid);
  const chain = chainInfo.chain;
  const chainText = chain.map((item) => `${item.name} ${item.executablePath} ${item.commandLine}`).join("\n");
  const chainIdentityText = chain.map((item) => `${item.name || ""} ${item.executablePath || ""} ${item.cwd || ""} ${item.workingDirectory || ""}`).join("\n");
  const ageSeconds = Number(proc.ageSeconds) || 0;
  const minAgeSeconds = Math.max(0, Number(minAgeMinutes) || 0) * 60;

  const codexSelf = containsAny(text, config.matching.codexKeywords) || containsAny(text, config.matching.codexPathKeywords);
  const codexPath = containsAny(text, config.matching.codexPathKeywords);
  const mcpLike = containsAny(text, config.matching.mcpKeywords);
  const toolName = nameInList(proc.name, config.matching.toolProcessNames);
  const browserProcess = nameInList(proc.name, config.matching.browserProcessNames);
  const protectedName = nameInList(proc.name, config.matching.protectedNames);
  const hasVisibleWindow = Boolean(proc.hasVisibleWindow);
  const hasCodexAncestor = containsAny(chainIdentityText, config.matching.codexKeywords) || containsAny(chainIdentityText, config.matching.codexPathKeywords);
  const hasMcpAncestor = containsAny(chainText, config.matching.mcpKeywords);
  const parentMissing = proc.ppid > 1 && !byPid.has(proc.ppid);
  const adoptedByInit = process.platform !== "win32" && proc.ppid === 1 && (mcpLike || toolName || browserProcess);
  const cpuKnown = proc.cpuPercent !== undefined && proc.cpuPercent !== null;
  const cpuIdle = cpuKnown && Number(proc.cpuPercent) <= config.scan.cpuIdlePercent;
  const oldEnough = ageSeconds >= minAgeSeconds;
  const browserData = containsAny(text, [".browser_data", "browser_data"]);
  const ledgerKnownRelated = typeof ledger?.wasProcessRelated === "function"
    ? ledger.wasProcessRelated(proc)
    : typeof ledger?.wasProcessCodexRelated === "function"
      ? ledger.wasProcessCodexRelated(proc)
      : false;
  const isOwnProcess = proc.pid === process.pid || ownProcessTree.has(proc.pid) || chain.some((parent) => parent.pid === process.pid);
  const codexRootProcess = codexSelf && !mcpLike && !hasCodexAncestor && !ledgerKnownRelated;
  const hostProfiles = matchHostProfiles(proc, chain, config);
  const toolProfiles = matchToolProfiles(proc, chain, config);
  const strongHostProfiles = hostProfiles.filter((profile) => profile.confidence !== "weak_signal");
  const strongToolProfiles = toolProfiles.filter((profile) => profile.confidence !== "weak_signal");
  const expectedHostProfile = normalizeExpectedHostProfile(config?.host?.expectedProfile);
  const expectedHostMatches = expectedHostProfile
    ? hostProfiles.filter((profile) => profile.id === expectedHostProfile)
    : [];
  const expectedHostMatched = Boolean(
    expectedHostProfile && expectedHostMatches.length > 0,
  );
  const expectedHostChainMatched = expectedHostMatches.some((profile) => hasStrongHostChainReason(profile));
  const expectedHostWeakChainContextMatched =
    expectedHostMatches.some((profile) => hasWeakHostChainContextReason(profile)) && !expectedHostChainMatched;
  const expectedHostSelfOnlyMatched = expectedHostMatched && !expectedHostChainMatched;
  const hostBindingConfigured = Boolean(expectedHostProfile);
  const preExistingAtBaseline = sessionContext && ledger?.isProcessInSessionBaseline?.(proc, sessionContext);
  const sessionObservation = sessionContext && ledger?.getSessionProcessObservation?.(proc, sessionContext);
  const sessionObservationCount = Number(sessionObservation?.observationCount || 0);
  const previouslyOwnedWithExpectedHostChain = Boolean(
    sessionObservation &&
      (sessionObservation.firstOwnership === "owned_current_session" ||
        sessionObservation.lastOwnership === "owned_current_session") &&
      (sessionObservation.firstHadExpectedHostChain || sessionObservation.lastHadExpectedHostChain),
  );
  const expectedHostOwnershipEvidence = Boolean(expectedHostChainMatched || previouslyOwnedWithExpectedHostChain);
  const bornAfterSessionStart = Boolean(
    sessionContext?.startedAtMs &&
      Number.isFinite(proc.createTimeMs) &&
      proc.createTimeMs >= sessionContext.startedAtMs - 2000,
  );
  const observedInCurrentEpoch = Boolean(sessionObservation);
  const hostRootProcess = isHostRootProcess(hostProfiles) || codexRootProcess;
  const invalidParentTemporalOrder = !chainInfo.parentTemporalValid;
  const managedMatch = typeof ledger?.findManagedProcessForProc === "function" ? ledger.findManagedProcessForProc(proc) : null;
  const managedProcessMatched = Boolean(managedMatch?.strong);
  const managedPidReuseMismatch = Boolean(managedMatch?.pidReuseMismatch);
  const managedRecord = managedMatch?.record || null;
  const managedRecordHostProfile = managedRecord?.hostProfile || null;
  const managedRecordLeaseState = managedLeaseState(managedRecord);
  const managedOrphanCandidate = Boolean(
    managedProcessMatched &&
      (managedRecord?.orphanState === "runner_dead_child_alive" ||
        managedRecord?.lifecycleState === "managed_orphan_candidate" ||
        managedRecord?.childMayBeOrphaned),
  );
  const managedRecordMissingHostProfile = Boolean(managedProcessMatched && !managedRecordHostProfile);
  const managedHostProfileMismatch = Boolean(
    managedProcessMatched &&
      expectedHostProfile &&
      managedRecordHostProfile &&
      managedRecordHostProfile !== expectedHostProfile,
  );
  const managedHostMatchesExpected = Boolean(
    managedProcessMatched &&
      expectedHostProfile &&
      managedRecordHostProfile === expectedHostProfile,
  );
  const managedIdentityBroken = Boolean(managedPidReuseMismatch || managedRecordMissingHostProfile || managedHostProfileMismatch);

  const signals = {
    codexSelf,
    codexPath,
    mcpLike,
    toolName,
    browserProcess,
    protectedName,
    hasVisibleWindow,
    hasCodexAncestor,
    hasMcpAncestor,
    parentMissing,
    adoptedByInit,
    cpuKnown,
    cpuIdle,
    oldEnough,
    browserData,
    ledgerKnownRelated,
    isOwnProcess,
    codexRootProcess,
    hostRootProcess,
    preExistingAtBaseline: Boolean(preExistingAtBaseline),
    bornAfterSessionStart,
    observedInCurrentEpoch,
    sessionObservationCount,
    hostBindingConfigured,
    expectedHostProfile,
    expectedHostMatched,
    expectedHostChainMatched,
    expectedHostWeakChainContextMatched,
    expectedHostSelfOnlyMatched,
    expectedHostOwnershipEvidence,
    previouslyOwnedWithExpectedHostChain,
    parentTemporalValid: chainInfo.parentTemporalValid,
    invalidParentTemporalOrder,
    managedProcessMatched,
    managedProcessId: managedMatch?.managedProcessId || null,
    managedMatchStatus: managedMatch?.matchStatus || null,
    managedRecordLeaseState,
    managedOrphanCandidate,
    managedPidReuseMismatch,
    managedRecordHostProfile,
    managedRecordMissingHostProfile,
    managedHostProfileMismatch,
    managedHostMatchesExpected,
  };

  const reasons = [];
  const blockers = [];
  let score = 0;

  if (hasCodexAncestor) addSignal("codex_ancestor", 25);
  if (codexPath) addSignal("codex_path_or_config", 20);
  if (ledgerKnownRelated) addSignal("ledger_previously_related", 15);
  if (mcpLike) addSignal("mcp_like_command", 15);
  if (toolName && (hasCodexAncestor || mcpLike || ledgerKnownRelated || codexPath)) addSignal("tool_process_name", 8);
  if (browserData) addSignal("browser_data_profile", 10);
  if (parentMissing) addSignal("parent_pid_missing", 5);
  if (adoptedByInit) addSignal("adopted_by_init_or_launchd", 5);
  if (strongHostProfiles.length) addSignal("host_profile_match", 10);
  else if (hostProfiles.length) addSignal("weak_host_profile_match", 2);
  if (strongToolProfiles.length) addSignal("tool_profile_match", 10);
  else if (toolProfiles.length) addSignal("weak_tool_profile_match", 2);
  if (expectedHostMatched) addSignal("expected_host_profile_match", 15);
  if (bornAfterSessionStart) addSignal("born_after_session_start", 20);
  if (observedInCurrentEpoch) addSignal("observed_in_current_epoch", 5);
  if (managedProcessMatched) addSignal("managed_process_identity_match", 35);
  if (oldEnough) addSignal("older_than_threshold", 8);
  else {
    score -= 15;
    blockers.push("too_young");
  }
  if (cpuIdle) addSignal("cpu_idle_observed", 8);
  if (!cpuKnown) blockers.push("cpu_unknown_neutral");
  if (invalidParentTemporalOrder) {
    score -= 60;
    blockers.push("invalid_parent_temporal_order");
  }
  if (managedPidReuseMismatch) {
    score -= 80;
    blockers.push("managed_pid_reuse_mismatch");
  }
  if (managedRecordMissingHostProfile) {
    score -= 60;
    blockers.push("managed_record_missing_host_profile");
  }
  if (managedHostProfileMismatch) {
    score -= 80;
    blockers.push("managed_host_profile_mismatch");
  }

  if (hasVisibleWindow) {
    score -= 45;
    blockers.push("visible_window");
  }
  if (protectedName) {
    score -= 80;
    blockers.push("protected_process");
  }
  if (browserProcess || toolProfiles.some((profile) => profile.safety?.requiresExplicitPid)) {
    score -= browserData ? 10 : 30;
    blockers.push("browser_process_requires_explicit_pid");
    blockers.push("browser_process_cleanup_disabled");
  }
  if (hostRootProcess) {
    score -= 90;
    blockers.push("host_root_process_not_a_cleanup_target");
  }
  if (isOwnProcess) {
    score -= 100;
    blockers.push("own_process_or_parent_chain");
  }
  if (preExistingAtBaseline) blockers.push("preexisting_at_session_baseline");

  const profileEvidence = strongHostProfiles.length > 0 || strongToolProfiles.length > 0;
  const relatedEvidence =
    mcpLike || hasCodexAncestor || codexPath || ledgerKnownRelated || managedProcessMatched || managedPidReuseMismatch || profileEvidence || (browserData && (toolName || browserProcess));
  const isCandidate = Boolean(relatedEvidence && !hostRootProcess && !isOwnProcess && proc.pid > 1);
  if (isCandidate && !hostBindingConfigured) blockers.push("missing_host_binding");
  if (isCandidate && hostBindingConfigured && !expectedHostMatched && !managedHostMatchesExpected) blockers.push("host_profile_mismatch");
  const internalOwnershipLevel = resolveInternalOwnershipLevel({
    isCandidate,
    preExistingAtBaseline,
    bornAfterSessionStart,
    hostProfiles,
    strongHostProfiles,
    toolProfiles,
    strongToolProfiles,
    hasCodexAncestor,
    hasMcpAncestor,
    mcpLike,
    ledgerKnownRelated,
    sessionContext,
    expectedHostProfile,
    expectedHostMatched,
    expectedHostChainMatched,
    expectedHostOwnershipEvidence,
    previouslyOwnedWithExpectedHostChain,
    managedProcessMatched,
    managedHostMatchesExpected,
    managedPidReuseMismatch,
    managedRecordMissingHostProfile,
    managedHostProfileMismatch,
    managedRecordLeaseState,
    managedOrphanCandidate,
  });
  const ownership = publicOwnershipFromInternal(internalOwnershipLevel);

  let risk = "risky";
  const hasDefaultBlocker = [
      "visible_window",
      "protected_process",
      "browser_process_requires_explicit_pid",
    "browser_process_cleanup_disabled",
    "host_root_process_not_a_cleanup_target",
    "own_process_or_parent_chain",
    "too_young",
    "preexisting_at_session_baseline",
    "cpu_unknown_neutral",
    "missing_host_binding",
    "host_profile_mismatch",
    "invalid_parent_temporal_order",
    "managed_pid_reuse_mismatch",
    "managed_record_missing_host_profile",
    "managed_host_profile_mismatch",
  ].some((blocker) => blockers.includes(blocker));

  if (isCandidate) {
    if (ownership === "owned_current_session" && score >= 65 && !hasDefaultBlocker && oldEnough && cpuIdle) {
      risk = "safe";
    } else if (score >= 40 && !protectedName && !hostRootProcess && !hasVisibleWindow) {
      risk = "probable";
    }
  }

  const cleanupAllowedByDefault = isCandidate && ownership === "owned_current_session" && risk === "safe";
  const base = summarizeProcess(proc, config, { includeCommandLine });

  return {
    ...base,
    executablePath: includeCommandLine ? redactCommandLine(proc.executablePath, { maxLength: config.scan.maxCommandLineLength }) : undefined,
    ppid: proc.ppid,
    score: Math.max(0, Math.min(100, Math.round(score))),
    rawScore: Math.round(score),
    risk,
    ownership,
    internalOwnershipLevel,
    ownershipEvidence: ownershipEvidence({
      ownership,
      internalOwnershipLevel,
      preExistingAtBaseline,
      bornAfterSessionStart,
      hostProfiles,
      toolProfiles,
      expectedHostProfile,
      expectedHostMatched,
      expectedHostChainMatched,
      expectedHostWeakChainContextMatched,
      expectedHostSelfOnlyMatched,
      expectedHostOwnershipEvidence,
      previouslyOwnedWithExpectedHostChain,
      invalidParentTemporalOrder,
      hasCodexAncestor,
      hasMcpAncestor,
      mcpLike,
      ledgerKnownRelated,
      managedProcessMatched,
      managedOrphanCandidate,
      managedPidReuseMismatch,
      managedRecordMissingHostProfile,
      managedHostProfileMismatch,
      managedProcessId: managedMatch?.managedProcessId || null,
      managedMatchStatus: managedMatch?.matchStatus || null,
      managedRecordLeaseState,
      managedRecordHostProfile,
    }),
    reasons,
    blockers,
    signals,
    managedProcessId: managedMatch?.managedProcessId || null,
    managedMatchStatus: managedMatch?.matchStatus || null,
    hostProfiles: hostProfiles.map(publicProfileMatch),
    toolProfiles: toolProfiles.map(publicProfileMatch),
    isCandidate,
    cleanupAllowedByDefault,
    parentChain: chain.slice(0, 8).map((parent) => ({ pid: parent.pid, name: parent.name, commandHash: commandHash(parent) })),
    parentChainDiagnostics: {
      parentTemporalValid: chainInfo.parentTemporalValid,
      invalidRelations: chainInfo.invalidRelations,
    },
  };

  function addSignal(reason, points) {
    score += points;
    reasons.push(reason);
  }
}

export function publicCandidate(item, config, includeCommandLine = false) {
  const out = {
    pid: item.pid,
    ppid: item.ppid,
    name: item.name,
    ageSeconds: item.ageSeconds,
    age: item.age,
    cpuPercent: item.cpuPercent,
    hasVisibleWindow: item.hasVisibleWindow,
    risk: item.risk,
    ownership: item.ownership,
    internalOwnershipLevel: item.internalOwnershipLevel,
    score: item.score,
    commandHash: item.commandHash,
    cwdHash: item.cwdHash,
    managedProcessId: item.managedProcessId,
    managedMatchStatus: item.managedMatchStatus,
    cleanupAllowedByDefault: item.cleanupAllowedByDefault,
    ownershipEvidence: item.ownershipEvidence,
    hostProfiles: item.hostProfiles,
    toolProfiles: item.toolProfiles,
    reasons: item.reasons,
    blockers: item.blockers,
    parentChain: item.parentChain,
    parentChainDiagnostics: item.parentChainDiagnostics,
  };

  if (includeCommandLine && item.commandLine) out.commandLine = item.commandLine;
  if (includeCommandLine && item.executablePath) out.executablePath = item.executablePath;
  return out;
}

export function filterCandidates(candidates, { scope = "owned_current_session", pids = [] } = {}) {
  const wantedPids = new Set((pids || []).map(Number).filter((value) => Number.isInteger(value) && value > 0));

  if (scope === "explicit_pids") {
    return candidates.filter((candidate) => wantedPids.has(candidate.pid));
  }

  if (wantedPids.size > 0) {
    return candidates.filter((candidate) => wantedPids.has(candidate.pid));
  }

  if (scope === "all") return candidates;
  if (scope === "related_unowned") return candidates.filter((candidate) => candidate.ownership === "related_unowned");
  if (scope === "unknown_owner") return candidates.filter((candidate) => candidate.ownership === "unknown_owner");
  return candidates.filter((candidate) => candidate.ownership === "owned_current_session");
}

export function sortCandidates(a, b) {
  const ownershipOrder = { owned_current_session: 0, related_unowned: 1, unknown_owner: 2 };
  const ownershipDiff = (ownershipOrder[a.ownership] ?? 9) - (ownershipOrder[b.ownership] ?? 9);
  if (ownershipDiff !== 0) return ownershipDiff;
  const riskOrder = { safe: 0, probable: 1, risky: 2 };
  const riskDiff = riskOrder[a.risk] - riskOrder[b.risk];
  if (riskDiff !== 0) return riskDiff;
  if (b.score !== a.score) return b.score - a.score;
  return (b.ageSeconds || 0) - (a.ageSeconds || 0);
}

function resolveInternalOwnershipLevel({
  isCandidate,
  preExistingAtBaseline,
  bornAfterSessionStart,
  hostProfiles,
  strongHostProfiles,
  toolProfiles,
  strongToolProfiles,
  hasCodexAncestor,
  hasMcpAncestor,
  mcpLike,
  ledgerKnownRelated,
  sessionContext,
  expectedHostProfile,
  expectedHostMatched,
  expectedHostChainMatched,
  expectedHostOwnershipEvidence,
  previouslyOwnedWithExpectedHostChain,
  managedProcessMatched,
  managedHostMatchesExpected,
  managedPidReuseMismatch,
  managedRecordMissingHostProfile,
  managedHostProfileMismatch,
  managedRecordLeaseState,
  managedOrphanCandidate,
}) {
  if (!isCandidate) return "unknown_owner";
  const toolEvidence = strongToolProfiles.length > 0 || mcpLike;

  if (managedPidReuseMismatch) return "related_tool_context";
  if (managedHostProfileMismatch) return "related_cross_host";
  if (managedRecordMissingHostProfile) return "managed_orphan_candidate";
  if (managedProcessMatched && managedHostMatchesExpected) {
    if (managedOrphanCandidate) return "managed_orphan_candidate";
    return managedRecordLeaseState === "expired" ? "managed_strong_expired" : "managed_strong";
  }
  if (managedProcessMatched) return "related_tool_context";

  if (!sessionContext || preExistingAtBaseline) {
    return hostProfiles.length || toolProfiles.length || mcpLike || ledgerKnownRelated ? "related_preexisting" : "unknown_owner";
  }

  const hostEvidence = Boolean(expectedHostOwnershipEvidence);
  if (!expectedHostProfile || !expectedHostMatched) {
    if (hostProfiles.length && expectedHostProfile) return "related_cross_host";
    return toolEvidence || ledgerKnownRelated || hasCodexAncestor || hasMcpAncestor ? "related_tool_context" : "unknown_owner";
  }
  if (previouslyOwnedWithExpectedHostChain && toolEvidence) return "previously_owned_observed_orphan";
  if (bornAfterSessionStart && hostEvidence && toolEvidence) return "owned_current_session_by_host_chain";
  if (expectedHostChainMatched || toolEvidence || ledgerKnownRelated || hasCodexAncestor || hasMcpAncestor) {
    return "related_tool_context";
  }
  return "unknown_owner";
}

function publicOwnershipFromInternal(internalOwnershipLevel) {
  if (
    [
      "managed_strong",
      "managed_strong_expired",
      "owned_current_session_by_host_chain",
      "previously_owned_observed_orphan",
    ].includes(internalOwnershipLevel)
  ) {
    return "owned_current_session";
  }
  if (
    [
      "managed_orphan_candidate",
      "related_cross_host",
      "related_preexisting",
      "related_tool_context",
    ].includes(internalOwnershipLevel)
  ) {
    return "related_unowned";
  }
  return "unknown_owner";
}

function ownershipEvidence({
  ownership,
  internalOwnershipLevel,
  preExistingAtBaseline,
  bornAfterSessionStart,
  hostProfiles,
  toolProfiles,
  expectedHostProfile,
  expectedHostMatched,
  expectedHostChainMatched,
  expectedHostWeakChainContextMatched,
  expectedHostSelfOnlyMatched,
  expectedHostOwnershipEvidence,
  previouslyOwnedWithExpectedHostChain,
  invalidParentTemporalOrder,
  hasCodexAncestor,
  hasMcpAncestor,
  mcpLike,
  ledgerKnownRelated,
  managedProcessMatched,
  managedOrphanCandidate,
  managedPidReuseMismatch,
  managedRecordMissingHostProfile,
  managedHostProfileMismatch,
  managedProcessId,
  managedMatchStatus,
  managedRecordLeaseState,
  managedRecordHostProfile,
}) {
  const evidence = [];
  if (internalOwnershipLevel) evidence.push(`internal_ownership_level:${internalOwnershipLevel}`);
  if (preExistingAtBaseline) evidence.push("preexisting_at_session_baseline");
  if (bornAfterSessionStart) evidence.push("born_after_session_start");
  if (expectedHostProfile) evidence.push(`expected_host_profile:${expectedHostProfile}`);
  if (expectedHostProfile && expectedHostMatched) evidence.push("expected_host_profile_matched");
  if (expectedHostProfile && !expectedHostMatched) evidence.push("expected_host_profile_mismatch");
  if (expectedHostChainMatched) evidence.push("expected_host_chain_matched");
  if (expectedHostWeakChainContextMatched) evidence.push("expected_host_weak_chain_context_matched");
  if (expectedHostSelfOnlyMatched) evidence.push("expected_host_self_match_only");
  if (expectedHostOwnershipEvidence) evidence.push("expected_host_ownership_evidence");
  if (previouslyOwnedWithExpectedHostChain) evidence.push("previously_owned_with_expected_host_chain");
  if (invalidParentTemporalOrder) evidence.push("invalid_parent_temporal_order");
  if (!expectedHostProfile) evidence.push("missing_host_binding");
  if (hostProfiles.length) evidence.push(`host_profiles:${hostProfiles.map((item) => item.id).join(",")}`);
  if (toolProfiles.length) evidence.push(`tool_profiles:${toolProfiles.map((item) => item.id).join(",")}`);
  if (hasCodexAncestor) evidence.push("codex_ancestor");
  if (hasMcpAncestor) evidence.push("mcp_ancestor");
  if (mcpLike) evidence.push("mcp_like_command");
  if (ledgerKnownRelated) evidence.push("ledger_previously_related");
  if (managedProcessMatched) evidence.push(`managed_process_identity_match:${managedProcessId || "unknown"}`);
  if (managedMatchStatus) evidence.push(`managed_match_status:${managedMatchStatus}`);
  if (managedRecordLeaseState) evidence.push(`managed_lease_state:${managedRecordLeaseState}`);
  if (managedOrphanCandidate) evidence.push("managed_orphan_candidate");
  if (managedRecordHostProfile) evidence.push(`managed_record_host_profile:${managedRecordHostProfile}`);
  if (managedRecordMissingHostProfile) evidence.push("managed_record_missing_host_profile");
  if (managedHostProfileMismatch) evidence.push("managed_host_profile_mismatch");
  if (managedPidReuseMismatch) evidence.push("managed_pid_reuse_mismatch");
  if (!evidence.length) evidence.push("no_sufficient_ownership_evidence");
  return { ownership, internalOwnershipLevel, evidence };
}

function normalizeExpectedHostProfile(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text;
}

function publicProfileMatch(match) {
  return {
    id: match.id,
    confidence: match.confidence,
    reasons: match.reasons,
    safety: match.safety,
  };
}

function hasProfileReason(profile, prefix) {
  return (profile?.reasons || []).some((reason) => String(reason).startsWith(prefix));
}

function hasStrongHostChainReason(profile) {
  return (profile?.reasons || []).some((reason) => reason === "chain:process_name" || reason === "chain:executable_path");
}

function hasWeakHostChainContextReason(profile) {
  return (profile?.reasons || []).some((reason) =>
    ["chain:command_line", "chain:cwd_path", "chain:working_directory"].includes(reason),
  );
}

function isHostRootProcess(hostProfiles) {
  return (hostProfiles || []).some(
    (profile) =>
      profile.confidence !== "weak_signal" &&
      (profile.reasons || []).some((reason) => reason === "self:process_name"),
  );
}

function managedLeaseState(record) {
  if (!record?.leaseExpiresAt) return "none";
  const expiresAt = Date.parse(record.leaseExpiresAt);
  if (!Number.isFinite(expiresAt)) return "invalid";
  return expiresAt <= Date.now() ? "expired" : "active";
}

function countProfileIds(items, field) {
  const counts = {};
  for (const item of items) {
    for (const profile of item[field] || []) {
      counts[profile.id] = (counts[profile.id] || 0) + 1;
    }
  }
  return counts;
}

function countValues(values) {
  const counts = {};
  for (const value of values || []) {
    if (!value) continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function partitionCandidates(candidates, config, includeCommandLine, limit) {
  const actionable = [];
  const blockedOwned = [];
  const relatedReportOnly = [];
  const weakSignalsCollapsed = {};

  for (const item of candidates) {
    if (item.cleanupAllowedByDefault) actionable.push(item);
    else if (item.ownership === "owned_current_session") blockedOwned.push(item);
    else relatedReportOnly.push(item);

    const profiles = [...(item.hostProfiles || []), ...(item.toolProfiles || [])];
    const hasStrongProfile = profiles.some((profile) => profile.confidence !== "weak_signal");
    if (!hasStrongProfile) {
      for (const profile of profiles.filter((entry) => entry.confidence === "weak_signal")) {
        weakSignalsCollapsed[profile.id] = (weakSignalsCollapsed[profile.id] || 0) + 1;
      }
    }
  }

  return {
    actionable: actionable.slice(0, limit).map((item) => publicCandidate(item, config, includeCommandLine)),
    blockedOwned: blockedOwned.slice(0, limit).map((item) => publicCandidate(item, config, includeCommandLine)),
    relatedReportOnly: relatedReportOnly.slice(0, limit).map((item) => publicCandidate(item, config, includeCommandLine)),
    weakSignalsCollapsed,
    counts: {
      actionable: actionable.length,
      blockedOwned: blockedOwned.length,
      relatedReportOnly: relatedReportOnly.length,
      weakSignalsCollapsed: Object.values(weakSignalsCollapsed).reduce((sum, value) => sum + value, 0),
    },
  };
}

function topValues(values, limit = 10) {
  const counts = {};
  for (const value of values || []) {
    if (!value) continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id, count]) => ({ id, count }));
}

function summarizeResourceImpact(candidates) {
  const withRss = candidates.filter((item) => Number.isFinite(item.rssMb));
  const withCpu = candidates.filter((item) => Number.isFinite(item.cpuPercent));
  const rssMbTotal = Math.round(withRss.reduce((sum, item) => sum + item.rssMb, 0) * 10) / 10;
  const cpuPercentTotal = Math.round(withCpu.reduce((sum, item) => sum + Number(item.cpuPercent || 0), 0) * 1000) / 1000;

  return {
    rssMbKnownCount: withRss.length,
    rssMbTotal,
    cpuKnownCount: withCpu.length,
    cpuPercentTotal,
    topByRssMb: [...withRss]
      .sort((a, b) => b.rssMb - a.rssMb)
      .slice(0, 10)
      .map((item) => ({ pid: item.pid, name: item.name, rssMb: item.rssMb, ownership: item.ownership, risk: item.risk })),
  };
}

function sessionPublic(sessionContext) {
  return {
    mcpInstanceId: sessionContext.mcpInstanceId,
    sessionEpochId: sessionContext.sessionEpochId,
    startedAt: sessionContext.startedAt,
    baselineSnapshotId: sessionContext.baselineSnapshotId || null,
  };
}

function buildReportNotes(counts, minAgeMinutes) {
  const notes = [];
  if (counts.candidates === 0) {
    notes.push("No se encontraron candidatos de reporte para el umbral actual.");
  } else {
    notes.push(
      `Se clasificaron ${counts.candidates} candidatos de reporte: ${counts.ownedCurrentSession} owned_current_session, ${counts.relatedUnowned} related_unowned, ${counts.unknownOwner} unknown_owner.`,
    );
  }
  notes.push(`El umbral de edad activo es ${minAgeMinutes} minutos; procesos mas jovenes quedan bloqueados por defecto.`);
  notes.push("CPU desconocida es neutral y bloquea cleanup por defecto; no se interpreta como idle.");
  notes.push("Solo owned_current_session con risk=safe puede entrar en dry-run por defecto.");
  return notes;
}
