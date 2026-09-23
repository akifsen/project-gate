import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PlanningContext } from "@projectgate/verifier-sdk";
import { ShellVerifier } from "@projectgate/shell-verifier";
import { discoverRepository } from "../discover.js";
import { classifyProjectPath } from "./index.js";
import { nodeAdapter, nodeRuntimeProposal } from "./node.js";
import type { ModuleScan } from "./types.js";

function discoverScripts(lockfile: string): { commands: { id: string; command: string; args: string[] }[]; runtimeProposal: string | null } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-node-scripts-"));
  try {
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
      scripts: { check: "tsc --noEmit", test: "vitest run", dev: "vite" },
    }));
    fs.writeFileSync(path.join(root, lockfile), "\n");
    const scan: ModuleScan = {
      repoRoot: root,
      path: ".",
      files: ["package.json", lockfile],
      exists: (name) => fs.existsSync(path.join(root, name)),
      read: () => null,
    };
    const commands = nodeAdapter.inspect(scan)?.commands ?? [];
    return { commands, runtimeProposal: nodeRuntimeProposal(scan) };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("Node package script invocation", () => {
  it("uses yarn run for a check script that collides with Yarn Classic's built-in check", () => {
    const result = discoverScripts("yarn.lock");
    expect(result.commands.find((item) => item.id === "check")).toMatchObject({ command: "yarn", args: ["run", "check"] });
    expect(result.commands.find((item) => item.id === "test")).toMatchObject({ command: "yarn", args: ["run", "test"] });
    expect(result.runtimeProposal).toBe("yarn run dev");
  });

  it("uses pnpm run explicitly and preserves npm script invocation", () => {
    const pnpm = discoverScripts("pnpm-lock.yaml");
    expect(pnpm.commands.find((item) => item.id === "check")).toMatchObject({ command: "pnpm", args: ["run", "check"] });
    expect(pnpm.commands.find((item) => item.id === "test")).toMatchObject({ command: "pnpm", args: ["run", "test"] });
    expect(pnpm.runtimeProposal).toBe("pnpm run dev");

    const npm = discoverScripts("package-lock.json");
    expect(npm.commands.find((item) => item.id === "check")).toMatchObject({ command: "npm", args: ["run", "check"] });
    expect(npm.commands.find((item) => item.id === "test")).toMatchObject({ command: "npm", args: ["test"] });
  });
});

describe("Node configuration invalidation", () => {
  it("plans a package check when only a tsconfig manifest changes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-node-tsconfig-"));
    try {
      fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { check: "tsc --noEmit" } }));
      fs.writeFileSync(path.join(root, "tsconfig.json"), "{}\n");
      fs.writeFileSync(path.join(root, "tsconfig.build.json"), "{}\n");
      const module = discoverRepository(root).modules.find((item) => item.path === ".");
      const check = module?.commands.find((item) => item.id === "check");
      expect(check).toBeDefined();
      if (!check) throw new Error("Node check command was not discovered");

      for (const file of ["tsconfig.json", "tsconfig.build.json"]) {
        expect(classifyProjectPath(file)).toMatchObject({ adapter: "node", category: "CONFIGURATION" });
        expect(module?.manifests.map((item) => item.name)).toContain(file);
        expect(check.invalidatesOn).toContain(file);
        const planned = new ShellVerifier().plan({
          root,
          changedFiles: [file],
          contract: { acceptance: [] } as unknown as PlanningContext["contract"],
          config: { commands: [{ ...check, evidence: "EXECUTABLE" }] } as unknown as PlanningContext["config"],
        });
        expect(planned.map((item) => item.id)).toContain("shell:check");
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
