# Release Notes v0.7.3

`clean-process-ended` v0.7.3 is a public-beta framing and hardening release for the ownership-first local MCP process janitor.

## Highlights

- Presents the package as runtime-validated local process hygiene, evidence and dry-run cleanup planning, not as a "diagnostics only" tool.
- Adds explicit public validation metrics for the current beta line: validated host workflows, exposed MCP tool surface, test gate, dependency audit, tarball smoke and `0` public real-cleanup executions.
- Keeps real termination non-operable from the public CLI/MCP surface while making the tested value proposition clearer.
- Records Qwen Code CLI non-destructive MCP tool-invocation validation with Ollama-backed Qwen models without adding unverified host or cleanup-parity claims.
- Constrains the Windows `CPE_POWERSHELL` override to trusted PowerShell executable names and rejects arbitrary binaries or shell-like arguments.
- Parses trusted `CPE_POWERSHELL` Windows paths with Windows path semantics across all CI platforms.
- Fixes the macOS CI failure class seen in v0.7.2 by using filesystem realpath identity for project config paths and supporting BSD/macOS `ps etime` process age output.
- Splits GitHub Actions into explicit release gates and adds macOS-only failure diagnostics for future scanner regressions.
- Documents the Windows scanner CPU-sampling cost so operators understand why a close check can take more than one second on process-heavy machines.

## Public Safety Position

The public beta produces process reports, ownership partitions, dry-run cleanup plans, sanitized receipts and audit evidence. It does not execute real termination from the public CLI/MCP surface.

That is not a lack of product behavior. It is the safety boundary for the public beta: the useful public behavior is runtime validation, evidence and reviewable cleanup planning; real termination requires future release gates and must keep the strict policy controls.

## Validation State

The public validation claim should use two categories:

- **Runtime validation metrics**: local host validations, MCP tool discovery, dry-run planning, test results, package smoke, dependency audit and evidence privacy checks.
- **Adoption metrics**: stars, forks, downloads and third-party production usage. These require time after publication and should not be substituted for runtime validation.

For this beta, publish runtime validation metrics and avoid pretending there are adoption metrics before the package has had public exposure.

See `docs/public-positioning.md`, `docs/discoverability.md`, `docs/support-matrix.md` and `docs/verification/v0.7.3/README.md`.

## Publication Gates

Before tag, GitHub Release, MCP Registry submission or npm publication:

- `npm run public-beta-candidate` must pass on the exact public tree;
- GitHub Actions must pass after push;
- host evidence must stay aligned with the public support matrix;
- no private LAB paths, audit folders, raw process output, command lines, env vars, tokens or secrets may ship;
- explicit maintainer approval is required for tag, release and npm publication.
