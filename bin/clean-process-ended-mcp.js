#!/usr/bin/env node

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`clean-process-ended\n\nRuns the Agent Process Janitor MCP server over stdio.\n\nOptions:\n  --config <path>   Load an explicit JSON config.\n  --data-dir <path> Use an explicit ledger directory.\n\nFor local CLI scanning use: cpe-scan report --json\n`);
  process.exit(0);
}

const configPath = valueAfter(args, "--config");
const dataDir = valueAfter(args, "--data-dir");

const { runMcpServer } = await import("../src/mcp-server.js");

runMcpServer({ configPath, dataDir }).catch((error) => {
  console.error("Fatal error in clean-process-ended:", error);
  process.exit(1);
});

function valueAfter(values, key) {
  const index = values.indexOf(key);
  if (index === -1) return undefined;
  return values[index + 1];
}
