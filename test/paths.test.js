import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { getDefaultConfigPaths, getDefaultDataDir, getInstallHome, getProjectConfigPath } from "../src/paths.js";

test("default install home is the canonical user directory", () => {
  const expectedHome = path.join(os.homedir(), ".clean-process-ended");
  assert.equal(getInstallHome(), expectedHome);
  assert.equal(getDefaultDataDir(), path.join(expectedHome, "data"));
  assert.ok(getDefaultConfigPaths().includes(path.join(expectedHome, "config.json")));
  assert.ok(!getDefaultConfigPaths().includes(getProjectConfigPath()));
  assert.ok(getDefaultConfigPaths({ includeProjectConfig: true }).includes(getProjectConfigPath()));
});

test("CLEAN_PROCESS_ENDED_HOME overrides the install home", () => {
  const previous = process.env.CLEAN_PROCESS_ENDED_HOME;
  const customHome = path.join(os.tmpdir(), "cpe-install-home");

  try {
    process.env.CLEAN_PROCESS_ENDED_HOME = customHome;
    assert.equal(getInstallHome(), path.resolve(customHome));
    assert.equal(getDefaultDataDir(), path.join(path.resolve(customHome), "data"));
    assert.ok(getDefaultConfigPaths().includes(path.join(path.resolve(customHome), "config.json")));
  } finally {
    if (previous === undefined) {
      delete process.env.CLEAN_PROCESS_ENDED_HOME;
    } else {
      process.env.CLEAN_PROCESS_ENDED_HOME = previous;
    }
  }
});
