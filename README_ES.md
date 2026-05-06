# clean-process-ended

Otros idiomas: [English](./README.md) | [Deutsch](./README_DE.md) | [Português do Brasil](./README_PT_BR.md) | [中文](./README_ZH.md) | [日本語](./README_JA.md)

**Janitor local MCP, ownership-first, para procesos de agentes de codigo; pensado para Codex, Claude Code, Gemini CLI y hosts compatibles con MCP donde los subprocesos pueden sobrevivir al trabajo util.**

`clean-process-ended` inspecciona subprocesos locales relacionados con sesiones de agentes y MCP, separa ownership de sesion de senales debiles por parecido, y produce planes conservadores de cleanup en dry-run antes de considerar cualquier accion sobre el entorno.

Esta disenado para flujos locales MCP y agentes de codigo donde subprocesos, helpers de navegador, devtools, servidores locales o servidores MCP pueden quedar vivos despues de que termina la sesion del host o la tarea. El proyecto clasifica procesos por evidencia de ownership, no por parecido de nombre, y luego informa que esta accionable, bloqueado, relacionado o desconocido.

No envia evidencia de procesos a un servicio remoto, no guarda command lines completas por defecto y no trata diagnosticos beta como permiso para terminar procesos.

## Lo que ofrece

- **Visibilidad de procesos de agentes**: ver subprocesos locales relacionados con Codex, Claude Code, Gemini CLI, hosts MCP genericos y futuros runtimes validados sin depender de cleanup por nombre de proceso.
- **Seguridad ownership-first**: clasificar `owned_current_session`, `related_unowned` y `unknown_owner` antes de planificar algo destructivo.
- **Close checks en dry-run**: dar a los agentes un protocolo concreto de fin de tarea mediante `janitor_discovery`, `session_close_check`, reportes, candidatos y audit bundles.
- **Evidencia reproducible**: generar receipts sanitizados, evidencia SHA-256, audit bundles y notas de matriz de soporte para revision.
- **Helpers de lifecycle gestionado**: envolver comandos locales conocidos con `cpe-run` para que la reconciliacion posterior en dry-run tenga evidencia mas fuerte.
- **Pairing opcional con memoria**: combinar con `codex-agent-mem` ([GitHub](https://github.com/MarceloCaporale/codex-agent-mem)) para cerrar continuidad e higiene de procesos en un mismo flujo.

## Por que existe este repositorio

- Los agentes de codigo con IA pueden dejar servidores MCP, drivers de navegador, servidores dev locales y procesos helper vivos.
- Un nombre de proceso como `node`, `python`, `chrome`, `mcp` o `codex` no prueba ownership.
- Los usuarios necesitan un protocolo seguro de cierre de tarea antes de decidir si algun proceso debe limpiarse.
- La herramienta publica debe hacer facil el camino conservador: inspeccionar, explicar, hacer dry-run, registrar evidencia y pedir decision humana.
- `clean-process-ended` convierte la higiene local de procesos en un flujo auditable en vez de una conjetura en el task manager.

## Estado

- Version: `0.7.2` beta.
- Runtime: Node.js `>=18.17`.
- Transporte: MCP stdio.
- Cleanup por defecto: dry-run.
- Cleanup automatico por defecto: deshabilitado.
- Watcher persistente: no se instala por defecto.

No trates los resultados beta como reemplazo de revision humana. La superficie publica CLI/MCP v0.7.2 es diagnostica y orientada a dry-run; no ejecuta terminacion real desde la superficie publica CLI/MCP.

## Snapshot de validacion

La evidencia publica actual de v0.7.2 esta formulada intencionalmente como validacion dry-run, no como validacion de cleanup real:

| Area | Evidencia actual |
| --- | --- |
| Superficie de tools MCP | El servidor expone tools de close-check, reporte, explain, policy, audit y managed lifecycle. |
| Codex | Validacion nativa local tras reinicio; solo dry-run. |
| Claude Code | Validacion nativa MCP local completada para v0.7.2; solo dry-run; resumen de evidencia sanitizada disponible. |
| Gemini CLI | Validacion nativa MCP local completada para v0.7.2; solo dry-run; resumen de evidencia sanitizada disponible. |
| Cleanup real publico | `0` ejecuciones de cleanup real forman parte de la validacion publica. |
| Privacidad de evidencia | Los receipts publicos estan disenados para excluir command lines completas, raw process output, env vars, tokens y secretos. |

## Instalacion

Con `npx`:

```bash
npx -y --package clean-process-ended clean-process-ended-mcp
```

O instalando el paquete y ejecutando los binarios:

```bash
npm install -g clean-process-ended
cpe-scan report --json
clean-process-ended-mcp
```

## Snippet para host MCP

Para configuracion TOML estilo Codex:

```toml
[mcp_servers.clean_process_ended]
command = "npx"
args = ["-y", "--package", "clean-process-ended", "clean-process-ended-mcp"]
env = { CPE_HOST_PROFILE = "codex" }
```

Valores de perfil de host expuestos por el paquete:

- `codex`
- `claude_code`
- `gemini_cli`
- `generic_mcp_host`

Hay samples adicionales en `samples/` y ejemplos adaptables en `examples/`.

## Matriz de soporte

Esta matriz describe la intencion publica de perfiles y el estado de validacion para v0.7.2. No afirma seguridad de cleanup mas alla de las compuertas de politica documentadas. Ver `docs/support-matrix.md` y `docs/validation/` para niveles de evidencia y estado de publicacion.

| Host | Perfil | Estado publico |
| --- | --- | --- |
| Codex | `codex` | Validacion local actual completada tras reinicio; solo dry-run. |
| Claude Code | `claude_code` | Validacion nativa local actual completada; solo dry-run. |
| Gemini CLI | `gemini_cli` | Validacion nativa local actual completada; solo dry-run. |
| Host MCP generico | `generic_mcp_host` | Perfil diagnostico solamente; los claims de ownership especifico por host requieren evidencia separada. |

## CLI

Comandos comunes no destructivos:

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

Evidencia de ciclo de vida gestionado:

```bash
cpe-run --host codex --role mcp-server -- node ./server.js
cpe-scan managed-reconcile --json
cpe-scan managed-lifecycle --json
cpe-scan managed-cleanup-dryrun --json
```

`managed-cleanup-dryrun` es solo reporte en v0.7.2.

## Protocolo de cierre para agentes

Instalar el MCP solo hace que sus tools esten disponibles para el host. No garantiza que un agente las llame.

Comportamiento recomendado para agentes:

- usar `janitor_discovery` para conocer el protocolo no destructivo;
- ejecutar `session_close_check` al final de tareas no triviales con subprocesos, servidores MCP, browsers/devtools, subagentes, servidores locales o jobs en background;
- nunca llamar `dry_run=false` ni `--no-dry-run` de forma autonoma;
- resumir cualquier plan dry-run antes de pedir decision humana sobre cleanup real.

## Integracion opcional con codex-agent-mem

`codex-agent-mem` v1.0.1 y `clean-process-ended` v0.7.2 funcionan por separado, pero estan disenados para complementarse. `codex-agent-mem` preserva continuidad de tarea y estado de cierre; `clean-process-ended` registra evidencia de higiene de procesos y receipts janitor en dry-run. Usados juntos, el flujo recomendado de cierre es:

1. recuperar y cerrar continuidad con `codex-agent-mem`;
2. ejecutar `clean-process-ended` como close check en dry-run;
3. guardar en memoria solo un resumen compacto `process_janitor_receipt` o su hash.

El flujo combinado mejora la experiencia del usuario porque reduce contexto repetido y agrega un chequeo de higiene mas seguro al final de la tarea. La integracion es opcional: ninguno de los dos MCP es dependencia obligatoria del otro. Los schemas y ejemplos publicos de receipts viven en `schemas/` y `docs/fixtures/codex-agent-mem/`.

## Metadata del proyecto

- Autor: Marcelo Caporale.
- X: `https://x.com/MarceloCaporale`.
- Studio: `https://visualaimedia.com`.
- Lab: `https://visualsystemslab.com`.
- Licencia: Apache-2.0.
- Repositorio: `https://github.com/MarceloCaporale/clean-process-ended`.
- Nombre MCP Registry: `io.github.marcelocaporale/clean-process-ended`.
- MCP opcional relacionado: `codex-agent-mem`.

## Seguridad de cleanup

Por defecto, cleanup es dry-run y esta limitado a `owned_current_session`. En v0.7.2, la superficie publica CLI/MCP es diagnostica y orientada a dry-run: la terminacion real permanece no operable desde CLI/MCP publico porque los inputs de evidencia se ocultan intencionalmente. La compuerta interna de cleanup real sigue siendo mas estricta que la superficie publica y requiere todo lo siguiente antes de cualquier ruta de terminacion:

- un candidato elegible `managed_strong` o `managed_strong_expired` en la politica de seguridad actual;
- configuracion confiable de instalacion con `cleanup.realExecutionEnabled=true`;
- `--no-dry-run`;
- un confirm token fresco de un plan dry-run anterior;
- evidencia SHA-256 valida de un bundle de auditoria/receipt previo;
- ningun blocker de politica como ownership desconocido, guardrails de browser/devtools o proteccion de host-root.

Si versiones futuras exponen cleanup real publicamente, deben exponer explicitamente inputs SHA-256 de evidencia y mantener estas compuertas intactas.

`related_unowned` y `unknown_owner` son report-only por defecto.

El auto-cleanup experimental es solo opt-in. Esta deshabilitado por defecto, debe reconocerse explicitamente en configuracion confiable de instalacion y debe tratarse como experimental incluso cuando se habilite.

## Documentacion

- `AGENTS.md`: guia del repositorio para agentes de codigo y maintainers.
- `docs/quickstart.md`: flujo seguro mas rapido de setup y close-check.
- `docs/SAFETY_MODEL.md`: modelo de seguridad de cleanup y auto-cleanup.
- `docs/ARCHITECTURE.md`: arquitectura de scanner, ownership, ciclo gestionado y audit bundle.
- `docs/design-decisions.md`: decisiones de producto y arquitectura.
- `docs/HOSTS.md`: perfiles de host y estado de validacion.
- `docs/support-matrix.md`: matriz formal de soporte y niveles de evidencia.
- `docs/INSTALL.md`: notas de instalacion y host binding.
- `docs/WHEN_TO_USE.md`: cuando ejecutar close checks.
- `docs/AGENT_PROTOCOL.md`: instrucciones para agentes y prompts de proyecto.
- `docs/INTEGRATION_CODEX_AGENT_MEM.md`: integracion opcional con `codex-agent-mem`.
- `docs/MANAGED_LIFECYCLE.md`: comandos de ciclo de vida gestionado.
- `docs/AUDIT_BUNDLE.md`: contenido de bundles de evidencia no destructivos.
- `docs/validation/`: niveles de validacion y notas de evidencia por host.
- `docs/verification/`: notas de verificacion y resumenes de release gate.
- `schemas/`: schemas JSON publicos para receipts y resumenes de audit bundle.
- `examples/`: ejemplos de configuracion adaptables por host.
- `SECURITY.md`: reporte de seguridad y politica de soporte.
- `SUPPORT.md`: matriz publica de soporte.
- `CHANGELOG.md`: notas de release.
- `RELEASE_NOTES_v0.7.2.md`: notas de release para v0.7.2.

## Checks de release

Para mantenedores que preparan tags, GitHub Releases, envios al MCP Registry o publicacion npm, ejecutar:

```bash
npm run public-beta-candidate
```

Este gate incluye checks de sintaxis, tests, smoke MCP stdio, validacion estricta de paquete, auditoria de dependencias moderada-o-superior, validacion del arbol publico, `npm pack --dry-run` y smoke validation del tarball instalado.

Luego completar `docs/release-checklist.md`, refrescar evidencia de hosts listada en `docs/verification/v0.7.2/README.md`, esperar GitHub Actions, ejecutar auditoria estatica externa desde la URL publica de GitHub y avanzar solo con aprobacion humana explicita.

## Licencia

Apache-2.0.
