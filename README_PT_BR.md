# clean-process-ended

Outros idiomas: [English](./README.md) | [Español](./README_ES.md) | [Deutsch](./README_DE.md) | [中文](./README_ZH.md) | [日本語](./README_JA.md)

**Janitor local MCP, ownership-first, para processos de agentes de codigo; pensado para Codex, Claude Code, Gemini CLI e hosts compativeis com MCP onde subprocessos podem sobreviver ao trabalho util.**

`clean-process-ended` inspeciona subprocessos locais relacionados a sessoes de agentes e MCP, separa ownership de sessao de sinais fracos de semelhanca e produz planos conservadores de cleanup em dry-run antes de considerar qualquer acao no ambiente.

Ele foi desenhado para fluxos locais MCP e agentes de codigo nos quais subprocessos, helpers de navegador, devtools, servidores locais ou servidores MCP podem continuar vivos depois da sessao do host ou da tarefa. O projeto classifica processos por evidencia de ownership, nao por semelhanca de nome, e depois informa o que e acionavel, bloqueado, relacionado ou desconhecido.

Ele nao envia evidencia de processos a um servico remoto, nao armazena command lines completas por padrao e nao trata diagnosticos beta como permissao para terminar processos.

## O que entrega

- **Visibilidade de processos de agentes**: ver subprocessos locais relacionados a Codex, Claude Code, Gemini CLI, hosts MCP genericos e runtimes futuros validados sem depender de cleanup por nome de processo.
- **Seguranca ownership-first**: classificar `owned_current_session`, `related_unowned` e `unknown_owner` antes de planejar algo destrutivo.
- **Close checks em dry-run**: dar aos agentes um protocolo concreto de fim de tarefa via `janitor_discovery`, `session_close_check`, relatorios, candidatos e audit bundles.
- **Evidencia reproduzivel**: gerar receipts sanitizados, evidencia SHA-256, audit bundles e notas de matriz de suporte para revisao.
- **Helpers de lifecycle gerenciado**: envolver comandos locais conhecidos com `cpe-run` para que reconciliacao posterior em dry-run tenha evidencia mais forte.
- **Pareamento opcional com memoria**: combinar com `codex-agent-mem` ([GitHub](https://github.com/MarceloCaporale/codex-agent-mem)) para fechar continuidade e higiene de processos no mesmo fluxo.

## Por que este repositorio existe

- Agentes de codigo com IA podem deixar servidores MCP, drivers de navegador, servidores dev locais e processos helper vivos.
- Um nome de processo como `node`, `python`, `chrome`, `mcp` ou `codex` nao prova ownership.
- Usuarios precisam de um protocolo seguro de fechamento de tarefa antes de decidir se algum processo deve ser limpo.
- Ferramentas publicas devem tornar facil o caminho conservador: inspecionar, explicar, fazer dry-run, registrar evidencia e pedir decisao humana.
- `clean-process-ended` transforma higiene local de processos em um workflow auditavel, nao em uma aposta no gerenciador de tarefas.

## Status

- Versao: `0.7.2` beta.
- Runtime: Node.js `>=18.17`.
- Transporte: MCP stdio.
- Cleanup padrao: dry-run.
- Cleanup automatico padrao: desabilitado.
- Watcher persistente: nao e instalado por padrao.

Nao trate resultados beta como substituto para revisao humana. A superficie publica CLI/MCP v0.7.2 e diagnostica e orientada a dry-run; ela nao executa terminacao real pela superficie publica CLI/MCP.

## Snapshot de validacao

A evidencia publica atual da v0.7.2 e formulada intencionalmente como validacao dry-run, nao como validacao de cleanup real:

| Area | Evidencia atual |
| --- | --- |
| Superficie de tools MCP | O servidor expoe tools de close-check, relatorio, explain, policy, audit e managed lifecycle. |
| Codex | Validacao nativa local apos reinicio; apenas dry-run. |
| Claude Code | Validacao nativa MCP local concluida para v0.7.2; apenas dry-run; resumo de evidencia sanitizada disponivel. |
| Gemini CLI | Validacao nativa MCP local concluida para v0.7.2; apenas dry-run; resumo de evidencia sanitizada disponivel. |
| Cleanup real publico | `0` execucoes de cleanup real fazem parte da validacao publica. |
| Privacidade da evidencia | Receipts publicos sao desenhados para excluir command lines completas, raw process output, env vars, tokens e secrets. |

## Instalacao

Com `npx`:

```bash
npx -y --package clean-process-ended clean-process-ended-mcp
```

Ou instale o pacote e execute os binarios:

```bash
npm install -g clean-process-ended
cpe-scan report --json
clean-process-ended-mcp
```

## Snippet de host MCP

Para configuracao TOML estilo Codex:

```toml
[mcp_servers.clean_process_ended]
command = "npx"
args = ["-y", "--package", "clean-process-ended", "clean-process-ended-mcp"]
env = { CPE_HOST_PROFILE = "codex" }
```

Perfis de host expostos atualmente pelo pacote:

- `codex`
- `claude_code`
- `gemini_cli`
- `generic_mcp_host`

Samples adicionais estao em `samples/` e exemplos adaptaveis estao em `examples/`.

## Matriz de suporte

Esta matriz descreve a intencao publica dos perfis e o status de validacao para v0.7.2. Ela nao afirma seguranca de cleanup alem dos gates de politica documentados. Veja `docs/support-matrix.md` e `docs/validation/` para niveis de evidencia e status de publicacao.

| Host | Perfil | Status publico |
| --- | --- | --- |
| Codex | `codex` | Validacao local atual concluida apos reinicio; apenas dry-run. |
| Claude Code | `claude_code` | Validacao nativa local atual concluida; apenas dry-run. |
| Gemini CLI | `gemini_cli` | Validacao nativa local atual concluida; apenas dry-run. |
| Host MCP generico | `generic_mcp_host` | Perfil diagnostico apenas; claims de ownership especifico por host exigem evidencia separada. |

## CLI

Comandos comuns nao destrutivos:

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

Evidencia de ciclo de vida gerenciado:

```bash
cpe-run --host codex --role mcp-server -- node ./server.js
cpe-scan managed-reconcile --json
cpe-scan managed-lifecycle --json
cpe-scan managed-cleanup-dryrun --json
```

`managed-cleanup-dryrun` e apenas report-only em v0.7.2.

## Protocolo de fechamento para agentes

Instalar o MCP apenas torna suas tools disponiveis para o host. Isso nao garante que um agente va chama-las.

Comportamento recomendado para agentes:

- usar `janitor_discovery` para aprender o protocolo nao destrutivo;
- executar `session_close_check` ao final de tarefas nao triviais envolvendo subprocessos, servidores MCP, browsers/devtools, subagentes, servidores locais ou jobs em background;
- nunca chamar `dry_run=false` nem `--no-dry-run` de forma autonoma;
- resumir qualquer plano dry-run antes de perguntar a uma pessoa sobre cleanup real.

## Integracao opcional com codex-agent-mem

`codex-agent-mem` v1.0.1 e `clean-process-ended` v0.7.2 funcionam separadamente, mas foram desenhados para se complementar. `codex-agent-mem` preserva continuidade da tarefa e estado de fechamento; `clean-process-ended` registra evidencia de higiene de processos e receipts janitor em dry-run. Usados juntos, o fluxo recomendado de fechamento e:

1. recuperar e fechar continuidade com `codex-agent-mem`;
2. executar `clean-process-ended` como close check em dry-run;
3. armazenar na memoria apenas um resumo compacto `process_janitor_receipt` ou seu hash.

O workflow combinado melhora a experiencia do usuario porque reduz contexto repetido e adiciona uma verificacao de higiene mais segura ao fim da tarefa. Esta integracao e opcional: nenhum dos MCPs e dependencia obrigatoria do outro. Schemas e exemplos publicos de receipts ficam em `schemas/` e `docs/fixtures/codex-agent-mem/`.

## Metadados do projeto

- Autor: Marcelo Caporale.
- X: `https://x.com/MarceloCaporale`.
- Studio: `https://visualaimedia.com`.
- Lab: `https://visualsystemslab.com`.
- Licenca: Apache-2.0.
- Repositorio: `https://github.com/MarceloCaporale/clean-process-ended`.
- Nome MCP Registry: `io.github.marcelocaporale/clean-process-ended`.
- MCP opcional relacionado: `codex-agent-mem`.

## Seguranca de cleanup

Por padrao, cleanup e dry-run e limitado a `owned_current_session`. Em v0.7.2, a superficie publica CLI/MCP e diagnostica e orientada a dry-run: terminacao real permanece nao operavel via CLI/MCP publico porque inputs de evidencia sao intencionalmente nao expostos. O gate interno de cleanup real continua mais estrito do que a superficie publica e exige todos os itens abaixo antes de qualquer caminho de terminacao:

- um candidato elegivel `managed_strong` ou `managed_strong_expired` na politica de seguranca atual;
- configuracao confiavel de instalacao com `cleanup.realExecutionEnabled=true`;
- `--no-dry-run`;
- um confirm token fresco de um plano dry-run anterior;
- evidencia SHA-256 valida de um bundle de auditoria/receipt anterior;
- nenhum blocker de politica como ownership desconhecido, guardrails de browser/devtools ou protecao de host-root.

Se versoes futuras expuserem cleanup real publicamente, elas devem expor inputs SHA-256 de evidencia explicitamente e manter estes gates intactos.

`related_unowned` e `unknown_owner` sao report-only por padrao.

Auto-cleanup experimental e apenas opt-in. Ele e desabilitado por padrao, deve ser reconhecido explicitamente em configuracao confiavel de instalacao e deve ser tratado como experimental mesmo quando habilitado.

## Documentacao

- `AGENTS.md`: guia do repositorio para agentes de codigo e maintainers.
- `docs/quickstart.md`: fluxo seguro mais rapido de setup e close-check.
- `docs/SAFETY_MODEL.md`: modelo de seguranca de cleanup e auto-cleanup.
- `docs/ARCHITECTURE.md`: arquitetura de scanner, ownership, ciclo gerenciado e audit bundle.
- `docs/design-decisions.md`: decisoes de produto e arquitetura.
- `docs/HOSTS.md`: perfis de host e status de validacao.
- `docs/support-matrix.md`: matriz formal de suporte e niveis de evidencia.
- `docs/INSTALL.md`: notas de instalacao e host binding.
- `docs/WHEN_TO_USE.md`: quando executar close checks.
- `docs/AGENT_PROTOCOL.md`: instrucoes para agentes e prompts de projeto.
- `docs/INTEGRATION_CODEX_AGENT_MEM.md`: integracao opcional com `codex-agent-mem`.
- `docs/MANAGED_LIFECYCLE.md`: comandos de ciclo de vida gerenciado.
- `docs/AUDIT_BUNDLE.md`: conteudo de bundles de evidencia nao destrutivos.
- `docs/validation/`: niveis de validacao e notas de evidencia por host.
- `docs/verification/`: notas de verificacao e resumos de release gate.
- `schemas/`: schemas JSON publicos para receipts e resumos de audit bundle.
- `examples/`: exemplos de configuracao adaptaveis por host.
- `SECURITY.md`: reporte de seguranca e politica de suporte.
- `SUPPORT.md`: matriz publica de suporte.
- `CHANGELOG.md`: notas de release.
- `RELEASE_NOTES_v0.7.2.md`: notas de release para v0.7.2.

## Checks de release

Para mantenedores preparando tags, GitHub Releases, envios ao MCP Registry ou publicacao npm, execute:

```bash
npm run public-beta-candidate
```

Este gate inclui checks de sintaxe, tests, smoke MCP stdio, validacao estrita de pacote, auditoria de dependencias moderada-ou-superior, validacao da arvore publica, `npm pack --dry-run` e smoke validation do tarball instalado.

Depois complete `docs/release-checklist.md`, atualize a evidencia de hosts listada em `docs/verification/v0.7.2/README.md`, aguarde GitHub Actions, execute auditoria estatica externa a partir da URL publica do GitHub e avance apenas com aprovacao humana explicita.

## Licenca

Apache-2.0.
