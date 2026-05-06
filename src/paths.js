import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const INSTALL_HOME_DIRNAME = ".clean-process-ended";
const LEGACY_APP_DIRNAME = "clean-process-ended-mcp";
const LEGACY_CONFIG_FILENAME = ".clean-process-ended-mcp.json";
const CONFIG_FILENAME = "config.json";

export function getInstallHome() {
  if (process.env.CLEAN_PROCESS_ENDED_HOME) {
    return path.resolve(process.env.CLEAN_PROCESS_ENDED_HOME);
  }

  return path.join(os.homedir(), INSTALL_HOME_DIRNAME);
}

export function getDefaultDataDir() {
  return path.join(getInstallHome(), "data");
}

export function getProjectConfigPath() {
  const cwd = process.cwd();
  return path.join(cwd, ".clean-process-ended.json");
}

export function getDefaultConfigPaths({ includeProjectConfig = false } = {}) {
  const home = os.homedir();
  const installHome = getInstallHome();
  const localName = ".clean-process-ended.json";

  const paths = [];

  if (process.platform === "win32") {
    paths.push(path.join(process.env.USERPROFILE || home, localName));
    paths.push(path.join(process.env.USERPROFILE || home, LEGACY_CONFIG_FILENAME));
    paths.push(path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), LEGACY_APP_DIRNAME, CONFIG_FILENAME));
  } else if (process.platform === "darwin") {
    paths.push(path.join(home, localName));
    paths.push(path.join(home, LEGACY_CONFIG_FILENAME));
    paths.push(path.join(home, "Library", "Application Support", LEGACY_APP_DIRNAME, CONFIG_FILENAME));
  } else {
    paths.push(path.join(home, localName));
    paths.push(path.join(home, LEGACY_CONFIG_FILENAME));
    paths.push(path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), LEGACY_APP_DIRNAME, CONFIG_FILENAME));
  }

  paths.push(path.join(installHome, CONFIG_FILENAME));
  if (includeProjectConfig) paths.push(getProjectConfigPath());
  return paths;
}

export function normalizeForMatching(value) {
  return String(value || "").replace(/\\/g, "/").toLowerCase();
}

export function canonicalizeFilesystemPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const resolved = path.resolve(raw);
  return realpathOrParent(resolved);
}

export function isSameFilesystemPath(left, right) {
  if (!left || !right) return false;
  return comparableFilesystemPath(canonicalizeFilesystemPath(left)) === comparableFilesystemPath(canonicalizeFilesystemPath(right));
}

function realpathOrParent(resolved) {
  const direct = tryRealpath(resolved);
  if (direct) return direct;

  const parent = path.dirname(resolved);
  const parentRealpath = tryRealpath(parent);
  if (parentRealpath) return path.join(parentRealpath, path.basename(resolved));

  return resolved;
}

function tryRealpath(candidate) {
  try {
    return fs.realpathSync.native(candidate);
  } catch {
    return null;
  }
}

function comparableFilesystemPath(value) {
  const resolved = path.resolve(String(value || ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
