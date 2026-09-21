import type { ChangeContract } from "@projectgate/contracts";
import type { CheckRecord, EvidenceRecord, Finding, ImpactSummary, ReleasePacket, Severity } from "@projectgate/domain";
import { computeVerdict, evaluateCriterion } from "@projectgate/domain";
import { product } from "@projectgate/shared";
import type { ChangeSet } from "@projectgate/impact-engine";

export function assemblePacket(input: {
  runId: string;
  kind: "audit" | "verify";
  parentRunId?: string;
  generatedAt: string;
  change: ChangeSet;
  contract: ChangeContract;
  checks: CheckRecord[];
  evidence: EvidenceRecord[];
  findings: Finding[];
  resolvedFindings: Finding[];
  impact: ImpactSummary;
  humanReviewRequired: boolean;
  limitations: string[];
  environment: string;
}): ReleasePacket {
  const acceptance = input.contract.acceptance.map((criterion) =>
    evaluateCriterion({
      id: criterion.id,
      required: criterion.required,
      requiredEvidence: criterion.evidence,
      checks: input.checks
        .filter((check) => check.criterionId === criterion.id)
        .map((check) => ({ status: check.status, evidenceClass: check.producedEvidence, ...(check.error ? { error: check.error } : {}) })),
    }),
  );
  const invariants = input.contract.invariants.map((invariant) =>
    evaluateCriterion({
      id: invariant.id,
      required: invariant.required,
      requiredEvidence: invariant.evidence,
      checks: input.checks
        .filter((check) => check.criterionId === invariant.id)
        .map((check) => ({ status: check.status, evidenceClass: check.producedEvidence, ...(check.error ? { error: check.error } : {}) })),
    }),
  );
  const items = [...acceptance, ...invariants];
  const verdict = computeVerdict({
    criteria: items,
    openFindings: input.findings.map((finding) => ({ severity: finding.severity })),
    humanReviewRequired: input.humanReviewRequired,
  });
  for (const item of items.filter((criterion) => criterion.required && criterion.state === "UNKNOWN")) {
    verdict.reasons.push(`${item.id}: ${item.reason}`);
  }
  const required = items.filter((item) => item.required);
  return {
    schemaVersion: 1,
    product: product.name,
    runId: input.runId,
    kind: input.kind,
    ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
    generatedAt: input.generatedAt,
    change: {
      id: input.contract.change.id,
      title: input.contract.change.title,
      baseRef: input.change.baseRef,
      headSha: input.change.headSha,
      dirty: input.change.dirty,
      files: input.change.files.map((file) => file.path),
    },
    contractHash: input.contract.hash,
    criteria: {
      total: required.length,
      verified: required.filter((item) => item.state === "VERIFIED").length,
      failed: required.filter((item) => item.state === "FAILED").length,
      unknown: required.filter((item) => item.state === "UNKNOWN").length,
      items,
    },
    checks: input.checks,
    findings: input.findings,
    resolvedFindings: input.resolvedFindings,
    findingCounts: countFindings(input.findings),
    evidence: input.evidence,
    uiStates: input.checks
      .filter((check) => check.id.startsWith("ui:"))
      .map((check) => ({
        id: check.id.slice(3),
        label: check.title,
        state: check.status === "PASSED" || check.status === "CARRIED" ? "VERIFIED" : check.status === "FAILED" ? "MISSING" : "UNKNOWN",
      })),
    impact: input.impact,
    verdict,
    limitations: input.limitations,
    environment: input.environment,
  };
}

function countFindings(findings: readonly Finding[]): Record<Severity, number> {
  return {
    CRITICAL: findings.filter((finding) => finding.severity === "CRITICAL").length,
    MAJOR: findings.filter((finding) => finding.severity === "MAJOR").length,
    MINOR: findings.filter((finding) => finding.severity === "MINOR").length,
    INFO: findings.filter((finding) => finding.severity === "INFO").length,
  };
}

export function reconcileFindings(input: {
  previous: readonly Finding[];
  next: readonly Finding[];
  checks: readonly CheckRecord[];
  plannedIds: ReadonlySet<string>;
}): { open: Finding[]; resolved: Finding[]; limitations: string[] } {
  const open = [...input.next];
  const limitations: string[] = [];
  for (const finding of input.previous) {
    if (input.plannedIds.has(finding.checkId)) continue;
    if (open.some((item) => item.stableKey === finding.stableKey)) continue;
    open.push(finding);
    limitations.push(`${finding.id} was not rechecked because ${finding.checkId} is no longer in the plan.`);
  }
  const openKeys = new Set(open.map((finding) => finding.stableKey));
  const resolved = input.previous
    .filter((finding) => !openKeys.has(finding.stableKey))
    .filter((finding) => {
      const check = input.checks.find((item) => item.id === finding.checkId);
      return check?.status === "PASSED" || check?.status === "CARRIED";
    })
    .map((finding) => ({ ...finding, status: "RESOLVED" as const }));
  return { open, resolved, limitations };
}
