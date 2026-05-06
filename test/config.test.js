import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, REAL_CLEANUP_ACKNOWLEDGEMENT } from "../src/config.js";
import { isSameFilesystemPath } from "../src/paths.js";
import { autoCleanupStatus } from "../src/policy.js";

function withTempCwd(callback) {
  const previousCwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpe-config-"));
  process.chdir(dir);
  try {
    return callback(dir);
  } finally {
    process.chdir(previousCwd);
  }
}

test("project config is ignored by default", () => {
  withTempCwd((dir) => {
    const expectedPath = path.join(dir, ".clean-process-ended.json");
    fs.writeFileSync(path.join(dir, ".clean-process-ended.json"), JSON.stringify({ scan: { minAgeMinutes: 987 } }));
    const loaded = loadConfig();
    assert.notEqual(loaded.config.scan.minAgeMinutes, 987);
    assert.equal(hasLoadedPath(loaded, expectedPath), false);
    assert.equal(loaded.blockedPaths[0].reason, "project_config_requires_CPE_TRUST_PROJECT_CONFIG_or_explicit_config");
  });
});

test("project config loads only with explicit opt-in", () => {
  const previous = process.env.CPE_TRUST_PROJECT_CONFIG;
  try {
    process.env.CPE_TRUST_PROJECT_CONFIG = "1";
    withTempCwd((dir) => {
      const expectedPath = path.join(dir, ".clean-process-ended.json");
      fs.writeFileSync(expectedPath, JSON.stringify({ scan: { minAgeMinutes: 987 } }));
      const loaded = loadConfig();
      assert.equal(loaded.config.scan.minAgeMinutes, 987);
      assert.ok(hasLoadedPath(loaded, expectedPath));
      assert.equal(loaded.blockedPaths.length, 0);
    });
  } finally {
    if (previous === undefined) delete process.env.CPE_TRUST_PROJECT_CONFIG;
    else process.env.CPE_TRUST_PROJECT_CONFIG = previous;
  }
});

test("filesystem path identity handles realpath aliases", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpe-path-"));
  const targetDir = path.join(dir, "target");
  const aliasDir = path.join(dir, "alias");
  fs.mkdirSync(targetDir);
  try {
    fs.symlinkSync(targetDir, aliasDir, "dir");
  } catch {
    return;
  }

  const targetFile = path.join(targetDir, "config.json");
  const aliasFile = path.join(aliasDir, "config.json");
  fs.writeFileSync(targetFile, "{}");
  assert.ok(isSameFilesystemPath(targetFile, aliasFile));
});

test("CPE_HOST_PROFILE sets expected host binding", () => {
  const previous = process.env.CPE_HOST_PROFILE;
  try {
    process.env.CPE_HOST_PROFILE = "codex";
    const loaded = loadConfig("missing-config.json");
    assert.equal(loaded.config.host.expectedProfile, "codex");
  } finally {
    if (previous === undefined) delete process.env.CPE_HOST_PROFILE;
    else process.env.CPE_HOST_PROFILE = previous;
  }
});

test("implicit project config cannot enable real auto-cleanup", () => {
  const previous = process.env.CPE_TRUST_PROJECT_CONFIG;
  try {
    process.env.CPE_TRUST_PROJECT_CONFIG = "1";
    withTempCwd((dir) => {
      fs.writeFileSync(
        path.join(dir, ".clean-process-ended.json"),
        JSON.stringify({
          autoCleanup: {
            enabled: true,
            action: "terminate",
            acknowledgement: "I_UNDERSTAND_AUTO_CLEANUP_IS_EXPERIMENTAL",
          },
        }),
      );
      const loaded = loadConfig();
      assert.equal(loaded.config.autoCleanup.enabled, false);
      assert.equal(loaded.config.autoCleanup.action, "plan_only");
      assert.equal(loaded.config.cleanup.requireConfirmToken, true);
    });
  } finally {
    if (previous === undefined) delete process.env.CPE_TRUST_PROJECT_CONFIG;
    else process.env.CPE_TRUST_PROJECT_CONFIG = previous;
  }
});

test("arbitrary explicit config cannot allow terminate auto-cleanup", () => {
  withTempCwd((dir) => {
    const configPath = path.join(dir, "arbitrary-config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        autoCleanup: {
          enabled: true,
          action: "terminate",
          acknowledgement: "I_UNDERSTAND_AUTO_CLEANUP_IS_EXPERIMENTAL",
        },
      }),
    );

    const loaded = loadConfig(configPath);
    const status = autoCleanupStatus(loaded.config, loaded.configMeta);
    assert.equal(status.enabled, true);
    assert.equal(status.terminateAllowed, false);
    assert.ok(status.blockedReasons.includes("auto_cleanup_terminate_requires_install_config"));
    assert.equal(loaded.configMeta.autoCleanupTerminateTrusted, false);
  });
});

test("install config can declare terminate auto-cleanup only with explicit acknowledgement", () => {
  const previousHome = process.env.CLEAN_PROCESS_ENDED_HOME;
  try {
    withTempCwd((dir) => {
      const installHome = path.join(dir, ".clean-process-ended");
      process.env.CLEAN_PROCESS_ENDED_HOME = installHome;
      fs.mkdirSync(installHome, { recursive: true });
      const configPath = path.join(installHome, "config.json");
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          autoCleanup: {
            enabled: true,
            action: "terminate",
            acknowledgement: "I_UNDERSTAND_AUTO_CLEANUP_IS_EXPERIMENTAL",
          },
        }),
      );

      const loaded = loadConfig();
      const status = autoCleanupStatus(loaded.config, loaded.configMeta);
      assert.equal(status.terminateAllowed, false);
      assert.ok(status.blockedReasons.includes("auto_cleanup_terminate_disabled_in_v0_7_plan_only"));
      assert.equal(loaded.configMeta.autoCleanupTerminateTrusted, true);
      assert.equal(loaded.configMeta.sources.at(-1).sourceType, "install");
    });
  } finally {
    if (previousHome === undefined) delete process.env.CLEAN_PROCESS_ENDED_HOME;
    else process.env.CLEAN_PROCESS_ENDED_HOME = previousHome;
  }
});

test("cleanup confirm token cannot be disabled by config", () => {
  withTempCwd((dir) => {
    const configPath = path.join(dir, "arbitrary-config.json");
    fs.writeFileSync(configPath, JSON.stringify({ cleanup: { requireConfirmToken: false } }));

    const loaded = loadConfig(configPath);
    assert.equal(loaded.config.cleanup.requireConfirmToken, true);
    assert.equal(loaded.configMeta.requireConfirmTokenEffective, true);
  });
});

test("real cleanup is disabled by default and from arbitrary explicit config", () => {
  withTempCwd((dir) => {
    const configPath = path.join(dir, "arbitrary-config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        cleanup: {
          realExecutionEnabled: true,
          realExecutionAcknowledgement: REAL_CLEANUP_ACKNOWLEDGEMENT,
        },
      }),
    );

    const loaded = loadConfig(configPath);
    assert.equal(loaded.config.cleanup.realExecutionEnabled, false);
    assert.equal(loaded.configMeta.cleanupRealExecutionRequested, true);
    assert.equal(loaded.configMeta.cleanupRealExecutionTrusted, false);
    assert.equal(loaded.configMeta.cleanupRealExecutionEffective, false);
  });
});

test("install config can enable real cleanup only with explicit acknowledgement", () => {
  const previousHome = process.env.CLEAN_PROCESS_ENDED_HOME;
  try {
    withTempCwd((dir) => {
      const installHome = path.join(dir, ".clean-process-ended");
      process.env.CLEAN_PROCESS_ENDED_HOME = installHome;
      fs.mkdirSync(installHome, { recursive: true });
      const configPath = path.join(installHome, "config.json");
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          cleanup: {
            realExecutionEnabled: true,
            realExecutionAcknowledgement: REAL_CLEANUP_ACKNOWLEDGEMENT,
          },
        }),
      );

      const loaded = loadConfig();
      assert.equal(loaded.config.cleanup.realExecutionEnabled, true);
      assert.equal(loaded.config.cleanup.requireConfirmToken, true);
      assert.equal(loaded.configMeta.cleanupRealExecutionTrusted, true);
      assert.equal(loaded.configMeta.cleanupRealExecutionEffective, true);
    });
  } finally {
    if (previousHome === undefined) delete process.env.CLEAN_PROCESS_ENDED_HOME;
    else process.env.CLEAN_PROCESS_ENDED_HOME = previousHome;
  }
});

test("install config without acknowledgement cannot enable real cleanup", () => {
  const previousHome = process.env.CLEAN_PROCESS_ENDED_HOME;
  try {
    withTempCwd((dir) => {
      const installHome = path.join(dir, ".clean-process-ended");
      process.env.CLEAN_PROCESS_ENDED_HOME = installHome;
      fs.mkdirSync(installHome, { recursive: true });
      fs.writeFileSync(path.join(installHome, "config.json"), JSON.stringify({ cleanup: { realExecutionEnabled: true } }));

      const loaded = loadConfig();
      assert.equal(loaded.config.cleanup.realExecutionEnabled, false);
      assert.equal(loaded.configMeta.cleanupRealExecutionRequested, true);
      assert.equal(loaded.configMeta.cleanupRealExecutionTrusted, false);
    });
  } finally {
    if (previousHome === undefined) delete process.env.CLEAN_PROCESS_ENDED_HOME;
    else process.env.CLEAN_PROCESS_ENDED_HOME = previousHome;
  }
});

function hasLoadedPath(loaded, expectedPath) {
  return loaded.loadedPaths.some((loadedPath) => isSameFilesystemPath(loadedPath, expectedPath));
}
