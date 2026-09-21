import type { EvidenceClass, Severity } from "@projectgate/domain";
import { findImportViolations } from "@projectgate/policy-engine";
import { matchAnyGlob } from "@projectgate/shared";
import type { ExecutionContext, PlanningContext, VerificationCheck, VerificationResult, Verifier } from "@projectgate/verifier-sdk";
import { sourcePatterns } from "@projectgate/verifier-sdk";
import fs from "node:fs";
import path from "node:path";
import { parseSource, parsesAs } from "./parse.js";

interface ArchitectureInput {
  files: string[];
}

export class ArchitectureVerifier implements Verifier {
  readonly id = "architecture";
  readonly version = "1.0.0";

  supports(context: PlanningContext): boolean {
    const policy = context.config.architecture;
    return policy.rules.length > 0 || policy.forbiddenEdges.length > 0;
  }

  plan(context: PlanningContext): VerificationCheck[] {
    const patterns = sourcePatterns([
      ...context.config.architecture.rules.flatMap((rule) => rule.pathGlobs),
      ...context.config.architecture.layers.flatMap((layer) => layer.paths),
    ]);
    const files = context.changedFiles.filter((file) => parsesAs(file) && (patterns.length === 0 || matchAnyGlob(patterns, file)));
    return [
      {
        id: "architecture:changed-files",
        verifierId: this.id,
        title: "Architecture",
        why: "Scan changed source files for forbidden imports, calls, and layer edges.",
        group: "Architecture",
        expectedEvidence: "STATIC",
        execution: "deterministic",
        severityOnFail: "MAJOR",
        dependencyPatterns: patterns,
        reproduction: ["Inspect the changed files listed in the finding."],
        suspects: files,
        input: { files } satisfies ArchitectureInput,
      },
    ];
  }

  async execute(check: VerificationCheck, context: ExecutionContext): Promise<VerificationResult> {
    const files = (check.input as ArchitectureInput).files;
    const findings: VerificationResult["findings"] = [];
    const scanned: string[] = [];
    for (const file of files) {
      const absolute = path.join(context.root, file);
      if (!fs.existsSync(absolute)) continue;
      const text = fs.readFileSync(absolute, "utf8");
      scanned.push(file);
      let parsed: ReturnType<typeof parseSource>;
      try {
        parsed = parseSource(context.root, file, text);
      } catch (error) {
        findings.push(violation(check, file, "MAJOR", `Could not parse ${file}: ${error instanceof Error ? error.message : String(error)}`, "parse"));
        continue;
      }
      for (const item of findImportViolations({
        policy: context.config.architecture,
        file,
        imports: parsed.imports,
        calls: parsed.calls,
        source: parsed.source,
      })) {
        findings.push(violation(check, item.file, item.severity, item.message, item.ruleId));
      }
    }
    const evidenceClass: EvidenceClass = "STATIC";
    const evidence = [
      {
        type: "ast-inspection",
        evidenceClass,
        summary: findings.length === 0 ? `Scanned ${scanned.length} file(s) and found no architecture violations.` : `Scanned ${scanned.length} file(s) and found ${findings.length} violation(s).`,
        artifacts: [
          {
            filename: "inspection.json",
            mediaType: "application/json",
            body: JSON.stringify({ scanned, findings: findings.map((finding) => finding.title) }, null, 2),
          },
        ],
      },
    ];
    if (findings.length === 0) return { status: "PASSED", evidence, findings: [] };
    return { status: "FAILED", evidence, findings };
  }
}

function violation(check: VerificationCheck, file: string, severity: Severity, message: string, ruleId: string): VerificationResult["findings"][number] {
  return {
    stableKey: `${check.id}:${ruleId}:${file}`,
    severity,
    title: message,
    observed: message,
    expected: "The architecture rules in .projectgate allow this dependency.",
    actual: message,
    reproduction: [`Open ${file}.`, `Review rule ${ruleId}.`],
    suspectedLocations: [file],
    evidenceClass: "STATIC",
    reproducible: true,
    fingerprint: `${ruleId}:${file}`,
  };
}

