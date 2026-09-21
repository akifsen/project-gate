import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadContract } from "@projectgate/contracts";
import { loadProject } from "./load.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("repository configuration", () => {
  it("loads this repo's Project Gate files", () => {
    const project = loadProject(root);
    expect(project.project.name).toBe("Project Gate");
    expect(project.commands[0]?.criterionId).toBe("AC-001");
    expect(project.architecture.rules.some((rule) => rule.id === "verifiers-do-not-import-adapters")).toBe(true);
    expect(project.architecture.forbiddenEdges.some((edge) => edge.id === "verifier-must-not-depend-on-cli")).toBe(true);
    const contract = loadContract(path.join(root, ".projectgate", "contract.yml"));
    expect(contract.change.id).toBe("GATE-SELF");
    expect(contract.acceptance[0]?.evidence).toBe("EXECUTABLE");
  });
});