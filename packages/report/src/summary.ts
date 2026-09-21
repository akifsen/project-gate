import type { CheckRecord, CheckStatus, ReleasePacket } from "@projectgate/domain";
import { product } from "@projectgate/shared";

export function formatSummary(packet: ReleasePacket, paths?: { json?: string; html?: string; fix?: string }): string {
  const groups = new Map<string, CheckRecord[]>();
  for (const check of packet.checks) {
    const current = groups.get(check.group) ?? [];
    current.push(check);
    groups.set(check.group, current);
  }
  const executable = packet.checks.filter((check) => ["EXECUTABLE", "RUNTIME", "OBSERVED"].includes(check.expectedEvidence)).length;
  const runtime = packet.checks.filter((check) => check.expectedEvidence === "RUNTIME" || check.expectedEvidence === "OBSERVED").length;
  const lines = [
    product.name,
    "",
    "Change detected:",
    "",
    `${packet.change.files.length} files changed`,
    `${packet.impact.surfaces.length} product surfaces affected`,
    `${packet.criteria.total} verification criteria`,
    `${executable} executable checks`,
    `${runtime} runtime checks`,
    "",
    "Verification:",
    "",
    ...(groups.size === 0 ? ["No checks ran."] : [...groups.entries()].map(([group, checks]) => `${mark(checks)} ${group}`)),
    "",
    "VERDICT",
    "",
    packet.verdict.state,
    "",
    `${packet.criteria.verified} / ${packet.criteria.total} verified`,
    `${packet.criteria.failed} failed`,
    `${packet.criteria.unknown} unknown`,
    "",
    `Critical findings: ${packet.findingCounts.CRITICAL}`,
    `Major findings: ${packet.findingCounts.MAJOR}`,
    `Minor findings: ${packet.findingCounts.MINOR}`,
  ];
  if (packet.verdict.reasons.length > 0) {
    lines.push("", ...packet.verdict.reasons);
  }
  if (packet.limitations.length > 0) {
    lines.push("", "Limitations:", ...packet.limitations.map((item) => `- ${item}`));
  }
  if (paths?.json || paths?.html || paths?.fix) {
    lines.push("", "Release packet:");
    if (paths.json) lines.push(paths.json);
    if (paths.html) lines.push(paths.html);
    if (paths.fix) lines.push(paths.fix);
  }
  return lines.join("\n");
}

function mark(checks: readonly CheckRecord[]): string {
  const statuses = new Set<CheckStatus>(checks.map((check) => check.status));
  if ([...statuses].some((status) => status === "FAILED" || status === "ERROR")) return "✗";
  if (statuses.has("UNKNOWN")) return "?";
  return "✓";
}
