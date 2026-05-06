import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { asToolText } from "./format.js";
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
  primeRuntimeBaseline,
  profileList,
  reconcileNow,
  resourceImpactReport,
  sessionCloseCheck,
  sessionStatus,
  staleSessionReport,
  startRuntimeWatcher,
} from "./runtime.js";

export async function runMcpServer({ configPath, dataDir } = {}) {
  const runtime = createRuntime({
    configPath,
    dataDir,
    logger: (...args) => {
      if (process.env.CPE_DEBUG) console.error("[clean-process-ended-mcp]", ...args);
    },
  });

  const server = new McpServer({
    name: "clean-process-ended",
    version: "0.7.2",
  });

  await primeRuntimeBaseline(runtime);

  server.registerTool(
    "process_scope_report",
    {
      description:
        "Scan local processes, reconcile them with this session ledger, and report agent/MCP process ownership without terminating anything.",
      inputSchema: {
        min_age_minutes: z.number().min(0).optional().describe("Override the age threshold used for candidate classification."),
        include_command_line: z.boolean().optional().describe("Include redacted command lines in the report."),
        limit: z.number().int().min(1).max(200).optional().describe("Maximum number of top candidates to return."),
      },
    },
    async (args) => asToolText(await buildScopeReport(runtime, mapOptions(args))),
  );

  server.registerTool(
    "process_cleanup_candidates",
    {
      description:
        "Return detailed candidates grouped by ownership. This is audit-only and never terminates processes.",
      inputSchema: {
        scope: z.enum(["owned_current_session", "related_unowned", "unknown_owner", "all", "explicit_pids"]).optional(),
        pids: z.array(z.number().int().positive()).optional().describe("Optional PID filter; useful when reviewing explicit candidates."),
        min_age_minutes: z.number().min(0).optional(),
        include_command_line: z.boolean().optional(),
        limit: z.number().int().min(1).max(300).optional(),
      },
    },
    async (args) => asToolText(await buildCleanupCandidates(runtime, mapOptions(args))),
  );

  server.registerTool(
    "process_cleanup",
    {
      description:
        "Dry-run selected owned_current_session candidates. In v0.7.x public CLI/MCP, real termination remains non-operable because evidence inputs are not exposed; dry_run=false stays blocked by safety gates. Agents must not call dry_run=false autonomously.",
      inputSchema: {
        dry_run: z.boolean().optional().describe("Defaults to true. When true, kills nothing. A live confirm token is not returned unless real cleanup is enabled by trusted config or request_confirm_token=true is explicit."),
        confirm_token: z.string().optional().describe("Token returned by a previous dry-run cleanup plan."),
        request_confirm_token: z.boolean().optional().describe("Explicitly request a live confirm token during dry-run. Agents should leave this false unless a human asks for manual cleanup."),
        scope: z.enum(["owned_current_session", "explicit_pids"]).optional(),
        pids: z.array(z.number().int().positive()).optional(),
        min_age_minutes: z.number().min(0).optional(),
        signal: z.enum(["SIGTERM", "SIGKILL", "SIGINT"]).optional(),
        force: z.boolean().optional().describe("After SIGTERM, optionally escalate to SIGKILL if still alive."),
        include_process_tree: z.boolean().optional().describe("Reserved; ignored unless tree-kill is enabled in config."),
        include_command_line: z.boolean().optional(),
      },
    },
    async (args) => asToolText(await executeCleanup(runtime, mapOptions(args))),
  );

  server.registerTool(
    "janitor_discovery",
    {
      description:
        "Return non-destructive machine-readable guidance for when agents should use clean-process-ended. It does not scan processes and never terminates anything.",
      inputSchema: {
        client: z.string().optional().describe("Optional host/client name such as codex, claude_code or gemini_cli."),
      },
    },
    async (args) => asToolText(janitorDiscovery(runtime, mapOptions(args))),
  );

  server.registerTool(
    "session_close_check",
    {
      description:
        "Run a compact non-destructive close-task check with one process snapshot and a dry-run cleanup plan. It never returns a live confirm token and never terminates processes.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional().describe("Maximum number of representative candidates to return."),
        project_key: z.string().optional().describe("Optional project key to include in the process_janitor_receipt summary."),
      },
    },
    async (args) => asToolText(await sessionCloseCheck(runtime, mapOptions(args))),
  );

  server.registerTool(
    "process_explain",
    {
      description:
        "Explain a single PID with ownership evidence, host/tool profiles, reasons, blockers, and cleanup eligibility. It never terminates processes.",
      inputSchema: {
        pid: z.number().int().positive(),
        include_command_line: z.boolean().optional(),
      },
    },
    async (args) => asToolText(await explainProcess(runtime, mapOptions(args))),
  );

  server.registerTool(
    "profile_list",
    {
      description: "List configured host and tool profiles used as weak signals for process classification.",
      inputSchema: {},
    },
    async () => asToolText(profileList(runtime)),
  );

  server.registerTool(
    "config_explain",
    {
      description: "Explain effective config, config paths, data directory, and safety defaults without exposing command line secrets.",
      inputSchema: {},
    },
    async () => asToolText(configExplain(runtime)),
  );

  server.registerTool(
    "session_status",
    {
      description: "Show this MCP instance identity, session epoch, baseline, and watcher status.",
      inputSchema: {},
    },
    async () => asToolText(sessionStatus(runtime)),
  );

  server.registerTool(
    "ledger_read",
    {
      description: "Read the local process ledger summary, recent snapshot metadata, and recent cleanup events.",
      inputSchema: {
        include_recent_events: z.boolean().optional(),
      },
    },
    async (args) => asToolText(runtime.ledger.summary({ includeRecentEvents: args?.include_recent_events !== false })),
  );

  server.registerTool(
    "watcher_status",
    {
      description: "Show the status of the embedded watcher that takes periodic non-destructive snapshots while this MCP server is running.",
      inputSchema: {},
    },
    async () => asToolText(runtime.watcher.status()),
  );

  server.registerTool(
    "watcher_reconcile_now",
    {
      description: "Force a watcher reconciliation snapshot now. It updates the ledger and does not terminate anything.",
      inputSchema: {
        min_age_minutes: z.number().min(0).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args) => asToolText(await reconcileNow(runtime, mapOptions(args))),
  );

  server.registerTool(
    "audit_bundle",
    {
      description: "Generate a single non-destructive audit payload with config, session, report, candidates, dry-run metrics and safety metadata.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args) => asToolText(await buildAuditBundle(runtime, mapOptions(args))),
  );

  server.registerTool(
    "policy_explain",
    {
      description: "Explain cleanup and auto-cleanup policy gates for one PID. It never terminates processes.",
      inputSchema: {
        pid: z.number().int().positive(),
        include_command_line: z.boolean().optional(),
      },
    },
    async (args) => asToolText(await policyExplain(runtime, mapOptions(args))),
  );

  server.registerTool(
    "stale_session_report",
    {
      description: "Report previous sessions from this installation that appear stale. This is report-only.",
      inputSchema: {},
    },
    async () => asToolText(await staleSessionReport(runtime)),
  );

  server.registerTool(
    "resource_impact_report",
    {
      description: "Summarize CPU/RSS impact, top blockers, and report partitions for related processes.",
      inputSchema: {
        min_age_minutes: z.number().min(0).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args) => asToolText(await resourceImpactReport(runtime, mapOptions(args))),
  );

  server.registerTool(
    "auto_cleanup_status",
    {
      description: "Show experimental auto-cleanup policy status and gates. Auto-cleanup is disabled by default.",
      inputSchema: {},
    },
    async () => asToolText(autoCleanupStatus(runtime)),
  );

  server.registerTool(
    "auto_cleanup_dryrun",
    {
      description: "Plan experimental auto-cleanup without terminating anything, even when auto-cleanup is disabled.",
      inputSchema: {
        min_age_minutes: z.number().min(0).optional(),
        include_command_line: z.boolean().optional(),
      },
    },
    async (args) => asToolText(await autoCleanupDryRun(runtime, mapOptions(args))),
  );

  server.registerTool(
    "managed_process_list",
    {
      description: "List processes launched explicitly through cpe-run lifecycle management. This is report-only.",
      inputSchema: {
        include_exited: z.boolean().optional(),
      },
    },
    async (args) => asToolText(managedProcessList(runtime, { includeExited: args?.include_exited !== false })),
  );

  server.registerTool(
    "managed_process_explain",
    {
      description: "Explain one cpe-run managed process record by managedProcessId. It never terminates processes.",
      inputSchema: {
        managed_process_id: z.string(),
      },
    },
    async (args) => asToolText(managedProcessExplain(runtime, mapOptions(args))),
  );

  server.registerTool(
    "managed_reconcile",
    {
      description: "Reconcile explicit cpe-run managed process records against the current process table. It never terminates processes.",
      inputSchema: {},
    },
    async () => asToolText(await managedReconcile(runtime)),
  );

  server.registerTool(
    "managed_lifecycle_report",
    {
      description: "Report lifecycle state for cpe-run managed processes: running, missing, exited, expired or PID-reuse mismatch.",
      inputSchema: {},
    },
    async () => asToolText(await managedLifecycleReport(runtime)),
  );

  server.registerTool(
    "managed_cleanup_dryrun",
    {
      description: "Plan cleanup for managed processes only. This is dry-run only and never terminates processes.",
      inputSchema: {},
    },
    async () => asToolText(await managedCleanupDryRun(runtime)),
  );

  server.registerTool(
    "managed_stale_report",
    {
      description: "Report stale managed process records. This is report-only evidence.",
      inputSchema: {},
    },
    async () => asToolText(await managedStaleReport(runtime)),
  );

  await startRuntimeWatcher(runtime);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function mapOptions(args = {}) {
  return {
    minAgeMinutes: args.min_age_minutes,
    includeCommandLine: args.include_command_line,
    limit: args.limit,
    scope: args.scope,
    pids: args.pids,
    dryRun: args.dry_run,
    confirmToken: args.confirm_token,
    requestConfirmToken: args.request_confirm_token,
    signal: args.signal,
    force: args.force,
    includeProcessTree: args.include_process_tree,
    pid: args.pid,
    managedProcessId: args.managed_process_id,
    client: args.client,
    projectKey: args.project_key,
  };
}
