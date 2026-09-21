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
  const files = packet.impact.changedFiles;
  const application = files.filter((file) => file.role === "ui" || file.role === "api-server" || file.role === "api-client" || file.role === "style" || file.role === "migration").length;
  const tests = files.filter((file) => file.role === "test").length;
  const configuration = files.filter((file) => file.role === "config").length;
  const baseline = packet.checks.filter((check) => check.verifierId === "shell" && !check.criterionId).length;
  const lines = [
    product.name,
    "",
    "Change detected:",
    "",
    `${packet.change.files.length} files changed`,
    `${application} application files`,
    `${tests} tests`,
    `${configuration} configuration files`,
    `${packet.impact.surfaces.length} product surfaces affected`,
    `${packet.impact.unresolvedFiles?.length ?? 0} unresolved files`,
    `${packet.criteria.total} verification criteria`,
    `${executable} executable checks`,
    `${runtime} runtime checks`,
    `${baseline} baseline checks`,
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
  const unknowns = packet.criteria.items.filter((item) => item.required && item.state === "UNKNOWN");
  if (unknowns.length > 0) {
    lines.push("", "Why Project Gate cannot complete verification", "");
    for (const item of unknowns) lines.push(`${item.id}`, item.reason, "");
  }
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
  lines.push("", "Next:", "", nextCommand(packet.verdict.state));
  return lines.join("\n");
}

function nextCommand(state: ReleasePacket["verdict"]["state"]): string {
  if (state === "BLOCKED") return `${product.command} report --format fix`;
  if (state === "INCOMPLETE_EVIDENCE") return `${product.command} inspect --verbose`;
  if (state === "PASS" || state === "PASS_WITH_HUMAN_REVIEW") return `${product.command} report`;
  return `${product.command} report`;
}

function mark(checks: readonly CheckRecord[]): string {
  const statuses = new Set<CheckStatus>(checks.map((check) => check.status));
  if ([...statuses].some((status) => status === "FAILED" || status === "ERROR")) return "✗";
  if (statuses.has("UNKNOWN")) return "?";
  return "✓";
}
