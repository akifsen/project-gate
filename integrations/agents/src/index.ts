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
