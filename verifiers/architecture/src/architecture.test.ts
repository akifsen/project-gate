import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ExecutionContext, VerificationCheck } from "@projectgate/verifier-sdk";
import { ArchitectureVerifier } from "./index.js";

describe("architecture verifier", () => {
  it("reports a controller that imports a repository", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-arch-"));
    const controller = path.join(root, "src", "controllers");
    const repository = path.join(root, "src", "repositories");
    fs.mkdirSync(controller, { recursive: true });
    fs.mkdirSync(repository, { recursive: true });
    fs.writeFileSync(path.join(repository, "user-repository.ts"), "export class UserRepository {}\n");
    fs.writeFileSync(
      path.join(controller, "UserController.ts"),
      'import { UserRepository } from "../repositories/user-repository";\nexport class UserController { repo: UserRepository | undefined; }\n',
    );
    fs.writeFileSync(
      path.join(root, "UserController.php"),
      "<?php\nnamespace App\\Http\\Controllers;\nuse App\\Repositories\\UserRepository;\nclass UserController {}\n",
    );
    const verifier = new ArchitectureVerifier();
    const tsResult = await verifier.execute(check(["src/controllers/UserController.ts"]), execution(root));
    expect(tsResult.status).toBe("FAILED");
    expect(tsResult.findings[0]?.evidenceClass).toBe("STATIC");
    expect(tsResult.findings.some((finding) => finding.fingerprint.includes("controller-no-repository"))).toBe(true);

    const phpResult = await verifier.execute(check(["UserController.php"]), execution(root));
    expect(phpResult.status).toBe("FAILED");
    expect(phpResult.evidence[0]?.summary).toContain("violation");
  });
});

function check(files: string[]): VerificationCheck {
  return {
    id: "architecture:changed-files",
    verifierId: "architecture",
    title: "Architecture",
    why: "test",
    group: "Architecture",
    expectedEvidence: "STATIC",
    execution: "deterministic",
    severityOnFail: "MAJOR",
    dependencyPatterns: ["**/*.ts", "**/*.php"],
    reproduction: [],
    suspects: files,
    input: { files },
  };
}

function execution(root: string): ExecutionContext {
  return {
    root,
    runDir: root,
    config: {
      architecture: {
        layers: [
          { name: "controller", paths: ["**/controllers/**", "UserController.php"], namespaces: ["App\\Http\\Controllers\\"] },
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
        rules: [],
      },
    } as unknown as ExecutionContext["config"],
    environmentName: "test",
    changeId: "C",
    now: () => new Date(0),
    browser: null,
    timeouts: { commandMs: 5_000, httpMs: 5_000, browserMs: 5_000 },
    redact: true,
  };
}
