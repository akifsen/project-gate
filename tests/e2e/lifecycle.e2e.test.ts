import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "@projectgate/cli";

describe("usable project lifecycle", () => {
  it("initializes, creates a contract through the CLI, blocks, then passes on verify", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-life-"));
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "widget-app",
        private: true,
        scripts: {
          test: "node tests/status.cjs",
          build: "node -e \"process.exit(0)\"",
          lint: "node -e \"process.exit(0)\"",
        },
        dependencies: { react: "19.0.0", vite: "6.0.0" },
      }),
    );
    fs.writeFileSync(path.join(root, "vite.config.js"), "export default {};\n");
    fs.mkdirSync(path.join(root, "src", "components"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "components", "Widget.tsx"), "export function Widget() { return \"BROKEN\"; }\n");
    fs.writeFileSync(
      path.join(root, "tests", "status.cjs"),
      "const fs = require('node:fs'); const text = fs.readFileSync('src/components/Widget.tsx', 'utf8'); if (text.includes('BROKEN')) process.exit(1);\n",
    );
    fs.writeFileSync(path.join(root, "README.md"), "widget\n");
    git(root, ["init", "-b", "main"]);
    git(root, ["add", "README.md"]);
    git(root, ["commit", "-m", "base"]);

    const init = capture();
    expect(await runCli(["init", "--cwd", root], init)).toBe(0);
    expect(fs.existsSync(path.join(root, ".projectgate", "contract.yml"))).toBe(false);
    expect(init.out).toContain("React + Vite");
    expect(init.out).toContain("projectgate contract --task");
    expect(init.out).not.toContain("Copy-Item");
    expect(init.out).not.toContain("contract.example.yml");

    const doctor = capture();
    expect(await runCli(["doctor", "--cwd", root], doctor)).toBe(0);
    expect(doctor.out).toContain("Change contract");
    expect(doctor.out).toContain("not created");

    const inspected = capture();
    expect(await runCli(["inspect", "--cwd", root, "--verbose"], inspected)).toBe(0);
    expect(inspected.out).toContain("React + Vite");
    expect(inspected.out).toContain("Widget.tsx");

    const contracted = capture();
    expect(await runCli(["contract", "--cwd", root, "--task", "The widget component must not ship the broken marker."], contracted)).toBe(0);
    expect(fs.existsSync(path.join(root, ".projectgate", "contract.yml"))).toBe(true);
    expect(contracted.out).toContain("Change Contract created.");

    const blocked = capture();
    const blockedCode = await runCli(["audit", "--cwd", root], blocked);
    expect(blockedCode).toBe(1);
    expect(blocked.out).toContain("BLOCKED");
    expect(blocked.out).not.toContain("0 product surfaces affected");
    expect(blocked.out).not.toContain("No checks ran.");
    expect(blocked.out).toContain("✗ Test");

    fs.writeFileSync(path.join(root, "src", "components", "Widget.tsx"), "export function Widget() { return \"ok\"; }\n");
    const passed = capture();
    expect(await runCli(["verify", "--cwd", root], passed)).toBe(0);
    expect(passed.out).toContain("PASS");
    expect(passed.out).toContain("✓ Test");

    const report = capture();
    expect(await runCli(["report", "--cwd", root], report)).toBe(0);
    expect(report.out).toContain("PASS");
  }, 120_000);
});

function capture(): { stdout: (text: string) => void; stderr: (text: string) => void; out: string; err: string } {
  return {
    out: "",
    err: "",
    stdout(text: string) {
      this.out += text;
    },
    stderr(text: string) {
      this.err += text;
    },
  };
}

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", ["-c", "user.name=Project Gate Test", "-c", "user.email=test@projectgate.local", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
}
