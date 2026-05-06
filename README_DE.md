# clean-process-ended

<p align="center">
  <img src="docs/assets/clean-process-ended-social-preview.png" alt="clean-process-ended: local process hygiene for MCP agent workflows" width="100%">
</p>

Andere Sprachen: [English](./README.md) | [Español](./README_ES.md) | [Português do Brasil](./README_PT_BR.md) | [中文](./README_ZH.md) | [日本語](./README_JA.md)

**Ownership-first lokaler MCP Process Janitor fuer Coding-Agents; gebaut fuer Codex Desktop, Claude Code, Gemini CLI, nicht-destruktive Qwen Code CLI Tool-Workflows mit Ollama-gestuetzten Qwen-Modellen und MCP-kompatible Host-Workflows, in denen Subprozesse laenger leben koennen als die eigentliche Arbeit.**

`clean-process-ended` inspiziert lokale Subprozesse, die mit Agent- und MCP-Sessions zusammenhaengen, trennt Session-Ownership von schwachen Aehnlichkeitssignalen und erzeugt pruefbare Cleanup-Plaene im dry-run mit reproduzierbarer Evidenz, bevor irgendeine Aktion am Environment erwogen wird.

`clean-process-ended` laeuft als lokaler MCP-Server ueber stdio. Codex Desktop, Claude Code und Gemini CLI haben dry-run-Validierung; Qwen Code CLI hat native nicht-destruktive MCP-Tool-Invocation-Validierung mit Ollama-gestuetzten Qwen-Modellen. Andere MCP-kompatible Hosts koennen ueber das generische MCP-Profil getestet werden.

Es ist fuer lokale MCP- und Coding-Agent-Workflows gedacht, in denen Subprozesse, Browser-Helper, Devtools, lokale Server oder MCP-Server nach Ende der Host-Session oder Aufgabe weiterlaufen koennen. Das Projekt klassifiziert Prozesse anhand von Ownership-Evidenz statt anhand aehnlicher Prozessnamen und berichtet danach, was handlungsfaehig, blockiert, verwandt oder unbekannt ist.

Es sendet keine Prozess-Evidenz an einen Remote-Service, speichert standardmaessig keine vollstaendigen Command Lines und behandelt Beta-Diagnostik nicht als Erlaubnis, Prozesse zu terminieren.

## Was es liefert

- **Sichtbarkeit fuer Agent-Prozesse**: lokale Subprozesse zu Codex Desktop, Claude Code, Gemini CLI, nicht-destruktiven Qwen Code CLI Tool-Workflows mit Ollama-gestuetzten Qwen-Modellen, generischen MCP-Hosts und kuenftig validierten Runtimes sehen, ohne Cleanup nach Prozessnamen zu verwenden.
- **Ownership-first Safety**: `owned_current_session`, `related_unowned` und `unknown_owner` klassifizieren, bevor etwas Destruktives geplant wird.
- **Dry-run Close Checks**: Agenten ein konkretes End-of-Task-Protokoll ueber `janitor_discovery`, `session_close_check`, Reports, Candidates und Audit Bundles geben.
- **Reproduzierbare Evidenz**: bereinigte Receipts, SHA-256-Evidenz, Audit Bundles und Support-Matrix-Notizen fuer Review erzeugen.
- **Managed-Lifecycle-Helper**: bekannte lokale Kommandos mit `cpe-run` wrappen, damit spaetere dry-run-Reconciliation staerkere Evidenz hat.
- **Optionale Memory-Kopplung**: mit `codex-agent-mem` ([GitHub](https://github.com/MarceloCaporale/codex-agent-mem)) kombinieren, sodass Kontinuitaet und Prozesshygiene gemeinsam geschlossen werden koennen.

## Warum dieses Repository existiert

- AI-Coding-Agents koennen MCP-Server, Browser-Driver, lokale Dev-Server und Helper-Prozesse zuruecklassen.
- Ein Prozessname wie `node`, `python`, `chrome`, `mcp` oder `codex` beweist kein Ownership.
- Nutzer brauchen ein sicheres Close-Task-Protokoll, bevor sie entscheiden, ob ein Prozess bereinigt werden soll.
- Public Tooling sollte den konservativen Weg einfach machen: inspizieren, erklaeren, dry-run, Evidenz speichern und menschliche Entscheidung einholen.
- `clean-process-ended` macht lokale Prozesshygiene zu einem auditierbaren Workflow statt zu einer Task-Manager-Vermutung.

## Status

- Version: `0.7.3` beta.
- Runtime: Node.js `>=18.17`.
- Transport: MCP stdio.
- Standard-Cleanup: dry-run.
- Automatischer Cleanup: standardmaessig deaktiviert.
- Persistenter Watcher: wird nicht standardmaessig installiert.

Beta-Ergebnisse ersetzen keine menschliche Pruefung. Die oeffentliche CLI/MCP-Oberflaeche v0.7.3 liefert runtime-validierte Prozesshygiene, Evidenz und dry-run-Planung; sie fuehrt keine echte Terminierung ueber die oeffentliche CLI/MCP-Oberflaeche aus.

## Validierungs-Snapshot

Die aktuelle v0.7.3 Public-Beta-Evidenz trennt Runtime-Validierungsmetriken von Adoptionsmetriken. Sie belegt Discovery, Reports, Evidenz und dry-run-Planung; sie behauptet keine Validierung echter Cleanup-Ausfuehrung:

| Bereich | Aktuelle Evidenz |
| --- | --- |
| MCP-Tool-Oberflaeche | Der Server exponiert Close-Check-, Report-, Explain-, Policy-, Audit- und Managed-Lifecycle-Tools. |
| Codex | Native lokale Validierung nach Neustart; nur dry-run. |
| Claude Code | Native lokale MCP-Validierung abgeschlossen; nur dry-run; sanitierte Evidenzzusammenfassung verfuegbar. |
| Gemini CLI | Native lokale MCP-Validierung abgeschlossen; nur dry-run; sanitierte Evidenzzusammenfassung verfuegbar. |
| Qwen Code CLI | Native lokale MCP-Tool-Invocation-Validierung mit Ollama-gestuetzten Qwen-Modellen abgeschlossen; nur nicht-destruktiver Diagnose-Workflow; volle dry-run Close-Check-Paritaet wird nicht behauptet. |
| Oeffentlicher echter Cleanup | `0` echte Cleanup-Ausfuehrungen sind Teil der oeffentlichen Validierung. |
| Evidenz-Privatsphaere | Oeffentliche Receipts sind darauf ausgelegt, vollstaendige Command Lines, Raw Process Output, Env Vars, Tokens und Secrets auszuschliessen. |

## Oeffentliche Validierungsmetriken

Dies sind echte Validierungsmetriken aus der Public-Beta-Linie und dem Release Gate, keine Adoptionsmetriken wie Stars, Forks, Downloads oder produktive Dritt-Nutzung:

- Validierte MCP-Host-Workflows: `4` (`codex`, `claude_code`, `gemini_cli`, `qwen_code`), darunter drei dry-run Close-Check-Workflows und ein nativer nicht-destruktiver Qwen Code CLI MCP-Tool-Invocation-Workflow; Qwen dry-run Close-Check-Paritaet wird nicht behauptet.
- MCP-stdio-Smoke-Oberflaeche: Der ausgelieferte Server exponiert den Tool-Katalog fuer Close-Check, Reports, Explain, Policy, Audit und Managed Lifecycle.
- Lokales Release Gate: ESLint, Syntax-Checks, Node-Tests, MCP-stdio-Smoke, strikte Paketvalidierung, Public-Tree-Check, Dependency Audit, `npm pack --dry-run` und Smoke des installierten Tarballs.
- GitHub-Actions-Matrix: konfiguriert fuer Windows, macOS und Linux mit Node 18, 20 und 22.
- Oeffentliche echte Cleanup-Ausfuehrungen: `0`.
- Ziel fuer produktiven Dependency Audit: `0` Schwachstellen moderater oder hoeherer Schwere.
- Ziel fuer Evidenz-Privatsphaere: keine vollstaendigen Command Lines, kein Raw Process Output, keine Env Vars, Tokens, Secrets oder live Confirm Tokens in oeffentlichen Receipts.

## Installation

Mit `npx`:

```bash
npx -y --package clean-process-ended clean-process-ended-mcp
```

Oder Paket installieren und Binaries ausfuehren:

```bash
npm install -g clean-process-ended
cpe-scan report --json
clean-process-ended-mcp
```

## MCP-Host-Snippet

Fuer Codex-artige TOML-Konfiguration:

```toml
[mcp_servers.clean_process_ended]
command = "npx"
args = ["-y", "--package", "clean-process-ended", "clean-process-ended-mcp"]
env = { CPE_HOST_PROFILE = "codex" }
```

Aktuell vom Paket exponierte Host-Profile:

- `codex`
- `claude_code`
- `gemini_cli`
- `qwen_code`
- `generic_mcp_host`

Weitere Samples liegen in `samples/`; anpassbare Beispiele liegen in `examples/`.

## Support-Matrix

Diese Matrix beschreibt die oeffentliche Profilabsicht und den Validierungsstatus fuer v0.7.3. Sie behauptet keine Cleanup-Sicherheit ausserhalb der dokumentierten Policy-Gates. Siehe `docs/support-matrix.md` und `docs/validation/` fuer Evidenzlevel und Publikationsstatus.

| Host | Profil | Oeffentlicher Status |
| --- | --- | --- |
| Codex | `codex` | Aktuelle lokale Validierung nach Neustart abgeschlossen; nur dry-run. |
| Claude Code | `claude_code` | Aktuelle lokale native Validierung abgeschlossen; nur dry-run. |
| Gemini CLI | `gemini_cli` | Aktuelle lokale native Validierung abgeschlossen; nur dry-run. |
| Qwen Code CLI | `qwen_code` | Aktuelle lokale native MCP-Tool-Invocation-Validierung mit Ollama-gestuetzten Qwen-Modellen abgeschlossen; nur nicht-destruktiver Diagnose-Workflow. |
| Generischer MCP-Host | `generic_mcp_host` | Nur diagnostisches Profil; host-spezifische Ownership-Claims brauchen separate Evidenz. |

## CLI

Haeufige nicht-destruktive Befehle:

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

Managed-Lifecycle-Evidenz:

```bash
cpe-run --host codex --role mcp-server -- node ./server.js
cpe-scan managed-reconcile --json
cpe-scan managed-lifecycle --json
cpe-scan managed-cleanup-dryrun --json
```

`managed-cleanup-dryrun` ist in v0.7.3 nur report-only.

## Agent Close Protocol

Die Installation des MCP macht seine Tools nur fuer den Host verfuegbar. Sie garantiert nicht, dass ein Agent sie aufruft.

Empfohlenes Agent-Verhalten:

- `janitor_discovery` nutzen, um das nicht-destruktive Protokoll zu lernen;
- `session_close_check` am Ende nicht-trivialer Aufgaben mit Subprozessen, MCP-Servern, Browsern/DevTools, Subagenten, lokalen Servern oder Background-Jobs ausfuehren;
- `dry_run=false` oder `--no-dry-run` niemals autonom aufrufen;
- jeden dry-run-Plan zusammenfassen, bevor ein Mensch zu realem Cleanup gefragt wird.

## Optionale codex-agent-mem-Integration

`codex-agent-mem` v1.0.1 und `clean-process-ended` v0.7.3 funktionieren jeweils eigenstaendig, sind aber als Ergaenzung gedacht. `codex-agent-mem` erhaelt Task-Kontinuitaet und Closure-State; `clean-process-ended` zeichnet Prozesshygiene-Evidenz und Janitor-Receipts im dry-run auf. Zusammen empfohlen:

1. Kontinuitaet mit `codex-agent-mem` wiederherstellen und schliessen;
2. `clean-process-ended` als dry-run Close Check ausfuehren;
3. nur eine kompakte `process_janitor_receipt`-Zusammenfassung oder deren Hash in Memory speichern.

Der kombinierte Workflow verbessert die Nutzererfahrung, weil er wiederholten Kontext reduziert und am Task-Ende einen sichereren Hygiene-Check hinzufuegt. Diese Integration ist optional: Keiner der beiden MCPs ist eine harte Abhaengigkeit des anderen. Oeffentliche Receipt-Schemas und Beispiele liegen in `schemas/` und `docs/fixtures/codex-agent-mem/`.

## Projekt-Metadaten

- Autor: Marcelo Caporale.
- X: `https://x.com/MarceloCaporale`.
- Studio: `https://visualaimedia.com`.
- Lab: `https://visualsystemslab.com`.
- Lizenz: Apache-2.0.
- Repository: `https://github.com/MarceloCaporale/clean-process-ended`.
- MCP-Registry-Name: `io.github.marcelocaporale/clean-process-ended`.
- Verwandter optionaler MCP: `codex-agent-mem`.

## Cleanup-Sicherheit

Standardmaessig ist Cleanup dry-run und auf `owned_current_session` begrenzt. In v0.7.3 liefert die oeffentliche CLI/MCP-Oberflaeche runtime-validierte Prozesshygiene, Evidenz und dry-run-Planung: reale Terminierung bleibt ueber oeffentliche CLI/MCP nicht operabel, weil Evidenz-Inputs absichtlich nicht exponiert werden. Das interne Real-Cleanup-Gate bleibt strenger als die oeffentliche Oberflaeche und verlangt vor jedem Terminierungspfad alle folgenden Punkte:

- einen geeigneten `managed_strong`- oder `managed_strong_expired`-Kandidaten in der aktuellen Safety-Policy;
- vertrauenswuerdige Installationskonfiguration mit `cleanup.realExecutionEnabled=true`;
- `--no-dry-run`;
- ein frisches Confirm Token aus einem vorherigen dry-run-Plan;
- gueltige SHA-256-Evidenz aus einem vorherigen Audit-/Receipt-Bundle;
- keinen Policy-Blocker wie unbekannte Ownership, Browser/DevTools-Guardrails oder Host-Root-Schutz.

Wenn zukuenftige Versionen reales Cleanup oeffentlich exponieren, muessen sie SHA-256-Evidenz-Inputs explizit exponieren und diese Gates intakt halten.

`related_unowned` und `unknown_owner` sind standardmaessig report-only.

Experimenteller Auto-Cleanup ist nur opt-in. Er ist standardmaessig deaktiviert, muss in vertrauenswuerdiger Installationskonfiguration explizit bestaetigt werden und sollte auch im aktivierten Zustand als experimentell behandelt werden.

## Dokumentation

- `AGENTS.md`: Repository-Leitfaden fuer Coding Agents und Maintainer.
- `docs/quickstart.md`: schnellster sicherer Setup- und Close-Check-Flow.
- `docs/SAFETY_MODEL.md`: Sicherheitsmodell fuer Cleanup und Auto-Cleanup.
- `docs/ARCHITECTURE.md`: Architektur fuer Scanner, Ownership, Managed Lifecycle und Audit Bundle.
- `docs/design-decisions.md`: Produkt- und Architekturentscheidungen.
- `docs/HOSTS.md`: Host-Profile und Validierungsstatus.
- `docs/support-matrix.md`: formale Support-Matrix und Evidenzlevel.
- `docs/INSTALL.md`: Installations- und Host-Binding-Notizen.
- `docs/WHEN_TO_USE.md`: wann Close Checks ausgefuehrt werden sollten.
- `docs/AGENT_PROTOCOL.md`: Anweisungen fuer Agenten und Projekt-Prompts.
- `docs/INTEGRATION_CODEX_AGENT_MEM.md`: optionale Integration mit `codex-agent-mem`.
- `docs/MANAGED_LIFECYCLE.md`: Managed-Process-Lifecycle-Befehle.
- `docs/AUDIT_BUNDLE.md`: Inhalte nicht-destruktiver Evidenz-Bundles.
- `docs/validation/`: Validierungslevel und Host-Evidenznotizen.
- `docs/verification/`: Verifikationsnotizen und Release-Gate-Zusammenfassungen.
- `schemas/`: oeffentliche JSON-Schemas fuer Receipts und Audit-Bundle-Zusammenfassungen.
- `examples/`: anpassbare Host-Konfigurationsbeispiele.
- `SECURITY.md`: Security Reporting und Support Policy.
- `SUPPORT.md`: oeffentliche Support-Matrix.
- `CHANGELOG.md`: Release Notes.
- `RELEASE_NOTES_v0.7.3.md`: Release Notes fuer v0.7.3.

## Release Checks

Fuer Maintainer, die Tags, GitHub Releases, MCP-Registry-Einreichungen oder npm-Publikation vorbereiten, ausfuehren:

```bash
npm run public-beta-candidate
```

Dieses Gate enthaelt ESLint, Syntax-Checks, Tests, MCP-stdio-Smoke-Validierung, strikte Paketvalidierung, Dependency-Audit ab moderater Schwere, Public-Tree-Validierung, `npm pack --dry-run` und Smoke-Validierung des installierten Tarballs.

Danach `docs/release-checklist.md` abschliessen, Host-Evidenz aus `docs/verification/v0.7.3/README.md` aktualisieren, GitHub Actions abwarten, externe statische Audit-Pruefung von der oeffentlichen GitHub-URL ausfuehren und nur nach expliziter menschlicher Freigabe fortfahren.

## Lizenz

Apache-2.0.
