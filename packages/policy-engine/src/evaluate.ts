import { matchAnyGlob, matchGlob } from "@projectgate/shared";
import type { ArchitecturePolicy, ImportRef, PolicyViolation } from "./types.js";

export function findImportViolations(input: {
  policy: ArchitecturePolicy;
  file: string;
  imports: readonly ImportRef[];
  calls: readonly string[];
  source: PolicyViolation["source"];
}): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  for (const rule of input.policy.rules) {
    if (rule.pathGlobs.length > 0 && !matchAnyGlob(rule.pathGlobs, input.file)) continue;
    for (const specifier of input.imports) {
      if (rule.forbiddenImports.some((pattern) => specifier.specifier.includes(pattern))) {
        violations.push({
          ruleId: rule.id,
          severity: rule.severity,
          file: input.file,
          source: input.source,
          message: `${input.file} imports ${specifier.specifier}, which matches forbidden import ${rule.id}.`,
        });
      }
    }
    for (const call of input.calls) {
      if (rule.forbiddenCalls.includes(call)) {
        violations.push({
          ruleId: rule.id,
          severity: rule.severity,
          file: input.file,
          source: input.source,
          message: `${input.file} calls ${call}, which is forbidden by ${rule.id}.`,
        });
      }
    }
  }

  const sourceLayers = layersForPath(input.policy, input.file);
  for (const imported of input.imports) {
    const targetLayers = layersForImport(input.policy, imported);
    for (const edge of input.policy.forbiddenEdges) {
      if (!sourceLayers.includes(edge.from) || !targetLayers.includes(edge.to)) continue;
      violations.push({
        ruleId: edge.id,
        severity: edge.severity,
        file: input.file,
        source: input.source,
        message: edge.description || `${input.file} (${edge.from}) depends on ${imported.specifier} (${edge.to}).`,
      });
    }
  }
  return violations;
}

function layersForPath(policy: ArchitecturePolicy, file: string): string[] {
  return policy.layers.filter((layer) => layer.paths.some((pattern) => matchGlob(pattern, file))).map((layer) => layer.name);
}

function layersForImport(policy: ArchitecturePolicy, imported: ImportRef): string[] {
  const names = new Set<string>();
  if (imported.resolvedPath) {
    for (const layer of layersForPath(policy, imported.resolvedPath)) names.add(layer);
  }
  for (const layer of policy.layers) {
    if (layer.namespaces.some((namespace) => imported.specifier.includes(namespace))) names.add(layer.name);
  }
  return [...names];
}

export function emptyArchitecturePolicy(): ArchitecturePolicy {
  return { layers: [], forbiddenEdges: [], rules: [] };
}
