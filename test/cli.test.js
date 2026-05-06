import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function receiptPayloadHash(receipt) {
  const copy = { ...receipt };
  delete copy.evidence_sha256;
  return crypto.createHash("sha256").update(canonicalJson(copy)).digest("hex");
}

function sha256File(relativePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, relativePath))).digest("hex");
}

function collectPackageFiles() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const out = [];
  const walk = (absolute) => {
    if (!fs.existsSync(absolute)) return;
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolute)) walk(path.join(absolute, entry));
    } else if (stat.isFile()) {
      out.push(path.relative(ROOT, absolute).replace(/\\/g, "/"));
    }
  };
  for (const item of pkg.files || []) walk(path.join(ROOT, item));
  return out.sort();
}

function buildHostNamePattern(codepointsList) {
  const names = codepointsList.map((codepoints) => String.fromCharCode(...codepoints));
  return new RegExp(`\\b(${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
}

test("cpe-run does not write launcher JSON to stdout when wrapping stdio roles", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cpe-cli-"));
  const result = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "bin", "cpe-run.js"),
      "--role",
      "mcp-server",
      "--json",
      "--",
      process.execPath,
      "-e",
      "process.stdout.write('child-stdout')",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, CLEAN_PROCESS_ENDED_HOME: home },
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "child-stdout");
  assert.match(result.stderr, /managedProcessId/);
});

test("validate-package strict-public accepts current registry server.json schema", () => {
  const result = spawnSync(process.execPath, [path.join(ROOT, "bin", "cpe-scan.js"), "validate-package", "--strict-public", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.strictPublic, true);
  assert.equal(payload.failures.length, 0);
});

test("smoke-stdio exits non-zero when MCP handshake fails", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "bin", "cpe-scan.js"),
      "smoke-stdio",
      "--entrypoint",
      path.join(ROOT, "bin", "missing-entrypoint.js"),
      "--json",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
});

test("install-snippet returns npx snippets for core clients", () => {
  const expectedCommands = {
    codex: /^codex mcp add/,
    claude: /^claude mcp add/,
    claude_code: /^claude mcp add/,
    gemini: /^gemini mcp add/,
    gemini_cli: /^gemini mcp add/,
  };
  for (const [client, expectedCommand] of Object.entries(expectedCommands)) {
    const result = spawnSync(process.execPath, [path.join(ROOT, "bin", "cpe-scan.js"), "install-snippet", "--client", client, "--json"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.match(payload.command, /npx -y --package clean-process-ended clean-process-ended-mcp/);
    assert.match(payload.command, expectedCommand);
    assert.match(payload.command, /CPE_HOST_PROFILE=/);
    if (client !== "codex") {
      assert.doesNotMatch(payload.command, /^codex mcp add/, `${client} should not fall back to Codex`);
    }
    assert.match(payload.agentInstruction, /Never request dry_run=false autonomously/);
  }
});

test("agent protocol CLI returns dry-run-only close guidance", () => {
  const result = spawnSync(process.execPath, [path.join(ROOT, "bin", "cpe-scan.js"), "agent-protocol", "--client", "codex", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.mode, "diagnostic_dry_run_beta");
  assert.equal(payload.client, "codex");
  assert.equal(payload.hostProfile, null);
  assert.equal(payload.suggestedHostProfile, "codex");
  assert.equal(payload.hostBindingConfigured, false);
  assert.ok(payload.closeTaskProtocol.includes("process_cleanup(dry_run=true)"));
  assert.ok(payload.neverDo.includes("dry_run_false_autonomously"));
  assert.equal(payload.optionalIntegrations.codexAgentMem.hardDependency, false);
});

test("janitor-discovery CLI alias matches agent-protocol payload", () => {
  const agent = spawnSync(process.execPath, [path.join(ROOT, "bin", "cpe-scan.js"), "agent-protocol", "--client", "codex", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const alias = spawnSync(process.execPath, [path.join(ROOT, "bin", "cpe-scan.js"), "janitor-discovery", "--client", "codex", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(agent.status, 0, agent.stderr || agent.stdout);
  assert.equal(alias.status, 0, alias.stderr || alias.stdout);
  assert.deepEqual(JSON.parse(alias.stdout), JSON.parse(agent.stdout));
});

test("public docs do not contain personal LAB paths", () => {
  const publicFiles = [
    "README.md",
    "README_ES.md",
    "README_DE.md",
    "README_PT_BR.md",
    "README_ZH.md",
    "README_JA.md",
    "CHANGELOG.md",
    "RELEASE_NOTES_v0.7.2.md",
    "SECURITY.md",
    "SUPPORT.md",
    "server.json",
    "docs/README.md",
    "docs/INSTALL.md",
    "docs/CONFIGURATION.md",
    "docs/SAFETY_MODEL.md",
    "docs/MANAGED_LIFECYCLE.md",
    "docs/AUDIT_BUNDLE.md",
    "docs/HOSTS.md",
    "docs/PUBLICATION_READINESS.md",
    "docs/public-positioning.md",
    "docs/release-checklist.md",
    "docs/release-process.md",
    "docs/support-matrix.md",
    "docs/verification/README.md",
    "docs/verification/v0.7.2/README.md",
    "docs/ARCHITECTURE.md",
    "docs/WHEN_TO_USE.md",
    "docs/AGENT_PROTOCOL.md",
    "docs/INTEGRATION_CODEX_AGENT_MEM.md",
    "docs/fixtures/codex-agent-mem/README.md",
    "docs/fixtures/codex-agent-mem/process_janitor_receipt.schema.json",
    "docs/fixtures/codex-agent-mem/process_janitor_receipt.empty.json",
    "docs/fixtures/codex-agent-mem/process_janitor_receipt.with_candidates.json",
    "docs/quickstart.md",
    "docs/design-decisions.md",
    "docs/validation/VALIDATION.md",
    "docs/validation/client-behavior.md",
    "docs/validation/runtime-support.md",
    "docs/validation/evidence/README.md",
    "docs/validation/evidence/codex-v0.7.2.md",
    "docs/validation/evidence/claude-code-v0.7.2.md",
    "docs/validation/evidence/gemini-cli-v0.7.2.md",
    "schemas/process_janitor_receipt.schema.json",
    "schemas/audit_bundle.schema.json",
    "examples/README.md",
  ];
  for (const file of publicFiles) {
    const content = fs.readFileSync(path.join(ROOT, file), "utf8");
    const userNamePattern = String.raw`[^\\/\s]+`;
    const personalPathPattern = new RegExp(`F:\\\\__LAB_desarrollo_IDEAS|C:\\\\Users\\\\${userNamePattern}|\\/Users\\/${userNamePattern}`, "i");
    assert.doesNotMatch(content, personalPathPattern, file);
  }
});

test("packaged public surface does not mention unvalidated host names", () => {
  const unvalidatedHostPattern = buildHostNamePattern([
    [113, 119, 101, 110],
    [113, 119, 101, 110, 95, 99, 111, 100, 101],
    [100, 101, 101, 112, 115, 101, 101, 107],
  ]);
  for (const file of collectPackageFiles()) {
    const content = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.doesNotMatch(content, unvalidatedHostPattern, file);
  }
});

test("localized READMEs carry equivalent public safety and release surface", () => {
  const readmes = [
    "README.md",
    "README_ES.md",
    "README_DE.md",
    "README_PT_BR.md",
    "README_ZH.md",
    "README_JA.md",
  ];
  const requiredSignals = [
    /v0\.7\.2/,
    /clean-process-ended/,
    /CPE_HOST_PROFILE/,
    /codex/,
    /claude_code/,
    /gemini_cli/,
    /session-close-check|session_close_check/,
    /janitor-discovery|janitor_discovery/,
    /codex-agent-mem/,
    /v1\.0\.1/,
    /generic_mcp_host/,
    /visualaimedia\.com/,
    /visualsystemslab\.com/,
    /x\.com\/MarceloCaporale/,
    /dry-run|dry_run/i,
    /related_unowned/,
    /unknown_owner/,
    /Apache-2\.0/,
    /npm run public-beta-candidate/,
    /tarball/i,
  ];
  for (const file of readmes) {
    const content = fs.readFileSync(path.join(ROOT, file), "utf8");
    const headingCount = content.split("\n").filter((line) => line.startsWith("## ")).length;
    assert.equal(headingCount, 15, file);
    for (const signal of requiredSignals) {
      assert.match(content, signal, `${file} missing ${signal}`);
    }
  }
});

test("server.json name and version match package metadata", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const server = JSON.parse(fs.readFileSync(path.join(ROOT, "server.json"), "utf8"));
  assert.equal(server.name, pkg.mcpName);
  assert.equal(server.version, pkg.version);
  assert.equal(server.packages[0].identifier, pkg.name);
  assert.equal(server.packages[0].version, pkg.version);
  assert.equal(server.packages[0].transport.type, "stdio");
});

test("package public files exclude internal and legacy docs", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const files = pkg.files.join("\n");
  assert.doesNotMatch(files, /PROJECTS_STATE|index_project|_BASELINE|_AUDITORIA|LEGACY|WATCHER_LEVEL_2_PLAN/i);
  assert.doesNotMatch(files, /^docs$/m);
  for (const required of [
    "AGENTS.md",
    "CHANGELOG.md",
    "README_DE.md",
    "README_ES.md",
    "README_JA.md",
    "README_PT_BR.md",
    "README_ZH.md",
    "RELEASE_NOTES_v0.7.2.md",
    "SECURITY.md",
    "SUPPORT.md",
    "docs/quickstart.md",
    "docs/design-decisions.md",
    "docs/INSTALL.md",
    "docs/HOSTS.md",
    "docs/support-matrix.md",
    "docs/release-checklist.md",
    "docs/release-process.md",
    "docs/public-positioning.md",
    "docs/verification/README.md",
    "docs/verification/v0.7.2/README.md",
    "docs/WHEN_TO_USE.md",
    "docs/AGENT_PROTOCOL.md",
    "docs/INTEGRATION_CODEX_AGENT_MEM.md",
    "docs/validation/VALIDATION.md",
    "docs/validation/runtime-support.md",
    "docs/validation/client-behavior.md",
    "docs/validation/evidence/codex-v0.7.2.md",
    "docs/verification/v0.7.2/release-gate-summary.md",
    "schemas",
    "examples",
    "scripts/smoke-packed-tarball.mjs",
    "docs/fixtures/codex-agent-mem/process_janitor_receipt.schema.json",
  ]) {
    assert.ok(pkg.files.includes(required), required);
  }
});

test("codex-agent-mem public receipt fixtures use non-null canonical evidence hashes", () => {
  for (const file of [
    "docs/fixtures/codex-agent-mem/process_janitor_receipt.empty.json",
    "docs/fixtures/codex-agent-mem/process_janitor_receipt.with_candidates.json",
  ]) {
    const receipt = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
    assert.equal(receipt.source, "clean-process-ended");
    assert.equal(receipt.external_receipt_kind, "process_janitor");
    assert.equal(receipt.cleanup_real_executed, false);
    assert.equal(receipt.evidence_sha256_scope, "receipt_payload_canonical");
    assert.match(receipt.evidence_sha256, /^[a-f0-9]{64}$/);
    assert.equal(receipt.evidence_sha256, receiptPayloadHash(receipt));
    assert.equal(receipt.command_lines_included, false);
    assert.equal(receipt.raw_process_output_included, false);
    assert.equal(receipt.confirm_token_returned, false);
  }
});

test("codex-agent-mem public fixture SHA256SUMS is current", () => {
  const checksumPath = "docs/fixtures/codex-agent-mem/SHA256SUMS.txt";
  const lines = fs
    .readFileSync(path.join(ROOT, checksumPath), "utf8")
    .trim()
    .split(/\r?\n/);
  for (const line of lines) {
    const [expected, relative] = line.split(/\s+/, 2);
    assert.match(expected, /^[a-f0-9]{64}$/);
    const fixturePath = `docs/fixtures/codex-agent-mem/${relative}`;
    assert.equal(sha256File(fixturePath), expected, fixturePath);
  }
});

test("strict package validation covers public beta release gates", () => {
  const result = spawnSync(process.execPath, [path.join(ROOT, "bin", "cpe-scan.js"), "validate-package", "--strict-public", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  const checks = new Set(payload.checks.map((check) => check.id));
  for (const required of [
    "public_doc_references_in_package",
    "packed_sources_no_personal_paths",
    "github_actions_ci_exists",
    "private_lab_files_gitignored",
    "script:public-beta-candidate",
    "script:public-tree:check",
    "script:package:audit",
    "script:package:smoke-tarball",
    "package_allowlist_not_gitignored",
    "package_audit_level_moderate_or_stricter",
    "public_schemas_shipped",
    "public_examples_shipped",
    "agents_doc_shipped",
    "public_surface_no_unvalidated_host_names",
  ]) {
    assert.ok(checks.has(required), required);
  }
});

test("public tree check confirms private artifacts are absent and guardrails are active", () => {
  const result = spawnSync(process.execPath, [path.join(ROOT, "bin", "cpe-scan.js"), "public-tree-check", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.failures.length, 0);
  const checkIds = new Set(payload.checks.map((check) => check.id));
  assert.ok(checkIds.has("legacy_doc_not_in_active_docs:docs/LEGACY_README_v0.1.md"));
  assert.ok(checkIds.has("historical_docs_absent_from_public_tree"));
  assert.ok(checkIds.has("public_surface_no_unvalidated_host_names"));
});

test("process_cleanup tool description warns agents against autonomous real cleanup", () => {
  const content = fs.readFileSync(path.join(ROOT, "src", "mcp-server.js"), "utf8");
  assert.match(content, /real termination remains non-operable/);
  assert.match(content, /evidence inputs are not exposed/);
  assert.match(content, /Agents must not call dry_run=false autonomously/);
  const processCleanupBlock = content.split('server.registerTool(\n    "process_cleanup"')[1].split('server.registerTool(\n    "janitor_discovery"')[0];
  assert.doesNotMatch(processCleanupBlock, /evidence_sha256|evidenceSha256|evidence_path|evidencePath/);
});
