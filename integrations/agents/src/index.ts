import type { ReleasePacket, Severity, VerdictState } from "@projectgate/domain";
import { product } from "@projectgate/shared";

export interface FixPacket {
  product: string;
  verdict: VerdictState;
  changeId: string;
  runId: string;
  findings: {
    id: string;
    severity: Severity;
    requirement: string;
    reproduction: string[];
    expected: string;
    actual: string;
    evidencePaths: string[];
    suspectedLocations: string[];
    verificationCondition: string;
  }[];
}

export function formatFixPacket(packet: ReleasePacket): string {
  const fix = toFixPacket(packet);
  if (fix.findings.length === 0) return `${fix.product}\n\nNo open findings.\nVerdict: ${fix.verdict}\n`;
  return fix.findings
    .map((finding) =>
      [
        finding.id,
        "",
        "Severity:",
        finding.severity,
        "",
        "Requirement:",
        finding.requirement || "(none)",
        "",
        "Observed:",
        finding.actual,
        "",
        "Expected:",
        finding.expected || "(none)",
        "",
        "Reproduction:",
        ...(finding.reproduction.length > 0 ? finding.reproduction.map((step, index) => `${index + 1}. ${step}`) : ["(none)"]),
        "",
        "Evidence:",
        ...(finding.evidencePaths.length > 0 ? finding.evidencePaths : ["(none)"]),
        "",
        "Likely affected files:",
        ...(finding.suspectedLocations.length > 0 ? finding.suspectedLocations : ["(none)"]),
        "",
        "Verification condition:",
        finding.verificationCondition,
      ].join("\n"),
    )
    .join("\n\n");
}

export function toFixPacket(packet: ReleasePacket): FixPacket {
  return {
    product: product.name,
    verdict: packet.verdict.state,
    changeId: packet.change.id,
    runId: packet.runId,
    findings: packet.findings.map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      requirement: finding.requirement ?? "",
      reproduction: finding.reproduction,
      expected: finding.expected ?? "",
      actual: finding.actual ?? finding.observed,
      evidencePaths: finding.evidencePaths,
      suspectedLocations: finding.suspectedLocations,
      verificationCondition: `Check ${finding.checkId} must pass with ${finding.evidenceClass} evidence.`,
    })),
  };
}
