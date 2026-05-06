import { execFile, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { basenameSafe } from "./format.js";

const execFileAsync = promisify(execFile);
const ALLOWED_WINDOWS_POWERSHELL_BASENAMES = new Set(["powershell.exe", "pwsh.exe"]);
const POSIX_PS_AGE_FIELD = process.platform === "darwin" ? "etime" : "etimes";

export function resolvePowerShellExecutable(value = process.env.CPE_POWERSHELL) {
  const raw = String(value || "").trim();
  if (!raw) return "powershell.exe";
  const candidate = raw.replace(/^"(.+)"$/, "$1");
  const base = path.basename(candidate).toLowerCase();
  if (!ALLOWED_WINDOWS_POWERSHELL_BASENAMES.has(base)) {
    throw new Error("CPE_POWERSHELL must point to powershell.exe or pwsh.exe");
  }
  return candidate;
}

export async function scanProcesses({ timeoutMs = 9000 } = {}) {
  const scannedAtMs = Date.now();
  const errors = [];
  let processes = [];

  if (process.platform === "win32") {
    try {
      processes = await scanWindows({ timeoutMs, scannedAtMs });
    } catch (error) {
      errors.push({ scanner: "windows-powershell", error: error.message });
      processes = [];
    }
  } else {
    try {
      processes = await scanPosix({ timeoutMs, scannedAtMs });
    } catch (error) {
      errors.push({ scanner: "posix-ps", error: error.message });
      processes = [];
    }
  }

  return {
    scannedAt: new Date(scannedAtMs).toISOString(),
    scannedAtMs,
    platform: process.platform,
    processCount: processes.length,
    processes,
    errors,
  };
}

export async function scanProcessByPid(pid, { timeoutMs = 3000 } = {}) {
  const targetPid = Number(pid);
  if (!Number.isInteger(targetPid) || targetPid <= 0) return null;
  const scannedAtMs = Date.now();
  if (process.platform === "win32") {
    return scanWindowsProcessByPid({ pid: targetPid, timeoutMs, scannedAtMs });
  }
  return scanPosixProcessByPid({ pid: targetPid, timeoutMs, scannedAtMs });
}

async function scanPosix({ timeoutMs, scannedAtMs }) {
  const processes = await scanPosixWithAgeField({
    argsPrefix: ["-axo"],
    ageField: POSIX_PS_AGE_FIELD,
    fallbackAgeField: POSIX_PS_AGE_FIELD === "etimes" ? "etime" : "etimes",
    timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
    scannedAtMs,
  });
  return enrichLinuxProcStartTimes(processes, scannedAtMs);
}

async function scanPosixProcessByPid({ pid, timeoutMs, scannedAtMs }) {
  const processes = await scanPosixWithAgeField({
    argsPrefix: ["-p", String(pid), "-o"],
    ageField: POSIX_PS_AGE_FIELD,
    fallbackAgeField: POSIX_PS_AGE_FIELD === "etimes" ? "etime" : "etimes",
    timeoutMs,
    maxBuffer: 1024 * 1024,
    scannedAtMs,
  });
  return enrichLinuxProcStartTimes(processes, scannedAtMs).find((item) => item?.pid === pid) || null;
}

async function scanPosixWithAgeField({ argsPrefix, ageField, fallbackAgeField, timeoutMs, maxBuffer, scannedAtMs }) {
  try {
    return await scanPosixWithPsArgs({ argsPrefix, ageField, timeoutMs, maxBuffer, scannedAtMs });
  } catch (error) {
    if (!fallbackAgeField || fallbackAgeField === ageField) throw error;
    return scanPosixWithPsArgs({ argsPrefix, ageField: fallbackAgeField, timeoutMs, maxBuffer, scannedAtMs });
  }
}

async function scanPosixWithPsArgs({ argsPrefix, ageField, timeoutMs, maxBuffer, scannedAtMs }) {
  const args = [...argsPrefix, `pid=,ppid=,${ageField}=,pcpu=,rss=,comm=,args=`];
  const { stdout } = await execFileAsync("ps", args, {
    timeout: timeoutMs,
    maxBuffer,
    windowsHide: true,
  });
  return stdout
    .split(/\r?\n/)
    .map((line) => parsePosixPsLine(line, scannedAtMs))
    .filter(Boolean);
}

export function parsePosixPsLine(line, scannedAtMs = Date.now()) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return null;

  let match = trimmed.match(/^(\d+)\s+(\d+)\s+(\S+)\s+([0-9]+(?:\.[0-9]+)?)\s+(\d+)\s+(\S+)\s*(.*)$/);
  let rssKb;
  if (!match) {
    match = trimmed.match(/^(\d+)\s+(\d+)\s+(\S+)\s+([0-9]+(?:\.[0-9]+)?)\s+(\S+)\s*(.*)$/);
  } else {
    rssKb = Number(match[5]);
  }
  if (!match) return null;

  const pid = Number(match[1]);
  const ppid = Number(match[2]);
  const age = parsePosixAge(match[3]);
  const ageSeconds = age.seconds;
  const cpuPercent = Number(match[4]);
  const executablePath = match[rssKb === undefined ? 5 : 6] || "";
  const commandLine = (match[rssKb === undefined ? 6 : 7] || executablePath || "").trim();
  const scannedAtSecondMs = Math.floor(Number(scannedAtMs) / 1000) * 1000;
  const createTimeMs = Number.isFinite(ageSeconds) ? scannedAtSecondMs - ageSeconds * 1000 : undefined;

  return sanitizeProcess({
    pid,
    ppid,
    name: basenameSafe(executablePath) || basenameSafe(commandLine),
    executablePath,
    commandLine,
    createTimeMs,
    createTimeSource: age.source,
    createTimeResolutionMs: 1000,
    createTimeToleranceMs: 2000,
    ageSeconds,
    cpuPercent,
    rssKb,
    hasVisibleWindow: false,
    windowTitle: "",
  });
}

function parsePosixAge(value) {
  const raw = String(value || "").trim();
  if (/^\d+$/.test(raw)) return { seconds: Number(raw), source: "posix_ps_etimes" };

  let days = 0;
  let timePart = raw;
  const daySplit = raw.split("-");
  if (daySplit.length === 2) {
    days = Number(daySplit[0]);
    timePart = daySplit[1];
  } else if (daySplit.length > 2) {
    return { seconds: undefined, source: "posix_ps_etime" };
  }

  const parts = timePart.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return { seconds: undefined, source: "posix_ps_etime" };
  if (!Number.isFinite(days) || days < 0) return { seconds: undefined, source: "posix_ps_etime" };

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return { seconds: days * 86400 + minutes * 60 + seconds, source: "posix_ps_etime" };
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return { seconds: days * 86400 + hours * 3600 + minutes * 60 + seconds, source: "posix_ps_etime" };
  }
  return { seconds: undefined, source: "posix_ps_etime" };
}

async function scanWindowsProcessByPid({ pid, timeoutMs, scannedAtMs }) {
  const script = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$targetPid = __PID__
$p = Get-CimInstance Win32_Process -Filter "ProcessId = $targetPid"
if ($null -ne $p) {
  $created = $null
  if ($p.CreationDate) { $created = $p.CreationDate.ToUniversalTime().ToString('o') }
  $gp = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
  [PSCustomObject]@{
    pid = [int]$p.ProcessId
    ppid = [int]$p.ParentProcessId
    name = [string]$p.Name
    executablePath = [string]$p.ExecutablePath
    commandLine = [string]$p.CommandLine
    creationDate = $created
    workingSetBytes = if ($null -ne $gp -and $null -ne $gp.WorkingSet64) { [double]$gp.WorkingSet64 } else { $null }
    windowTitle = if ($null -ne $gp) { [string]$gp.MainWindowTitle } else { "" }
  } | ConvertTo-Json -Compress -Depth 3
}
`.replace("__PID__", String(pid));

  const shell = resolvePowerShellExecutable();
  let stdout;
  try {
    ({ stdout } = await execFileAsync(shell, ["-NoProfile", "-NonInteractive", "-Command", script], {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    }));
  } catch (error) {
    if (shell !== "pwsh.exe") {
      ({ stdout } = await execFileAsync("pwsh.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      }));
    } else {
      throw error;
    }
  }

  const parsed = stdout.trim() ? JSON.parse(stdout) : null;
  if (!parsed) return null;
  const createTimeMs = parsed.creationDate ? Date.parse(parsed.creationDate) : undefined;
  const ageSeconds = Number.isFinite(createTimeMs) ? Math.max(0, (scannedAtMs - createTimeMs) / 1000) : undefined;
  const windowTitle = String(parsed.windowTitle || "");
  return sanitizeProcess({
    pid: Number(parsed.pid),
    ppid: Number(parsed.ppid),
    name: basenameSafe(parsed.name || parsed.executablePath || parsed.commandLine),
    executablePath: parsed.executablePath || "",
    commandLine: parsed.commandLine || parsed.executablePath || parsed.name || "",
    createTimeMs,
    createTimeSource: "windows_cim_creation_date",
    createTimeResolutionMs: 1,
    createTimeToleranceMs: 0,
    ageSeconds,
    rssBytes: parsed.workingSetBytes === null || parsed.workingSetBytes === undefined ? undefined : Number(parsed.workingSetBytes),
    hasVisibleWindow: windowTitle.trim().length > 0,
    windowTitle,
  });
}

async function scanWindows({ timeoutMs, scannedAtMs }) {
  const script = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$windowMap = @{}
$cpuFirst = @{}
$workingSetMap = @{}
$sampleStarted = Get-Date
Get-Process | ForEach-Object {
  $windowMap[[int]$_.Id] = [string]$_.MainWindowTitle
  if ($null -ne $_.CPU) { $cpuFirst[[int]$_.Id] = [double]$_.CPU }
  if ($null -ne $_.WorkingSet64) { $workingSetMap[[int]$_.Id] = [double]$_.WorkingSet64 }
}
Start-Sleep -Milliseconds 700
$sampleEnded = Get-Date
$sampleSeconds = [Math]::Max(0.001, ($sampleEnded - $sampleStarted).TotalSeconds)
$cpuSecond = @{}
Get-Process | ForEach-Object {
  if (-not $windowMap.ContainsKey([int]$_.Id)) { $windowMap[[int]$_.Id] = [string]$_.MainWindowTitle }
  if ($null -ne $_.CPU) { $cpuSecond[[int]$_.Id] = [double]$_.CPU }
  if ($null -ne $_.WorkingSet64) { $workingSetMap[[int]$_.Id] = [double]$_.WorkingSet64 }
}
$processorCount = [Math]::Max(1, [Environment]::ProcessorCount)
Get-CimInstance Win32_Process | ForEach-Object {
  $created = $null
  if ($_.CreationDate) { $created = $_.CreationDate.ToUniversalTime().ToString('o') }
  $cpuPercent = $null
  if ($cpuFirst.ContainsKey([int]$_.ProcessId) -and $cpuSecond.ContainsKey([int]$_.ProcessId)) {
    $delta = [Math]::Max(0, $cpuSecond[[int]$_.ProcessId] - $cpuFirst[[int]$_.ProcessId])
    $cpuPercent = [Math]::Round(($delta / $sampleSeconds / $processorCount) * 100, 3)
  }
  [PSCustomObject]@{
    pid = [int]$_.ProcessId
    ppid = [int]$_.ParentProcessId
    name = [string]$_.Name
    executablePath = [string]$_.ExecutablePath
    commandLine = [string]$_.CommandLine
    creationDate = $created
    cpuPercent = $cpuPercent
    workingSetBytes = if ($workingSetMap.ContainsKey([int]$_.ProcessId)) { [double]$workingSetMap[[int]$_.ProcessId] } else { $null }
    windowTitle = [string]$windowMap[[int]$_.ProcessId]
  }
} | ConvertTo-Json -Compress -Depth 3
`;

  const shell = resolvePowerShellExecutable();
  let stdout;
  try {
    ({ stdout } = await execFileAsync(shell, ["-NoProfile", "-NonInteractive", "-Command", script], {
      timeout: timeoutMs,
      maxBuffer: 15 * 1024 * 1024,
      windowsHide: true,
    }));
  } catch (error) {
    if (shell !== "pwsh.exe") {
      ({ stdout } = await execFileAsync("pwsh.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        timeout: timeoutMs,
        maxBuffer: 15 * 1024 * 1024,
        windowsHide: true,
      }));
    } else {
      throw error;
    }
  }

  const parsed = stdout.trim() ? JSON.parse(stdout) : [];
  const items = Array.isArray(parsed) ? parsed : [parsed];

  return items.map((item) => {
    const createTimeMs = item.creationDate ? Date.parse(item.creationDate) : undefined;
    const ageSeconds = Number.isFinite(createTimeMs) ? Math.max(0, (scannedAtMs - createTimeMs) / 1000) : undefined;
    const windowTitle = String(item.windowTitle || "");
    const cpuPercent = item.cpuPercent === null || item.cpuPercent === undefined ? undefined : Number(item.cpuPercent);
    return sanitizeProcess({
      pid: Number(item.pid),
      ppid: Number(item.ppid),
      name: basenameSafe(item.name || item.executablePath || item.commandLine),
      executablePath: item.executablePath || "",
      commandLine: item.commandLine || item.executablePath || item.name || "",
      createTimeMs,
      createTimeSource: "windows_cim_creation_date",
      createTimeResolutionMs: 1,
      createTimeToleranceMs: 0,
      ageSeconds,
      cpuPercent,
      rssBytes: item.workingSetBytes === null || item.workingSetBytes === undefined ? undefined : Number(item.workingSetBytes),
      hasVisibleWindow: windowTitle.trim().length > 0,
      windowTitle,
    });
  }).filter(Boolean);
}

function sanitizeProcess(proc) {
  const pid = Number(proc.pid);
  const ppid = Number(proc.ppid);
  if (!Number.isInteger(pid) || pid <= 0) return null;

  return {
    pid,
    ppid: Number.isInteger(ppid) && ppid >= 0 ? ppid : 0,
    name: String(proc.name || "").trim(),
    executablePath: String(proc.executablePath || "").trim(),
    commandLine: String(proc.commandLine || "").trim(),
    createTimeMs: Number.isFinite(proc.createTimeMs) ? Math.floor(proc.createTimeMs) : undefined,
    createTimeSource: proc.createTimeSource ? String(proc.createTimeSource) : undefined,
    createTimeResolutionMs: Number.isFinite(proc.createTimeResolutionMs) ? Math.max(0, Number(proc.createTimeResolutionMs)) : undefined,
    createTimeToleranceMs: Number.isFinite(proc.createTimeToleranceMs) ? Math.max(0, Number(proc.createTimeToleranceMs)) : undefined,
    ageSeconds: Number.isFinite(proc.ageSeconds) ? Math.max(0, Number(proc.ageSeconds)) : undefined,
    cpuPercent: Number.isFinite(proc.cpuPercent) ? Number(proc.cpuPercent) : undefined,
    rssBytes: Number.isFinite(proc.rssBytes)
      ? Math.max(0, Number(proc.rssBytes))
      : Number.isFinite(proc.rssKb)
        ? Math.max(0, Number(proc.rssKb) * 1024)
        : undefined,
    rssMb: Number.isFinite(proc.rssBytes)
      ? Math.round((Math.max(0, Number(proc.rssBytes)) / 1024 / 1024) * 10) / 10
      : Number.isFinite(proc.rssKb)
        ? Math.round((Math.max(0, Number(proc.rssKb)) / 1024) * 10) / 10
        : undefined,
    hasVisibleWindow: Boolean(proc.hasVisibleWindow),
    windowTitle: String(proc.windowTitle || ""),
  };
}

function enrichLinuxProcStartTimes(processes, scannedAtMs) {
  if (process.platform !== "linux" || !fs.existsSync("/proc/stat")) return processes;
  const bootTimeSeconds = readLinuxBootTimeSeconds();
  const clockTicks = readLinuxClockTicks();
  if (!Number.isFinite(bootTimeSeconds) || !Number.isFinite(clockTicks) || clockTicks <= 0) return processes;

  return processes.map((proc) => {
    const startTicks = readLinuxProcStartTicks(proc.pid);
    if (!Number.isFinite(startTicks)) return proc;
    const createTimeMs = Math.floor((bootTimeSeconds + startTicks / clockTicks) * 1000);
    return {
      ...proc,
      createTimeMs,
      createTimeSource: "linux_proc_stat_starttime",
      createTimeResolutionMs: Math.ceil(1000 / clockTicks),
      createTimeToleranceMs: 0,
      ageSeconds: Math.max(0, (Number(scannedAtMs) - createTimeMs) / 1000),
    };
  });
}

function readLinuxBootTimeSeconds() {
  try {
    const content = fs.readFileSync("/proc/stat", "utf8");
    const line = content.split(/\r?\n/).find((item) => item.startsWith("btime "));
    const value = Number(line?.split(/\s+/)[1]);
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function readLinuxClockTicks() {
  try {
    const { status, stdout } = execFileSyncCompat("getconf", ["CLK_TCK"]);
    const value = Number(String(stdout || "").trim());
    if (status === 0 && Number.isFinite(value) && value > 0) return value;
  } catch {
    // Fall through to the common Linux default.
  }
  return 100;
}

function readLinuxProcStartTicks(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const close = stat.lastIndexOf(")");
    if (close === -1) return undefined;
    const fields = stat.slice(close + 2).trim().split(/\s+/);
    const startTicks = Number(fields[19]);
    return Number.isFinite(startTicks) ? startTicks : undefined;
  } catch {
    return undefined;
  }
}

function execFileSyncCompat(command, args) {
  return spawnSync(command, args, { encoding: "utf8", windowsHide: true });
}

export function buildProcessIndex(processes) {
  const byPid = new Map();
  for (const proc of processes) byPid.set(proc.pid, proc);
  return byPid;
}

export function getParentChain(proc, byPid, { maxDepth = 32 } = {}) {
  return getParentChainWithDiagnostics(proc, byPid, { maxDepth }).chain;
}

export function getParentChainWithDiagnostics(proc, byPid, { maxDepth = 32, temporalToleranceMs = 2000 } = {}) {
  const chain = [];
  const invalidRelations = [];
  const seen = new Set([proc.pid]);
  let current = proc;

  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (!current || !current.ppid || seen.has(current.ppid)) break;
    const parent = byPid.get(current.ppid);
    if (!parent) break;
    if (!isParentTemporalOrderValid(current, parent, temporalToleranceMs)) {
      invalidRelations.push({
        childPid: current.pid,
        parentPid: parent.pid,
        childCreateTimeMs: current.createTimeMs,
        parentCreateTimeMs: parent.createTimeMs,
        reason: "invalid_parent_temporal_order",
      });
      break;
    }
    chain.push(parent);
    seen.add(parent.pid);
    current = parent;
  }

  return {
    chain,
    invalidRelations,
    parentTemporalValid: invalidRelations.length === 0,
  };
}

export function isParentTemporalOrderValid(child, parent, toleranceMs = 2000) {
  if (!Number.isFinite(child?.createTimeMs) || !Number.isFinite(parent?.createTimeMs)) return true;
  return parent.createTimeMs <= child.createTimeMs + Math.max(0, Number(toleranceMs) || 0);
}
