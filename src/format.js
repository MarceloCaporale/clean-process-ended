import os from "node:os";
import path from "node:path";

const SECRET_PATTERNS = [
  /(api[_-]?key|auth(?:orization)?|credential(?:s)?|token|access[_-]?token|refresh[_-]?token|secret|password|passwd|pwd|private[_-]?key)(=|:)([^\s"'&]+)/gi,
  /(^|\s)(--(?=[a-z0-9_-]*(?:api[-_]?key|auth(?:orization)?|credential(?:s)?|token|secret|password|passwd|pwd|private[-_]?key))[a-z0-9_-]+|-p)(\s+)([^\s"'&]+)/gi,
  /(^|\s)(api[_-]?key|auth(?:orization)?|credential(?:s)?|token|access[_-]?token|refresh[_-]?token|secret|password|passwd|pwd|private[_-]?key)(\s+)([^\s"'&]+)/gi,
  /(bearer\s+)[a-z0-9._~+/=-]+/gi,
  /([a-z][a-z0-9+.-]*:\/\/)([^:\s/@]+):([^@\s/]+)@/gi,
];

export function basenameSafe(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return path.basename(text.replace(/\\/g, "/"));
}

export function redactCommandLine(commandLine, { maxLength = 420 } = {}) {
  let text = String(commandLine || "");
  const home = os.homedir();
  if (home) {
    const escaped = escapeRegExp(home.replace(/\\/g, "/"));
    text = text.replace(new RegExp(escaped, "gi"), "~");
    text = text.replace(new RegExp(escapeRegExp(home), "gi"), "~");
  }

  text = text.replace(
    /(^|\s)(--(?=[a-z0-9_-]*(?:api[-_]?key|auth(?:orization)?|credential(?:s)?|token|secret|password|passwd|pwd|private[-_]?key))[a-z0-9_-]+|-p)(=|\s+)(?:"[^"]*"|'[^']*'|[^\s]+)/gi,
    (_match, prefix, flag, sep) => `${prefix}${flag}${sep}[redacted]`,
  );
  text = text.replace(
    /(^|\s)([A-Z0-9_]*(?:API[_-]?KEY|AUTH(?:ORIZATION)?|CREDENTIALS?|TOKEN|ACCESS[_-]?TOKEN|REFRESH[_-]?TOKEN|SECRET|CLIENT[_-]?SECRET|PASSWORD|PASSWD|PWD|PRIVATE[_-]?KEY)[A-Z0-9_]*)(=|\s+)(?:Bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s]+)/g,
    (_match, prefix, name, sep) => `${prefix}${name}${sep}[redacted]`,
  );

  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (...parts) => {
      if (parts.length >= 5 && /^(\s*)?--|^(\s*)?-[a-z]/i.test(`${parts[1] || ""}${parts[2] || ""}`)) {
        return `${parts[1] || ""}${parts[2]}${parts[3] || ""}[redacted]`;
      }
      if (parts.length >= 5 && /^(api|auth|credential|token|access|refresh|secret|password|passwd|pwd|private)/i.test(parts[2] || "")) {
        return `${parts[1] || ""}${parts[2]}${parts[3]}[redacted]`;
      }
      if (parts.length >= 5 && /^[a-z][a-z0-9+.-]*:\/\//i.test(parts[1] || "")) {
        return `${parts[1]}[redacted]@`;
      }
      if (parts.length >= 4 && /^(api|auth|credential|token|access|refresh|secret|password|passwd|pwd|private)/i.test(parts[1] || "")) {
        return `${parts[1]}${parts[2]}[redacted]`;
      }
      if (parts.length >= 3 && /(?:api[_-]?key|auth|credential|token|secret|password|pwd|private[_-]?key)/i.test(parts[2] || "")) {
        return `${parts[1] || ""}${parts[2]}[redacted]`;
      }
      return `${parts[1] || ""}[redacted]`;
    });
  }

  text = text.replace(/\s+/g, " ").trim();
  if (text.length > maxLength) return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
  return text;
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function asToolText(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function humanAge(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return remM ? `${h}h ${remM}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH ? `${d}d ${remH}h` : `${d}d`;
}

export function nowIso() {
  return new Date().toISOString();
}
