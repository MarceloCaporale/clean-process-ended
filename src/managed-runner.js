import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { loadConfig } from "./config.js";
import { commandHash, looseCommandHash } from "./classifier.js";
import { Ledger } from "./ledger.js";
import { getDefaultDataDir } from "./paths.js";
import { scanProcessByPid, scanProcesses } from "./scanner.js";
import { basenameSafe } from "./format.js";

export async function runManagedCommand(options = {}) {
  const command = options.command || [];
  if (!command.length) {
    throw new Error("managed_command_required");
  }

  const loaded = loadConfig(options.configPath);
  const config = loaded.config;
  if (options.hostProfile) config.host.expectedProfile = options.hostProfile;
  const ledger = new Ledger({ dataDir: options.dataDir || getDefaultDataDir(), config }).load();
  const managedProcessId = options.managedProcessId || `managed_${crypto.randomBytes(10).toString("hex")}`;
  const startedAtMs = Date.now();
  const leaseTtlSeconds = Number.isFinite(Number(options.leaseTtlSeconds)) ? Number(options.leaseTtlSeconds) : null;
  const leaseExpiresAt = leaseTtlSeconds ? new Date(startedAtMs + leaseTtlSeconds * 1000).toISOString() : null;
  const argvHash = hashCommand(command);
  const childCwd = options.cwd || process.cwd();
  const cwdHash = hashText(childCwd);

  const child = spawn(command[0], command.slice(1), {
    cwd: childCwd,
    env: {
      ...process.env,
      CPE_MANAGED_PROCESS_ID: managedProcessId,
      CPE_HOST_PROFILE: config.host.expectedProfile || "",
      CPE_MANAGED_ROLE: options.role || "tool",
    },
    stdio: options.stdio || "inherit",
    shell: Boolean(options.shell),
    windowsHide: true,
  });

  let childExited = false;
  let runnerSignalHandled = false;
  const signalHandlers = [];
  const exitPromise = new Promise((resolve) => {
    child.once("exit", (exitCode, signal) => {
      childExited = true;
      resolve({ exitCode, signal, error: null });
    });
    child.once("error", (error) => {
      childExited = true;
      resolve({ exitCode: 1, signal: null, error });
    });
  });

  if (!Number.isInteger(child.pid) || child.pid <= 0) {
    const exit = await exitPromise;
    const record = ledger.recordManagedProcessSpawnError({
      managedProcessId,
      hostProfile: config.host.expectedProfile,
      role: options.role || "tool",
      error: exit.error?.message || "spawn_failed",
    });
    return {
      managedProcessId,
      pid: null,
      error: exit.error?.message || "spawn_failed",
      exitCode: exit.exitCode,
      signal: exit.signal,
      record,
    };
  }

  const observed = await observeChildProcess(child.pid);
  const observedCreateTimeMs = Number.isFinite(Number(observed?.createTimeMs)) ? Number(observed.createTimeMs) : null;
  const recordCreateTimeMs = observedCreateTimeMs || startedAtMs;
  const observedForIdentity = observed
    ? {
        ...observed,
        createTimeMs: recordCreateTimeMs,
        createTimeSource: observed.createTimeSource || (observedCreateTimeMs ? null : "managed_runner_spawn_time_estimate"),
        createTimeToleranceMs: Math.max(Number(observed.createTimeToleranceMs) || 0, observedCreateTimeMs ? 0 : 10000),
      }
    : null;
  ledger.recordManagedProcessStart({
    managedProcessId,
    pid: child.pid,
    ppid: process.pid,
    hostProfile: config.host.expectedProfile,
    role: options.role || "tool",
    processName: observedForIdentity?.name || basenameSafe(command[0]),
    createTimeMs: recordCreateTimeMs,
    createTimeSource: observedForIdentity?.createTimeSource || (observed ? null : "managed_runner_spawn_time_estimate"),
    createTimeResolutionMs: observedForIdentity?.createTimeResolutionMs || null,
    createTimeToleranceMs: observedForIdentity?.createTimeToleranceMs || null,
    cwdHash,
    commandHash: argvHash,
    argvHash,
    scannerCommandHash: observedForIdentity ? commandHash(observedForIdentity) : null,
    scannerLooseHash: observedForIdentity ? looseCommandHash(observedForIdentity) : null,
    identityVersion: 2,
    matchStatus: observed ? "observed_strong" : "registered_unobserved",
    matchedAt: observed ? new Date().toISOString() : null,
    leaseTtlSeconds,
    leaseExpiresAt,
    shutdownPolicy: options.shutdownPolicy || "none",
    startedAt: new Date(startedAtMs).toISOString(),
  });

  const handleRunnerSignal = async (signal, reason = "runner_signal") => {
    if (runnerSignalHandled) return;
    runnerSignalHandled = true;
    ledger.recordManagedRunnerSignal(managedProcessId, { signal, runnerPid: process.pid, reason });
    if (options.forwardSignal !== false && !childExited) {
      try {
        child.kill(signal);
      } catch {
        // The child may have exited between the signal and forwarding attempt.
      }
    }
    const graceMs = Math.max(0, Number(options.orphanGraceMs ?? 1200));
    if (graceMs > 0) await delay(graceMs);
    if (!childExited) {
      ledger.recordManagedChildMayBeOrphaned(managedProcessId, {
        type: "child_may_be_orphaned",
        reason: "signal_grace_elapsed",
        runnerPid: process.pid,
      });
      ledger.recordManagedChildMayBeOrphaned(managedProcessId, {
        type: "runner_dead_child_alive",
        reason: "runner_signal_child_alive_after_grace",
        runnerPid: process.pid,
      });
    }
  };

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    const handler = () => {
      void handleRunnerSignal(signal, "process_signal").finally(() => {
        if (options.exitOnSignal !== false) process.exit(signalExitCode(signal));
      });
    };
    process.once(signal, handler);
    signalHandlers.push([signal, handler]);
  }

  if (options.abortSignal) {
    if (options.abortSignal.aborted) {
      void handleRunnerSignal(options.abortSignal.reason?.signal || "SIGTERM", "abort_signal");
    } else {
      const abortHandler = () => {
        void handleRunnerSignal(options.abortSignal.reason?.signal || "SIGTERM", "abort_signal");
      };
      options.abortSignal.addEventListener("abort", abortHandler, { once: true });
      signalHandlers.push(["abort", abortHandler]);
    }
  }

  const exit = await exitPromise;
  for (const [signal, handler] of signalHandlers) {
    if (signal === "abort") {
      options.abortSignal?.removeEventListener("abort", handler);
    } else {
      process.removeListener(signal, handler);
    }
  }
  const record = ledger.recordManagedProcessExit(managedProcessId, { exitCode: exit.exitCode, signal: exit.signal });
  return {
    managedProcessId,
    pid: child.pid || null,
    error: exit.error?.message,
    exitCode: exit.exitCode,
    signal: exit.signal,
    record,
  };
}

export function hashCommand(command) {
  return hashText(command.join("\0"));
}

async function observeChildProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await delay(120);
    try {
      const direct = await scanProcessByPid(pid, { timeoutMs: 3000 });
      if (direct?.createTimeMs && direct?.name) return direct;
      const snapshot = await scanProcesses();
      const proc = (snapshot.processes || []).find((item) => item.pid === pid);
      if (proc?.createTimeMs && proc?.name) return proc;
      if (proc && attempt === 4) return proc;
    } catch {
      // Retry; process scanners can race with very young child processes.
    }
  }
  return null;
}

function hashText(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function signalExitCode(signal) {
  const numbers = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };
  return 128 + (numbers[signal] || 0);
}
