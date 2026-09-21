import { describe, expect, it } from "vitest";
import { findImportViolations } from "./evaluate.js";
import type { ArchitecturePolicy } from "./types.js";

const policy: ArchitecturePolicy = {
  layers: [
    { name: "controller", paths: ["**/controllers/**"], namespaces: ["App\\Http\\Controllers\\"] },
    { name: "repository", paths: ["**/repositories/**"], namespaces: ["App\\Repositories\\"] },
  ],
  forbiddenEdges: [
    {
      id: "controller-no-repository",
      from: "controller",
      to: "repository",
      severity: "MAJOR",
      description: "Controllers must not depend on repositories.",
    },
  ],
  rules: [
    {
      id: "no-eval",
      description: "eval is forbidden",
      pathGlobs: ["**/*.ts"],
      severity: "MAJOR",
      forbiddenImports: [],
      forbiddenCalls: ["eval"],
    },
  ],
};

describe("architecture policy", () => {
  it("flags a forbidden layer edge from an import", () => {
    const violations = findImportViolations({
      policy,
      file: "src/controllers/UserController.ts",
      imports: [{ specifier: "../repositories/user-repository", resolvedPath: "src/repositories/user-repository.ts" }],
      calls: [],
      source: "typescript-ast",
    });
    expect(violations.map((item) => item.ruleId)).toContain("controller-no-repository");
  });

  it("flags a forbidden call", () => {
    const violations = findImportViolations({
      policy,
      file: "src/app.ts",
      imports: [],
      calls: ["eval"],
      source: "typescript-ast",
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.ruleId).toBe("no-eval");
  });
});
