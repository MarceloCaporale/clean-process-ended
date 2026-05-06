import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const npmExecPath = process.env.npm_execpath || null;
const npmCommand = npmExecPath ? node : process.platform === "win32" ? "npm.cmd" : "npm";
const npmPrefix = npmExecPath ? [npmExecPath] : [];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    encoding: "utf8",
    shell: options.shell || false,
  });
  return {
    command,
    args,
    cwd: options.cwd || root,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message || null,
    ok: result.status === 0,
  };
}

function runNpm(args, options = {}) {
  return run(npmCommand, npmPrefix.concat(args), options);
}

function runShim(command, args, options = {}) {
  if (process.platform !== "win32") return run(command, args, options);
  const comspec = process.env.ComSpec || "cmd.exe";
  return run(comspec, ["/d", "/c", "call", command, ...args], options);
}

function assertRun(step, result) {
  if (result.ok) return;
  const error = new Error(`${step} failed with exit code ${result.status}`);
  error.result = result;
  throw error;
}

function exists(relativePath, base) {
  return fs.existsSync(path.join(base, relativePath.replace(/\//g, path.sep)));
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cpe-pack-smoke-"));
const appRoot = path.join(tempRoot, "app");
const installHome = path.join(tempRoot, "home");
fs.mkdirSync(appRoot, { recursive: true });
fs.mkdirSync(installHome, { recursive: true });

const report = {
  product: "clean-process-ended",
  check: "package_smoke_tarball",
  ok: false,
  tempRoot,
  steps: [],
  requiredFiles: [],
};

try {
  const pack = runNpm(["pack", "--json", "--pack-destination", tempRoot]);
  report.steps.push({ name: "npm_pack", status: pack.status });
  assertRun("npm pack", pack);

  const packJson = JSON.parse(pack.stdout);
  const filename = packJson?.[0]?.filename;
  const tarballPath = path.isAbsolute(filename) ? filename : path.join(tempRoot, filename);
  report.tarball = {
    path: tarballPath,
    filename,
    size: packJson?.[0]?.size,
    unpackedSize: packJson?.[0]?.unpackedSize,
    entryCount: packJson?.[0]?.entryCount,
  };

  fs.writeFileSync(path.join(appRoot, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2));

  const install = runNpm(["install", tarballPath, "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: appRoot });
  report.steps.push({ name: "npm_install_tarball", status: install.status });
  assertRun("npm install tarball", install);

  const packageRoot = path.join(appRoot, "node_modules", "clean-process-ended");
  const requiredFiles = [
    "README.md",
    "README_ES.md",
    "README_DE.md",
    "README_PT_BR.md",
    "README_ZH.md",
    "README_JA.md",
    "AGENTS.md",
    "schemas/process_janitor_receipt.schema.json",
    "schemas/audit_bundle.schema.json",
    "examples/README.md",
    "docs/validation/VALIDATION.md",
    "docs/validation/evidence/README.md",
    "docs/verification/v0.7.2/release-gate-summary.md",
    "scripts/smoke-packed-tarball.mjs",
  ];
  report.requiredFiles = requiredFiles.map((file) => ({ file, ok: exists(file, packageRoot) }));
  const missing = report.requiredFiles.filter((item) => !item.ok);
  if (missing.length) {
    throw new Error(`tarball is missing required public files: ${missing.map((item) => item.file).join(", ")}`);
  }

  const env = {
    ...process.env,
    CLEAN_PROCESS_ENDED_HOME: installHome,
    CPE_HOST_PROFILE: "codex",
  };
  const cli = path.join(packageRoot, "bin", "cpe-scan.js");
  const binDir = path.join(appRoot, "node_modules", ".bin");
  const shimExt = process.platform === "win32" ? ".cmd" : "";
  const pathEnvKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  const shimEnv = {
    ...env,
    [pathEnvKey]: `${binDir}${path.delimiter}${env[pathEnvKey] || ""}`,
  };
  const cpeScanShim = path.join(binDir, `cpe-scan${shimExt}`);
  const cpeRunShim = path.join(binDir, `cpe-run${shimExt}`);
  const mcpShim = path.join(binDir, `clean-process-ended-mcp${shimExt}`);
  for (const [name, file] of [
    ["shim_exists_cpe_scan", cpeScanShim],
    ["shim_exists_cpe_run", cpeRunShim],
    ["shim_exists_clean_process_ended_mcp", mcpShim],
  ]) {
    const ok = fs.existsSync(file);
    report.steps.push({ name, status: ok ? 0 : 1 });
    if (!ok) throw new Error(`missing installed bin shim: ${file}`);
  }
  for (const [name, args] of [
    ["help", [cli, "--help"]],
    ["smoke_stdio", [cli, "smoke-stdio", "--json"]],
    ["janitor_discovery", [cli, "janitor-discovery", "--client", "codex", "--json"]],
    ["validate_package_installed", [cli, "validate-package", "--json"]],
  ]) {
    const step = run(node, args, { cwd: packageRoot, env });
    report.steps.push({ name, status: step.status });
    assertRun(name, step);
  }
  for (const [name, command, args] of [
    ["shim_cpe_scan_help", cpeScanShim, ["--help"]],
    ["shim_cpe_run_help", cpeRunShim, ["--help"]],
    ["shim_mcp_help", mcpShim, ["--help"]],
    ["shim_cpe_scan_smoke_stdio", cpeScanShim, ["smoke-stdio", "--json"]],
  ]) {
    const step = runShim(command, args, { cwd: appRoot, env: shimEnv });
    report.steps.push({ name, status: step.status });
    assertRun(name, step);
  }

  report.ok = true;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  report.error = {
    message: error.message,
    step: error.result
      ? {
          command: error.result.command,
          args: error.result.args,
          status: error.result.status,
          stdout: error.result.stdout.slice(0, 4000),
          stderr: error.result.stderr.slice(0, 4000),
          error: error.result.error,
        }
      : null,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
