import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverRepository } from "./discover.js";

describe("repository discovery", () => {
  it("records node scripts that exist and does not invent missing ones", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-discover-"));
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "node tests/ok.js", build: "node -e process.exit(0)" }, dependencies: { react: "1.0.0" } }),
    );
    fs.writeFileSync(path.join(root, "vite.config.ts"), "export default {};\n");
    const discovery = discoverRepository(root);
    expect(discovery.packageManager).toBe("npm");
    expect(discovery.frontend).toBe("React + Vite");
    expect(discovery.commands.map((command) => command.id)).toEqual(["build", "test"]);
    expect(discovery.commands.some((command) => command.id === "lint")).toBe(false);
  });

  it("uses artisan test when a Laravel app has tests and no composer test script", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-laravel-"));
    fs.writeFileSync(path.join(root, "composer.json"), JSON.stringify({ require: { php: "^8.2" } }));
    fs.writeFileSync(path.join(root, "artisan"), "#!/usr/bin/env php\n");
    fs.mkdirSync(path.join(root, "tests"));
    const discovery = discoverRepository(root);
    expect(discovery.backend).toBe("Laravel");
    expect(discovery.modules.find((module) => module.path === ".")?.commands.map((command) => command.id)).toEqual(["artisan-test"]);
  });
});
