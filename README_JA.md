# clean-process-ended

<p align="center">
  <img src="docs/assets/clean-process-ended-social-preview.png" alt="clean-process-ended: local process hygiene for MCP agent workflows" width="100%">
</p>

他の言語: [English](./README.md) | [Español](./README_ES.md) | [Deutsch](./README_DE.md) | [Português do Brasil](./README_PT_BR.md) | [中文](./README_ZH.md)

**AI coding agent 向けの ownership-first local MCP process janitor。Codex Desktop、Claude Code、Gemini CLI、Ollama-backed Qwen models を使う Qwen Code CLI non-destructive tool workflow、MCP-compatible host workflows で、subprocess が実際の作業より長く残る場面を想定しています。**

`clean-process-ended` は agent / MCP session に関係するローカル subprocess を調査し、session ownership と弱い類似シグナルを分け、環境に対する操作を検討する前に、reproducible evidence に基づく reviewable な dry-run cleanup plan を生成します。

`clean-process-ended` は local stdio MCP server として動作します。Codex Desktop、Claude Code、Gemini CLI には dry-run validation があり、Ollama-backed Qwen models を使う Qwen Code CLI には native non-destructive MCP tool invocation validation があります。他の MCP-compatible hosts は generic MCP profile でテストできます。

これは、subprocess、browser helper、devtools、local server、MCP server が host session や task の終了後も残ることがあるローカル MCP と coding-agent のワークフロー向けに設計されています。プロジェクトはプロセス名の類似性ではなく ownership evidence でプロセスを分類し、その後で actionable、blocked、related、unknown を報告します。

Process evidence を remote service に送信せず、デフォルトでは full command line を保存せず、beta diagnostics を process termination の許可として扱いません。

## 得られるもの

- **Agent process visibility**: Codex Desktop、Claude Code、Gemini CLI、Ollama-backed Qwen models を使う Qwen Code CLI non-destructive tool workflow、generic MCP host、今後 validated される runtime に関係するローカル subprocess を、process-name cleanup に頼らず確認できます。
- **Ownership-first safety**: 破壊的な計画の前に `owned_current_session`、`related_unowned`、`unknown_owner` を分類します。
- **Dry-run close checks**: `janitor_discovery`、`session_close_check`、reports、candidates、audit bundles により、agent に具体的な end-of-task protocol を提供します。
- **Reproducible evidence**: sanitized receipts、SHA-256 evidence、audit bundles、support-matrix notes を review 用に生成します。
- **Managed lifecycle helpers**: 既知の local commands を `cpe-run` で wrap し、後続の dry-run reconciliation により強い evidence を与えます。
- **Optional memory pairing**: `codex-agent-mem` ([GitHub](https://github.com/MarceloCaporale/codex-agent-mem)) と組み合わせて、continuity と process hygiene を同じ close flow で閉じられます。

## この repository が存在する理由

- AI coding agent は MCP server、browser driver、local dev server、helper process を残すことがあります。
- `node`、`python`、`chrome`、`mcp`、`codex` のような process name は ownership の証明ではありません。
- どの process を cleanup すべきか判断する前に、安全な task-close protocol が必要です。
- Public tooling は、inspect、explain、dry-run、record evidence、人間への確認という保守的な path を簡単にすべきです。
- `clean-process-ended` は local process hygiene を task manager 上の推測ではなく auditable workflow にします。

## ステータス

- Version: `0.7.3` beta。
- Runtime: Node.js `>=18.17`。
- Transport: MCP stdio。
- デフォルト cleanup: dry-run。
- デフォルト automatic cleanup: 無効。
- Persistent watcher: デフォルトではインストールされません。

beta の結果を operator review の代替として扱わないでください。v0.7.3 の公開 CLI/MCP surface は runtime-validated process hygiene、evidence、dry-run planning を提供し、公開 CLI/MCP surface から実際の termination は実行しません。

## Validation Snapshot

現在の v0.7.3 public-beta evidence は runtime validation metrics と adoption metrics を分けます。Discovery、reports、evidence、dry-run planning を検証しますが、real cleanup validation は主張しません:

| Area | Current evidence |
| --- | --- |
| MCP tool surface | Server は close-check、report、explain、policy、audit、managed-lifecycle tools を公開します。 |
| Codex | Restart 後の local native validation; dry-run only。 |
| Claude Code | local native MCP validation 完了; dry-run のみ; sanitized evidence summary あり。 |
| Gemini CLI | local native MCP validation 完了; dry-run のみ; sanitized evidence summary あり。 |
| Qwen Code CLI | Ollama-backed Qwen models を使う local native MCP tool invocation validation 完了; non-destructive diagnostic workflow のみ; full dry-run close-check parity は主張しません。 |
| Public cleanup real | public validation に含まれる real cleanup execution は `0`。 |
| Evidence privacy | Public receipts は full command lines、raw process output、env vars、tokens、secrets を含めない設計です。 |

## Public Validation Metrics

これは public beta line と release gate の実際の validation metrics であり、stars、forks、downloads、third-party production usage のような adoption metrics ではありません:

- Validated MCP host workflows: `4` (`codex`, `claude_code`, `gemini_cli`, `qwen_code`)。三つの dry-run close-check workflows と、一つの Qwen Code CLI native non-destructive MCP tool invocation workflow を含みます。Qwen dry-run close-check parity は主張しません。
- MCP stdio smoke surface: shipped server は close-check、report、explain、policy、audit、managed-lifecycle tool catalog を公開します。
- Local release gate: ESLint、syntax checks、Node tests、MCP stdio smoke、strict package validation、public-tree check、dependency audit、`npm pack --dry-run`、installed-tarball smoke。
- GitHub Actions matrix: Windows、macOS、Linux で Node 18、20、22 に設定済み。
- Public real-cleanup executions: `0`。
- Production dependency audit target: `0` moderate-or-higher vulnerabilities。
- Evidence privacy target: public receipts に full command lines、raw process output、env vars、tokens、secrets、live confirm tokens を含めないこと。

## インストール

`npx` を使う場合:

```bash
npx -y --package clean-process-ended clean-process-ended-mcp
```

または package をインストールして binaries を実行:

```bash
npm install -g clean-process-ended
cpe-scan report --json
clean-process-ended-mcp
```

## MCP Host Snippet

Codex 形式の TOML 設定:

```toml
[mcp_servers.clean_process_ended]
command = "npx"
args = ["-y", "--package", "clean-process-ended", "clean-process-ended-mcp"]
env = { CPE_HOST_PROFILE = "codex" }
```

現在 package が公開している host profile 値:

- `codex`
- `claude_code`
- `gemini_cli`
- `qwen_code`
- `generic_mcp_host`

追加 samples は `samples/` にあり、コピーして調整できる examples は `examples/` にあります。

## Support Matrix

この matrix は v0.7.3 の public profile intent と validation status を示します。文書化された policy gates を超える cleanup safety は主張しません。Evidence levels と release status は `docs/support-matrix.md` と `docs/validation/` を参照してください。

| Host | Profile | Public status |
| --- | --- | --- |
| Codex | `codex` | 再起動後の現在のローカル validation 完了; dry-run のみ。 |
| Claude Code | `claude_code` | 現在のローカル native validation 完了; dry-run のみ。 |
| Gemini CLI | `gemini_cli` | 現在のローカル native validation 完了; dry-run のみ。 |
| Qwen Code CLI | `qwen_code` | Ollama-backed Qwen models を使う現在のローカル native MCP tool invocation validation 完了; non-destructive diagnostic workflow のみ。 |
| Generic MCP Host | `generic_mcp_host` | Diagnostic profile のみ; host-specific ownership claims には separate evidence が必要です。 |

## CLI

一般的な非破壊コマンド:

```bash
cpe-scan report --json
cpe-scan candidates --json
cpe-scan cleanup --dry-run --scope owned_current_session --json
cpe-scan janitor-discovery --client codex --json
cpe-scan agent-protocol --client codex --json
cpe-scan session-close-check --project-key my-project --json
cpe-scan audit-bundle --output-dir ./evidence/cpe --json
cpe-scan smoke-stdio --json
```

Managed lifecycle evidence:

```bash
cpe-run --host codex --role mcp-server -- node ./server.js
cpe-scan managed-reconcile --json
cpe-scan managed-lifecycle --json
cpe-scan managed-cleanup-dryrun --json
```

`managed-cleanup-dryrun` は v0.7.3 では report-only です。

## Agent Close Protocol

MCP をインストールしても、host で tools が利用可能になるだけです。agent が必ず呼び出すことは保証されません。

推奨される agent behavior:

- `janitor_discovery` を使って非破壊 protocol を学ぶ;
- subprocesses、MCP servers、browsers/devtools、subagents、local servers、background jobs を含む非自明なタスクの終了時に `session_close_check` を実行する;
- `dry_run=false` または `--no-dry-run` を自律的に呼ばない;
- real cleanup について人間に尋ねる前に、dry-run plan を要約する。

## codex-agent-mem との任意連携

`codex-agent-mem` v1.0.1 と `clean-process-ended` v0.7.3 は別々に機能しますが、相互補完するように設計されています。`codex-agent-mem` は task continuity と closure state を保持し、`clean-process-ended` は process-hygiene evidence と dry-run janitor receipts を記録します。併用する場合の推奨 close flow:

1. `codex-agent-mem` で continuity を復元して閉じる;
2. `clean-process-ended` を dry-run close check として実行する;
3. compact な `process_janitor_receipt` summary または hash だけを memory に保存する。

Combined workflow は repeated context を減らし、task end により安全な hygiene check を追加することで user experience を改善します。この integration は任意です。どちらの MCP も、もう一方への hard dependency ではありません。Public receipt schemas と examples は `schemas/` と `docs/fixtures/codex-agent-mem/` にあります。

## Project Metadata

- Author: Marcelo Caporale.
- X: `https://x.com/MarceloCaporale`.
- Studio: `https://visualaimedia.com`.
- Lab: `https://visualsystemslab.com`.
- License: Apache-2.0.
- Repository: `https://github.com/MarceloCaporale/clean-process-ended`.
- MCP Registry name: `io.github.marcelocaporale/clean-process-ended`.
- Related optional MCP: `codex-agent-mem`.

## Cleanup Safety

デフォルトでは cleanup は dry-run で、scope は `owned_current_session` です。v0.7.3 では、公開 CLI/MCP surface は runtime-validated process hygiene、evidence、dry-run planning を提供します。Evidence inputs は意図的に公開されていないため、public CLI/MCP から real termination は操作できません。Internal real-cleanup gate は public surface より厳しく、termination path の前に次のすべてを要求します:

- 現在の safety policy における eligible な `managed_strong` または `managed_strong_expired` candidate;
- `cleanup.realExecutionEnabled=true` を持つ trusted install config;
- `--no-dry-run`;
- 直前の dry-run plan から得た fresh confirm token;
- prior audit/receipt bundle からの valid SHA-256 evidence;
- unknown ownership、browser/devtools guardrails、host-root protection などの policy blocker がないこと。

将来のバージョンが real cleanup を公開する場合、evidence SHA-256 inputs を明示的に公開し、これらの gates を維持する必要があります。

`related_unowned` と `unknown_owner` はデフォルトで report-only です。

Experimental auto-cleanup は opt-in のみです。デフォルトでは無効で、trusted installation config で明示的に acknowledgement される必要があり、有効化されていても experimental として扱うべきです。

## ドキュメント

- `AGENTS.md`: coding agents と maintainers のための repository guide。
- `docs/quickstart.md`: 最短の安全な setup と close-check flow。
- `docs/SAFETY_MODEL.md`: cleanup と auto-cleanup safety model。
- `docs/ARCHITECTURE.md`: scanner、ownership、managed lifecycle、audit bundle architecture。
- `docs/design-decisions.md`: product と architecture decisions。
- `docs/HOSTS.md`: host profiles と validation status。
- `docs/support-matrix.md`: formal support matrix と evidence levels。
- `docs/INSTALL.md`: install と host binding notes。
- `docs/WHEN_TO_USE.md`: close checks を実行するタイミング。
- `docs/AGENT_PROTOCOL.md`: agents と project prompts の instructions。
- `docs/INTEGRATION_CODEX_AGENT_MEM.md`: `codex-agent-mem` との optional continuity integration。
- `docs/MANAGED_LIFECYCLE.md`: managed process lifecycle commands。
- `docs/AUDIT_BUNDLE.md`: non-destructive evidence bundle contents。
- `docs/validation/`: validation levels と host evidence notes。
- `docs/verification/`: verification notes と release-gate summaries。
- `schemas/`: receipts と audit bundle summaries の public JSON schemas。
- `examples/`: copy-adaptable host configuration examples。
- `SECURITY.md`: security reporting と support policy。
- `SUPPORT.md`: public support matrix。
- `CHANGELOG.md`: release notes。
- `RELEASE_NOTES_v0.7.3.md`: v0.7.3 の release notes。

## Release Checks

Maintainer が tag、GitHub Release、MCP Registry submission、npm publication を準備する場合に実行:

```bash
npm run public-beta-candidate
```

この gate には ESLint、syntax checks、tests、MCP stdio smoke validation、strict package validation、moderate-or-higher dependency audit、public-tree validation、`npm pack --dry-run`、installed-tarball smoke validation が含まれます。

その後 `docs/release-checklist.md` を完了し、`docs/verification/v0.7.3/README.md` にある host evidence を更新し、GitHub Actions を待ち、公開 GitHub URL から外部 static audit を実行し、明示的な人間の承認後にのみ進めます。

## ライセンス

Apache-2.0.
