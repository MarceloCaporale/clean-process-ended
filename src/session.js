import crypto from "node:crypto";

export function createSessionContext({ ledger } = {}) {
  const mcpInstanceId = ledger?.ensureMcpInstanceId?.() || randomId("mcp");
  const startedAtMs = Date.now();

  return {
    mcpInstanceId,
    sessionEpochId: randomId("epoch"),
    startedAt: new Date(startedAtMs).toISOString(),
    startedAtMs,
    serverPid: process.pid,
    hostProfile: ledger?.config?.host?.expectedProfile || null,
    clientName: process.env.CPE_CLIENT_NAME || null,
    baselineSnapshotId: null,
  };
}

export function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}
