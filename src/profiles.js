import { basenameSafe } from "./format.js";
import { normalizeForMatching } from "./paths.js";

export function matchHostProfiles(proc, chain, config) {
  const profiles = config?.profiles?.hosts || {};
  return matchProfiles(profiles, proc, chain);
}

export function matchToolProfiles(proc, chain, config) {
  const profiles = config?.profiles?.tools || {};
  return matchProfiles(profiles, proc, chain);
}

export function listConfiguredProfiles(config) {
  return {
    hosts: summarizeProfileGroup(config?.profiles?.hosts || {}),
    tools: summarizeProfileGroup(config?.profiles?.tools || {}),
  };
}

function matchProfiles(profiles, proc, chain) {
  const matches = [];
  for (const [id, profile] of Object.entries(profiles || {})) {
    if (profile?.enabled === false) continue;
    const match = profile.match || {};
    const selfMatches = matchesRule(match, proc);
    const chainMatches = (chain || []).flatMap((parent) => matchesRule(match, parent));
    if (selfMatches.length || chainMatches.length) {
      matches.push({
        id,
        confidence: profile.confidence || "signal",
        reasons: [
          ...selfMatches.map((reason) => `self:${reason}`),
          ...chainMatches.map((reason) => `chain:${reason}`),
        ],
        safety: profile.safety || {},
      });
    }
  }
  return matches;
}

function matchesRule(match, text) {
  const reasons = [];
  const proc = text || {};
  if (match.processNames?.length && nameInList(proc.name, match.processNames)) reasons.push("process_name");
  if (match.commandLineIncludes?.length && containsAny(proc.commandLine, match.commandLineIncludes)) {
    reasons.push("command_line");
  }
  if (match.pathIncludes?.length) {
    if (containsAny(proc.executablePath, match.pathIncludes)) reasons.push("executable_path");
    if (containsAny(proc.cwd, match.pathIncludes)) reasons.push("cwd_path");
    if (containsAny(proc.workingDirectory, match.pathIncludes)) reasons.push("working_directory");
  }
  return reasons;
}

function containsAny(haystack, needles) {
  const text = normalizeForMatching(haystack);
  return (needles || []).some((needle) => needle && text.includes(normalizeForMatching(needle)));
}

function nameInList(name, list) {
  const normalized = normalizeForMatching(basenameSafe(name));
  return (list || []).some((item) => normalized === normalizeForMatching(item));
}

function summarizeProfileGroup(group) {
  return Object.fromEntries(
    Object.entries(group || {}).map(([id, profile]) => [
      id,
      {
        enabled: profile?.enabled !== false,
        confidence: profile?.confidence || "signal",
        safety: profile?.safety || {},
        match: profile?.match || {},
      },
    ]),
  );
}
