import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../src/config.js";
import { analyzeSnapshot } from "../src/classifier.js";
import { cleanupDecision } from "../src/cleanup.js";
import { parsePosixPsLine, resolvePowerShellExecutable } from "../src/scanner.js";

function fakeSnapshot(processes) {
  return {
    scannedAt: new Date().toISOString(),
    scannedAtMs: Date.now(),
    platform: process.platform,
    processCount: processes.length,
    processes,
    errors: [],
  };
}

function fakeSession(startedAtMs = Date.now() - 1000) {
  return {
    mcpInstanceId: "mcp_test",
    sessionEpochId: "epoch_test",
    startedAt: new Date(startedAtMs).toISOString(),
    startedAtMs,
  };
}

function configForHost(profile) {
  const config = structuredClone(DEFAULT_CONFIG);
  config.host.expectedProfile = profile;
  return config;
}

function fakeLedger({ baselinePids = [] } = {}) {
  const baseline = new Set(baselinePids);
  return {
    isProcessInSessionBaseline: (proc) => baseline.has(proc.pid),
    getSessionProcessObservation: () => null,
    wasProcessRelated: () => false,
  };
}

test("resolvePowerShellExecutable accepts default and trusted PowerShell executables", () => {
  assert.equal(resolvePowerShellExecutable(""), "powershell.exe");
  assert.equal(resolvePowerShellExecutable("powershell.exe"), "powershell.exe");
  assert.equal(resolvePowerShellExecutable("pwsh.exe"), "pwsh.exe");
  assert.equal(
    resolvePowerShellExecutable('"C:\\Program Files\\PowerShell\\7\\pwsh.exe"'),
    "C:\\Program Files\\PowerShell\\7\\pwsh.exe"
  );
});

test("resolvePowerShellExecutable rejects arbitrary binaries and shell-like arguments", () => {
  assert.throws(
    () => resolvePowerShellExecutable("cmd.exe"),
    /CPE_POWERSHELL must point to powershell\.exe or pwsh\.exe/
  );
  assert.throws(
    () => resolvePowerShellExecutable("pwsh.exe -NoProfile"),
    /CPE_POWERSHELL must point to powershell\.exe or pwsh\.exe/
  );
});

test("classifies session-born MCP child with Codex ancestor as owned_current_session safe", () => {
  const startedAtMs = Date.now() - 5000;
  const processes = [
    {
      pid: 100,
      ppid: 1,
      name: "Codex.exe",
      executablePath: "C:/Users/demo/AppData/Local/OpenAI/Codex/Codex.exe",
      commandLine: "Codex.exe",
      createTimeMs: startedAtMs - 10000,
      ageSeconds: 7200,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
    {
      pid: 200,
      ppid: 100,
      name: "node.exe",
      executablePath: "C:/Program Files/nodejs/node.exe",
      commandLine: "node C:/Users/demo/.codex/mcp_servers/filesystem-mcp/index.js",
      createTimeMs: startedAtMs + 1000,
      ageSeconds: 3600,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
  ];

  const result = analyzeSnapshot(fakeSnapshot(processes), configForHost("codex"), fakeLedger(), {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const child = result.candidates.find((item) => item.pid === 200);
  assert.equal(child.ownership, "owned_current_session");
  assert.equal(child.internalOwnershipLevel, "owned_current_session_by_host_chain");
  assert.equal(child.risk, "safe");
  assert.equal(child.cleanupAllowedByDefault, true);
  assert.ok(child.reasons.includes("codex_ancestor"));
  assert.equal(result.report.internalOwnership.owned_current_session_by_host_chain, 1);
  assert.equal(result.report.topCandidates[0].internalOwnershipLevel, "owned_current_session_by_host_chain");
});

test("preexisting MCP child is related_unowned and not cleanup eligible", () => {
  const startedAtMs = Date.now();
  const processes = [
    {
      pid: 100,
      ppid: 1,
      name: "Codex.exe",
      executablePath: "C:/Users/demo/AppData/Local/OpenAI/Codex/Codex.exe",
      commandLine: "Codex.exe",
      createTimeMs: startedAtMs - 10000,
      ageSeconds: 7200,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
    {
      pid: 200,
      ppid: 100,
      name: "node.exe",
      executablePath: "C:/Program Files/nodejs/node.exe",
      commandLine: "node C:/Users/demo/.codex/mcp_servers/chrome-devtools-mcp/index.js",
      createTimeMs: startedAtMs - 9000,
      ageSeconds: 3600,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
  ];

  const result = analyzeSnapshot(fakeSnapshot(processes), configForHost("codex"), fakeLedger({ baselinePids: [200] }), {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const child = result.candidates.find((item) => item.pid === 200);
  assert.equal(child.ownership, "related_unowned");
  assert.equal(child.internalOwnershipLevel, "related_preexisting");
  assert.equal(child.cleanupAllowedByDefault, false);
  assert.ok(child.blockers.includes("preexisting_at_session_baseline"));
});

test("does not classify Codex root process as cleanup candidate", () => {
  const processes = [
    {
      pid: 100,
      ppid: 1,
      name: "Codex.exe",
      executablePath: "C:/Users/demo/AppData/Local/OpenAI/Codex/Codex.exe",
      commandLine: "Codex.exe",
      ageSeconds: 7200,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
  ];

  const result = analyzeSnapshot(fakeSnapshot(processes), DEFAULT_CONFIG, null, { minAgeMinutes: 20 });
  assert.equal(result.candidates.length, 0);
});

test("browser process with browser_data is not safe by default", () => {
  const startedAtMs = Date.now() - 5000;
  const processes = [
    {
      pid: 100,
      ppid: 1,
      name: "Codex.exe",
      executablePath: "C:/Users/demo/AppData/Local/OpenAI/Codex/Codex.exe",
      commandLine: "Codex.exe",
      createTimeMs: startedAtMs - 10000,
      ageSeconds: 7200,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
    {
      pid: 201,
      ppid: 100,
      name: "chrome.exe",
      executablePath: "C:/Program Files/Chrome/chrome.exe",
      commandLine: "chrome.exe --user-data-dir=C:/Users/demo/.browser_data --headless",
      createTimeMs: startedAtMs + 1000,
      ageSeconds: 3600,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
  ];

  const result = analyzeSnapshot(fakeSnapshot(processes), configForHost("codex"), fakeLedger(), {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const browser = result.candidates.find((item) => item.pid === 201);
  assert.notEqual(browser.risk, "safe");
  assert.equal(browser.cleanupAllowedByDefault, false);
  assert.ok(browser.blockers.includes("browser_process_requires_explicit_pid"));
  assert.ok(browser.blockers.includes("browser_process_cleanup_disabled"));
});

test("browser process cleanup is hard-blocked even with explicit PID scope", () => {
  const decision = cleanupDecision(
    {
      pid: 202,
      name: "chrome.exe",
      isCandidate: true,
      ownership: "owned_current_session",
      risk: "probable",
      blockers: ["browser_process_cleanup_disabled"],
    },
    { scope: "explicit_pids", pids: [202] },
  );
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, "browser_process_cleanup_disabled");
});

test("common npx dev server is not safe just because it uses npx", () => {
  const processes = [
    {
      pid: 300,
      ppid: 1,
      name: "node.exe",
      executablePath: "C:/Program Files/nodejs/node.exe",
      commandLine: "npx vite --host 127.0.0.1",
      createTimeMs: Date.now() - 60000,
      ageSeconds: 3600,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
  ];

  const result = analyzeSnapshot(fakeSnapshot(processes), DEFAULT_CONFIG, fakeLedger(), {
    minAgeMinutes: 20,
    sessionContext: fakeSession(Date.now() - 5000),
  });
  const item = result.analyses.find((candidate) => candidate.pid === 300);
  assert.notEqual(item.risk, "safe");
  assert.equal(item.cleanupAllowedByDefault, false);
});

test("host binding is required before a session-born process can be owned", () => {
  const startedAtMs = Date.now() - 5000;
  const processes = [
    {
      pid: 100,
      ppid: 1,
      name: "Codex.exe",
      executablePath: "C:/Users/demo/AppData/Local/OpenAI/Codex/Codex.exe",
      commandLine: "Codex.exe",
      createTimeMs: startedAtMs - 10000,
      ageSeconds: 7200,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
    {
      pid: 200,
      ppid: 100,
      name: "node.exe",
      executablePath: "C:/Program Files/nodejs/node.exe",
      commandLine: "node C:/Users/demo/.codex/mcp_servers/filesystem-mcp/index.js",
      createTimeMs: startedAtMs + 1000,
      ageSeconds: 3600,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
  ];

  const result = analyzeSnapshot(fakeSnapshot(processes), DEFAULT_CONFIG, fakeLedger(), {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const child = result.candidates.find((item) => item.pid === 200);
  assert.equal(child.ownership, "related_unowned");
  assert.equal(child.cleanupAllowedByDefault, false);
  assert.ok(child.blockers.includes("missing_host_binding"));
});

test("a different expected host profile cannot own another host process", () => {
  const startedAtMs = Date.now() - 5000;
  const processes = [
    {
      pid: 101,
      ppid: 1,
      name: "gemini.exe",
      executablePath: "C:/Users/demo/.gemini/gemini.exe",
      commandLine: "gemini mcp",
      createTimeMs: startedAtMs - 10000,
      ageSeconds: 7200,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
    {
      pid: 201,
      ppid: 101,
      name: "node.exe",
      executablePath: "C:/Program Files/nodejs/node.exe",
      commandLine: "node C:/Users/demo/.gemini/mcp_servers/filesystem-mcp/index.js",
      createTimeMs: startedAtMs + 1000,
      ageSeconds: 3600,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
  ];

  const result = analyzeSnapshot(fakeSnapshot(processes), configForHost("codex"), fakeLedger(), {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const child = result.candidates.find((item) => item.pid === 201);
  assert.equal(child.ownership, "related_unowned");
  assert.equal(child.internalOwnershipLevel, "related_cross_host");
  assert.equal(child.cleanupAllowedByDefault, false);
  assert.ok(child.blockers.includes("host_profile_mismatch"));
});

test("self command line gemini mcp-server is not owned without host parent chain", () => {
  const startedAtMs = Date.now() - 5000;
  const processes = [
    {
      pid: 500,
      ppid: 1,
      name: "python.exe",
      executablePath: "C:/Python/python.exe",
      commandLine: "python ./gemini-mcp-server-example.py",
      createTimeMs: startedAtMs + 1000,
      ageSeconds: 3600,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
  ];

  const result = analyzeSnapshot(fakeSnapshot(processes), configForHost("gemini_cli"), fakeLedger(), {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const child = result.candidates.find((item) => item.pid === 500);
  assert.equal(child.ownership, "related_unowned");
  assert.equal(child.internalOwnershipLevel, "related_cross_host");
  assert.equal(child.cleanupAllowedByDefault, false);
  assert.equal(child.signals.expectedHostMatched, false);
  assert.ok(child.blockers.includes("host_profile_mismatch"));
});

test(".codex path in child command line without host parent is related_unowned", () => {
  const startedAtMs = Date.now() - 5000;
  const processes = [
    {
      pid: 501,
      ppid: 1,
      name: "node.exe",
      executablePath: "C:/Program Files/nodejs/node.exe",
      commandLine: "node C:/Users/demo/.codex/mcp_servers/filesystem-mcp/index.js",
      createTimeMs: startedAtMs + 1000,
      ageSeconds: 3600,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
  ];

  const result = analyzeSnapshot(fakeSnapshot(processes), configForHost("codex"), fakeLedger(), {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const child = result.candidates.find((item) => item.pid === 501);
  assert.equal(child.ownership, "related_unowned");
  assert.equal(child.cleanupAllowedByDefault, false);
  assert.ok(child.ownershipEvidence.evidence.includes("expected_host_self_match_only"));
});

test("named host root processes are never cleanup candidates", () => {
  const startedAtMs = Date.now() - 5000;
  const roots = [
    ["claude_code", "claude.exe", "claude mcp-server"],
    ["gemini_cli", "gemini.exe", "gemini mcp-server"],
    ["qwen_code", "qwen.exe", "qwen mcp-server"],
  ];

  for (const [profile, name, commandLine] of roots) {
    const processes = [
      {
        pid: 600,
        ppid: 1,
        name,
        executablePath: `C:/Users/demo/${name}`,
        commandLine,
        createTimeMs: startedAtMs + 1000,
        ageSeconds: 3600,
        cpuPercent: 0,
        hasVisibleWindow: false,
      },
    ];

    const result = analyzeSnapshot(fakeSnapshot(processes), configForHost(profile), fakeLedger(), {
      minAgeMinutes: 20,
      sessionContext: fakeSession(startedAtMs),
    });
    const root = result.analyses.find((item) => item.pid === 600);
    assert.equal(root.isCandidate, false);
    assert.equal(root.cleanupAllowedByDefault, false);
    assert.ok(root.blockers.includes("host_root_process_not_a_cleanup_target"));
  }
});

test("orphan can remain owned only after prior owned observation with expected host chain", () => {
  const startedAtMs = Date.now() - 5000;
  const processes = [
    {
      pid: 700,
      ppid: 99999,
      name: "node.exe",
      executablePath: "C:/Program Files/nodejs/node.exe",
      commandLine: "node C:/Users/demo/.codex/mcp_servers/filesystem-mcp/index.js",
      createTimeMs: startedAtMs + 1000,
      ageSeconds: 3600,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
  ];
  const ledger = {
    isProcessInSessionBaseline: () => false,
    getSessionProcessObservation: () => ({
      firstOwnership: "owned_current_session",
      firstHadExpectedHostChain: true,
      lastOwnership: "owned_current_session",
      lastHadExpectedHostChain: false,
    }),
    wasProcessRelated: () => true,
  };

  const result = analyzeSnapshot(fakeSnapshot(processes), configForHost("codex"), ledger, {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const orphan = result.candidates.find((item) => item.pid === 700);
  assert.equal(orphan.ownership, "owned_current_session");
  assert.equal(orphan.internalOwnershipLevel, "previously_owned_observed_orphan");
  assert.equal(orphan.cleanupAllowedByDefault, true);
  assert.ok(orphan.ownershipEvidence.evidence.includes("previously_owned_with_expected_host_chain"));
  assert.ok(orphan.ownershipEvidence.evidence.includes("internal_ownership_level:previously_owned_observed_orphan"));
});

test("parent PID reuse cannot create owned_current_session through impossible parent chain", () => {
  const startedAtMs = Date.now() - 5000;
  const childCreatedAt = startedAtMs + 1000;
  const processes = [
    {
      pid: 1000,
      ppid: 1,
      name: "Codex.exe",
      executablePath: "C:/Users/demo/AppData/Local/OpenAI/Codex/Codex.exe",
      commandLine: "Codex.exe",
      createTimeMs: childCreatedAt + 60_000,
      ageSeconds: 7200,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
    {
      pid: 9000,
      ppid: 1000,
      name: "node.exe",
      executablePath: "C:/Program Files/nodejs/node.exe",
      commandLine: "node C:/Users/demo/.codex/mcp_servers/filesystem-mcp/index.js",
      createTimeMs: childCreatedAt,
      ageSeconds: 3600,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
  ];

  const result = analyzeSnapshot(fakeSnapshot(processes), configForHost("codex"), fakeLedger(), {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const child = result.candidates.find((item) => item.pid === 9000);
  assert.equal(child.ownership, "related_unowned");
  assert.equal(child.internalOwnershipLevel, "related_tool_context");
  assert.equal(child.cleanupAllowedByDefault, false);
  assert.ok(child.blockers.includes("invalid_parent_temporal_order"));
  assert.equal(child.signals.expectedHostChainMatched, false);
});

test("CPE_HOST_PROFILE=codex in parent command does not create codex ancestor evidence", () => {
  const startedAtMs = Date.now() - 5000;
  const processes = [
    {
      pid: 800,
      ppid: 1,
      name: "bash",
      executablePath: "/usr/bin/bash",
      commandLine: "CPE_HOST_PROFILE=codex bash",
      createTimeMs: startedAtMs - 10000,
      ageSeconds: 7200,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
    {
      pid: 801,
      ppid: 800,
      name: "head",
      executablePath: "/usr/bin/head",
      commandLine: "head -n 1 file.txt",
      createTimeMs: startedAtMs + 1000,
      ageSeconds: 3600,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
  ];

  const result = analyzeSnapshot(fakeSnapshot(processes), configForHost("codex"), fakeLedger(), {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const child = result.analyses.find((item) => item.pid === 801);
  assert.equal(child.signals.hasCodexAncestor, false);
  assert.equal(child.isCandidate, false);
});

test("bare gemini word in parent command does not create expected host chain evidence", () => {
  const startedAtMs = Date.now() - 5000;
  const processes = [
    {
      pid: 850,
      ppid: 1,
      name: "node.exe",
      executablePath: "C:/Program Files/nodejs/node.exe",
      commandLine: "node unrelated-gemini-helper.js",
      createTimeMs: startedAtMs - 10000,
      ageSeconds: 7200,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
    {
      pid: 851,
      ppid: 850,
      name: "python.exe",
      executablePath: "C:/Python/python.exe",
      commandLine: "python ./mcp-server-example.py",
      createTimeMs: startedAtMs + 1000,
      ageSeconds: 3600,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
  ];

  const result = analyzeSnapshot(fakeSnapshot(processes), configForHost("gemini_cli"), fakeLedger(), {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const child = result.candidates.find((item) => item.pid === 851);
  assert.equal(child.ownership, "related_unowned");
  assert.equal(child.cleanupAllowedByDefault, false);
  assert.equal(child.signals.expectedHostChainMatched, false);
  assert.ok(child.blockers.includes("host_profile_mismatch"));
});

test("host markers in parent command line are context, not ownership evidence", () => {
  const cases = [
    ["codex", ".codex"],
    ["claude_code", ".claude"],
    ["gemini_cli", ".gemini"],
    ["qwen_code", ".qwen"],
  ];

  for (const [profile, marker] of cases) {
    const startedAtMs = Date.now() - 5000;
    const processes = [
      {
        pid: 860,
        ppid: 1,
        name: "bash",
        executablePath: "/usr/bin/bash",
        commandLine: `bash -lc "echo ${marker} unrelated"`,
        createTimeMs: startedAtMs - 10000,
        ageSeconds: 7200,
        cpuPercent: 0,
        hasVisibleWindow: false,
      },
      {
        pid: 861,
        ppid: 860,
        name: "node",
        executablePath: "/usr/bin/node",
        commandLine: "node /tmp/mcp-server-example.js",
        createTimeMs: startedAtMs + 1000,
        ageSeconds: 3600,
        cpuPercent: 0,
        hasVisibleWindow: false,
      },
    ];

    const result = analyzeSnapshot(fakeSnapshot(processes), configForHost(profile), fakeLedger(), {
      minAgeMinutes: 20,
      sessionContext: fakeSession(startedAtMs),
    });
    const child = result.candidates.find((item) => item.pid === 861);
    assert.equal(child.ownership, "related_unowned", profile);
    assert.equal(child.internalOwnershipLevel, "related_tool_context", profile);
    assert.equal(child.signals.expectedHostMatched, true, profile);
    assert.equal(child.signals.expectedHostChainMatched, false, profile);
    assert.equal(child.signals.expectedHostWeakChainContextMatched, true, profile);
    assert.equal(child.cleanupAllowedByDefault, false, profile);
    assert.ok(child.ownershipEvidence.evidence.includes("expected_host_weak_chain_context_matched"), profile);
  }
});

test("host markers in parent cwd are context, not ownership evidence", () => {
  const cases = [
    ["codex", "/tmp/.codex"],
    ["claude_code", "/tmp/.claude"],
    ["gemini_cli", "/tmp/.gemini"],
    ["qwen_code", "/tmp/.qwen"],
  ];

  for (const [profile, cwd] of cases) {
    const startedAtMs = Date.now() - 5000;
    const processes = [
      {
        pid: 862,
        ppid: 1,
        name: "bash",
        executablePath: "/usr/bin/bash",
        cwd,
        commandLine: "bash",
        createTimeMs: startedAtMs - 10000,
        ageSeconds: 7200,
        cpuPercent: 0,
        hasVisibleWindow: false,
      },
      {
        pid: 863,
        ppid: 862,
        name: "node",
        executablePath: "/usr/bin/node",
        commandLine: "node /tmp/mcp-server-example.js",
        createTimeMs: startedAtMs + 1000,
        ageSeconds: 3600,
        cpuPercent: 0,
        hasVisibleWindow: false,
      },
    ];

    const result = analyzeSnapshot(fakeSnapshot(processes), configForHost(profile), fakeLedger(), {
      minAgeMinutes: 20,
      sessionContext: fakeSession(startedAtMs),
    });
    const child = result.candidates.find((item) => item.pid === 863);
    assert.equal(child.ownership, "related_unowned", profile);
    assert.equal(child.internalOwnershipLevel, "related_tool_context", profile);
    assert.equal(child.signals.expectedHostMatched, true, profile);
    assert.equal(child.signals.expectedHostChainMatched, false, profile);
    assert.equal(child.signals.expectedHostWeakChainContextMatched, true, profile);
    assert.equal(child.cleanupAllowedByDefault, false, profile);
    assert.ok(child.hostProfiles.some((item) => item.reasons.includes("chain:cwd_path")), profile);
  }
});

test("host executable path in parent chain remains strong ownership evidence", () => {
  const startedAtMs = Date.now() - 5000;
  const processes = [
    {
      pid: 864,
      ppid: 1,
      name: "launcher",
      executablePath: "/opt/tools/.gemini/gemini-host",
      commandLine: "launcher",
      createTimeMs: startedAtMs - 10000,
      ageSeconds: 7200,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
    {
      pid: 865,
      ppid: 864,
      name: "node",
      executablePath: "/usr/bin/node",
      commandLine: "node /tmp/mcp-server-example.js",
      createTimeMs: startedAtMs + 1000,
      ageSeconds: 3600,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
  ];

  const result = analyzeSnapshot(fakeSnapshot(processes), configForHost("gemini_cli"), fakeLedger(), {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const child = result.candidates.find((item) => item.pid === 865);
  assert.equal(child.ownership, "owned_current_session");
  assert.equal(child.internalOwnershipLevel, "owned_current_session_by_host_chain");
  assert.equal(child.signals.expectedHostChainMatched, true);
  assert.equal(child.cleanupAllowedByDefault, true);
  assert.ok(child.hostProfiles.some((item) => item.reasons.includes("chain:executable_path")));
});

test("weak shell profile alone is not a candidate", () => {
  const processes = [
    {
      pid: 400,
      ppid: 1,
      name: "bash",
      executablePath: "/usr/bin/bash",
      commandLine: "bash",
      createTimeMs: Date.now() - 60000,
      ageSeconds: 3600,
      cpuPercent: 0,
      hasVisibleWindow: false,
    },
  ];

  const result = analyzeSnapshot(fakeSnapshot(processes), configForHost("codex"), fakeLedger(), {
    minAgeMinutes: 20,
    sessionContext: fakeSession(Date.now() - 5000),
  });
  assert.equal(result.candidates.length, 0);
});

test("managed process with strong identity can be owned without host parent chain", () => {
  const startedAtMs = Date.now() - 5000;
  const proc = {
    pid: 9100,
    ppid: 1,
    name: "node.exe",
    executablePath: "C:/Program Files/nodejs/node.exe",
    commandLine: "node C:/Users/demo/.codex/mcp_servers/filesystem-mcp/index.js",
    createTimeMs: startedAtMs + 1000,
    ageSeconds: 3600,
    cpuPercent: 0,
    hasVisibleWindow: false,
  };
  const ledger = {
    isProcessInSessionBaseline: () => false,
    getSessionProcessObservation: () => null,
    wasProcessRelated: () => false,
    findManagedProcessForProc: () => ({
      strong: true,
      managedProcessId: "managed_test",
      matchStatus: "strong",
      pidReuseMismatch: false,
      record: { managedProcessId: "managed_test", hostProfile: "codex" },
    }),
  };

  const result = analyzeSnapshot(fakeSnapshot([proc]), configForHost("codex"), ledger, {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const child = result.candidates.find((item) => item.pid === 9100);
  assert.equal(child.ownership, "owned_current_session");
  assert.equal(child.internalOwnershipLevel, "managed_strong");
  assert.equal(child.cleanupAllowedByDefault, true);
  assert.equal(child.managedProcessId, "managed_test");
  assert.ok(child.ownershipEvidence.evidence.includes("managed_process_identity_match:managed_test"));
  assert.equal(result.report.topCandidates[0].internalOwnershipLevel, "managed_strong");
});

test("managed pid reuse mismatch blocks ownership and cleanup", () => {
  const startedAtMs = Date.now() - 5000;
  const proc = {
    pid: 9101,
    ppid: 1,
    name: "node.exe",
    executablePath: "C:/Program Files/nodejs/node.exe",
    commandLine: "node C:/Users/demo/.codex/mcp_servers/filesystem-mcp/index.js",
    createTimeMs: startedAtMs + 1000,
    ageSeconds: 3600,
    cpuPercent: 0,
    hasVisibleWindow: false,
  };
  const ledger = {
    isProcessInSessionBaseline: () => false,
    getSessionProcessObservation: () => null,
    wasProcessRelated: () => false,
    findManagedProcessForProc: () => ({
      strong: false,
      managedProcessId: "managed_reused",
      matchStatus: "pid_reuse_mismatch",
      pidReuseMismatch: true,
      record: { managedProcessId: "managed_reused", hostProfile: "codex" },
    }),
  };

  const result = analyzeSnapshot(fakeSnapshot([proc]), configForHost("codex"), ledger, {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const child = result.candidates.find((item) => item.pid === 9101);
  assert.equal(child.ownership, "related_unowned");
  assert.equal(child.internalOwnershipLevel, "related_tool_context");
  assert.equal(child.cleanupAllowedByDefault, false);
  assert.ok(child.blockers.includes("managed_pid_reuse_mismatch"));
});

test("managed process with expired lease exposes managed_strong_expired without changing public ownership", () => {
  const startedAtMs = Date.now() - 5000;
  const proc = {
    pid: 9106,
    ppid: 1,
    name: "node.exe",
    executablePath: "C:/Program Files/nodejs/node.exe",
    commandLine: "node C:/Users/demo/.codex/mcp_servers/filesystem-mcp/index.js",
    createTimeMs: startedAtMs + 1000,
    ageSeconds: 3600,
    cpuPercent: 0,
    hasVisibleWindow: false,
  };
  const ledger = {
    isProcessInSessionBaseline: () => false,
    getSessionProcessObservation: () => null,
    wasProcessRelated: () => false,
    findManagedProcessForProc: () => ({
      strong: true,
      managedProcessId: "managed_expired",
      matchStatus: "strong",
      pidReuseMismatch: false,
      record: {
        managedProcessId: "managed_expired",
        hostProfile: "codex",
        leaseExpiresAt: new Date(Date.now() - 1000).toISOString(),
      },
    }),
  };

  const result = analyzeSnapshot(fakeSnapshot([proc]), configForHost("codex"), ledger, {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const child = result.candidates.find((item) => item.pid === 9106);
  assert.equal(child.ownership, "owned_current_session");
  assert.equal(child.internalOwnershipLevel, "managed_strong_expired");
  assert.ok(child.ownershipEvidence.evidence.includes("managed_lease_state:expired"));
});

test("managed process without record hostProfile is related_unowned", () => {
  const startedAtMs = Date.now() - 5000;
  const proc = {
    pid: 9102,
    ppid: 1,
    name: "node.exe",
    executablePath: "C:/Program Files/nodejs/node.exe",
    commandLine: "node C:/Users/demo/.codex/mcp_servers/filesystem-mcp/index.js",
    createTimeMs: startedAtMs + 1000,
    ageSeconds: 3600,
    cpuPercent: 0,
    hasVisibleWindow: false,
  };
  const ledger = {
    isProcessInSessionBaseline: () => false,
    getSessionProcessObservation: () => null,
    wasProcessRelated: () => false,
    findManagedProcessForProc: () => ({
      strong: true,
      managedProcessId: "managed_unbound",
      matchStatus: "strong",
      pidReuseMismatch: false,
      record: { managedProcessId: "managed_unbound" },
    }),
  };

  const result = analyzeSnapshot(fakeSnapshot([proc]), configForHost("codex"), ledger, {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const child = result.candidates.find((item) => item.pid === 9102);
  assert.equal(child.ownership, "related_unowned");
  assert.equal(child.internalOwnershipLevel, "managed_orphan_candidate");
  assert.equal(child.cleanupAllowedByDefault, false);
  assert.ok(child.blockers.includes("managed_record_missing_host_profile"));
});

test("managed process with different record hostProfile is related_unowned", () => {
  const startedAtMs = Date.now() - 5000;
  const proc = {
    pid: 9103,
    ppid: 1,
    name: "node.exe",
    executablePath: "C:/Program Files/nodejs/node.exe",
    commandLine: "node C:/Users/demo/.codex/mcp_servers/filesystem-mcp/index.js",
    createTimeMs: startedAtMs + 1000,
    ageSeconds: 3600,
    cpuPercent: 0,
    hasVisibleWindow: false,
  };
  const ledger = {
    isProcessInSessionBaseline: () => false,
    getSessionProcessObservation: () => null,
    wasProcessRelated: () => false,
    findManagedProcessForProc: () => ({
      strong: true,
      managedProcessId: "managed_other_host",
      matchStatus: "strong",
      pidReuseMismatch: false,
      record: { managedProcessId: "managed_other_host", hostProfile: "claude_code" },
    }),
  };

  const result = analyzeSnapshot(fakeSnapshot([proc]), configForHost("codex"), ledger, {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const child = result.candidates.find((item) => item.pid === 9103);
  assert.equal(child.ownership, "related_unowned");
  assert.equal(child.internalOwnershipLevel, "related_cross_host");
  assert.equal(child.cleanupAllowedByDefault, false);
  assert.ok(child.blockers.includes("managed_host_profile_mismatch"));
});

test("resource impact is reported but does not change ownership or cleanup eligibility", () => {
  const startedAtMs = Date.now() - 5000;
  const proc = {
    pid: 9200,
    ppid: 1,
    name: "node.exe",
    executablePath: "C:/Program Files/nodejs/node.exe",
    commandLine: "node C:/Users/demo/.codex/mcp_servers/filesystem-mcp/index.js",
    createTimeMs: startedAtMs + 1000,
    ageSeconds: 3600,
    cpuPercent: 0,
    rssMb: 4096,
    hasVisibleWindow: false,
  };

  const result = analyzeSnapshot(fakeSnapshot([proc]), configForHost("codex"), fakeLedger(), {
    minAgeMinutes: 20,
    sessionContext: fakeSession(startedAtMs),
  });
  const child = result.candidates.find((item) => item.pid === 9200);
  assert.equal(child.ownership, "related_unowned");
  assert.equal(child.internalOwnershipLevel, "related_tool_context");
  assert.equal(child.cleanupAllowedByDefault, false);
  assert.equal(result.report.resourceImpact.rssMbTotal, 4096);
  assert.deepEqual(result.report.resourceImpact.topByRssMb[0], {
    pid: 9200,
    name: "node.exe",
    rssMb: 4096,
    ownership: "related_unowned",
    risk: child.risk,
  });
});

test("managed pid reuse mismatch blocks cleanup even with explicit pids", () => {
  const decision = cleanupDecision(
    {
      pid: 9104,
      name: "node.exe",
      isCandidate: true,
      ownership: "owned_current_session",
      risk: "probable",
      blockers: ["managed_pid_reuse_mismatch"],
    },
    { scope: "explicit_pids", pids: [9104] },
  );
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, "managed_pid_reuse_mismatch");
});

test("cleanupDecision hard-blocks managed identity blockers before ownership report-only", () => {
  const decision = cleanupDecision(
    {
      pid: 9105,
      name: "node.exe",
      isCandidate: true,
      ownership: "related_unowned",
      risk: "probable",
      blockers: ["managed_record_missing_host_profile"],
    },
    { scope: "explicit_pids", pids: [9105] },
  );
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, "managed_record_missing_host_profile");
});

test("parsePosixPsLine parses ps output", () => {
  const parsed = parsePosixPsLine(" 123 1 3600 0.1 /usr/bin/node node /tmp/.codex/chrome-devtools-mcp/index.js", 1_700_000_000_000);
  assert.equal(parsed.pid, 123);
  assert.equal(parsed.ppid, 1);
  assert.equal(parsed.name, "node");
  assert.equal(parsed.ageSeconds, 3600);
  assert.equal(parsed.cpuPercent, 0.1);
  assert.equal(parsed.createTimeSource, "posix_ps_etimes");
  assert.equal(parsed.createTimeResolutionMs, 1000);
  assert.equal(parsed.createTimeToleranceMs, 2000);
  assert.match(parsed.commandLine, /chrome-devtools-mcp/);
});

test("parsePosixPsLine parses BSD/macOS etime output", () => {
  const parsed = parsePosixPsLine(" 123 1 01:30 0.1 2048 /usr/bin/node node -e setTimeout(() => {}, 3000)", 1_700_000_000_000);
  assert.equal(parsed.pid, 123);
  assert.equal(parsed.ppid, 1);
  assert.equal(parsed.name, "node");
  assert.equal(parsed.ageSeconds, 90);
  assert.equal(parsed.rssBytes, 2_097_152);
  assert.equal(parsed.rssMb, 2);
  assert.equal(parsed.createTimeSource, "posix_ps_etime");
  assert.equal(parsed.createTimeMs, 1_699_999_910_000);
});

test("parsePosixPsLine parses BSD/macOS etime output with days", () => {
  const parsed = parsePosixPsLine(" 123 1 1-02:03:04 0.1 2048 /usr/bin/node node script.js", 1_700_000_000_000);
  assert.equal(parsed.ageSeconds, 93784);
  assert.equal(parsed.createTimeSource, "posix_ps_etime");
  assert.equal(parsed.createTimeMs, 1_699_906_216_000);
});

test("parsePosixPsLine keeps createTimeMs stable inside the same scanned second", () => {
  const line = " 123 1 3600 0.1 /usr/bin/node node /tmp/.codex/chrome-devtools-mcp/index.js";
  const first = parsePosixPsLine(line, 1_700_000_000_123);
  const second = parsePosixPsLine(line, 1_700_000_000_999);
  assert.equal(first.createTimeMs, second.createTimeMs);
});
