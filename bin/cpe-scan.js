#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  autoCleanupDryRun,
  autoCleanupStatus,
  buildAuditBundle,
  buildCleanupCandidates,
  buildScopeReport,
  configExplain,
  createRuntime,
  executeCleanup,
  explainProcess,
  janitorDiscovery,
  managedCleanupDryRun,
  managedLifecycleReport,
  managedProcessExplain,
  managedProcessList,
  managedReconcile,
  managedStaleReport,
  policyExplain,
  profileList,
  reconcileNow,
  resourceImpactReport,
  sessionCloseCheck,
  sessionStatus,
  staleSessionReport,
  startRuntimeWatcher,
} from "../src/runtime.js";

const args = process.argv.slice(2);
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DISALLOWED_PUBLIC_HOST_PATTERN = buildHostNamePattern([
  [113, 119, 101, 110],
  [113, 119, 101, 110, 95, 99, 111, 100, 101],
  [100, 101, 101, 112, 115, 101, 101, 107],
]);
const KNOWN_COMMANDS = new Set([
  "report",
  "candidates",
  "cleanup",
  "explain",
  "profiles",
  "config",
  "session",
  "ledger",
  "reconcile",
  "watch",
  "audit-bundle",
  "policy-explain",
  "stale-sessions",
  "resource-impact",
  "auto-cleanup",
  "doctor",
  "validate-package",
  "public-tree-check",
  "install-snippet",
  "agent-protocol",
  "janitor-discovery",
  "session-close-check",
  "smoke-stdio",
  "managed-processes",
  "managed-explain",
  "managed-reconcile",
  "managed-lifecycle",
  "managed-cleanup-dryrun",
  "managed-stale",
]);
const command = args.find((arg) => KNOWN_COMMANDS.has(arg)) || "report";

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const options = parseOptions(args);
const runtime = createRuntime({ configPath: options.configPath, dataDir: options.dataDir, logger: (...items) => console.error("[cpe-scan]", ...items) });

try {
  let result;
  switch (command) {
    case "report":
      result = await buildScopeReport(runtime, options);
      break;
    case "candidates":
      result = await buildCleanupCandidates(runtime, { ...options, scope: options.scope || "all" });
      break;
    case "cleanup":
      result = await executeCleanup(runtime, options);
      break;
    case "explain":
      result = await explainProcess(runtime, options);
      break;
    case "profiles":
      result = profileList(runtime);
      break;
    case "config":
      result = configExplain(runtime);
      break;
    case "session":
      result = sessionStatus(runtime);
      break;
    case "ledger":
      result = runtime.ledger.summary({ includeRecentEvents: true });
      break;
    case "reconcile":
      result = await reconcileNow(runtime, options);
      break;
    case "watch":
      await startRuntimeWatcher(runtime);
      process.stdout.write(`Embedded watcher running every ${runtime.config.watcher.intervalSeconds}s. Press Ctrl+C to stop.\n`);
      await new Promise(() => {});
      break;
    case "audit-bundle":
      result = await buildAuditBundle(runtime, options);
      if (options.outputDir) result = writeAuditBundle(options.outputDir, result);
      break;
    case "policy-explain":
      result = await policyExplain(runtime, options);
      break;
    case "stale-sessions":
      result = await staleSessionReport(runtime);
      break;
    case "resource-impact":
      result = await resourceImpactReport(runtime, options);
      break;
    case "auto-cleanup":
      result = options.status ? autoCleanupStatus(runtime) : await autoCleanupDryRun(runtime, options);
      break;
    case "doctor":
      result = doctor(runtime);
      break;
    case "validate-package":
      result = validatePackage({ strictPublic: options.strictPublic });
      break;
    case "public-tree-check":
      result = validatePublicTree();
      break;
    case "install-snippet":
      result = installSnippet(options.client || "codex");
      break;
    case "agent-protocol":
    case "janitor-discovery":
      result = janitorDiscovery(runtime, options);
      break;
    case "session-close-check":
      result = await sessionCloseCheck(runtime, options);
      break;
    case "smoke-stdio":
      result = await smokeStdio(options);
      break;
    case "managed-processes":
      result = managedProcessList(runtime, { includeExited: options.includeExited });
      break;
    case "managed-explain":
      result = managedProcessExplain(runtime, options);
      break;
    case "managed-reconcile":
      result = await managedReconcile(runtime);
      break;
    case "managed-lifecycle":
      result = await managedLifecycleReport(runtime);
      break;
    case "managed-cleanup-dryrun":
      result = await managedCleanupDryRun(runtime);
      break;
    case "managed-stale":
      result = await managedStaleReport(runtime);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }

  if (result) output(result, options.json);
  if (["smoke-stdio", "validate-package", "public-tree-check", "doctor"].includes(command) && result?.ok === false && !options.noFail) {
    process.exitCode = 1;
  }
} catch (error) {
  const payload = { error: error.message, stack: options.verbose ? error.stack : undefined };
  output(payload, options.json);
  process.exitCode = 1;
}

function parseOptions(values) {
  const out = {
    json: values.includes("--json"),
    verbose: values.includes("--verbose"),
    includeCommandLine: values.includes("--include-command-line"),
    force: values.includes("--force"),
    includeProcessTree: values.includes("--include-process-tree"),
    dryRun: !values.includes("--no-dry-run"),
    requestConfirmToken: values.includes("--request-confirm-token"),
    pids: [],
  };

  out.configPath = optionValue(values, "--config");
  out.dataDir = optionValue(values, "--data-dir");
  out.scope = optionValue(values, "--scope") || undefined;
  out.confirmToken = optionValue(values, "--confirm-token") || undefined;
  out.signal = optionValue(values, "--signal") || undefined;
  out.outputDir = optionValue(values, "--output-dir") || undefined;
  out.client = optionValue(values, "--client") || undefined;
  out.projectKey = optionValue(values, "--project-key") || undefined;
  out.status = values.includes("status") || values.includes("--status");
  out.strictPublic = values.includes("--strict-public") || values.includes("--public");
  out.noFail = values.includes("--no-fail");
  out.includeExited = !values.includes("--running-only");
  out.managedProcessId = optionValue(values, "--managed-process-id") || undefined;
  out.entrypoint = optionValue(values, "--entrypoint") || undefined;

  const pid = optionValue(values, "--pid");
  if (pid !== undefined) out.pid = Number(pid);

  const minAge = optionValue(values, "--min-age") || optionValue(values, "--min-age-minutes");
  if (minAge !== undefined) out.minAgeMinutes = Number(minAge);

  const limit = optionValue(values, "--limit");
  if (limit !== undefined) out.limit = Number(limit);

  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === "--pid" && values[i + 1]) out.pids.push(Number(values[i + 1]));
  }

  const pids = optionValue(values, "--pids");
  if (pids) {
    out.pids.push(...pids.split(",").map((value) => Number(value.trim())));
  }
  out.pids = out.pids.filter((value) => Number.isInteger(value) && value > 0);

  return out;
}

function optionValue(values, key) {
  const index = values.indexOf(key);
  if (index === -1) return undefined;
  return values[index + 1];
}

function output(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (result?.topCandidates) {
    process.stdout.write(`Scan at ${result.scannedAt} on ${result.platform}\n`);
    process.stdout.write(`Processes: ${result.counts.totalProcesses}; candidates: ${result.counts.candidates}; owned: ${result.counts.ownedCurrentSession}; related: ${result.counts.relatedUnowned}; unknown: ${result.counts.unknownOwner}; cleanupEligible: ${result.counts.cleanupEligibleByDefault}\n`);
    for (const note of result.notes || []) process.stdout.write(`- ${note}\n`);
    if (result.topCandidates.length) {
      process.stdout.write("\nTop candidates:\n");
      for (const c of result.topCandidates) {
        process.stdout.write(`  PID ${c.pid} ${c.name} [${c.ownership}, ${c.risk}, score ${c.score}, age ${c.age}] reasons=${c.reasons.join(",")} blockers=${c.blockers.join(",") || "none"}\n`);
      }
    }
    process.stdout.write(`\nLedger: ${result.ledger.path}\n`);
    return;
  }

  if (result?.candidates) {
    process.stdout.write(`Candidates (${result.returnedCount ?? result.candidates.length}) scope=${result.scope || "n/a"}\n`);
    for (const c of result.candidates) {
      process.stdout.write(`  PID ${c.pid} ${c.name} [${c.ownership}, ${c.risk}, score ${c.score}, age ${c.age}] reasons=${c.reasons.join(",")} blockers=${c.blockers.join(",") || "none"}\n`);
    }
    return;
  }

  if (result?.mode) {
    process.stdout.write(`Mode: ${result.mode}; matched=${result.matchedCount ?? result.selectedCount}; planned=${result.plannedCleanupCount ?? 0}; executed=${result.executedCleanupCount ?? result.cleanupCount ?? 0}\n`);
    if (result.confirmToken) process.stdout.write(`Confirm token: ${result.confirmToken} (expires ${result.confirmTokenExpiresAt})\n`);
    for (const w of result.warnings || []) process.stdout.write(`Warning: ${w}\n`);
    for (const item of result.terminated || []) process.stdout.write(`Terminated PID ${item.pid} ${item.name}: ${item.status}\n`);
    for (const item of result.skipped || []) process.stdout.write(`Skipped PID ${item.pid} ${item.name}: ${item.reason}\n`);
    for (const item of result.errors || []) process.stdout.write(`Error PID ${item.pid} ${item.name}: ${item.error}\n`);
    if (result.nextStep) process.stdout.write(`${result.nextStep}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function writeAuditBundle(outputDir, bundle) {
  const dir = path.resolve(outputDir);
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    "CONFIG_EXPLAIN.json": bundle.config,
    "SESSION_STATUS.json": bundle.session,
    "WATCHER_STATUS.json": bundle.watcher,
    "PROFILE_LIST.json": bundle.profiles,
    "PROCESS_SCOPE_REPORT.json": bundle.processScopeReport,
    "PROCESS_CLEANUP_CANDIDATES.json": bundle.processCleanupCandidates,
    "PROCESS_CLEANUP_DRYRUN.json": bundle.processCleanupDryRun,
    "METRICS.json": bundle.metrics,
    "SAFETY.json": bundle.safety,
    "NODE_ENVIRONMENT.json": bundle.environment,
    "PACKAGE_INFO.json": packageInfo(),
    "AUDIT_BUNDLE.json": bundle,
  };
  for (const [name, value] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
  const explainDir = path.join(dir, "PROCESS_EXPLAIN_SELECTED");
  fs.mkdirSync(explainDir, { recursive: true });
  for (const item of bundle.processExplainSelected || []) {
    fs.writeFileSync(path.join(explainDir, `PID_${item.pid}.json`), `${JSON.stringify(item, null, 2)}\n`, "utf8");
  }
  fs.writeFileSync(path.join(dir, "ENTRYPOINT_HASH.txt"), `${sha256File(path.join(PACKAGE_ROOT, "bin", "clean-process-ended-mcp.js"))}  bin/clean-process-ended-mcp.js\n`, "utf8");
  fs.writeFileSync(
    path.join(dir, "COMMANDS_RUN.md"),
    `# Commands Run\n\n- cpe-scan audit-bundle --output-dir <output-dir> --json\n- internal process_cleanup dry-run with createConfirmToken=false\n\nNo cleanup real executed.\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "EVIDENCE.md"),
    `# clean-process-ended audit bundle\n\nGenerated: ${bundle.generatedAt}\nVersion: ${bundle.version}\nRun: ${bundle.runId}\nSnapshot: ${bundle.safety.snapshotId}\nSingle snapshot: ${bundle.safety.singleSnapshot}\n\nCleanup real executed: no\nDry-run only: yes\nConfirm token returned: ${bundle.processCleanupDryRun.confirmTokenReturned}\n\nSee METRICS.json, SAFETY.json and SHA256SUMS.txt for summary and integrity.\n`,
    "utf8",
  );
  const writtenFiles = GetFilesRecursive(dir).filter((file) => path.basename(file) !== "SHA256SUMS.txt");
  const sums = writtenFiles
    .map((file) => {
      const relative = path.relative(dir, file).replace(/\\/g, "/");
      if (path.isAbsolute(relative) || /[\r\n\t]/.test(relative)) {
        throw new Error(`unsafe_checksum_path:${relative}`);
      }
      return `${sha256File(file)}  ${relative}`;
    })
    .sort((a, b) => a.localeCompare(b))
    .join("\n");
  fs.writeFileSync(path.join(dir, "SHA256SUMS.txt"), `${sums}\n`, "utf8");
  return {
    outputDir: dir,
    files: GetFilesRecursive(dir).map((file) => path.relative(dir, file).replace(/\\/g, "/")).sort(),
    metrics: bundle.metrics,
    sha256Sums: "SHA256SUMS.txt",
  };
}

function doctor(runtime) {
  const checks = [
    { id: "host_binding", ok: Boolean(runtime.config.host.expectedProfile), severity: "warn", note: runtime.config.host.expectedProfile ? "configured" : "CPE_HOST_PROFILE is not set" },
    { id: "watcher_default", ok: runtime.config.watcher.enabled === false, severity: "error", note: "watcher should be opt-in" },
    { id: "command_lines_private", ok: runtime.config.ledger.storeCommandLines === false, severity: "error", note: "storeCommandLines should stay false by default" },
    { id: "confirm_token", ok: runtime.config.cleanup.requireConfirmToken === true, severity: "error", note: "real cleanup requires token" },
    { id: "ledger_writable", ok: canWriteDirectory(runtime.ledger.dataDir), severity: "error", note: runtime.ledger.dataDir },
    { id: "auto_cleanup_trust", ok: autoCleanupStatus(runtime).policy.terminateAllowed === false || runtime.configMeta?.autoCleanupTerminateTrusted === true, severity: "error", note: "terminate auto-cleanup must come from install config" },
  ];
  return {
    product: runtime.product,
    version: runtime.version,
    node: process.version,
    platform: process.platform,
    dataDir: runtime.ledger.dataDir,
    ledgerPath: runtime.ledger.ledgerPath,
    expectedHostProfile: runtime.config.host.expectedProfile,
    watcher: runtime.watcher.status(),
    autoCleanup: autoCleanupStatus(runtime).policy,
    ok: checks.every((check) => check.ok || check.severity === "warn"),
    checks,
    failures: checks.filter((check) => !check.ok && check.severity !== "warn"),
    warnings: checks.filter((check) => !check.ok && check.severity === "warn"),
  };
}

function validatePackage({ strictPublic = false } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"));
  const packageLockPath = path.join(PACKAGE_ROOT, "package-lock.json");
  const packageLock = fs.existsSync(packageLockPath) ? JSON.parse(fs.readFileSync(packageLockPath, "utf8")) : null;
  const sourceCheckout = fs.existsSync(path.join(PACKAGE_ROOT, ".git"));
  const serverJsonPath = path.join(PACKAGE_ROOT, "server.json");
  const serverJson = fs.existsSync(serverJsonPath) ? JSON.parse(fs.readFileSync(serverJsonPath, "utf8")) : null;
  const serverPackage = Array.isArray(serverJson?.packages) ? serverJson.packages[0] : null;
  const files = [
    "bin/clean-process-ended-mcp.js",
    "bin/cpe-scan.js",
    "src/runtime.js",
    "src/mcp-server.js",
    "AGENTS.md",
    "README.md",
    "README_ES.md",
    "README_DE.md",
    "README_PT_BR.md",
    "README_ZH.md",
    "README_JA.md",
    "CHANGELOG.md",
    "SECURITY.md",
    "SUPPORT.md",
    "docs/quickstart.md",
    "docs/INSTALL.md",
    "docs/CONFIGURATION.md",
    "docs/SAFETY_MODEL.md",
    "docs/MANAGED_LIFECYCLE.md",
    "docs/AUDIT_BUNDLE.md",
    "docs/HOSTS.md",
    "docs/design-decisions.md",
    "docs/validation/VALIDATION.md",
    "schemas/process_janitor_receipt.schema.json",
    "schemas/audit_bundle.schema.json",
    "examples/README.md",
    "scripts/smoke-packed-tarball.mjs",
  ];
  const packageFiles = Array.isArray(pkg.files) ? pkg.files : [];
  const missingPackageFiles = packageFiles.filter((item) => !fs.existsSync(path.join(PACKAGE_ROOT, item)));
  const ignoredPackageFiles = gitIgnoredPackageFiles(packageFiles);
  const referencedDocs = markdownDocReferences(["README.md", "docs/README.md"]);
  const missingReferencedDocs = referencedDocs.filter((item) => !packageFiles.includes(item) && !fs.existsSync(path.join(PACKAGE_ROOT, item)));
  const omittedReferencedDocs = referencedDocs.filter((item) => fs.existsSync(path.join(PACKAGE_ROOT, item)) && !packageFiles.includes(item));
  const gitignoreText = fs.existsSync(path.join(PACKAGE_ROOT, ".gitignore")) ? fs.readFileSync(path.join(PACKAGE_ROOT, ".gitignore"), "utf8") : "";
  const requiredScripts = [
    "test",
    "check:syntax",
    "smoke:stdio",
    "validate:package:strict",
    "public-tree:check",
    "package:audit",
    "package:pack:dry-run",
    "package:smoke-tarball",
    "public-beta-candidate",
    "ci",
  ];
  const publicChecks = [
    {
      id: "package_lock_version_matches_package",
      ok: packageLock
        ? packageLock.version === pkg.version && packageLock.packages?.[""]?.version === pkg.version
        : !sourceCheckout,
      note: packageLock?.version || (sourceCheckout ? null : "package-lock.json is not shipped in the installed npm package"),
    },
    { id: "package_files_is_allowlist", ok: Array.isArray(pkg.files) && pkg.files.length > 0, note: `${packageFiles.length} entries` },
    { id: "package_files_exist", ok: missingPackageFiles.length === 0, note: missingPackageFiles.length ? missingPackageFiles.join(", ") : "all package files exist" },
    { id: "public_doc_references_exist", ok: missingReferencedDocs.length === 0, note: missingReferencedDocs.length ? missingReferencedDocs.join(", ") : "all referenced docs exist" },
    { id: "public_doc_references_in_package", ok: omittedReferencedDocs.length === 0, note: omittedReferencedDocs.length ? omittedReferencedDocs.join(", ") : "all referenced docs are packaged" },
    { id: "package_author_not_placeholder", ok: Boolean(pkg.author && !/prototype generated/i.test(pkg.author)), note: pkg.author || null },
    { id: "package_repository_https_github", ok: Boolean(pkg.repository?.url && /^git\+https:\/\/github\.com\/MarceloCaporale\/clean-process-ended\.git$/i.test(pkg.repository.url)), note: pkg.repository?.url || null },
    { id: "package_bugs_url", ok: Boolean(pkg.bugs?.url && /^https:\/\/github\.com\/MarceloCaporale\/clean-process-ended\/issues$/i.test(pkg.bugs.url)), note: pkg.bugs?.url || null },
    { id: "package_homepage_url", ok: Boolean(pkg.homepage && /^https:\/\/github\.com\/MarceloCaporale\/clean-process-ended#readme$/i.test(pkg.homepage)), note: pkg.homepage || null },
    { id: "package_license_apache_2", ok: pkg.license === "Apache-2.0" && fs.existsSync(path.join(PACKAGE_ROOT, "NOTICE")), note: pkg.license || null },
    { id: "mcpName_not_placeholder", ok: pkg.mcpName && !pkg.mcpName.includes(".local/"), note: pkg.mcpName },
    { id: "server_json_exists", ok: Boolean(serverJson), note: "required for MCP Registry publishing" },
    { id: "server_json_name_matches_mcpName", ok: Boolean(serverJson?.name && serverJson.name === pkg.mcpName), note: serverJson?.name || null },
    { id: "server_json_version_matches_package", ok: Boolean(serverJson?.version && serverJson.version === pkg.version), note: serverJson?.version || null },
    { id: "server_json_registry_schema", ok: Boolean(serverJson?.$schema && String(serverJson.$schema).includes("/2025-12-11/server.schema.json")), note: serverJson?.$schema || null },
    { id: "server_json_package_registry_type", ok: serverPackage?.registryType === "npm", note: serverPackage?.registryType || null },
    { id: "server_json_package_identifier_matches_package", ok: serverPackage?.identifier === pkg.name, note: serverPackage?.identifier || null },
    { id: "server_json_package_version_matches_package", ok: serverPackage?.version === pkg.version, note: serverPackage?.version || null },
    { id: "server_json_stdio_transport", ok: serverPackage?.transport?.type === "stdio", note: serverPackage?.transport?.type || null },
    { id: "no_node_modules_in_package_files", ok: !(pkg.files || []).includes("node_modules"), note: "package files should stay source-only" },
    { id: "public_docs_no_personal_paths", ok: !packagePublicDocsContain(forbiddenPersonalPathPattern()), note: "public docs and samples should not contain personal LAB paths" },
    { id: "packed_sources_no_personal_paths", ok: !packageAllowlistContains(forbiddenPersonalPathPattern()), note: "npm package allowlist should not contain personal LAB paths in shipped source" },
    { id: "internal_audit_docs_excluded", ok: !(pkg.files || []).some((item) => item.includes("_AUDITORIA")), note: "internal docs must not ship in npm package" },
  ];
  const strictChecks = strictPublic
    ? [
        { id: "package_files_do_not_ship_whole_docs_tree", ok: !(pkg.files || []).includes("docs"), note: "package files should allowlist public docs" },
        { id: "legacy_docs_excluded_from_package", ok: !(pkg.files || []).some((item) => /LEGACY|WATCHER_LEVEL_2_PLAN|docs\/history/i.test(item)), note: "legacy/future planning docs should stay out of npm package" },
        { id: "package_allowlist_not_gitignored", ok: ignoredPackageFiles.length === 0, note: ignoredPackageFiles.length ? ignoredPackageFiles.join(", ") : "no package allowlist files are ignored by git" },
        { id: "public_schemas_shipped", ok: (pkg.files || []).includes("schemas"), note: "schemas directory should ship public contracts" },
        { id: "public_examples_shipped", ok: (pkg.files || []).includes("examples"), note: "examples directory should ship host snippets" },
        { id: "agents_doc_shipped", ok: (pkg.files || []).includes("AGENTS.md"), note: "AGENTS.md should guide agentic repository readers" },
        { id: "server_json_no_legacy_package_keys", ok: !serverPackage?.registry && !serverPackage?.name && !serverPackage?.runtime_hint, note: "use registryType/identifier/transport" },
        { id: "github_actions_ci_exists", ok: fs.existsSync(path.join(PACKAGE_ROOT, ".github", "workflows", "ci.yml")), note: ".github/workflows/ci.yml" },
        { id: "private_lab_files_gitignored", ok: /PROJECTS_STATE_\*\.md/.test(gitignoreText) && /index_project_\*\.md/.test(gitignoreText) && /\*\.lnk/.test(gitignoreText) && /_AUDITORIA_DOCS\//.test(gitignoreText), note: "PROJECTS_STATE_*.md, index_project_*.md, _AUDITORIA_DOCS/ and *.lnk should stay out of public commits" },
        { id: "package_audit_level_moderate_or_stricter", ok: /npm audit\b/.test(pkg.scripts?.["package:audit"] || "") && /--audit-level=(moderate|low)/.test(pkg.scripts?.["package:audit"] || ""), note: pkg.scripts?.["package:audit"] || null },
        ...requiredScripts.map((name) => ({ id: `script:${name}`, ok: Boolean(pkg.scripts?.[name]), note: pkg.scripts?.[name] || null })),
      ]
    : [];
  const disallowedPublicHostMatches = packageAllowlistMatches(DISALLOWED_PUBLIC_HOST_PATTERN);
  const currentPublicChecks = [
    {
      id: "public_surface_no_unvalidated_host_names",
      ok: disallowedPublicHostMatches.length === 0,
      note: disallowedPublicHostMatches.length ? disallowedPublicHostMatches.join(", ") : "no unvalidated host names in packaged public surface",
    },
  ];
  const checks = files.map((file) => ({ id: `file:${file}`, ok: fs.existsSync(path.join(PACKAGE_ROOT, file)), note: file })).concat(publicChecks, strictChecks, currentPublicChecks);
  return {
    packageName: pkg.name,
    version: pkg.version,
    mcpName: pkg.mcpName,
    strictPublic,
    ok: checks.every((check) => check.ok),
    checks,
    failures: checks.filter((check) => !check.ok),
    packageFiles: pkg.files,
  };
}

function validatePublicTree() {
  const privatePaths = findExistingPrivatePublicTreeArtifacts();
  const legacyRootDocs = [
    "docs/LEGACY_README_v0.1.md",
    "docs/LIFECYCLE_v0.5.md",
    "docs/SAFETY.md",
    "docs/WATCHER_LEVEL_2_PLAN.md",
  ];
  const historicalDocs = fs.existsSync(path.join(PACKAGE_ROOT, "docs", "history"))
    ? GetFilesRecursive(path.join(PACKAGE_ROOT, "docs", "history")).map((absolute) => path.relative(PACKAGE_ROOT, absolute).replace(/\\/g, "/"))
    : [];
  const disallowedPublicHostMatches = packageAllowlistMatches(DISALLOWED_PUBLIC_HOST_PATTERN);
  const gitignoreText = fs.existsSync(path.join(PACKAGE_ROOT, ".gitignore")) ? fs.readFileSync(path.join(PACKAGE_ROOT, ".gitignore"), "utf8") : "";
  const checks = [
    {
      id: "gitignore_private_state_files",
      ok: /PROJECTS_STATE_\*\.md/.test(gitignoreText) && /index_project_\*\.md/.test(gitignoreText),
      note: "PROJECTS_STATE_*.md and index_project_*.md must stay out of public commits",
    },
    {
      id: "gitignore_private_artifacts",
      ok: /\*\.lnk/.test(gitignoreText) && /clean-process-ended-mcp__v\*\.zip/.test(gitignoreText) && /_AUDITORIA_DOCS\//.test(gitignoreText) && /_BASELINE\//.test(gitignoreText) && /evidence\//.test(gitignoreText),
      note: "*.lnk, audit zips and evidence folders must stay out of public commits",
    },
    {
      id: "private_artifacts_absent_from_public_tree",
      ok: privatePaths.length === 0,
      note: privatePaths.length ? privatePaths.join(", ") : "no private audit/LAB artifacts present",
    },
    ...privatePaths.map((relativePath) => ({
      id: `private_artifact_present:${relativePath}`,
      ok: false,
      note: "Private audit/LAB artifacts belong in audit packs, not the public GitHub tree.",
    })),
    ...legacyRootDocs.map((relativePath) => ({
      id: `legacy_doc_not_in_active_docs:${relativePath}`,
      ok: !fs.existsSync(path.join(PACKAGE_ROOT, relativePath)),
      note: "Legacy prototype docs are not part of the public tree; keep them in LAB/audit archives, not active public docs.",
    })),
    {
      id: "historical_docs_absent_from_public_tree",
      ok: historicalDocs.length === 0,
      note: historicalDocs.length ? historicalDocs.join(", ") : "historical prototype docs are not part of the public tree",
    },
    {
      id: "public_surface_no_unvalidated_host_names",
      ok: disallowedPublicHostMatches.length === 0,
      note: disallowedPublicHostMatches.length ? disallowedPublicHostMatches.join(", ") : "no unvalidated host names in packaged public surface",
    },
  ];
  return {
    ok: checks.every((check) => check.ok),
    checks,
    failures: checks.filter((check) => !check.ok),
    note: "This validates the local GitHub/public tree guardrails. It does not publish or stage files.",
  };
}

function gitIgnoredPackageFiles(packageFiles) {
  if (!fs.existsSync(path.join(PACKAGE_ROOT, ".git"))) return [];
  const candidates = [];
  for (const item of packageFiles) {
    const absolute = path.join(PACKAGE_ROOT, item);
    if (!fs.existsSync(absolute)) continue;
    if (fs.statSync(absolute).isDirectory()) {
      for (const file of GetFilesRecursive(absolute)) {
        candidates.push(path.relative(PACKAGE_ROOT, file).replace(/\\/g, "/"));
      }
    } else {
      candidates.push(item.replace(/\\/g, "/"));
    }
  }
  const ignored = [];
  for (const relativePath of candidates) {
    const result = spawnSync("git", ["check-ignore", "-q", "--", relativePath], {
      cwd: PACKAGE_ROOT,
      encoding: "utf8",
    });
    if (result.status === 0) ignored.push(relativePath);
  }
  return ignored;
}


function findExistingPrivatePublicTreeArtifacts() {
  const results = [];
  const rootEntries = fs.existsSync(PACKAGE_ROOT) ? fs.readdirSync(PACKAGE_ROOT, { withFileTypes: true }) : [];
  for (const entry of rootEntries) {
    const name = entry.name;
    if (/^PROJECTS_STATE_.*\.md$/i.test(name)) results.push(name);
    if (/^index_project_.*\.md$/i.test(name)) results.push(name);
    if (/\.lnk$/i.test(name)) results.push(name);
    if (["_AUDITORIA_DOCS", "_BASELINE", "_INFO_DOCS", "90_ARCHIVO"].includes(name)) results.push(name);
    if (/^clean-process-ended-mcp__v.*\.zip(?:\.sha256\.txt)?$/i.test(name)) results.push(name);
  }
  return results.sort();
}

function hasHistoricalDocumentBanner(relativePath) {
  const fullPath = path.join(PACKAGE_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) return true;
  const text = fs.readFileSync(fullPath, "utf8").slice(0, 500);
  return text.includes("# Historical Document") && text.includes("does not describe the current public behavior");
}

function isGitIgnored(relativePath, gitignoreText) {
  const result = spawnSync("git", ["check-ignore", "--quiet", relativePath], {
    cwd: PACKAGE_ROOT,
    windowsHide: true,
  });
  if (!result.error && result.status === 0) return true;
  return matchesLocalGitignore(relativePath, gitignoreText);
}

function matchesLocalGitignore(relativePath, gitignoreText) {
  const normalized = String(relativePath || "").replaceAll("\\", "/").replace(/\/$/, "");
  if (/^PROJECTS_STATE_/.test(normalized)) return /PROJECTS_STATE_\*\.md/.test(gitignoreText);
  if (/^index_project_/.test(normalized)) return /index_project_\*\.md/.test(gitignoreText);
  if (/\.lnk$/i.test(normalized)) return /\*\.lnk/.test(gitignoreText);
  if (/^_AUDITORIA_DOCS(?:\/|$)/.test(normalized)) return /_AUDITORIA_DOCS\//.test(gitignoreText);
  if (/^_BASELINE(?:\/|$)/.test(normalized)) return /_BASELINE\//.test(gitignoreText);
  if (/^_INFO_DOCS(?:\/|$)/.test(normalized)) return /_INFO_DOCS\//.test(gitignoreText);
  if (/^90_ARCHIVO(?:\/|$)/.test(normalized)) return /90_ARCHIVO\//.test(gitignoreText);
  if (/^evidence(?:\/|$)/.test(normalized)) return /evidence\//.test(gitignoreText);
  if (/^audit-bundles(?:\/|$)/.test(normalized)) return /audit-bundles\//.test(gitignoreText);
  if (/^clean-process-ended-mcp__v.*\.zip$/i.test(normalized)) return /clean-process-ended-mcp__v\*\.zip/.test(gitignoreText);
  if (/^clean-process-ended-mcp__v.*\.zip\.sha256\.txt$/i.test(normalized)) return /clean-process-ended-mcp__v\*\.zip\.sha256\.txt/.test(gitignoreText);
  if (/^clean-process-ended-mcp__v/.test(normalized)) return /clean-process-ended-mcp__v\*\//.test(gitignoreText);
  return false;
}

function packageInfo() {
  const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"));
  return {
    name: pkg.name,
    version: pkg.version,
    mcpName: pkg.mcpName,
    node: process.version,
    npmUserAgent: process.env.npm_config_user_agent || null,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
  };
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function GetFilesRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...GetFilesRecursive(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function canWriteDirectory(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `.cpe-doctor-${process.pid}-${Date.now()}.tmp`);
    fs.writeFileSync(file, "ok");
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

function fileContains(file, pattern) {
  try {
    return pattern.test(fs.readFileSync(file, "utf8"));
  } catch {
    return false;
  }
}

function packagePublicDocsContain(pattern) {
  const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"));
  const packageFiles = Array.isArray(pkg.files) ? pkg.files : [];
  const candidates = new Set(["README.md", "server.json", "CHANGELOG.md", "SECURITY.md", "SUPPORT.md"]);
  for (const item of packageFiles) {
    if (/^(docs|samples)\//.test(item) || /\.(md|json|toml|yml|yaml)$/i.test(item)) candidates.add(item);
  }
  for (const item of candidates) {
    const absolute = path.join(PACKAGE_ROOT, item);
    if (!fs.existsSync(absolute)) continue;
    if (fs.statSync(absolute).isDirectory()) {
      for (const file of GetFilesRecursive(absolute)) {
        if (fileContains(file, pattern)) return true;
      }
    } else if (fileContains(absolute, pattern)) {
      return true;
    }
  }
  return false;
}

function packageAllowlistContains(pattern) {
  return packageAllowlistMatches(pattern).length > 0;
}

function packageAllowlistMatches(pattern) {
  const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"));
  const packageFiles = Array.isArray(pkg.files) ? pkg.files : [];
  const matches = [];
  for (const item of packageFiles) {
    const absolute = path.join(PACKAGE_ROOT, item);
    if (!fs.existsSync(absolute)) continue;
    if (fs.statSync(absolute).isDirectory()) {
      for (const file of GetFilesRecursive(absolute)) {
        if (fileContains(file, pattern)) matches.push(path.relative(PACKAGE_ROOT, file).replace(/\\/g, "/"));
      }
    } else if (fileContains(absolute, pattern)) {
      matches.push(item.replace(/\\/g, "/"));
    }
  }
  return matches;
}

function forbiddenPersonalPathPattern() {
  const drive = String.raw`[A-Z]:\\`;
  const windowsPath = String.raw`[^<>"|\r\n]+`;
  const slash = "/";
  const unixUsersHome = `${slash}Users${slash}`;
  return new RegExp(
    [
      `${drive}(?!/)${windowsPath}(?:__LAB|LAB)${windowsPath}`,
      `${drive}(?!/)Users\\\\[^\\\\\\s"'<>]+`,
      `${escapeRegExp(unixUsersHome)}[^/\\s"'<>]+`,
    ].join("|"),
    "i",
  );
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildHostNamePattern(codepointsList) {
  const names = codepointsList.map((codepoints) => String.fromCharCode(...codepoints));
  return new RegExp(`\\b(${names.map(escapeRegExp).join("|")})\\b`, "i");
}

function markdownDocReferences(files) {
  const references = new Set();
  for (const file of files) {
    const absolute = path.join(PACKAGE_ROOT, file);
    if (!fs.existsSync(absolute)) continue;
    const content = fs.readFileSync(absolute, "utf8");
    for (const match of content.matchAll(/(?:\(|`)(docs\/[A-Za-z0-9_.-]+\.md)(?:\)|`)/g)) {
      references.add(match[1]);
    }
  }
  return [...references].sort();
}

function installSnippet(client) {
  const aliases = {
    codex: "codex",
    claude: "claude",
    claude_code: "claude",
    gemini: "gemini",
    gemini_cli: "gemini",
  };
  const profiles = {
    codex: "codex",
    claude: "claude_code",
    claude_code: "claude_code",
    gemini: "gemini_cli",
    gemini_cli: "gemini_cli",
  };
  const clientKey = aliases[client] || client;
  const profile = profiles[client] || client;
  const npxCommand = "npx -y --package clean-process-ended clean-process-ended-mcp";
  const command = {
    codex: `codex mcp add clean-process-ended --env CPE_HOST_PROFILE=${profile} -- ${npxCommand}`,
    claude: `claude mcp add --transport stdio --scope user --env CPE_HOST_PROFILE=${profile} clean-process-ended -- ${npxCommand}`,
    gemini: `gemini mcp add -s user -e CPE_HOST_PROFILE=${profile} clean-process-ended ${npxCommand}`,
  };
  return {
    client,
    clientKey,
    profile,
    command: command[clientKey] || null,
    note: "Preview only; this command is not executed by install-snippet.",
    agentInstruction:
      "After non-trivial tasks with subprocesses, MCP servers, devtools, browser automation, local servers, subagents or background jobs, use clean-process-ended only for a dry-run close check. Never request dry_run=false autonomously.",
  };
}

async function smokeStdio(options) {
  const entrypoint = options.entrypoint ? path.resolve(options.entrypoint) : path.join(PACKAGE_ROOT, "bin", "clean-process-ended-mcp.js");
  const child = spawn(process.execPath, [entrypoint], {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, CPE_HOST_PROFILE: options.client || "codex" },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const result = await jsonRpcSmoke(child);
  child.kill();
  return result;
}

function jsonRpcSmoke(child) {
  let id = 1;
  let buffer = "";
  let stderr = "";
  let exitCode = null;
  let exitSignal = null;
  const malformedStdout = [];
  const pending = new Map();
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  child.on("exit", (code, signal) => {
    exitCode = code;
    exitSignal = signal;
    for (const resolve of pending.values()) resolve({ error: { message: "server_exited_before_response", code, signal } });
    pending.clear();
  });
  const timeout = setTimeout(() => {
    for (const resolve of pending.values()) resolve({ error: { message: "smoke_timeout" } });
    pending.clear();
    child.kill();
  }, 6000);

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      try {
        const message = JSON.parse(line);
        if (message.id && pending.has(message.id)) {
          pending.get(message.id)(message);
          pending.delete(message.id);
        }
      } catch {
        malformedStdout.push(line.slice(0, 300));
      }
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const msgId = id++;
      pending.set(msgId, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: msgId, method, params })}\n`);
    });

  return (async () => {
    const init = await send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "cpe-smoke-stdio", version: "0.7.2" },
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);
    const tools = await send("tools/list", {});
    clearTimeout(timeout);
    const names = tools.result?.tools?.map((tool) => tool.name).sort() || [];
    const requiredTools = ["process_scope_report", "process_cleanup", "janitor_discovery", "session_close_check", "audit_bundle", "managed_reconcile", "managed_lifecycle_report", "managed_cleanup_dryrun", "managed_stale_report"];
    const missingTools = requiredTools.filter((name) => !names.includes(name));
    const ok = Boolean(init.result && missingTools.length === 0 && malformedStdout.length === 0 && !init.error && !tools.error);
    return {
      ok,
      serverInfo: init.result?.serverInfo || null,
      toolCount: names.length,
      tools: names,
      requiredTools,
      missingTools,
      malformedStdout,
      stderr: stderr.trim(),
      exitCode,
      exitSignal,
      error: init.error || tools.error || null,
    };
  })();
}

function printHelp() {
  process.stdout.write(`cpe-scan - local CLI for clean-process-ended v0.7.2\n\nCommands:\n  report, candidates, cleanup, explain, profiles, config, session, ledger\n  reconcile, watch\n  audit-bundle --output-dir <dir>\n  policy-explain --pid <pid>\n  stale-sessions\n  resource-impact\n  auto-cleanup [--status]\n  managed-processes [--running-only]\n  managed-explain --managed-process-id <id>\n  managed-reconcile\n  managed-lifecycle\n  managed-cleanup-dryrun\n  managed-stale\n  doctor\n  validate-package --strict-public\n  public-tree-check\n  install-snippet --client codex|claude|claude_code|gemini|gemini_cli\n  agent-protocol --client codex|claude|gemini\n  janitor-discovery --client codex|claude|gemini\n  session-close-check\n  smoke-stdio\n\nCommon options:\n  --json\n  --scope owned_current_session|related_unowned|unknown_owner|all|explicit_pids\n       Scope note: related_unowned, unknown_owner and all are report/candidates scopes.\n       Cleanup remains dry-run first and report-only ownership scopes are blocked.\n  --pid <pid>                 Repeatable.\n  --pids <pid,pid>\n  --min-age <minutes>\n  --include-command-line\n  --config <path>\n  --data-dir <path>\n  --project-key <key>\n\nCleanup options:\n  --no-dry-run                Requests real termination, still blocked unless install config explicitly enables cleanup.realExecutionEnabled with the required acknowledgement.\n  --confirm-token <token>     Always required for real cleanup.\n  --request-confirm-token     Explicitly request a live token during dry-run; agents should not use this autonomously.\n  --signal SIGTERM|SIGKILL|SIGINT\n  --force                     Escalate to SIGKILL after grace period.\n\nExamples:\n  cpe-scan report --json\n  cpe-scan audit-bundle --output-dir ./evidence/cpe --json\n  cpe-scan managed-lifecycle --json\n  cpe-scan managed-cleanup-dryrun --json\n  cpe-scan janitor-discovery --client codex --json\n  cpe-scan session-close-check --project-key my-project --json\n  cpe-scan smoke-stdio --json\n  cpe-run --host codex --role mcp-server -- node ./server.js\n`);
}
