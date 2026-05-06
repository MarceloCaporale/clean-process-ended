import { scanProcesses } from "./scanner.js";
import { analyzeSnapshot } from "./classifier.js";
import { nowIso } from "./format.js";

export class EmbeddedWatcher {
  constructor({ config, ledger, logger = () => {}, sessionContext = null } = {}) {
    this.config = config;
    this.ledger = ledger;
    this.logger = logger;
    this.sessionContext = sessionContext;
    this.timer = null;
    this.running = false;
    this.inTick = false;
    this.lastTick = null;
    this.lastError = null;
    this.lastCounts = null;
    this.tickCount = 0;
  }

  async start({ immediate = true } = {}) {
    if (this.running || !this.config?.watcher?.enabled) return this.status();
    this.running = true;
    const intervalMs = Math.max(15, Number(this.config.watcher.intervalSeconds) || 120) * 1000;
    if (immediate) {
      this.tick().catch((error) => {
        this.lastError = { at: nowIso(), error: error.message };
        this.logger("watcher immediate tick failed", error);
      });
    }
    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        this.lastError = { at: nowIso(), error: error.message };
        this.logger("watcher tick failed", error);
      });
    }, intervalMs);
    this.timer.unref?.();
    return this.status();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    return this.status();
  }

  async tick(options = {}) {
    if (this.inTick) return { skipped: true, reason: "tick_already_running", status: this.status() };
    this.inTick = true;
    try {
      const snapshot = await scanProcesses();
      if (this.sessionContext) this.ledger.ensureSessionBaseline(snapshot, this.sessionContext);
      const analysis = analyzeSnapshot(snapshot, this.config, this.ledger, {
        includeCommandLine: false,
        limit: options.limit || 10,
        minAgeMinutes: options.minAgeMinutes,
        sessionContext: this.sessionContext,
      });
      let snapshotRecord = null;
      if (this.config?.watcher?.writeSnapshots !== false) {
        snapshotRecord = this.ledger.recordSnapshot(snapshot, analysis.analyses, { sessionContext: this.sessionContext });
      }
      this.lastTick = nowIso();
      this.lastError = null;
      this.lastCounts = analysis.counts;
      this.tickCount += 1;
      return { snapshotId: snapshotRecord?.id || null, counts: analysis.counts, report: analysis.report };
    } finally {
      this.inTick = false;
    }
  }

  status() {
    return {
      enabled: Boolean(this.config?.watcher?.enabled),
      running: this.running,
      intervalSeconds: this.config?.watcher?.intervalSeconds,
      writeSnapshots: this.config?.watcher?.writeSnapshots !== false,
      inTick: this.inTick,
      tickCount: this.tickCount,
      sessionEpochId: this.sessionContext?.sessionEpochId || null,
      baselineSnapshotId: this.sessionContext?.baselineSnapshotId || null,
      lastTick: this.lastTick,
      lastError: this.lastError,
      lastCounts: this.lastCounts,
    };
  }
}
