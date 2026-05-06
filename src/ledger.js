import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { commandHash, looseCommandHash } from "./classifier.js";
import { nowIso, redactCommandLine } from "./format.js";
import { getDefaultDataDir } from "./paths.js";

const LEDGER_VERSION = 3;
const MEMORY_TTL_MS = 72 * 60 * 60 * 1000;
const CLEANUP_POLICY_VERSION = "cleanup-policy-v2";

export class Ledger {
  constructor({ dataDir = getDefaultDataDir(), config } = {}) {
    this.dataDir = dataDir;
    this.ledgerPath = path.join(dataDir, "ledger.json");
    this.lockPath = `${this.ledgerPath}.lock`;
    this.config = config || {};
    this.data = createEmptyLedger();
    this.loaded = false;
    this.deferSaveDepth = 0;
    this.needsSave = false;
  }

  load() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (fs.existsSync(this.ledgerPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.ledgerPath, "utf8"));
        this.data = normalizeLedger(parsed);
      } catch (error) {
        const backupPath = `${this.ledgerPath}.broken-${Date.now()}`;
        fs.renameSync(this.ledgerPath, backupPath);
        this.data = createEmptyLedger();
        this.recordEvent({ at: nowIso(), type: "ledger_recovered", backupPath, error: error.message });
        this.save();
      }
    } else {
      this.data = createEmptyLedger();
      this.save();
    }
    this.mergeAppendOnlyEvents();
    this.loaded = true;
    this.prune();
    return this;
  }

  save({ mergeExisting = true } = {}) {
    if (this.deferSaveDepth > 0) {
      this.needsSave = true;
      return;
    }
    fs.mkdirSync(this.dataDir, { recursive: true });
    withFileLock(this.lockPath, () => {
      const current = mergeExisting ? readLedgerFile(this.ledgerPath) : null;
      const next = mergeExisting && current
        ? mergeLedgerData(normalizeLedger(current), this.data)
        : normalizeLedger(this.data);
      applyRetention(next, this.config);
      next.updatedAt = nowIso();
      const tmp = `${this.ledgerPath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
      replaceLedgerFile(tmp, this.ledgerPath);
      this.data = next;
    });
  }

  transaction(callback, { save = true } = {}) {
    this.deferSaveDepth += 1;
    try {
      return callback();
    } finally {
      this.deferSaveDepth -= 1;
      if (this.deferSaveDepth === 0 && save && this.needsSave) {
        this.needsSave = false;
        this.save();
      }
    }
  }

  prune({ save = true } = {}) {
    const maxSnapshots = this.config?.ledger?.maxSnapshots ?? 120;
    const maxEvents = this.config?.ledger?.maxEvents ?? 400;
    const now = Date.now();

    this.data.snapshots = this.data.snapshots.slice(-maxSnapshots);
    this.data.events = this.data.events.slice(-maxEvents);

    for (const [key, value] of Object.entries(this.data.processMemory || {})) {
      const lastSeen = Date.parse(value.lastSeen || "");
      if (!Number.isFinite(lastSeen) || now - lastSeen > MEMORY_TTL_MS) {
        delete this.data.processMemory[key];
      }
    }

    for (const [tokenHash, plan] of Object.entries(this.data.cleanupPlans || {})) {
      const expiresAt = Date.parse(plan.expiresAt || "");
      if (!Number.isFinite(expiresAt) || expiresAt < now) {
        delete this.data.cleanupPlans[tokenHash];
      }
    }

    if (save) this.save();
  }

  ensureMcpInstanceId() {
    if (!this.data.installation?.mcpInstanceId) {
      this.data.installation = {
        ...(this.data.installation || {}),
        mcpInstanceId: `mcp_${crypto.randomBytes(10).toString("hex")}`,
        createdAt: this.data.installation?.createdAt || nowIso(),
      };
      this.save();
    }
    return this.data.installation.mcpInstanceId;
  }

  startSession(sessionContext) {
    if (!sessionContext?.sessionEpochId) return null;
    const session = this.getOrCreateSession(sessionContext);
    session.startedAt = sessionContext.startedAt;
    session.startedAtMs = sessionContext.startedAtMs;
    session.mcpInstanceId = sessionContext.mcpInstanceId;
    session.serverPid = sessionContext.serverPid || process.pid;
    session.hostProfile = sessionContext.hostProfile || this.config?.host?.expectedProfile || null;
    session.clientName = sessionContext.clientName || null;
    session.lastSeenAt = nowIso();
    this.save();
    return session;
  }

  ensureSessionBaseline(snapshot, sessionContext) {
    if (!sessionContext?.sessionEpochId) return null;
    const session = this.getOrCreateSession(sessionContext);
    if (session.baseline) {
      sessionContext.baselineSnapshotId = session.baseline.snapshotId;
      return session.baseline;
    }

    const snapshotId = crypto.randomBytes(6).toString("hex");
    const keys = (snapshot.processes || []).map((proc) => this.stableKey(proc));
    session.baseline = {
      snapshotId,
      at: snapshot.scannedAt || nowIso(),
      processCount: snapshot.processCount,
      processKeys: keys,
    };
    sessionContext.baselineSnapshotId = snapshotId;
    this.recordEvent({
      at: nowIso(),
      type: "session_baseline",
      sessionEpochId: sessionContext.sessionEpochId,
      snapshotId,
      processCount: snapshot.processCount,
    });
    this.save();
    return session.baseline;
  }

  isProcessInSessionBaseline(proc, sessionContext) {
    const session = this.data.sessions?.[sessionContext?.sessionEpochId];
    if (!session?.baseline?.processKeys) return false;
    return session.baseline.processKeys.includes(this.stableKey(proc));
  }

  getSessionProcessObservation(proc, sessionContext) {
    const session = this.data.sessions?.[sessionContext?.sessionEpochId];
    if (!session?.processObservations) return null;
    return session.processObservations[this.stableKey(proc)] || null;
  }

  stableKey(proc) {
    return `${proc.pid}:${proc.createTimeMs || "unknown"}:${looseCommandHash(proc)}`;
  }

  wasProcessRelated(proc) {
    const stable = this.stableKey(proc);
    const loose = `loose:${looseCommandHash(proc)}`;
    const now = Date.now();

    for (const key of [stable, loose]) {
      const memory = this.data.processMemory?.[key];
      if (!memory || !memory.related) continue;
      const lastSeen = Date.parse(memory.lastSeen || "");
      if (Number.isFinite(lastSeen) && now - lastSeen <= MEMORY_TTL_MS) return true;
    }

    return false;
  }

  wasProcessCodexRelated(proc) {
    return this.wasProcessRelated(proc);
  }

  recordSnapshot(snapshot, analyses = [], { sessionContext = null } = {}) {
    const byPid = new Map(analyses.map((item) => [item.pid, item]));
    const id = crypto.randomBytes(6).toString("hex");
    const session = sessionContext?.sessionEpochId ? this.getOrCreateSession(sessionContext) : null;
    const snapshotRecord = {
      id,
      at: snapshot.scannedAt || nowIso(),
      platform: snapshot.platform,
      processCount: snapshot.processCount,
      errors: snapshot.errors || [],
      sessionEpochId: sessionContext?.sessionEpochId || null,
      counts: {
        candidates: analyses.filter((item) => item.isCandidate).length,
        safe: analyses.filter((item) => item.isCandidate && item.risk === "safe").length,
        probable: analyses.filter((item) => item.isCandidate && item.risk === "probable").length,
        risky: analyses.filter((item) => item.isCandidate && item.risk === "risky").length,
        ownedCurrentSession: analyses.filter((item) => item.isCandidate && item.ownership === "owned_current_session").length,
        relatedUnowned: analyses.filter((item) => item.isCandidate && item.ownership === "related_unowned").length,
        unknownOwner: analyses.filter((item) => item.isCandidate && item.ownership === "unknown_owner").length,
      },
      processes: [],
    };

    for (const proc of snapshot.processes || []) {
      const analysis = byPid.get(proc.pid);
      const related = analysis ? isRelatedAnalysis(analysis) : false;
      const procRecord = {
        pid: proc.pid,
        ppid: proc.ppid,
        name: proc.name,
        createTimeMs: proc.createTimeMs,
        ageSeconds: proc.ageSeconds,
        commandHash: commandHash(proc),
        looseHash: looseCommandHash(proc),
        related,
        mcpLike: Boolean(analysis?.signals?.mcpLike),
        ownership: analysis?.ownership,
        risk: analysis?.risk,
        score: analysis?.score,
      };

      if (this.config?.ledger?.storeCommandLines) {
        procRecord.commandLine = redactCommandLine(proc.commandLine || proc.executablePath || proc.name, {
          maxLength: this.config?.scan?.maxCommandLineLength || 420,
        });
      }

      if (this.config?.ledger?.storeAllProcesses || related) {
        snapshotRecord.processes.push(procRecord);
      }

      if (session) {
        const stable = this.stableKey(proc);
        const existing = session.processObservations[stable];
        const hadExpectedHostChain = Boolean(analysis?.signals?.expectedHostChainMatched);
        session.processObservations[stable] = {
          pid: proc.pid,
          name: proc.name,
          commandHash: commandHash(proc),
          looseHash: looseCommandHash(proc),
          firstSeen: existing?.firstSeen || snapshotRecord.at,
          firstOwnership: existing?.firstOwnership || analysis?.ownership || null,
          firstRisk: existing?.firstRisk || analysis?.risk || null,
          firstHadExpectedHostChain: Boolean(existing?.firstHadExpectedHostChain || hadExpectedHostChain),
          lastSeen: snapshotRecord.at,
          observationCount: (existing?.observationCount || 0) + 1,
          lastOwnership: analysis?.ownership,
          lastRisk: analysis?.risk,
          lastScore: analysis?.score,
          lastHadExpectedHostChain: hadExpectedHostChain,
        };
      }

      if (related || analysis?.signals?.mcpLike) {
        const memory = {
          name: proc.name,
          pid: proc.pid,
          commandHash: commandHash(proc),
          looseHash: looseCommandHash(proc),
          related,
          mcpLike: Boolean(analysis?.signals?.mcpLike),
          ownership: analysis?.ownership,
          firstSeen: this.data.processMemory[this.stableKey(proc)]?.firstSeen || snapshotRecord.at,
          lastSeen: snapshotRecord.at,
          lastRisk: analysis?.risk,
          lastScore: analysis?.score,
        };
        this.data.processMemory[this.stableKey(proc)] = memory;
        this.data.processMemory[`loose:${looseCommandHash(proc)}`] = {
          ...memory,
          firstSeen: this.data.processMemory[`loose:${looseCommandHash(proc)}`]?.firstSeen || snapshotRecord.at,
        };
      }
    }

    this.data.snapshots.push(snapshotRecord);
    this.recordEvent({
      at: nowIso(),
      type: "snapshot",
      id,
      sessionEpochId: sessionContext?.sessionEpochId || null,
      processCount: snapshot.processCount,
      counts: snapshotRecord.counts,
    });
    this.prune();
    return snapshotRecord;
  }

  createCleanupPlan(candidates, meta = {}) {
    const action = cleanupPlanAction(meta);
    const binding = cleanupPlanBinding(candidates, action);
    if (!candidates.length) {
      return {
        token: null,
        createdAt: nowIso(),
        expiresAt: null,
        pids: [],
        commandHashes: {},
        risks: {},
        ownership: {},
        scope: action.scope,
        action,
        binding,
        bindingHash: hashBinding(binding),
        dryRunOnly: true,
      };
    }

    const token = crypto.randomBytes(12).toString("hex");
    const tokenHash = hashToken(token);
    const ttl = Math.max(60, Number(this.config?.cleanup?.tokenTtlSeconds) || 900);
    const plan = {
      tokenHash,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      sessionEpochId: meta.sessionEpochId || null,
      pids: candidates.map((candidate) => candidate.pid),
      commandHashes: Object.fromEntries(candidates.map((candidate) => [candidate.pid, candidate.commandHash])),
      risks: Object.fromEntries(candidates.map((candidate) => [candidate.pid, candidate.risk])),
      ownership: Object.fromEntries(candidates.map((candidate) => [candidate.pid, candidate.ownership])),
      blockers: Object.fromEntries(candidates.map((candidate) => [candidate.pid, [...(candidate.blockers || [])].sort()])),
      scope: action.scope,
      action,
      binding,
      bindingHash: hashBinding(binding),
      dryRunOnly: true,
    };

    this.data.cleanupPlans[tokenHash] = plan;
    this.recordEvent({ at: nowIso(), type: "cleanup_plan", tokenHash, pids: plan.pids, scope: plan.scope });
    this.prune();
    return { ...plan, token };
  }

  validateCleanupToken(token, candidates, meta = {}) {
    if (!token) return { ok: false, reason: "missing_confirm_token" };
    const tokenHash = hashToken(token);
    const plan = this.data.cleanupPlans[tokenHash] || this.data.cleanupPlans[token];
    if (!plan) return { ok: false, reason: "unknown_or_expired_confirm_token" };
    if (Date.parse(plan.expiresAt) < Date.now()) {
      delete this.data.cleanupPlans[tokenHash];
      delete this.data.cleanupPlans[token];
      this.save();
      return { ok: false, reason: "expired_confirm_token" };
    }

    const requestedAction = cleanupPlanAction(meta);
    const actionDiff = comparePlanAction(plan.action || cleanupPlanAction(plan), requestedAction);
    if (actionDiff) return { ok: false, reason: "cleanup_action_changed", field: actionDiff };

    const plannedPids = [...new Set(plan.pids.map(Number))].sort((a, b) => a - b);
    const candidatePids = [...new Set(candidates.map((item) => item.pid))].sort((a, b) => a - b);
    if (!sameNumberArray(plannedPids, candidatePids)) {
      return { ok: false, reason: "confirmed_pid_set_changed" };
    }
    const planned = new Set(plannedPids);

    for (const pid of candidatePids) {
      if (!planned.has(pid)) return { ok: false, reason: "pid_not_in_confirmed_plan", pid };
      const candidate = candidates.find((item) => item.pid === pid);
      if (candidate.ownership !== "owned_current_session") {
        return { ok: false, reason: "ownership_not_owned_current_session", pid };
      }
      if (plan.commandHashes[String(pid)] && plan.commandHashes[String(pid)] !== candidate.commandHash) {
        return { ok: false, reason: "command_hash_changed", pid };
      }
      if (plan.risks?.[String(pid)] && plan.risks[String(pid)] !== candidate.risk) {
        return { ok: false, reason: "risk_changed", pid };
      }
      const plannedBlockers = [...(plan.blockers?.[String(pid)] || [])].sort();
      const currentBlockers = [...(candidate.blockers || [])].sort();
      if (!sameStringArray(plannedBlockers, currentBlockers)) {
        return { ok: false, reason: "blockers_changed", pid };
      }
    }
    const currentBinding = cleanupPlanBinding(candidates, requestedAction);
    if (plan.bindingHash && plan.bindingHash !== hashBinding(currentBinding)) {
      return { ok: false, reason: "cleanup_binding_changed" };
    }

    return { ok: true, plan };
  }

  consumeCleanupToken(token) {
    const tokenHash = token ? hashToken(token) : null;
    if (tokenHash && this.data.cleanupPlans[tokenHash]) {
      delete this.data.cleanupPlans[tokenHash];
      this.save();
    } else if (token && this.data.cleanupPlans[token]) {
      delete this.data.cleanupPlans[token];
      this.save();
    }
  }

  recordCleanupEvent(event) {
    this.recordEvent({ at: nowIso(), type: "cleanup", ...event });
    this.prune();
  }

  recordManagedProcessStart(record) {
    const id = record.managedProcessId || `managed_${crypto.randomBytes(10).toString("hex")}`;
    const now = nowIso();
    this.data.managedProcesses[id] = {
      managedProcessId: id,
      startedAt: record.startedAt || now,
      lastSeenAt: now,
      hostProfile: record.hostProfile || this.config?.host?.expectedProfile || null,
      role: record.role || "tool",
      pid: record.pid,
      ppid: record.ppid || process.pid,
      processName: record.processName || null,
      createTimeMs: record.createTimeMs || null,
      createTimeSource: record.createTimeSource || null,
      createTimeResolutionMs: record.createTimeResolutionMs || null,
      createTimeToleranceMs: record.createTimeToleranceMs || null,
      cwdHash: record.cwdHash || null,
      commandHash: record.scannerCommandHash || record.commandHash || null,
      scannerCommandHash: record.scannerCommandHash || null,
      scannerLooseHash: record.scannerLooseHash || null,
      argvHash: record.argvHash || record.commandHash || null,
      identityVersion: record.identityVersion || 2,
      matchStatus: record.matchStatus || (record.scannerCommandHash && record.createTimeMs ? "observed_strong" : "registered_unobserved"),
      matchedAt: record.matchedAt || null,
      pidReuseMismatch: false,
      leaseTtlSeconds: record.leaseTtlSeconds || null,
      leaseExpiresAt: record.leaseExpiresAt || null,
      shutdownPolicy: record.shutdownPolicy || "none",
      status: "running",
      exitCode: null,
      signal: null,
      exitObservedAt: null,
      signalSent: null,
      signalSentAt: null,
      childExitAfterSignal: false,
      orphanCandidate: false,
      orphanReason: null,
      orphanObservedAt: null,
    };
    this.recordEvent({
      at: now,
      type: "managed_process_start",
      managedProcessId: id,
      pid: record.pid,
      hostProfile: record.hostProfile || null,
      managedRecord: this.data.managedProcesses[id],
    });
    this.prune();
    return this.data.managedProcesses[id];
  }

  recordManagedProcessSpawnError(record = {}) {
    const id = record.managedProcessId || `managed_${crypto.randomBytes(10).toString("hex")}`;
    this.recordEvent({
      at: nowIso(),
      type: "managed_process_spawn_error",
      managedProcessId: id,
      hostProfile: record.hostProfile || this.config?.host?.expectedProfile || null,
      role: record.role || "tool",
      error: record.error || "spawn_failed",
    });
    this.prune();
    return { managedProcessId: id, status: "spawn_error", error: record.error || "spawn_failed" };
  }

  updateManagedProcess(managedProcessId, patch = {}) {
    const record = this.data.managedProcesses?.[managedProcessId];
    if (!record) return null;
    Object.assign(record, patch, { lastSeenAt: patch.lastSeenAt || nowIso() });
    this.recordEvent({ at: nowIso(), type: "managed_process_update", managedProcessId, matchStatus: record.matchStatus, pid: record.pid, patch });
    this.prune();
    return record;
  }

  findManagedProcessForProc(proc) {
    const records = Object.values(this.data.managedProcesses || {}).filter((record) => record.pid === proc.pid);
    if (!records.length) return null;
    const procCommandHash = commandHash(proc);
    const procLooseHash = looseCommandHash(proc);
    const procCreateTimeMs = proc.createTimeMs || null;

    for (const record of records) {
      const createTimeKnown = Number.isFinite(Number(record.createTimeMs)) && Number.isFinite(Number(procCreateTimeMs));
      const createTimeMatches = createTimeKnown && Number(record.createTimeMs) === Number(procCreateTimeMs);
      const createTimeDriftMs = createTimeKnown ? Math.abs(Number(record.createTimeMs) - Number(procCreateTimeMs)) : null;
      const createTimeToleranceMs = managedCreateTimeToleranceMs(record, proc);
      const createTimeWithinTolerance = createTimeKnown && createTimeDriftMs <= createTimeToleranceMs;
      const hashKnown = Boolean(record.scannerCommandHash || record.commandHash);
      const hashMatches = hashKnown && (record.scannerCommandHash || record.commandHash) === procCommandHash;
      const looseHashKnown = Boolean(record.scannerLooseHash);
      const looseHashMatches = looseHashKnown && record.scannerLooseHash === procLooseHash;
      const nameMatches = !record.processName || String(record.processName).toLowerCase() === String(proc.name || "").toLowerCase();

      if (nameMatches && ((createTimeMatches && hashMatches) || (createTimeWithinTolerance && (hashMatches || looseHashMatches)))) {
        return {
          record,
          managedProcessId: record.managedProcessId,
          matchStatus: createTimeMatches ? "strong" : "strong_start_time_tolerated",
          strong: true,
          pidReuseMismatch: false,
          reasons: [
            "pid_match",
            createTimeMatches ? "create_time_match" : "create_time_within_tolerance",
            hashMatches ? "scanner_command_hash_match" : "scanner_loose_hash_match",
          ],
        };
      }
    }

    return {
      record: records[0],
      managedProcessId: records[0].managedProcessId,
      matchStatus: "pid_reuse_mismatch",
      strong: false,
      pidReuseMismatch: true,
      reasons: ["pid_match_without_identity_match"],
    };
  }

  recordManagedProcessExit(managedProcessId, { exitCode = null, signal = null } = {}) {
    const record = this.data.managedProcesses?.[managedProcessId];
    if (!record) return null;
    const exitAfterSignal = Boolean(record.signalSentAt);
    record.status = "exited";
    record.exitCode = exitCode;
    record.signal = signal;
    record.exitObservedAt = nowIso();
    record.lastSeenAt = record.exitObservedAt;
    record.childExitAfterSignal = exitAfterSignal;
    record.orphanCandidate = false;
    this.recordEvent({ at: record.exitObservedAt, type: "managed_process_exit", managedProcessId, pid: record.pid, exitCode, signal });
    if (exitAfterSignal) {
      this.recordEvent({
        at: record.exitObservedAt,
        type: "child_exit_after_signal",
        managedProcessId,
        pid: record.pid,
        exitCode,
        signal,
        signalSent: record.signalSent,
        signalSentAt: record.signalSentAt,
      });
    }
    this.prune();
    return record;
  }

  recordManagedRunnerSignal(managedProcessId, { signal = "SIGTERM", runnerPid = process.pid, reason = "runner_signal" } = {}) {
    const record = this.data.managedProcesses?.[managedProcessId];
    if (!record) return null;
    const at = nowIso();
    record.signalSent = signal;
    record.signalSentAt = at;
    record.lastSeenAt = at;
    if (record.status === "running") record.status = "signaled";
    this.recordEvent({
      at,
      type: "managed_runner_signal",
      managedProcessId,
      pid: record.pid,
      runnerPid,
      signal,
      reason,
    });
    this.prune();
    return record;
  }

  recordManagedChildMayBeOrphaned(managedProcessId, { type = "child_may_be_orphaned", reason = "signal_grace_elapsed", runnerPid = process.pid } = {}) {
    const record = this.data.managedProcesses?.[managedProcessId];
    if (!record || record.status === "exited") return record || null;
    const at = nowIso();
    record.status = "orphan_candidate";
    record.orphanCandidate = true;
    record.orphanReason = reason;
    record.orphanObservedAt = at;
    record.lastSeenAt = at;
    this.recordEvent({
      at,
      type,
      managedProcessId,
      pid: record.pid,
      runnerPid,
      reason,
      signalSent: record.signalSent,
      signalSentAt: record.signalSentAt,
    });
    this.prune();
    return record;
  }

  listManagedProcesses({ includeExited = true } = {}) {
    const records = Object.values(this.data.managedProcesses || {});
    return records
      .filter((record) => includeExited || record.status !== "exited")
      .sort((a, b) => Date.parse(b.lastSeenAt || b.startedAt || 0) - Date.parse(a.lastSeenAt || a.startedAt || 0));
  }

  getManagedProcess(managedProcessId) {
    return this.data.managedProcesses?.[managedProcessId] || null;
  }

  summary({ includeRecentEvents = true } = {}) {
    return {
      ledgerPath: this.ledgerPath,
      version: this.data.version,
      installation: this.data.installation,
      createdAt: this.data.createdAt,
      updatedAt: this.data.updatedAt,
      snapshotCount: this.data.snapshots.length,
      sessionCount: Object.keys(this.data.sessions || {}).length,
      processMemoryCount: Object.keys(this.data.processMemory || {}).length,
      cleanupPlanCount: Object.keys(this.data.cleanupPlans || {}).length,
      managedProcessCount: Object.keys(this.data.managedProcesses || {}).length,
      lastSnapshot: this.data.snapshots.at(-1) || null,
      recentEvents: includeRecentEvents ? this.data.events.slice(-20).map(sanitizeEvent) : undefined,
    };
  }

  recordEvent(event = {}) {
    const record = {
      at: event.at || nowIso(),
      eventId: event.eventId || `evt_${crypto.randomBytes(10).toString("hex")}`,
      ...event,
    };
    if (!this.data.events) this.data.events = [];
    this.data.events.push(record);
    this.appendEventLog(record);
    return record;
  }

  mergeAppendOnlyEvents() {
    const events = readAppendOnlyEvents(this.eventLogPath());
    if (!events.length) return;
    this.data.events = mergeArrayByKey(this.data.events, events, eventKey);
    this.data.managedProcesses = mergeManagedProcesses(
      deriveManagedProcessesFromEvents(this.data.events),
      this.data.managedProcesses,
    );
  }

  readAppendOnlyEvents() {
    return readAppendOnlyEvents(this.eventLogPath());
  }

  eventLogPath() {
    const configured = this.config?.ledger?.eventsJsonlPath || this.config?.ledger?.appendOnlyEventsPath;
    return configured ? path.resolve(configured) : path.join(this.dataDir, "events.jsonl");
  }

  appendEventLog(event) {
    if (!this.config?.ledger?.appendOnlyEvents && !this.config?.ledger?.eventsJsonlPath && !this.config?.ledger?.appendOnlyEventsPath) {
      return;
    }
    const eventPath = this.eventLogPath();
    fs.mkdirSync(path.dirname(eventPath), { recursive: true });
    fs.appendFileSync(eventPath, `${JSON.stringify(event)}\n`, { encoding: "utf8" });
  }

  getOrCreateSession(sessionContext) {
    if (!this.data.sessions) this.data.sessions = {};
    const id = sessionContext.sessionEpochId;
    if (!this.data.sessions[id]) {
      this.data.sessions[id] = {
        sessionEpochId: id,
        mcpInstanceId: sessionContext.mcpInstanceId,
        startedAt: sessionContext.startedAt || nowIso(),
        startedAtMs: sessionContext.startedAtMs || Date.now(),
        serverPid: sessionContext.serverPid || process.pid,
        hostProfile: sessionContext.hostProfile || this.config?.host?.expectedProfile || null,
        clientName: sessionContext.clientName || null,
        lastSeenAt: nowIso(),
        baseline: null,
        processObservations: {},
      };
    }
    return this.data.sessions[id];
  }
}

function managedCreateTimeToleranceMs(record, proc) {
  const recordSource = String(record?.createTimeSource || "");
  const procSource = String(proc?.createTimeSource || "");
  const explicit = Math.max(
    Number(record?.createTimeToleranceMs) || 0,
    Number(proc?.createTimeToleranceMs) || 0,
  );
  if (explicit > 0) return explicit;
  if (recordSource === "posix_ps_etimes" || procSource === "posix_ps_etimes") return 2000;
  return 0;
}

function createEmptyLedger() {
  const at = nowIso();
  return {
    version: LEDGER_VERSION,
    createdAt: at,
    updatedAt: at,
    installation: {},
    sessions: {},
    snapshots: [],
    processMemory: {},
    cleanupPlans: {},
    managedProcesses: {},
    events: [],
  };
}

function normalizeLedger(value) {
  const ledger = { ...createEmptyLedger(), ...(value || {}) };
  ledger.version = LEDGER_VERSION;
  ledger.installation = ledger.installation && typeof ledger.installation === "object" ? ledger.installation : {};
  ledger.sessions = ledger.sessions && typeof ledger.sessions === "object" ? ledger.sessions : {};
  ledger.snapshots = Array.isArray(ledger.snapshots) ? ledger.snapshots : [];
  ledger.processMemory = ledger.processMemory && typeof ledger.processMemory === "object" ? ledger.processMemory : {};
  ledger.cleanupPlans = ledger.cleanupPlans && typeof ledger.cleanupPlans === "object" ? ledger.cleanupPlans : {};
  ledger.managedProcesses = ledger.managedProcesses && typeof ledger.managedProcesses === "object" ? ledger.managedProcesses : {};
  ledger.events = Array.isArray(ledger.events) ? ledger.events : [];

  for (const session of Object.values(ledger.sessions)) {
    if (!session.processObservations || typeof session.processObservations !== "object") {
      session.processObservations = {};
    }
  }
  return ledger;
}

function applyRetention(data, config = {}) {
  const maxSnapshots = config?.ledger?.maxSnapshots ?? 120;
  const maxEvents = config?.ledger?.maxEvents ?? 400;
  const now = Date.now();

  data.snapshots = (data.snapshots || []).slice(-maxSnapshots);
  data.events = (data.events || []).slice(-maxEvents);

  for (const [key, value] of Object.entries(data.processMemory || {})) {
    const lastSeen = Date.parse(value.lastSeen || "");
    if (!Number.isFinite(lastSeen) || now - lastSeen > MEMORY_TTL_MS) {
      delete data.processMemory[key];
    }
  }

  for (const [tokenHash, plan] of Object.entries(data.cleanupPlans || {})) {
    const expiresAt = Date.parse(plan.expiresAt || "");
    if (!Number.isFinite(expiresAt) || expiresAt < now) {
      delete data.cleanupPlans[tokenHash];
    }
  }
}

function readLedgerFile(ledgerPath) {
  try {
    if (!fs.existsSync(ledgerPath)) return null;
    return JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  } catch {
    return null;
  }
}

function mergeLedgerData(base, incoming) {
  const out = normalizeLedger(base || {});
  const next = normalizeLedger(incoming || {});
  out.version = LEDGER_VERSION;
  out.createdAt = earliestIso(out.createdAt, next.createdAt);
  out.installation = { ...out.installation, ...next.installation };
  out.sessions = mergeSessions(out.sessions, next.sessions);
  out.snapshots = mergeArrayByKey(out.snapshots, next.snapshots, (item) => item?.id || `${item?.at}:${item?.sessionEpochId}:${item?.processCount}`);
  out.processMemory = { ...out.processMemory, ...next.processMemory };
  out.cleanupPlans = { ...out.cleanupPlans, ...next.cleanupPlans };
  out.managedProcesses = mergeManagedProcesses(out.managedProcesses, next.managedProcesses);
  out.events = mergeArrayByKey(out.events, next.events, eventKey);
  return out;
}

function mergeSessions(base = {}, incoming = {}) {
  const out = { ...(base || {}) };
  for (const [id, session] of Object.entries(incoming || {})) {
    const existing = out[id] || {};
    out[id] = {
      ...existing,
      ...session,
      baseline: existing.baseline || session.baseline || null,
      processObservations: {
        ...(existing.processObservations || {}),
        ...(session.processObservations || {}),
      },
      lastSeenAt: latestIso(existing.lastSeenAt, session.lastSeenAt),
    };
  }
  return out;
}

function mergeManagedProcesses(base = {}, incoming = {}) {
  const out = { ...(base || {}) };
  for (const [id, record] of Object.entries(incoming || {})) {
    const existing = out[id];
    if (!existing) {
      out[id] = record;
      continue;
    }

    const existingExit = Date.parse(existing.exitObservedAt || "");
    const incomingExit = Date.parse(record.exitObservedAt || "");
    if (Number.isFinite(existingExit) && !Number.isFinite(incomingExit)) {
      out[id] = {
        ...record,
        ...existing,
        lastSeenAt: latestIso(existing.lastSeenAt, record.lastSeenAt),
      };
      continue;
    }
    if (Number.isFinite(incomingExit) && !Number.isFinite(existingExit)) {
      out[id] = {
        ...existing,
        ...record,
        lastSeenAt: latestIso(existing.lastSeenAt, record.lastSeenAt),
      };
      continue;
    }

    const existingSeen = Date.parse(existing.lastSeenAt || existing.startedAt || "");
    const incomingSeen = Date.parse(record.lastSeenAt || record.startedAt || "");
    out[id] = incomingSeen >= existingSeen ? { ...existing, ...record } : { ...record, ...existing };
  }
  return out;
}

function deriveManagedProcessesFromEvents(events = []) {
  const out = {};
  for (const event of [...events].sort((a, b) => Date.parse(a?.at || 0) - Date.parse(b?.at || 0))) {
    const id = event?.managedProcessId;
    if (!id) continue;
    if (event.type === "managed_process_start" && event.managedRecord) {
      out[id] = { ...event.managedRecord };
      continue;
    }
    const record = out[id];
    if (!record) continue;
    if (event.type === "managed_process_update") {
      Object.assign(record, event.patch || {}, { lastSeenAt: event.at || record.lastSeenAt });
    } else if (event.type === "managed_runner_signal") {
      record.signalSent = event.signal || record.signalSent || null;
      record.signalSentAt = event.at || record.signalSentAt || null;
      record.lastSeenAt = event.at || record.lastSeenAt;
      if (record.status === "running") record.status = "signaled";
    } else if (event.type === "child_may_be_orphaned" || event.type === "runner_dead_child_alive") {
      record.status = "orphan_candidate";
      record.orphanCandidate = true;
      record.orphanReason = event.reason || event.type;
      record.orphanObservedAt = event.at || record.orphanObservedAt || null;
      record.lastSeenAt = event.at || record.lastSeenAt;
    } else if (event.type === "managed_process_exit") {
      record.status = "exited";
      record.exitCode = event.exitCode ?? null;
      record.signal = event.signal ?? null;
      record.exitObservedAt = event.at || record.exitObservedAt || null;
      record.lastSeenAt = event.at || record.lastSeenAt;
      record.orphanCandidate = false;
    } else if (event.type === "child_exit_after_signal") {
      record.childExitAfterSignal = true;
      record.orphanCandidate = false;
    }
  }
  return out;
}

function readAppendOnlyEvents(eventPath) {
  try {
    if (!fs.existsSync(eventPath)) return [];
    return fs.readFileSync(eventPath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((event) => event && typeof event === "object");
  } catch {
    return [];
  }
}

function eventKey(item) {
  if (item?.eventId) return `event:${item.eventId}`;
  if (item?.id) return `${item.type}:${item.id}`;
  return `${item?.at}:${item?.type}:${item?.managedProcessId || ""}:${JSON.stringify(item?.pids || item?.counts || item?.pid || "")}`;
}

function mergeArrayByKey(base = [], incoming = [], keyFn = (item) => JSON.stringify(item)) {
  const map = new Map();
  for (const item of [...(base || []), ...(incoming || [])]) {
    const key = keyFn(item);
    if (!key) continue;
    map.set(key, item);
  }
  return [...map.values()].sort((a, b) => Date.parse(a?.at || a?.createdAt || 0) - Date.parse(b?.at || b?.createdAt || 0));
}

function earliestIso(a, b) {
  const at = Date.parse(a || "");
  const bt = Date.parse(b || "");
  if (!Number.isFinite(at)) return b || a;
  if (!Number.isFinite(bt)) return a || b;
  return at <= bt ? a : b;
}

function latestIso(a, b) {
  const at = Date.parse(a || "");
  const bt = Date.parse(b || "");
  if (!Number.isFinite(at)) return b || a;
  if (!Number.isFinite(bt)) return a || b;
  return at >= bt ? a : b;
}

function isRelatedAnalysis(analysis) {
  const strongHostProfile = (analysis?.hostProfiles || []).some((profile) => profile.confidence !== "weak_signal");
  const strongToolProfile = (analysis?.toolProfiles || []).some((profile) => profile.confidence !== "weak_signal");
  return Boolean(
    analysis?.isCandidate ||
      analysis?.signals?.hasCodexAncestor ||
      analysis?.signals?.codexPath ||
      analysis?.signals?.ledgerKnownRelated ||
      analysis?.signals?.mcpLike ||
      strongHostProfile ||
      strongToolProfile,
  );
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex").slice(0, 24);
}

function cleanupPlanAction(meta = {}) {
  return {
    policyVersion: meta.policyVersion || CLEANUP_POLICY_VERSION,
    sessionEpochId: meta.sessionEpochId || null,
    hostProfile: meta.hostProfile || null,
    scope: meta.scope || "owned_current_session",
      signal: meta.signal || "SIGTERM",
      force: Boolean(meta.force),
      includeProcessTree: Boolean(meta.includeProcessTree),
      evidenceSha256: normalizeEvidenceSha256(meta.evidenceSha256),
      allowBrowsers: Boolean(meta.allowBrowsers),
      allowShells: Boolean(meta.allowShells),
  };
}

function cleanupPlanBinding(candidates = [], action = {}) {
  const sorted = [...(candidates || [])].sort((a, b) => Number(a.pid) - Number(b.pid));
  return {
    action: cleanupPlanAction(action),
    pids: sorted.map((candidate) => Number(candidate.pid)),
    commandHashes: Object.fromEntries(sorted.map((candidate) => [String(candidate.pid), candidate.commandHash || null])),
    risks: Object.fromEntries(sorted.map((candidate) => [String(candidate.pid), candidate.risk || null])),
    ownership: Object.fromEntries(sorted.map((candidate) => [String(candidate.pid), candidate.ownership || null])),
    blockers: Object.fromEntries(sorted.map((candidate) => [String(candidate.pid), [...(candidate.blockers || [])].sort()])),
  };
}

function hashBinding(binding) {
  return crypto.createHash("sha256").update(JSON.stringify(binding)).digest("hex").slice(0, 24);
}

function comparePlanAction(planned = {}, requested = {}) {
  const fields = [
    "policyVersion",
    "sessionEpochId",
    "hostProfile",
    "scope",
    "signal",
    "force",
    "includeProcessTree",
    "evidenceSha256",
    "allowBrowsers",
    "allowShells",
  ];
  for (const field of fields) {
    if (planned[field] !== requested[field]) return field;
  }
  return null;
}

function normalizeEvidenceSha256(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : null;
}

function sameNumberArray(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => Number(value) === Number(b[index]));
}

function sameStringArray(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => String(value) === String(b[index]));
}

function sanitizeEvent(event) {
  if (!event || typeof event !== "object") return event;
  const out = { ...event };
  if (out.token) {
    out.tokenHash = out.tokenHash || hashToken(out.token);
    delete out.token;
  }
  return out;
}

function withFileLock(lockPath, callback, { timeoutMs = 1500, staleMs = 10000 } = {}) {
  const started = Date.now();
  let handle = null;

  while (!handle) {
    try {
      handle = fs.openSync(lockPath, "wx");
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (isStaleLock(lockPath, staleMs)) {
        try {
          fs.unlinkSync(lockPath);
          continue;
        } catch {
          // Another process may have removed it; retry until timeout.
        }
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(`ledger_lock_timeout:${lockPath}`);
      }
      sleepSync(25);
    }
  }

  try {
    fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, at: nowIso() }));
    return callback();
  } finally {
    try {
      fs.closeSync(handle);
    } finally {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // Best effort cleanup; stale lock handling covers interrupted writers.
      }
    }
  }
}

function isStaleLock(lockPath, staleMs) {
  try {
    const stat = fs.statSync(lockPath);
    return Date.now() - stat.mtimeMs > staleMs;
  } catch {
    return false;
  }
}

function sleepSync(ms) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function replaceLedgerFile(tmp, destination) {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.renameSync(tmp, destination);
      return;
    } catch (error) {
      lastError = error;
      if (!["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
      sleepSync(25 * (attempt + 1));
    }
  }

  // Windows can transiently block rename over a file that another process is reading.
  // The lock still serializes writers; this fallback avoids losing events while preserving
  // a complete JSON file at the destination.
  try {
    fs.copyFileSync(tmp, destination);
    fs.unlinkSync(tmp);
    return;
  } catch (error) {
    throw lastError || error;
  }
}
