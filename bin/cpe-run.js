#!/usr/bin/env node
import { runManagedCommand } from "../src/managed-runner.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const separator = args.indexOf("--");
const optionArgs = separator === -1 ? [] : args.slice(0, separator);
const command = separator === -1 ? args : args.slice(separator + 1);

if (!command.length) {
  printHelp();
  process.exitCode = 2;
} else {
  try {
    const role = optionValue(optionArgs, "--role") || "tool";
    const stdioWrapperMode = isStdioWrapperRole(role) || optionArgs.includes("--stdio-wrapper");
    const result = await runManagedCommand({
      command,
      hostProfile: optionValue(optionArgs, "--host") || process.env.CPE_HOST_PROFILE || null,
      role,
      leaseTtlSeconds: optionValue(optionArgs, "--lease-ttl"),
      shutdownPolicy: optionValue(optionArgs, "--shutdown-policy") || "none",
      dataDir: optionValue(optionArgs, "--data-dir"),
      configPath: optionValue(optionArgs, "--config"),
    });
    if (optionArgs.includes("--json")) {
      const stream = stdioWrapperMode ? process.stderr : process.stdout;
      stream.write(`${JSON.stringify(result, null, 2)}\n`);
    }
    process.exitCode = Number.isInteger(result.exitCode) ? result.exitCode : 0;
  } catch (error) {
    process.stderr.write(`cpe-run: ${error.message}\n`);
    process.exitCode = 1;
  }
}

function optionValue(values, key) {
  const index = values.indexOf(key);
  if (index === -1) return undefined;
  return values[index + 1];
}

function isStdioWrapperRole(role) {
  return ["mcp-server", "stdio-server", "stdio"].includes(String(role || "").toLowerCase());
}

function printHelp() {
  process.stdout.write(`cpe-run - launch a managed child process for clean-process-ended v0.7.3\n\nUsage:\n  cpe-run --host codex --role mcp-server -- <command> [args...]\n\nOptions:\n  --host <profile>             codex|claude_code|gemini_cli|qwen_code|generic_mcp_host\n  --role <role>                tool|mcp-server|dev-server|agent-helper\n  --lease-ttl <seconds>        Optional lease expiry metadata.\n  --shutdown-policy <policy>   none|terminate-on-expiry (policy metadata; cleanup is still planned separately).\n  --config <path>\n  --data-dir <path>\n  --stdio-wrapper              Treat stdout as child-owned stdio transport.\n  --json                       Prints launcher result to stdout, except stdio roles print to stderr.\n\nThis launcher records explicit ownership metadata in the ledger. It does not clean up or terminate unrelated processes.\n`);
}
