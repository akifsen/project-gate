import { EXIT_BLOCKED, EXIT_HUMAN_REVIEW, EXIT_INCOMPLETE, EXIT_PASS } from "@projectgate/shared";
import type { CheckStatus, EvidenceClass, Severity, VerdictState } from "./vocabulary.js";
import { evidenceSatisfies } from "./vocabulary.js";

export interface CriterionEvaluation {
  id: string;
  required: boolean;
  state: "VERIFIED" | "FAILED" | "UNKNOWN";
  reason: string;
}

export interface Verdict {
  state: VerdictState;
  verified: number;
  failed: number;
  unknown: number;
  total: number;
  reasons: string[];
}

export function evaluateCriterion(input: {
  id: string;
  required: boolean;
  requiredEvidence: EvidenceClass;
  checks: readonly { status: CheckStatus; evidenceClass: EvidenceClass | null; error?: string }[];
}): CriterionEvaluation {
  if (input.checks.length === 0) {
    return {
      id: input.id,
      required: input.required,
      state: "UNKNOWN",
      reason: missingCheckReason(input.requiredEvidence),
    };
  }
  if (input.checks.some((check) => check.status === "FAILED")) {
    return {
      id: input.id,
      required: input.required,
      state: "FAILED",
      reason: "A linked verification check failed.",
    };
  }
  if (input.checks.some((check) => check.status === "ERROR" || check.status === "UNKNOWN")) {
    const detail = input.checks.find((check) => check.error)?.error;
    return {
      id: input.id,
      required: input.required,
      state: "UNKNOWN",
      reason: detail
        ? `A linked verification check did not produce a result. ${detail}`
        : `A linked verification check did not produce ${input.requiredEvidence} evidence. Next: inspect the check error in the report and supply the missing runtime or command configuration.`,
    };
  }
  const satisfied = input.checks.some(
    (check) =>
      (check.status === "PASSED" || check.status === "CARRIED") &&
      check.evidenceClass !== null &&
      evidenceSatisfies(check.evidenceClass, input.requiredEvidence),
  );
  if (!satisfied) {
    return {
      id: input.id,
      required: input.required,
      state: "UNKNOWN",
      reason: `Passed checks did not produce ${input.requiredEvidence} evidence. Missing evidence: ${input.requiredEvidence}. Next: add a check that produces ${input.requiredEvidence}, or change this criterion's evidence class if a weaker check is actually sufficient.`,
    };
  }
  return {
    id: input.id,
    required: input.required,
    state: "VERIFIED",
    reason: "Linked checks passed with sufficient evidence.",
  };
}

function missingCheckReason(evidence: EvidenceClass): string {
  if (evidence === "RUNTIME" || evidence === "OBSERVED") {
    return `No verification check was planned for this criterion. Missing evidence: ${evidence}. Next: add a route, UI state, or API verification block to the contract, and set local.start plus ready_url in .projectgate/environments.yml.`;
  }
  if (evidence === "EXECUTABLE") {
    return "No verification check was planned for this criterion. Missing evidence: EXECUTABLE. Next: add a command under .projectgate/verification.yml commands and set its criterion to this id. projectgate init records build, test, lint, and typecheck commands it can see.";
  }
  if (evidence === "STATIC") {
    return "No verification check was planned for this criterion. Missing evidence: STATIC. Next: add an architecture rule that applies to the changed files, or link a static command to this criterion.";
  }
  return `No verification check was planned for this criterion. Missing evidence: ${evidence}. Next: link a verifier check that produces ${evidence}.`;
}

export function computeVerdict(input: {
  criteria: readonly CriterionEvaluation[];
  openFindings: readonly { severity: Severity }[];
  humanReviewRequired: boolean;
  blockingSeverities?: readonly Severity[];
}): Verdict {
  const blocking = new Set(input.blockingSeverities ?? ["CRITICAL", "MAJOR"]);
  const required = input.criteria.filter((criterion) => criterion.required);
  const verified = required.filter((criterion) => criterion.state === "VERIFIED").length;
  const failed = required.filter((criterion) => criterion.state === "FAILED").length;
  const unknown = required.filter((criterion) => criterion.state === "UNKNOWN").length;
  const counts = { verified, failed, unknown, total: required.length };
  const openBlocking = input.openFindings.filter((finding) => blocking.has(finding.severity));

  if (openBlocking.length > 0 || failed > 0) {
    const reasons: string[] = [];
    if (openBlocking.length > 0) reasons.push(`${openBlocking.length} open blocking finding(s).`);
    if (failed > 0) reasons.push(`${failed} required criterion(s) failed.`);
    return { state: "BLOCKED", ...counts, reasons };
  }
  if (unknown > 0) {
    return {
      state: "INCOMPLETE_EVIDENCE",
      ...counts,
      reasons: [`${unknown} required criterion(s) lack sufficient evidence.`],
    };
  }
  if (input.humanReviewRequired) {
    return {
      state: "PASS_WITH_HUMAN_REVIEW",
      ...counts,
      reasons: ["Policy requires a human reviewer before this change can pass."],
    };
  }
  return {
    state: "PASS",
    ...counts,
    reasons: ["All required criteria are verified and no blocking findings are open."],
  };
}

export function exitCodeForVerdict(state: VerdictState): number {
  switch (state) {
    case "PASS":
      return EXIT_PASS;
    case "BLOCKED":
      return EXIT_BLOCKED;
    case "INCOMPLETE_EVIDENCE":
      return EXIT_INCOMPLETE;
    case "PASS_WITH_HUMAN_REVIEW":
      return EXIT_HUMAN_REVIEW;
  }
}
