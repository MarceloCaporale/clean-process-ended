import fs from "node:fs";
import path from "node:path";
import { getDefaultConfigPaths, getInstallHome, getProjectConfigPath } from "./paths.js";

export const REAL_CLEANUP_ACKNOWLEDGEMENT = "I_UNDERSTAND_REAL_CLEANUP_TERMINATES_PROCESSES";

export const DEFAULT_CONFIG = Object.freeze({
  host: {
    expectedProfile: null,
  },
  watcher: {
    enabled: false,
    intervalSeconds: 300,
    writeSnapshots: true,
  },
  ledger: {
    maxSnapshots: 120,
    maxEvents: 400,
    storeCommandLines: false,
    storeAllProcesses: false,
  },
  scan: {
    minAgeMinutes: 20,
    cpuIdlePercent: 1.0,
    maxCommandLineLength: 420,
    cacheTtlMs: 1500,
    cacheForAuditBundle: true,
    refreshBeforeRealCleanup: true,
  },
  cleanup: {
    defaultScope: "owned_current_session",
    requireConfirmToken: true,
    realExecutionEnabled: false,
    realExecutionSourceMustBeInstallConfig: true,
    realExecutionAcknowledgement: null,
    allowedModes: ["manual_confirmed_managed"],
    manualMaxProcessesPerRun: 3,
    manualCooldownMinutes: 15,
    evidenceRequired: true,
    defaultSignal: "SIGTERM",
    allowTreeKill: false,
    tokenTtlSeconds: 900,
    graceMs: 1200,
    browserRequiresExplicitPid: true,
  },
  autoCleanup: {
    enabled: false,
    action: "plan_only",
    mode: "manual_reconcile",
    scope: "owned_current_session",
    allowedOwnershipLevels: ["managed_strong"],
    requireHostBinding: true,
    requireValidTemporalParentChain: true,
    requirePreviousOwnedObservation: true,
    requirePreviousOwnedHostChain: true,
    requireRisk: "safe",
    requireStableIdleSnapshots: 2,
    minAgeMinutes: 30,
    excludeBrowsers: true,
    excludeShells: true,
    excludeVisibleWindows: true,
    excludeHostRoots: true,
    excludeProtected: true,
    maxProcessesPerRun: 3,
    maxProcessesPerSession: 10,
    cooldownMinutes: 15,
    allowForce: false,
    allowTreeKill: false,
    writeEvidenceBundle: true,
    configSourceMustBeInstallConfig: true,
    acknowledgement: null,
  },
  matching: {
    codexKeywords: [
      "codex.exe",
      "codex app-server",
      ".codex",
      "openai/codex",
      "openai\\codex",
      "openai/codex",
      "openai codex",
    ],
    codexPathKeywords: [
      ".codex",
      "openai/codex",
      "openai\\codex",
      "appdata/local/openai/codex",
      "library/application support/openai/codex",
    ],
    mcpKeywords: [
      "mcp-server",
      "mcp_servers",
      "modelcontextprotocol",
      "@modelcontextprotocol",
      "chrome-devtools-mcp",
      "mcp-sqlalchemy",
      "node_repl",
      "playwright-mcp",
      "filesystem-mcp",
      "browser_data",
      ".browser_data",
    ],
    toolProcessNames: [
      "node",
      "node.exe",
      "npm",
      "npm.cmd",
      "npx",
      "npx.cmd",
      "pnpm",
      "pnpm.cmd",
      "bun",
      "bun.exe",
      "uvx",
      "uvx.exe",
      "uv",
      "uv.exe",
      "python",
      "python.exe",
      "python3",
      "python3.exe",
      "cmd.exe",
      "powershell.exe",
      "pwsh.exe",
      "bash",
      "sh",
      "zsh",
    ],
    browserProcessNames: [
      "chrome",
      "chrome.exe",
      "chromium",
      "chromium.exe",
      "msedge",
      "msedge.exe",
      "firefox",
      "firefox.exe",
      "brave",
      "brave.exe",
    ],
    protectedNames: [
      "system",
      "system idle process",
      "launchd",
      "kernel_task",
      "init",
      "systemd",
      "explorer.exe",
      "finder",
      "windowserver",
      "loginwindow",
      "services.exe",
      "lsass.exe",
      "winlogon.exe",
      "csrss.exe",
      "smss.exe",
      "code",
      "code.exe",
      "cursor",
      "cursor.exe",
      "codex",
      "codex.exe",
    ],
  },
  profiles: {
    hosts: {
      codex: {
        enabled: true,
        confidence: "signal",
        match: {
          processNames: ["codex", "codex.exe"],
          commandLineIncludes: ["codex app-server", ".codex"],
          pathIncludes: ["OpenAI/Codex", "OpenAI\\Codex", ".codex"],
        },
      },
      claude_code: {
        enabled: true,
        confidence: "signal",
        match: {
          processNames: ["claude", "claude.exe"],
          commandLineIncludes: [".claude", "claude mcp"],
          pathIncludes: [".claude"],
        },
      },
      gemini_cli: {
        enabled: true,
        confidence: "signal",
        match: {
          processNames: ["gemini", "gemini.exe"],
          commandLineIncludes: [".gemini", "gemini mcp"],
          pathIncludes: [".gemini"],
        },
      },
      generic_mcp_host: {
        enabled: true,
        confidence: "weak_signal",
        match: {
          commandLineIncludes: ["mcpServers", "mcp_servers", "modelcontextprotocol", "mcp-server"],
        },
      },
    },
    tools: {
      node_npx: {
        enabled: true,
        confidence: "weak_signal",
        match: {
          processNames: ["node", "node.exe", "npx", "npx.cmd", "npm", "npm.cmd"],
          commandLineIncludes: ["@modelcontextprotocol", "mcp-server", "mcp_servers", " npx ", " node ", "pnpm dlx", "bunx "],
        },
      },
      python_uvx: {
        enabled: true,
        confidence: "weak_signal",
        match: {
          processNames: ["python", "python.exe", "python3", "python3.exe", "uvx", "uvx.exe", "uv", "uv.exe"],
          commandLineIncludes: ["uvx ", "python -m", "modelcontextprotocol", "mcp-server"],
        },
      },
      chrome_devtools: {
        enabled: true,
        confidence: "signal",
        match: {
          processNames: ["chrome", "chrome.exe", "chromium", "chromium.exe", "msedge", "msedge.exe"],
          commandLineIncludes: ["chrome-devtools-mcp", "--remote-debugging-port", ".browser_data"],
        },
        safety: {
          requiresExplicitPid: true,
        },
      },
      playwright: {
        enabled: true,
        confidence: "signal",
        match: {
          commandLineIncludes: ["playwright", "--user-data-dir", "headless"],
        },
        safety: {
          requiresExplicitPid: true,
        },
      },
      dev_server: {
        enabled: true,
        confidence: "weak_signal",
        match: {
          commandLineIncludes: ["vite", "next dev", "webpack-dev-server", "tsx watch"],
        },
        safety: {
          defaultOwnership: "unknown_owner",
        },
      },
      repl_shell: {
        enabled: true,
        confidence: "weak_signal",
        match: {
          processNames: ["cmd.exe", "powershell.exe", "pwsh.exe", "bash", "sh", "zsh"],
        },
      },
    },
  },
});

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function mergeDeep(base, override) {
  if (!isPlainObject(override)) return structuredClone(base);
  const out = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = mergeDeep(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function loadConfig(explicitPath) {
  const trustProjectConfig = isEnvEnabled(process.env.CPE_TRUST_PROJECT_CONFIG);
  const projectConfigPath = getProjectConfigPath();
  const installConfigPath = path.join(getInstallHome(), "config.json");
  const paths = explicitPath ? [explicitPath] : getDefaultConfigPaths({ includeProjectConfig: trustProjectConfig });
  let config = structuredClone(DEFAULT_CONFIG);
  const loadedPaths = [];
  const sources = [];
  const errors = [];
  const blockedPaths = [];

  if (!explicitPath && !trustProjectConfig && fs.existsSync(projectConfigPath)) {
    blockedPaths.push({
      path: projectConfigPath,
      reason: "project_config_requires_CPE_TRUST_PROJECT_CONFIG_or_explicit_config",
    });
  }

  for (const candidate of paths) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
      config = mergeDeep(config, parsed);
      loadedPaths.push(candidate);
      sources.push(configSource(candidate, parsed, { explicitPath, installConfigPath, projectConfigPath }));
    } catch (error) {
      errors.push({ path: candidate, error: error.message });
    }
  }

  applyEnvOverrides(config);
  const configMeta = buildConfigMeta({
    explicitPath,
    installConfigPath,
    projectConfigPath,
    trustProjectConfig,
    sources,
    config,
  });
  enforceUnsafeConfigGuards(config, { explicitPath, loadedPaths, configMeta });
  configMeta.cleanupRealExecutionEffective = Boolean(config.cleanup.realExecutionEnabled);
  configMeta.requireConfirmTokenEffective = true;
  Object.defineProperty(config, "__configMeta", {
    value: configMeta,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return { config, loadedPaths, errors, blockedPaths, configMeta };
}

function enforceUnsafeConfigGuards(config, { explicitPath, loadedPaths, configMeta }) {
  const projectConfigPath = getProjectConfigPath();
  const projectConfigLoadedImplicitly = !explicitPath && loadedPaths.includes(projectConfigPath);
  if (projectConfigLoadedImplicitly) {
    config.autoCleanup.enabled = false;
    config.autoCleanup.action = "plan_only";
  }

  // v0.6.1 safety invariant: real cleanup always requires a confirm token.
  // Config may expose the legacy setting for compatibility, but cannot disable
  // the runtime gate.
  config.cleanup.requireConfirmToken = true;

  if (!configMeta?.cleanupRealExecutionTrusted) {
    config.cleanup.realExecutionEnabled = false;
  }
}

function applyEnvOverrides(config) {
  if (process.env.CPE_HOST_PROFILE) {
    config.host.expectedProfile = String(process.env.CPE_HOST_PROFILE).trim() || null;
  }

  if (process.env.CPE_WATCHER_ENABLED !== undefined) {
    config.watcher.enabled = isEnvEnabled(process.env.CPE_WATCHER_ENABLED);
  }

  if (process.env.CPE_WATCH_INTERVAL_SECONDS) {
    const parsed = Number(process.env.CPE_WATCH_INTERVAL_SECONDS);
    if (Number.isFinite(parsed) && parsed > 0) config.watcher.intervalSeconds = parsed;
  }

  if (process.env.CPE_MIN_AGE_MINUTES) {
    const parsed = Number(process.env.CPE_MIN_AGE_MINUTES);
    if (Number.isFinite(parsed) && parsed >= 0) config.scan.minAgeMinutes = parsed;
  }

  if (process.env.CPE_STORE_COMMAND_LINES !== undefined) {
    config.ledger.storeCommandLines = !["0", "false", "no", "off"].includes(
      process.env.CPE_STORE_COMMAND_LINES.toLowerCase(),
    );
  }
}

function buildConfigMeta({ explicitPath, installConfigPath, projectConfigPath, trustProjectConfig, sources, config }) {
  const autoCleanupSources = sources.filter((source) => source.touchesAutoCleanup);
  const autoCleanupTerminateTrusted = Boolean(
    autoCleanupSources.length > 0 &&
      autoCleanupSources.every((source) => source.trustedForAutoCleanupTerminate) &&
      autoCleanupSources.some((source) => isSamePath(source.path, installConfigPath)),
  );
  const cleanupSources = sources.filter((source) => source.touchesCleanupPolicy);
  const cleanupRealExecutionRequested = Boolean(config?.cleanup?.realExecutionEnabled);
  const cleanupRealExecutionTrusted = Boolean(
    cleanupRealExecutionRequested &&
      config?.cleanup?.realExecutionAcknowledgement === REAL_CLEANUP_ACKNOWLEDGEMENT &&
      cleanupSources.length > 0 &&
      cleanupSources.every((source) => source.trustedForCleanupRealExecution) &&
      cleanupSources.some((source) => isSamePath(source.path, installConfigPath)),
  );

  return {
    explicitPath: explicitPath || null,
    installConfigPath,
    projectConfigPath,
    trustProjectConfig,
    sources,
    autoCleanupTerminateTrusted,
    cleanupRealExecutionTrusted,
    cleanupRealExecutionRequested,
    cleanupRealExecutionAcknowledgementRequired: REAL_CLEANUP_ACKNOWLEDGEMENT,
    trustPolicy: {
      autoCleanupTerminate: autoCleanupTerminateTrusted
        ? "trusted_install_config"
        : "blocked_unless_declared_in_install_config",
      cleanupRealExecution: cleanupRealExecutionTrusted
        ? "trusted_install_config"
        : "blocked_unless_declared_in_install_config_with_acknowledgement",
    },
  };
}

function configSource(candidate, parsed, { explicitPath, installConfigPath, projectConfigPath }) {
  const resolved = path.resolve(candidate);
  const sourceType = isSamePath(resolved, installConfigPath)
    ? "install"
    : isSamePath(resolved, projectConfigPath)
      ? "project"
      : explicitPath
        ? "explicit"
        : "user_or_legacy";

  return {
    path: candidate,
    resolvedPath: resolved,
    sourceType,
    explicit: Boolean(explicitPath),
    touchesAutoCleanup: hasOwn(parsed, "autoCleanup"),
    touchesCleanupPolicy: hasOwn(parsed, "cleanup"),
    trustedForAutoCleanupTerminate: sourceType === "install",
    trustedForCleanupRealExecution: sourceType === "install",
  };
}

function hasOwn(value, key) {
  return isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function isSamePath(left, right) {
  if (!left || !right) return false;
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function isEnvEnabled(value) {
  if (value === undefined || value === null) return false;
  return !["0", "false", "no", "off", ""].includes(String(value).trim().toLowerCase());
}

export function normalizeScope(scope) {
  const value = String(scope || "safe").toLowerCase();
  if (value === "safe") return "owned_current_session";
  if (["owned_current_session", "related_unowned", "unknown_owner", "all", "explicit_pids"].includes(value)) return value;
  return "owned_current_session";
}
