import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Ledger } from "../src/ledger.js";
import { runManagedCommand } from "../src/managed-runner.js";
import { DEFAULT_CONFIG } from "../src/config.js";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cpe-managed-"));
}

test("managed runner records explicit child lifecycle without command lines", async () => {
  const dir = tempDir();
  const result = await runManagedCommand({
    dataDir: dir,
    hostProfile: "codex",
    role: "test-child",
    command: [process.execPath, "-e", "setTimeout(() => process.exit(0), 1500)"],
    stdio: "ignore",
  });

  assert.ok(result.managedProcessId.startsWith("managed_"));
  assert.equal(result.exitCode, 0);

  const ledger = new Ledger({ dataDir: dir, config: DEFAULT_CONFIG }).load();
  const record = ledger.getManagedProcess(result.managedProcessId);
  assert.equal(record.status, "exited");
  assert.equal(record.hostProfile, "codex");
  assert.equal(record.role, "test-child");
  assert.ok(record.commandHash);
  assert.equal(record.identityVersion, 2);
  assert.ok(record.processName);
  assert.ok(record.createTimeMs);
  assert.ok(record.scannerCommandHash);
  assert.ok(record.argvHash);
  const raw = fs.readFileSync(path.join(dir, "ledger.json"), "utf8");
  assert.doesNotMatch(raw, /process\.exit/);
});

test("managed runner records signal, orphan candidate, and later child exit", async () => {
  const dir = tempDir();
  const abortController = new AbortController();
  const run = runManagedCommand({
    dataDir: dir,
    hostProfile: "codex",
    role: "signal-test-child",
    command: [process.execPath, "-e", "setTimeout(() => process.exit(0), 2500)"],
    stdio: "ignore",
    abortSignal: abortController.signal,
    forwardSignal: false,
    orphanGraceMs: 20,
  });

  setTimeout(() => abortController.abort({ signal: "SIGTERM" }), 30);
  const result = await run;
  assert.equal(result.exitCode, 0);

  const ledger = new Ledger({ dataDir: dir, config: DEFAULT_CONFIG }).load();
  const record = ledger.getManagedProcess(result.managedProcessId);
  assert.equal(record.status, "exited");
  assert.equal(record.signalSent, "SIGTERM");
  assert.equal(record.childExitAfterSignal, true);
  assert.equal(record.orphanCandidate, false);

  const eventTypes = ledger.data.events.map((event) => event.type);
  assert.ok(eventTypes.includes("managed_runner_signal"));
  assert.ok(eventTypes.includes("child_may_be_orphaned"));
  assert.ok(eventTypes.includes("runner_dead_child_alive"));
  assert.ok(eventTypes.includes("child_exit_after_signal"));
});
