import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG } from "../src/config.js";
import { commandHash, looseCommandHash } from "../src/classifier.js";
import { Ledger } from "../src/ledger.js";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cpe-ledger-"));
}

test("ledger creates and validates cleanup plan for owned_current_session", () => {
  const dir = tempDir();
  const ledger = new Ledger({ dataDir: dir, config: DEFAULT_CONFIG }).load();
  const candidates = [
    { pid: 42, name: "node", commandHash: "abc", risk: "safe", ownership: "owned_current_session" },
  ];

  const plan = ledger.createCleanupPlan(candidates, { scope: "owned_current_session" });
  assert.ok(plan.token);
  assert.equal(ledger.validateCleanupToken(plan.token, candidates).ok, true);
  assert.equal(ledger.validateCleanupToken("missing", candidates).ok, false);
  const raw = fs.readFileSync(path.join(dir, "ledger.json"), "utf8");
  assert.doesNotMatch(raw, new RegExp(plan.token));
  assert.match(raw, /tokenHash/);
});

test("ledger does not create a confirm token for an empty plan", () => {
  const dir = tempDir();
  const ledger = new Ledger({ dataDir: dir, config: DEFAULT_CONFIG }).load();
  const plan = ledger.createCleanupPlan([], { scope: "owned_current_session" });
  assert.equal(plan.token, null);
  assert.equal(plan.pids.length, 0);
});

test("ledger blocks cleanup token validation for report-only ownership", () => {
  const dir = tempDir();
  const ledger = new Ledger({ dataDir: dir, config: DEFAULT_CONFIG }).load();
  const planned = [
    { pid: 42, name: "node", commandHash: "abc", risk: "safe", ownership: "owned_current_session" },
  ];
  const actual = [
    { pid: 42, name: "node", commandHash: "abc", risk: "safe", ownership: "related_unowned" },
  ];

  const plan = ledger.createCleanupPlan(planned, { scope: "owned_current_session" });
  assert.equal(ledger.validateCleanupToken(plan.token, actual).reason, "ownership_not_owned_current_session");
});

test("cleanup token is bound to action envelope", () => {
  const dir = tempDir();
  const ledger = new Ledger({ dataDir: dir, config: DEFAULT_CONFIG }).load();
  const candidates = [
    { pid: 42, name: "node", commandHash: "abc", risk: "safe", ownership: "owned_current_session", blockers: [] },
  ];
  const action = {
    scope: "owned_current_session",
    sessionEpochId: "epoch_a",
    hostProfile: "codex",
    signal: "SIGTERM",
    force: false,
    includeProcessTree: false,
  };

  const plan = ledger.createCleanupPlan(candidates, action);
  assert.equal(ledger.validateCleanupToken(plan.token, candidates, action).ok, true);
  assert.equal(ledger.validateCleanupToken(plan.token, candidates, { ...action, signal: "SIGKILL" }).reason, "cleanup_action_changed");
  assert.equal(ledger.validateCleanupToken(plan.token, candidates, { ...action, force: true }).field, "force");
  assert.equal(ledger.validateCleanupToken(plan.token, candidates, { ...action, scope: "explicit_pids" }).field, "scope");
  assert.equal(ledger.validateCleanupToken(plan.token, candidates, { ...action, hostProfile: "claude_code" }).field, "hostProfile");
  assert.equal(ledger.validateCleanupToken(plan.token, candidates, { ...action, sessionEpochId: "epoch_b" }).field, "sessionEpochId");
});

test("cleanup token rejects changed pid set", () => {
  const dir = tempDir();
  const ledger = new Ledger({ dataDir: dir, config: DEFAULT_CONFIG }).load();
  const candidates = [
    { pid: 42, name: "node", commandHash: "abc", risk: "safe", ownership: "owned_current_session", blockers: [] },
  ];
  const plan = ledger.createCleanupPlan(candidates, { scope: "owned_current_session" });
  const changed = [
    ...candidates,
    { pid: 43, name: "node", commandHash: "def", risk: "safe", ownership: "owned_current_session", blockers: [] },
  ];
  assert.equal(ledger.validateCleanupToken(plan.token, changed, { scope: "owned_current_session" }).reason, "confirmed_pid_set_changed");
});

test("ledger stores summary without full command line by default", () => {
  const dir = tempDir();
  const ledger = new Ledger({ dataDir: dir, config: DEFAULT_CONFIG }).load();
  ledger.recordSnapshot(
    {
      scannedAt: new Date().toISOString(),
      platform: process.platform,
      processCount: 1,
      errors: [],
      processes: [
        {
          pid: 10,
          ppid: 1,
          name: "node",
          commandLine: "node --api-key=SECRET /tmp/.codex/mcp.js",
          executablePath: "/usr/bin/node",
          ageSeconds: 1000,
          cpuPercent: 0,
          hasVisibleWindow: false,
        },
      ],
    },
    [
      {
        pid: 10,
        risk: "safe",
        score: 90,
        ownership: "owned_current_session",
        isCandidate: true,
        signals: { hasCodexAncestor: true, mcpLike: true },
      },
    ],
  );

  const summary = ledger.summary({ includeRecentEvents: false });
  assert.equal(summary.snapshotCount, 1);
  const raw = fs.readFileSync(path.join(dir, "ledger.json"), "utf8");
  assert.doesNotMatch(raw, /SECRET/);
});

test("weak profile alone does not enter related process memory", () => {
  const dir = tempDir();
  const ledger = new Ledger({ dataDir: dir, config: DEFAULT_CONFIG }).load();
  const snapshot = {
    scannedAt: new Date().toISOString(),
    platform: process.platform,
    processCount: 1,
    errors: [],
    processes: [
      {
        pid: 20,
        ppid: 1,
        name: "bash",
        commandLine: "bash",
        executablePath: "/usr/bin/bash",
        ageSeconds: 1000,
        cpuPercent: 0,
        hasVisibleWindow: false,
      },
    ],
  };

  ledger.recordSnapshot(snapshot, [
    {
      pid: 20,
      risk: "risky",
      score: 2,
      ownership: "unknown_owner",
      isCandidate: false,
      signals: {},
      hostProfiles: [],
      toolProfiles: [{ id: "repl_shell", confidence: "weak_signal" }],
    },
  ]);

  assert.equal(ledger.wasProcessRelated(snapshot.processes[0]), false);
  assert.equal(Object.keys(ledger.data.processMemory).length, 0);
  assert.equal(ledger.data.snapshots.at(-1).processes.length, 0);
});

test("ledger merge preserves events from two loaded instances", () => {
  const dir = tempDir();
  const first = new Ledger({ dataDir: dir, config: DEFAULT_CONFIG }).load();
  const second = new Ledger({ dataDir: dir, config: DEFAULT_CONFIG }).load();

  first.data.events.push({ at: new Date().toISOString(), type: "test_event", id: "from_first" });
  first.save();
  second.data.events.push({ at: new Date().toISOString(), type: "test_event", id: "from_second" });
  second.save();

  const finalLedger = new Ledger({ dataDir: dir, config: DEFAULT_CONFIG }).load();
  const ids = finalLedger.data.events.filter((event) => event.type === "test_event").map((event) => event.id).sort();
  assert.deepEqual(ids, ["from_first", "from_second"]);
  assert.equal(finalLedger.data.version, 3);
});

test("append-only event log keeps concurrent writer events and supports managed rebuild", () => {
  const dir = tempDir();
  const config = {
    ...DEFAULT_CONFIG,
    ledger: {
      ...DEFAULT_CONFIG.ledger,
      appendOnlyEvents: true,
    },
  };
  const first = new Ledger({ dataDir: dir, config }).load();
  const second = new Ledger({ dataDir: dir, config }).load();

  first.recordCleanupEvent({ id: "from_first", marker: "one" });
  second.recordCleanupEvent({ id: "from_second", marker: "two" });
  const lines = fs.readFileSync(path.join(dir, "events.jsonl"), "utf8").trim().split(/\r?\n/);
  const ids = lines.map((line) => JSON.parse(line).id).filter(Boolean).sort();
  assert.deepEqual(ids, ["from_first", "from_second"]);

  const record = first.recordManagedProcessStart({ managedProcessId: "managed_rebuild", pid: 321, processName: "node" });
  first.recordManagedRunnerSignal(record.managedProcessId, { signal: "SIGTERM", reason: "test_signal" });
  first.recordManagedChildMayBeOrphaned(record.managedProcessId, { reason: "test_orphan" });

  const raw = JSON.parse(fs.readFileSync(path.join(dir, "ledger.json"), "utf8"));
  raw.managedProcesses = {};
  fs.writeFileSync(path.join(dir, "ledger.json"), JSON.stringify(raw, null, 2));

  const rebuilt = new Ledger({ dataDir: dir, config }).load();
  const rebuiltRecord = rebuilt.getManagedProcess("managed_rebuild");
  assert.equal(rebuiltRecord.status, "orphan_candidate");
  assert.equal(rebuiltRecord.orphanCandidate, true);
  assert.equal(rebuiltRecord.signalSent, "SIGTERM");
});

test("managed identity tolerates POSIX etimes start drift when loose hash matches", () => {
  const dir = tempDir();
  const ledger = new Ledger({ dataDir: dir, config: DEFAULT_CONFIG }).load();
  const baseTime = 1_700_000_000_000;
  const baseProc = managedProc({ createTimeMs: baseTime });
  ledger.recordManagedProcessStart({
    managedProcessId: "managed_posix",
    pid: baseProc.pid,
    hostProfile: "codex",
    processName: baseProc.name,
    createTimeMs: baseProc.createTimeMs,
    createTimeSource: "posix_ps_etimes",
    createTimeToleranceMs: 2000,
    scannerCommandHash: commandHash(baseProc),
    scannerLooseHash: looseCommandHash(baseProc),
  });

  const match = ledger.findManagedProcessForProc(managedProc({ createTimeMs: baseTime + 1000 }));
  assert.equal(match.strong, true);
  assert.equal(match.matchStatus, "strong_start_time_tolerated");
  assert.ok(match.reasons.includes("create_time_within_tolerance"));
  assert.ok(match.reasons.includes("scanner_loose_hash_match"));
});

test("managed identity does not tolerate Windows start drift", () => {
  const dir = tempDir();
  const ledger = new Ledger({ dataDir: dir, config: DEFAULT_CONFIG }).load();
  const baseTime = 1_700_000_000_000;
  const baseProc = managedProc({ createTimeMs: baseTime, createTimeSource: "windows_cim_creation_date", createTimeToleranceMs: 0 });
  ledger.recordManagedProcessStart({
    managedProcessId: "managed_windows",
    pid: baseProc.pid,
    hostProfile: "codex",
    processName: baseProc.name,
    createTimeMs: baseProc.createTimeMs,
    createTimeSource: baseProc.createTimeSource,
    createTimeToleranceMs: 0,
    scannerCommandHash: commandHash(baseProc),
    scannerLooseHash: looseCommandHash(baseProc),
  });

  const match = ledger.findManagedProcessForProc(managedProc({
    createTimeMs: baseTime + 1,
    createTimeSource: "windows_cim_creation_date",
    createTimeToleranceMs: 0,
  }));
  assert.equal(match.strong, false);
  assert.equal(match.matchStatus, "pid_reuse_mismatch");
});

test("managed POSIX drift tolerance still rejects changed command identity", () => {
  const dir = tempDir();
  const ledger = new Ledger({ dataDir: dir, config: DEFAULT_CONFIG }).load();
  const baseTime = 1_700_000_000_000;
  const baseProc = managedProc({ createTimeMs: baseTime });
  ledger.recordManagedProcessStart({
    managedProcessId: "managed_changed",
    pid: baseProc.pid,
    hostProfile: "codex",
    processName: baseProc.name,
    createTimeMs: baseProc.createTimeMs,
    createTimeSource: "posix_ps_etimes",
    createTimeToleranceMs: 2000,
    scannerCommandHash: commandHash(baseProc),
    scannerLooseHash: looseCommandHash(baseProc),
  });

  const match = ledger.findManagedProcessForProc(managedProc({
    createTimeMs: baseTime + 1000,
    commandLine: "node /tmp/.codex/mcp_servers/other-server.js",
  }));
  assert.equal(match.strong, false);
  assert.equal(match.matchStatus, "pid_reuse_mismatch");
});

function managedProc(overrides = {}) {
  return {
    pid: 12345,
    ppid: 1,
    name: "node",
    executablePath: "/usr/bin/node",
    commandLine: "node /tmp/.codex/mcp_servers/filesystem-mcp/index.js",
    createTimeMs: 1_700_000_000_000,
    createTimeSource: "posix_ps_etimes",
    createTimeResolutionMs: 1000,
    createTimeToleranceMs: 2000,
    ageSeconds: 3600,
    cpuPercent: 0,
    hasVisibleWindow: false,
    ...overrides,
  };
}
