import type { CheckRecord, EvidenceRecord, Finding } from "@projectgate/domain";
import { strongestEvidence } from "@projectgate/domain";
import { expandPatterns, product, redactText, safeName, stableId } from "@projectgate/shared";
import type { ExecutionContext, VerificationCheck, VerificationResult, VerifierRegistry } from "@projectgate/verifier-sdk";
import fs from "node:fs";
import path from "node:path";

export interface ExecutionBundle {
  checks: CheckRecord[];
  evidence: EvidenceRecord[];
  findings: Finding[];
}

export async function executeChecks(options: {
  runId: string;
  checks: readonly VerificationCheck[];
  registry: VerifierRegistry;
  context: ExecutionContext;
  carried: readonly { check: CheckRecord; evidence: EvidenceRecord[] }[];
}): Promise<ExecutionBundle> {
  const checks: CheckRecord[] = [];
  const evidence: EvidenceRecord[] = [];
  const findings: Finding[] = [];
  for (const carried of options.carried) {
    const copied = copyCarried(options.runId, carried.check, carried.evidence);
    checks.push(copied.check);
    evidence.push(...copied.evidence);
  }
  for (const planned of options.checks) {
    const started = Date.now();
    const dependencies = expandPatterns(options.context.root, planned.dependencyPatterns);
    let result: VerificationResult;
    try {
      result = options.context.signal?.aborted
        ? { status: "UNKNOWN", evidence: [], findings: [], error: "Verification was cancelled before this check started." }
        : normalize(planned, await options.registry.get(planned.verifierId).execute(planned, options.context));
    } catch (error) {
      result = {
        status: "ERROR",
        evidence: [],
        findings: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const stored = storeResult({
      runId: options.runId,
      check: planned,
      result,
      dependencies,
      durationMs: Date.now() - started,
      context: options.context,
    });
    checks.push(stored.check);
    evidence.push(...stored.evidence);
    findings.push(...stored.findings);
  }
  return { checks, evidence, findings };
}

function normalize(check: VerificationCheck, result: VerificationResult): VerificationResult {
  const findings = [...result.findings];
  let status = result.status;
  if (status === "PASSED" && findings.some((finding) => finding.severity === "CRITICAL" || finding.severity === "MAJOR")) {
    status = "FAILED";
  }
  if (status === "PASSED" && result.evidence.length === 0) {
    return { status: "UNKNOWN", evidence: [], findings, error: "The check completed without evidence." };
  }
  if (status === "FAILED" && findings.length === 0) {
    findings.push({
      stableKey: `${check.id}:failed`,
      severity: check.severityOnFail,
      title: check.title,
      ...(check.requirement ? { requirement: check.requirement } : {}),
      observed: result.error ?? "The check failed without a verifier finding.",
      expected: check.requirement,
      actual: result.error ?? "Failed",
      reproduction: check.reproduction,
      suspectedLocations: check.suspects,
      evidenceClass: check.expectedEvidence,
      reproducible: false,
      fingerprint: check.id,
    });
  }
  return { status, evidence: result.evidence, findings, ...(result.error ? { error: result.error } : {}) };
}

function storeResult(options: {
  runId: string;
  check: VerificationCheck;
  result: VerificationResult;
  dependencies: { path: string; hash: string }[];
  durationMs: number;
  context: ExecutionContext;
}): { check: CheckRecord; evidence: EvidenceRecord[]; findings: Finding[] } {
  const evidence: EvidenceRecord[] = [];
  options.result.evidence.forEach((draft, index) => {
    const id = stableId("ev", `${options.runId}:${options.check.id}:${draft.type}:${index}`, 12).toLowerCase();
    const artifacts = draft.artifacts.map((artifact) => {
      const filename = safeName(artifact.filename);
      const relative = path.posix.join(product.configDir, "runtime", "runs", options.runId, "artifacts", id, filename);
      const absolute = path.join(options.context.root, relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      const body = typeof artifact.body === "string" && options.context.redact ? redactText(artifact.body).text : artifact.body;
      fs.writeFileSync(absolute, body);
      return { path: relative, mediaType: artifact.mediaType, bytes: Buffer.byteLength(body) };
    });
    evidence.push({
      id,
      type: draft.type,
      evidenceClass: draft.evidenceClass,
      sourceVerifier: options.check.verifierId,
      timestamp: options.context.now().toISOString(),
      changeId: options.context.changeId,
      ...(options.check.criterionId ? { criterionId: options.check.criterionId } : {}),
      checkId: options.check.id,
      runId: options.runId,
      environment: options.context.environmentName,
      artifacts,
      freshness: "FRESH",
      dependencies: options.dependencies,
      summary: options.context.redact ? redactText(draft.summary).text : draft.summary,
    });
  });
  const evidenceIds = evidence.map((item) => item.id);
  const evidencePaths = evidence.flatMap((item) => item.artifacts.map((artifact) => artifact.path));
  const findings: Finding[] = options.result.findings.map((draft) => ({
    id: stableId("PG", draft.stableKey),
    stableKey: draft.stableKey,
    severity: draft.severity,
    status: "OPEN",
    ...(options.check.criterionId ? { criterionId: options.check.criterionId } : {}),
    checkId: options.check.id,
    verifierId: options.check.verifierId,
    title: draft.title,
    ...(draft.requirement ?? options.check.requirement ? { requirement: draft.requirement ?? options.check.requirement } : {}),
    observed: draft.observed,
    ...(draft.expected ? { expected: draft.expected } : {}),
    ...(draft.actual ? { actual: draft.actual } : {}),
    environment: options.context.environmentName,
    reproduction: draft.reproduction ?? options.check.reproduction,
    evidenceIds,
    evidencePaths,
    suspectedLocations: draft.suspectedLocations ?? options.check.suspects,
    evidenceClass: draft.evidenceClass,
    reproducible: draft.reproducible,
  }));
  const record: CheckRecord = {
    id: options.check.id,
    verifierId: options.check.verifierId,
    ...(options.check.criterionId ? { criterionId: options.check.criterionId } : {}),
    title: options.check.title,
    why: options.check.why,
    group: options.check.group,
    expectedEvidence: options.check.expectedEvidence,
    producedEvidence: strongestEvidence(options.result.evidence.map((item) => item.evidenceClass)),
    execution: options.check.execution,
    status: options.result.status,
    durationMs: options.durationMs,
    dependencyPatterns: [...options.check.dependencyPatterns],
    dependencies: options.dependencies,
    evidenceIds,
    reproduction: options.check.reproduction,
    suspects: options.check.suspects,
    ...(options.result.error ? { error: options.result.error } : {}),
  };
  return { check: record, evidence, findings };
}

function copyCarried(runId: string, check: CheckRecord, previousEvidence: readonly EvidenceRecord[]): { check: CheckRecord; evidence: EvidenceRecord[] } {
  const evidence = previousEvidence
    .filter((item) => item.checkId === check.id)
    .map((item, index) => ({
      ...item,
      id: stableId("ev", `${runId}:carried:${check.id}:${index}`, 12).toLowerCase(),
      runId,
      freshness: "FRESH" as const,
      carriedFromRunId: item.runId,
    }));
  return {
    check: { ...check, status: "CARRIED", durationMs: 0, carriedFromRunId: check.carriedFromRunId ?? previousEvidence[0]?.runId, evidenceIds: evidence.map((item) => item.id) },
    evidence,
  };
}
