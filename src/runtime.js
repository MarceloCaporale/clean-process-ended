import crypto from "node:crypto";
import { loadConfig } from "./config.js";
import { Ledger } from "./ledger.js";
import { EmbeddedWatcher } from "./watcher.js";
import { scanProcesses } from "./scanner.js";
import { analyzeSnapshot, commandHash, filterCandidates, looseCommandHash, publicCandidate } from "./classifier.js";
import { cleanupDecision, planOrCleanupCandidates } from "./cleanup.js";
import { createSessionContext } from "./session.js";
import { listConfiguredProfiles } from "./profiles.js";
import {
  autoCleanupStatus as policyAutoCleanupStatus,
  canAutoCleanupPlan,
  canAutoCleanupTerminate,
  canDryRun,
  canManualCleanup,
  canReport,
  planAutoCleanup,
} from "./policy.js";

const CLIENT_HOST_PROFILES = Object.freeze({
  codex: "codex",
  codex_cli: "codex",
  claude: "claude_code",
  claude_code: "claude_code",
  gemini: "gemini_cli",
  gemini_cli: "gemini_cli",
  qwen: "qwen_code",
  qwen_code: "qwen_code",
});

function suggestedHostProfileForClient(client) {
  if (!client) return null;
  return CLIENT_HOST_PROFILES[String(client).toLowerCase()] || null;
}

export function createRuntime({ configPath, dataDir, logger = () => {} } = {}) {
  const loaded = loadConfig(configPath);
  const ledger = new Ledger({ dataDir, config: loaded.config }).load();
  const session = createSessionContext({ ledger });
  ledger.startSession(session);
  const watcher = new EmbeddedWatcher({ config: loaded.config, ledger, logger, sessionContext: session });

  return {
    product: "clean-process-ended",
  version: "0.7.3",
    config: loaded.config,
    configLoadedPaths: loaded.loadedPaths,
    configMeta: loaded.configMeta,
    configErrors: loaded.errors,
    configBlockedPaths: loaded.blockedPaths || [],
    ledger,
    watcher,
    session,
    logger,
    scanCache: null,
  };
}

export async function startRuntimeWatcher(runtime) {
  if (runtime.config.watcher.enabled) {
    await runtime.watcher.start({ immediate: true });
  }
  return runtime.watcher.status();
}

export async function primeRuntimeBaseline(runtime) {
  if (!runtime?.session?.sessionEpochId) return null;
  const existing = runtime.ledger.data.sessions?.[runtime.session.sessionEpochId]?.baseline;
  if (existing) {
    runtime.session.baselineSnapshotId = existing.snapshotId;
    return existing;
  }
  const snapshot = await scanProcesses();
  return runtime.ledger.ensureSessionBaseline(snapshot, runtime.session);
}

export async function buildScopeReport(runtime, options = {}) {
  const scanResult = await scanAnalyzeRecord(runtime, options);
  return scopeReportFromScan(runtime, scanResult);
}

export async function buildCleanupCandidates(runtime, options = {}) {
  const scanResult = await scanAnalyzeRecord(runtime, options);
  return cleanupCandidatesFromScan(runtime, scanResult, options);
}

export async function executeCleanup(runtime, options = {}) {
  const { analysis } = await scanAnalyzeRecord(runtime, options, {
    forceRefresh: options.dryRun === false && runtime.config.scan.refreshBeforeRealCleanup !== false,
  });
  return planOrCleanupCandidates(analysis.candidates, runtime.ledger, runtime.config, {
    ...options,
    sessionEpochId: runtime.session.sessionEpochId,
  });
}

export function janitorDiscovery(runtime, options = {}) {
  const client = options.client || runtime.config.host.expectedProfile || "generic_mcp_host";
  const hostProfile = runtime.config.host.expectedProfile || null;
  const suggestedHostProfile = suggestedHostProfileForClient(client);
  return {
    product: runtime.product,
    version: runtime.version,
    available: true,
    mode: "diagnostic_dry_run_beta",
    client,
    hostProfile,
    suggestedHostProfile,
    hostBindingConfigured: Boolean(hostProfile),
    hostBindingMatchesSuggested: Boolean(hostProfile && suggestedHostProfile && hostProfile === suggestedHostProfile),
    realExecution: {
      enabled: Boolean(runtime.config.cleanup.realExecutionEnabled),
      trusted: Boolean(runtime.configMeta?.cleanupRealExecutionTrusted),
      autonomousExecutionAllowed: false,
      humanAuthorizationRequired: true,
    },
    recommendedUse: [
      "task_close_check",
      "performance_diagnostics",
      "manual_audit",
      "managed_lifecycle_review",
    ],
    closeTaskProtocol: [
      "session_status",
      "process_scope_report",
      "process_cleanup_candidates(scope=owned_current_session)",
      "process_cleanup(dry_run=true)",
      "process_explain(representative_pids)",
    ],
    neverDo: [
      "dry_run_false_autonomously",
      "no_dry_run_autonomously",
      "cleanup_related_unowned",
      "cleanup_unknown_owner",
      "cleanup_browsers",
      "cleanup_devtools",
      "cleanup_shells",
      "cleanup_host_roots",
      "treat_cpu_idle_as_ownership",
    ],
    optionalIntegrations: {
      codexAgentMem: {
        status: "optional",
        purpose: "Store a compact process_janitor_receipt hash/summary with task closure memory.",
        hardDependency: false,
        storeCommandLines: false,
      },
    },
    agentInstruction:
      "Use clean-process-ended only for non-destructive close checks after non-trivial tasks involving subprocesses, MCP servers, browsers/devtools, local servers, subagents or background jobs. Never call dry_run=false autonomously.",
  };
}

export async function sessionCloseCheck(runtime, options = {}) {
  const limit = Number.isInteger(options.limit) ? options.limit : 10;
  const scanResult = await scanAnalyzeRecord(
    runtime,
    { ...options, limit },
    { forceRefresh: true, useCache: true },
  );
  const report = scopeReportFromScan(runtime, scanResult);
  const candidates = cleanupCandidatesFromScan(runtime, scanResult, {
    ...options,
    scope: "owned_current_session",
    limit,
  });
  const dryRun = await planOrCleanupCandidates(scanResult.analysis.candidates, runtime.ledger, runtime.config, {
    ...options,
    dryRun: true,
    scope: "owned_current_session",
    includeCommandLine: false,
    createConfirmToken: false,
    sessionEpochId: runtime.session.sessionEpochId,
  });
  const actionable = report.partitions?.actionable?.length || 0;
  const blockedOwned = report.partitions?.blockedOwned?.length || 0;
  const relatedReportOnly = report.partitions?.relatedReportOnly?.length || 0;
  const unknownOwner = report.counts?.unknownOwner || 0;
  const now = new Date().toISOString();
  const receipt = {
    type: "process_janitor_receipt",
    source: "clean-process-ended",
    projectKey: options.projectKey || null,
    hostProfile: runtime.config.host.expectedProfile || null,
    sessionEpochId: runtime.session.sessionEpochId,
    mode: "dry_run",
    cleanupEligibleByDefault: report.counts?.cleanupEligibleByDefault || 0,
    cleanupRealExecuted: false,
    evidenceSha256Scope: "receipt_payload_canonical",
    createdAt: now,
  };
  receipt.evidenceSha256 = canonicalSha256(receipt);
  const externalReceipt = buildExternalReceipt({
    projectKey: options.projectKey || null,
    hostProfile: runtime.config.host.expectedProfile || null,
    sessionEpochId: runtime.session.sessionEpochId,
    createdAt: now,
    summary: dryRun.plannedCleanupCount
      ? "session_close_check completed. Cleanup dry-run found owned_current_session candidates, but no real cleanup was executed. Human review is required before any termination attempt."
      : "session_close_check completed. No cleanup candidates were eligible by the default owned_current_session dry-run policy. No real cleanup was executed.",
    counts: {
      processes_seen: report.counts?.totalProcesses || 0,
      candidates: report.counts?.candidates || 0,
      cleanup_eligible: report.counts?.cleanupEligibleByDefault || 0,
      cleanup_planned: dryRun.plannedCleanupCount || 0,
      cleanup_executed: 0,
    },
  });

  return {
    product: runtime.product,
    version: runtime.version,
    ok: dryRun.plannedCleanupCount === 0,
    mode: "close_check_dry_run",
    generatedAt: now,
    safety: {
      nonDestructive: true,
      singleSnapshot: true,
      confirmTokenReturned: false,
      cleanupRealExecuted: false,
      commandLinesIncluded: false,
    },
    summary: {
      totalProcesses: report.counts?.totalProcesses || 0,
      candidates: report.counts?.candidates || 0,
      actionable,
      blockedOwned,
      relatedReportOnly,
      unknownOwner,
      plannedCleanupCount: dryRun.plannedCleanupCount,
      skippedCount: dryRun.skippedCount,
    },
    executionGate: dryRun.executionGate,
    recommendation: dryRun.plannedCleanupCount
      ? "Review the dry-run candidates and blockers. Do not execute real cleanup without explicit human authorization."
      : "No cleanup action required by the default owned_current_session dry-run policy.",
    receipt,
    externalReceipt,
    codexAgentMem: {
      optional: true,
      recommendedStoredFields: [
        "type",
        "source",
        "projectKey",
        "hostProfile",
        "sessionEpochId",
        "mode",
        "cleanupEligibleByDefault",
        "cleanupRealExecuted",
        "evidenceSha256Scope",
        "evidenceSha256",
        "createdAt",
      ],
      publicReceiptFields: Object.keys(externalReceipt),
      note: "Store only the receipt summary/hash in codex-agent-mem. Do not store full command lines or tokens.",
    },
    topBlockers: report.topBlockers,
    topReasons: report.topReasons,
    candidates: candidates.candidates,
    dryRun: {
      mode: dryRun.mode,
      plannedCleanupCount: dryRun.plannedCleanupCount,
      skippedCount: dryRun.skippedCount,
      confirmTokenReturned: false,
      confirmToken: null,
      nextStep: dryRun.nextStep,
    },
  };
}

function canonicalSha256(payload) {
  const copy = { ...payload };
  delete copy.evidenceSha256;
  return crypto.createHash("sha256").update(canonicalJson(copy)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function buildAuditBundle(runtime, options = {}) {
  const scanResult = await scanAnalyzeRecord(
    runtime,
    { ...options, limit: options.limit || 50 },
    { forceRefresh: true, useCache: runtime.config.scan.cacheForAuditBundle !== false },
  );
  const report = scopeReportFromScan(runtime, scanResult);
  const candidates = cleanupCandidatesFromScan(runtime, scanResult, { ...options, scope: options.scope || "all", limit: options.limit || 50 });
  const dryRun = await planOrCleanupCandidates(scanResult.analysis.candidates, runtime.ledger, runtime.config, {
    ...options,
    dryRun: true,
    scope: "owned_current_session",
    includeCommandLine: false,
    createConfirmToken: false,
    sessionEpochId: runtime.session.sessionEpochId,
  });
  const processExplainSelected = scanResult.analysis.candidates.slice(0, 3).map((item) => ({
    pid: item.pid,
    found: true,
    process: publicCandidate(item, runtime.config, false),
    signals: item.signals,
  }));
  return {
    product: runtime.product,
    version: runtime.version,
    generatedAt: new Date().toISOString(),
    runId: `audit_${Date.now().toString(36)}`,
    client: options.client || null,
    hostProfile: runtime.config.host.expectedProfile || null,
    config: configExplain(runtime),
    session: sessionStatus(runtime),
    watcher: runtime.watcher.status(),
    profiles: profileList(runtime),
    processScopeReport: report,
    processCleanupCandidates: candidates,
    processCleanupDryRun: {
      ...dryRun,
      confirmToken: dryRun.confirmToken ? "[redacted-live-token]" : null,
    },
    processExplainSelected,
    metrics: {
      totalProcesses: report.counts.totalProcesses,
      candidates: report.counts.candidates,
      cleanupEligibleByDefault: report.counts.cleanupEligibleByDefault,
      actionable: report.partitions?.counts?.actionable || 0,
      blockedOwned: report.partitions?.counts?.blockedOwned || 0,
      relatedReportOnly: report.partitions?.counts?.relatedReportOnly || 0,
      rssMbTotal: report.resourceImpact?.rssMbTotal || 0,
      cpuPercentTotal: report.resourceImpact?.cpuPercentTotal || 0,
    },
    safety: {
      cleanupRealExecuted: false,
      noDryRunUsed: false,
      dryRunOnly: true,
      storeCommandLines: runtime.config.ledger.storeCommandLines,
      commandLinesIncluded: false,
      rawProcessOutputIncluded: false,
      secretsIncluded: false,
      liveConfirmTokenReturned: false,
      watcherEnabled: runtime.config.watcher.enabled,
      autoCleanup: policyAutoCleanupStatus(runtime.config, runtime.configMeta),
      snapshotId: scanResult.snapshotRecord.id,
      singleSnapshot: report.ledger.snapshotId === candidates.ledger.snapshotId,
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
    },
  };
}

export async function policyExplain(runtime, options = {}) {
  const explained = await explainProcess(runtime, options);
  if (!explained.found) return explained;
  const candidate = { ...explained.process, signals: explained.signals, isCandidate: explained.process?.isCandidate !== false };
  const context = {
    scope: options.scope || "owned_current_session",
    pids: options.pids || (options.pid ? [Number(options.pid)] : []),
    confirmToken: options.confirmToken || null,
    evidenceSha256: options.evidenceSha256 || null,
    force: Boolean(options.force),
    includeProcessTree: Boolean(options.includeProcessTree),
  };
  const layers = {
    report: canReport(candidate),
    dryRun: canDryRun(candidate, context),
    manualCleanup: canManualCleanup(candidate, runtime.config, context),
    autoCleanupPlan: canAutoCleanupPlan(candidate, runtime.config),
    autoCleanupTerminate: canAutoCleanupTerminate(candidate, runtime.config, { configMeta: runtime.configMeta }),
  };
  return {
    ...explained,
    policyVersion: policyAutoCleanupStatus(runtime.config, runtime.configMeta).policyVersion,
    policyLayers: layers,
    cleanupPolicy: cleanupDecision({ ...candidate, isCandidate: true, signals: explained.signals }, { scope: "owned_current_session", pids: [] }),
    autoCleanupPolicy: policyAutoCleanupStatus(runtime.config, runtime.configMeta),
  };
}

export function ledgerCompactDryRun(runtime) {
  const eventLogEvents = runtime.ledger.readAppendOnlyEvents();
  const maxEvents = runtime.config?.ledger?.maxEvents ?? 400;
  const maxSnapshots = runtime.config?.ledger?.maxSnapshots ?? 120;
  const mergedEventKeys = new Set([...(runtime.ledger.data.events || []), ...eventLogEvents].map((event) => JSON.stringify(event)));
  return {
    product: runtime.product,
    version: runtime.version,
    mode: "ledger_compact_dryrun",
    dryRun: true,
    ledgerPath: runtime.ledger.ledgerPath,
    eventLogPath: runtime.ledger.eventLogPath(),
    current: {
      snapshots: runtime.ledger.data.snapshots?.length || 0,
      events: runtime.ledger.data.events?.length || 0,
      appendOnlyEvents: eventLogEvents.length,
      sessions: Object.keys(runtime.ledger.data.sessions || {}).length,
      processMemory: Object.keys(runtime.ledger.data.processMemory || {}).length,
      cleanupPlans: Object.keys(runtime.ledger.data.cleanupPlans || {}).length,
      managedProcesses: Object.keys(runtime.ledger.data.managedProcesses || {}).length,
    },
    proposed: {
      snapshots: Math.min(runtime.ledger.data.snapshots?.length || 0, maxSnapshots),
      events: Math.min(mergedEventKeys.size, maxEvents),
      appendOnlyEventsPreserved: eventLogEvents.length,
      destructive: false,
    },
    notes: [
      "Dry-run only: no ledger files were rewritten.",
      "Compaction preserves append-only events as evidence and applies JSON ledger retention limits on rebuild.",
    ],
  };
}

export async function staleSessionReport(runtime) {
  const sessions = Object.values(runtime.ledger.data.sessions || {});
  const expectedHost = runtime.config.host.expectedProfile || null;
  const currentEpoch = runtime.session.sessionEpochId;
  const stale = sessions
    .filter((session) => session.sessionEpochId !== currentEpoch)
    .filter((session) => !expectedHost || !session.hostProfile || session.hostProfile === expectedHost)
    .map((session) => ({
      sessionEpochId: session.sessionEpochId,
      mcpInstanceId: session.mcpInstanceId,
      hostProfile: session.hostProfile || null,
      serverPid: session.serverPid || null,
      startedAt: session.startedAt,
      lastSeenAt: session.lastSeenAt || null,
      serverPidAlive: Number.isInteger(session.serverPid) ? isPidAlive(session.serverPid) : null,
      observedProcesses: Object.keys(session.processObservations || {}).length,
      baselineProcessCount: session.baseline?.processCount || 0,
    }))
    .filter((session) => session.serverPidAlive === false || session.serverPidAlive === null);

  return {
    product: runtime.product,
    version: runtime.version,
    generatedAt: new Date().toISOString(),
    currentSession: publicSession(runtime.session),
    staleSessionCount: stale.length,
    staleSessions: stale,
    notes: ["This report is non-destructive. Stale sessions are evidence for review, not automatic ownership."],
  };
}

export function managedProcessList(runtime, options = {}) {
  const includeExited = options.includeExited !== false;
  const records = runtime.ledger.listManagedProcesses({ includeExited });
  return {
    product: runtime.product,
    version: runtime.version,
    generatedAt: new Date().toISOString(),
    count: records.length,
    managedProcesses: records.map(publicManagedProcess),
  };
}

export function managedProcessExplain(runtime, options = {}) {
  const id = options.managedProcessId || options.managed_process_id;
  if (!id) return { error: "managed_process_id_required" };
  const record = runtime.ledger.getManagedProcess(id);
  if (!record) {
    return {
      product: runtime.product,
      version: runtime.version,
      found: false,
      managedProcessId: id,
    };
  }
  return {
    product: runtime.product,
    version: runtime.version,
    found: true,
    managedProcess: publicManagedProcess(record),
    lifecyclePolicy: {
      managedOwnership: "explicit",
      cleanupDefault: "report_only_until_policy_allows",
      note: "Managed records provide explicit lineage for later policy decisions; this explain call is non-destructive.",
    },
  };
}

export async function managedReconcile(runtime) {
  const snapshot = await scanProcesses();
  const byPid = new Map((snapshot.processes || []).map((proc) => [proc.pid, proc]));
  const updates = [];

  runtime.ledger.transaction(() => {
    for (const record of runtime.ledger.listManagedProcesses({ includeExited: true })) {
      const proc = byPid.get(record.pid);
      const leaseState = managedLeaseState(record);
      if (!proc) {
        const missingStatus = record.status === "exited" ? "exited" : "missing";
        const updated = runtime.ledger.updateManagedProcess(record.managedProcessId, {
          status: missingStatus,
          matchStatus: missingStatus,
          leaseState,
        });
        updates.push(publicManagedProcess(updated));
        continue;
      }

      const enrichment = {};
      if (!record.processName) enrichment.processName = proc.name || null;
      if (!record.createTimeMs) enrichment.createTimeMs = proc.createTimeMs || null;
      if (!record.createTimeSource) enrichment.createTimeSource = proc.createTimeSource || null;
      if (!record.createTimeResolutionMs) enrichment.createTimeResolutionMs = proc.createTimeResolutionMs || null;
      if (!record.createTimeToleranceMs) enrichment.createTimeToleranceMs = proc.createTimeToleranceMs || null;
      if (!record.scannerCommandHash) enrichment.scannerCommandHash = commandHash(proc);
      if (!record.scannerLooseHash) enrichment.scannerLooseHash = looseCommandHash(proc);
      if (!record.commandHash) enrichment.commandHash = enrichment.scannerCommandHash || commandHash(proc);
      if (!record.identityVersion) enrichment.identityVersion = 2;
      if (Object.keys(enrichment).length) {
        runtime.ledger.updateManagedProcess(record.managedProcessId, {
          ...enrichment,
          matchedAt: new Date().toISOString(),
          matchStatus: "observed_strong",
          status: "running",
          leaseState,
          pidReuseMismatch: false,
        });
      }

      const match = runtime.ledger.findManagedProcessForProc(proc);
      const updated = runtime.ledger.updateManagedProcess(record.managedProcessId, {
        processName: proc.name || record.processName || null,
        createTimeMs: proc.createTimeMs || record.createTimeMs || null,
        createTimeSource: proc.createTimeSource || record.createTimeSource || null,
        createTimeResolutionMs: proc.createTimeResolutionMs || record.createTimeResolutionMs || null,
        createTimeToleranceMs: proc.createTimeToleranceMs || record.createTimeToleranceMs || null,
        scannerCommandHash: record.scannerCommandHash || enrichment.scannerCommandHash || commandHash(proc),
        scannerLooseHash: record.scannerLooseHash || enrichment.scannerLooseHash || looseCommandHash(proc),
        commandHash: record.commandHash || record.scannerCommandHash || enrichment.scannerCommandHash || commandHash(proc),
        matchedAt: new Date().toISOString(),
        matchStatus: match?.strong ? match.matchStatus || "strong" : "pid_reuse_mismatch",
        status: match?.strong ? "running" : "pid_reuse_mismatch",
        leaseState,
        pidReuseMismatch: Boolean(match?.pidReuseMismatch),
      });
      updates.push(publicManagedProcess(updated));
    }
  });

  return {
    product: runtime.product,
    version: runtime.version,
    reconciledAt: new Date().toISOString(),
    scannedAt: snapshot.scannedAt,
    count: updates.length,
    managedProcesses: updates,
    notes: ["Managed reconcile is non-destructive. It never terminates processes."],
  };
}

export async function managedLifecycleReport(runtime) {
  const reconcile = await managedReconcile(runtime);
  const counts = countManagedStates(reconcile.managedProcesses);
  return {
    product: runtime.product,
    version: runtime.version,
    generatedAt: new Date().toISOString(),
    counts,
    managedProcesses: reconcile.managedProcesses,
    notes: ["Lifecycle report is non-destructive and based on explicit cpe-run records."],
  };
}

export async function managedCleanupDryRun(runtime) {
  const report = await managedLifecycleReport(runtime);
  const expectedHostProfile = runtime.config.host.expectedProfile || null;
  const planned = [];
  const skipped = [];
  for (const record of report.managedProcesses) {
    const decision = managedCleanupDecision(record, { expectedHostProfile });
    if (decision.ok) planned.push(record);
    else skipped.push({ managedProcessId: record.managedProcessId, pid: record.pid, reason: decision.reason });
  }
  return {
    product: runtime.product,
    version: runtime.version,
    mode: "managed_cleanup_dryrun",
    cleanupRealExecuted: false,
    plannedCleanupCount: planned.length,
    skippedCount: skipped.length,
    candidates: planned,
    skipped,
    notes: [
      "This dry-run never terminates processes.",
      "Managed cleanup requires strong scanner identity, terminate-on-expiry policy and an expired lease.",
      "Managed cleanup dry-run plans only records owned by the current expected host profile.",
    ],
  };
}

export async function managedStaleReport(runtime) {
  const report = await managedLifecycleReport(runtime);
  const stale = report.managedProcesses.filter((record) =>
    ["missing", "exited", "pid_reuse_mismatch"].includes(record.status) || record.leaseState === "expired",
  );
  return {
    product: runtime.product,
    version: runtime.version,
    generatedAt: new Date().toISOString(),
    staleCount: stale.length,
    staleManagedProcesses: stale,
    notes: ["Stale managed records are report-only evidence."],
  };
}

export async function resourceImpactReport(runtime, options = {}) {
  const report = await buildScopeReport(runtime, { ...options, limit: options.limit || 25 });
  return {
    product: runtime.product,
    version: runtime.version,
    scannedAt: report.scannedAt,
    counts: report.counts,
    resourceImpact: report.resourceImpact,
    topBlockers: report.topBlockers,
    topReasons: report.topReasons,
    partitions: report.partitions?.counts,
  };
}

export function autoCleanupStatus(runtime) {
  return {
    product: runtime.product,
    version: runtime.version,
    policy: policyAutoCleanupStatus(runtime.config, runtime.configMeta),
  };
}

export async function autoCleanupDryRun(runtime, options = {}) {
  const { analysis } = await scanAnalyzeRecord(runtime, options);
  const plan = planAutoCleanup(analysis.candidates, runtime.config, { scope: "owned_current_session" });
  return {
    product: runtime.product,
    version: runtime.version,
    ...plan,
    candidates: plan.candidates.map((item) => publicCandidate(item, runtime.config, Boolean(options.includeCommandLine))),
  };
}

export async function explainProcess(runtime, options = {}) {
  const pid = Number(options.pid);
  if (!Number.isInteger(pid) || pid <= 0) return { error: "pid_required" };
  const { snapshot, analysis, snapshotRecord } = await scanAnalyzeRecord(runtime, {
    ...options,
    includeCommandLine: Boolean(options.includeCommandLine),
    limit: options.limit || 200,
  });
  const item = analysis.analyses.find((candidate) => candidate.pid === pid);
  if (!item) {
    return {
      product: runtime.product,
      version: runtime.version,
      scannedAt: snapshot.scannedAt,
      ledger: { path: runtime.ledger.ledgerPath, snapshotId: snapshotRecord.id },
      pid,
      found: false,
    };
  }
  return {
    product: runtime.product,
    version: runtime.version,
    scannedAt: snapshot.scannedAt,
    ledger: { path: runtime.ledger.ledgerPath, snapshotId: snapshotRecord.id },
    found: true,
    process: publicCandidate(item, runtime.config, Boolean(options.includeCommandLine)),
    signals: item.signals,
  };
}

export function profileList(runtime) {
  return {
    product: runtime.product,
    version: runtime.version,
    profiles: listConfiguredProfiles(runtime.config),
  };
}

export function configExplain(runtime) {
  return {
    product: runtime.product,
    version: runtime.version,
    loadedPaths: runtime.configLoadedPaths,
    configTrust: runtime.configMeta,
    blockedPaths: runtime.configBlockedPaths,
    errors: runtime.configErrors,
    effective: {
      host: runtime.config.host,
      watcher: runtime.config.watcher,
      ledger: {
        maxSnapshots: runtime.config.ledger.maxSnapshots,
        maxEvents: runtime.config.ledger.maxEvents,
        storeCommandLines: runtime.config.ledger.storeCommandLines,
        storeAllProcesses: runtime.config.ledger.storeAllProcesses,
      },
      scan: runtime.config.scan,
      cleanup: runtime.config.cleanup,
      autoCleanup: runtime.config.autoCleanup,
      profiles: listConfiguredProfiles(runtime.config),
    },
    dataDir: runtime.ledger.dataDir,
    ledgerPath: runtime.ledger.ledgerPath,
  };
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return true;
    return false;
  }
}

export function sessionStatus(runtime) {
  return {
    product: runtime.product,
    version: runtime.version,
    session: publicSession(runtime.session),
    baseline: runtime.ledger.data.sessions?.[runtime.session.sessionEpochId]?.baseline || null,
    watcher: runtime.watcher.status(),
  };
}

export async function reconcileNow(runtime, options = {}) {
  return runtime.watcher.tick(options);
}

async function scanAnalyzeRecord(runtime, options = {}, controls = {}) {
  const cacheKey = scanCacheKey(options);
  const ttl = Math.max(0, Number(runtime.config.scan.cacheTtlMs) || 0);
  const useCache = controls.useCache !== false && ttl > 0;
  if (useCache && !controls.forceRefresh && runtime.scanCache?.cacheKey === cacheKey) {
    const ageMs = Date.now() - runtime.scanCache.createdAtMs;
    if (ageMs <= ttl) return { ...runtime.scanCache, cacheHit: true };
  }

  const snapshot = await scanProcesses();
  let analysis;
  let snapshotRecord;
  runtime.ledger.transaction(() => {
    runtime.ledger.ensureSessionBaseline(snapshot, runtime.session);
    analysis = analyzeSnapshot(snapshot, runtime.config, runtime.ledger, {
      ...options,
      sessionContext: runtime.session,
    });
    snapshotRecord = runtime.ledger.recordSnapshot(snapshot, analysis.analyses, { sessionContext: runtime.session });
  });
  const result = { snapshot, analysis, snapshotRecord, cacheKey, createdAtMs: Date.now(), cacheHit: false };
  if (useCache) runtime.scanCache = result;
  return result;
}

function scopeReportFromScan(runtime, { snapshot, analysis, snapshotRecord }) {
  return {
    product: runtime.product,
    version: runtime.version,
    config: {
      loadedPaths: runtime.configLoadedPaths,
      blockedPaths: runtime.configBlockedPaths,
      errors: runtime.configErrors,
      watcher: runtime.watcher.status(),
    },
    ledger: {
      path: runtime.ledger.ledgerPath,
      snapshotId: snapshotRecord.id,
    },
    ...analysis.report,
    scannedAt: snapshot.scannedAt,
  };
}

function cleanupCandidatesFromScan(runtime, { snapshot, analysis, snapshotRecord }, options = {}) {
  const scope = options.scope || "all";
  const filtered = filterCandidates(analysis.candidates, { scope, pids: options.pids || [] });
  const includeCommandLine = Boolean(options.includeCommandLine);

  return {
    product: runtime.product,
    version: runtime.version,
    scannedAt: snapshot.scannedAt,
    platform: snapshot.platform,
    session: publicSession(runtime.session),
    ledger: {
      path: runtime.ledger.ledgerPath,
      snapshotId: snapshotRecord.id,
    },
    scope,
    counts: analysis.counts,
    partitions: analysis.report.partitions,
    topBlockers: analysis.report.topBlockers,
    topReasons: analysis.report.topReasons,
    resourceImpact: analysis.report.resourceImpact,
    returnedCount: filtered.length,
    candidates: filtered.slice(0, options.limit || 100).map((item) => publicCandidate(item, runtime.config, includeCommandLine)),
    notes: analysis.report.notes,
  };
}

function scanCacheKey(options = {}) {
  return JSON.stringify({
    minAgeMinutes: options.minAgeMinutes ?? null,
  });
}

function publicSession(session) {
  return {
    mcpInstanceId: session.mcpInstanceId,
    sessionEpochId: session.sessionEpochId,
    startedAt: session.startedAt,
    baselineSnapshotId: session.baselineSnapshotId || null,
  };
}

function buildExternalReceipt({ projectKey, hostProfile, sessionEpochId, createdAt, summary, counts }) {
  const receipt = {
    source: "clean-process-ended",
    external_receipt_kind: "process_janitor",
    mode: "close_check_dry_run",
    cleanup_real_executed: false,
    evidence_sha256_scope: "receipt_payload_canonical",
    evidence_sha256: null,
    summary,
    counts,
    host_profile: hostProfile,
    project_key: projectKey,
    session_epoch_id: sessionEpochId || null,
    created_at: createdAt,
    command_lines_included: false,
    raw_process_output_included: false,
    confirm_token_returned: false,
  };
  receipt.evidence_sha256 = canonicalSha256Snake(receipt);
  return receipt;
}

function canonicalSha256Snake(payload) {
  const copy = { ...payload };
  delete copy.evidence_sha256;
  return crypto.createHash("sha256").update(canonicalJson(copy)).digest("hex");
}

function publicManagedProcess(record) {
  return {
    managedProcessId: record.managedProcessId,
    status: record.status,
    pid: record.pid,
    ppid: record.ppid,
    processName: record.processName,
    createTimeMs: record.createTimeMs,
    createTimeSource: record.createTimeSource,
    createTimeResolutionMs: record.createTimeResolutionMs,
    createTimeToleranceMs: record.createTimeToleranceMs,
    hostProfile: record.hostProfile,
    role: record.role,
    startedAt: record.startedAt,
    lastSeenAt: record.lastSeenAt,
    leaseExpiresAt: record.leaseExpiresAt,
    shutdownPolicy: record.shutdownPolicy,
    commandHash: record.commandHash,
    scannerCommandHash: record.scannerCommandHash,
    scannerLooseHash: record.scannerLooseHash,
    argvHash: record.argvHash,
    identityVersion: record.identityVersion,
    matchStatus: record.matchStatus,
    matchedAt: record.matchedAt,
    pidReuseMismatch: record.pidReuseMismatch,
    leaseState: record.leaseState || managedLeaseState(record),
    cwdHash: record.cwdHash,
    exitCode: record.exitCode,
    signal: record.signal,
    exitObservedAt: record.exitObservedAt,
  };
}

function managedLeaseState(record) {
  if (!record?.leaseExpiresAt) return "none";
  const expiresAt = Date.parse(record.leaseExpiresAt);
  if (!Number.isFinite(expiresAt)) return "invalid";
  return expiresAt <= Date.now() ? "expired" : "active";
}

function countManagedStates(records = []) {
  const counts = { total: records.length, running: 0, exited: 0, missing: 0, expired: 0, pidReuseMismatch: 0, strong: 0 };
  for (const record of records) {
    if (record.status === "running") counts.running += 1;
    if (record.status === "exited") counts.exited += 1;
    if (record.status === "missing") counts.missing += 1;
    if (record.status === "pid_reuse_mismatch" || record.pidReuseMismatch) counts.pidReuseMismatch += 1;
    if (record.leaseState === "expired") counts.expired += 1;
    if (record.matchStatus === "strong" || record.matchStatus === "observed_strong") counts.strong += 1;
  }
  return counts;
}

export function managedCleanupDecision(record, { expectedHostProfile = null } = {}) {
  if (!expectedHostProfile) return { ok: false, reason: "missing_host_binding" };
  if (!record.hostProfile) return { ok: false, reason: "managed_record_missing_host_profile" };
  if (record.hostProfile !== expectedHostProfile) return { ok: false, reason: "managed_host_profile_mismatch" };
  if (record.status !== "running") return { ok: false, reason: `managed_status_${record.status}` };
  if (!["strong", "observed_strong"].includes(record.matchStatus)) return { ok: false, reason: "managed_requires_strong_identity" };
  if (record.pidReuseMismatch) return { ok: false, reason: "managed_pid_reuse_mismatch" };
  if (record.shutdownPolicy !== "terminate-on-expiry") return { ok: false, reason: "managed_requires_terminate_on_expiry_policy" };
  if (record.leaseState !== "expired") return { ok: false, reason: "managed_lease_not_expired" };
  return { ok: true };
}
