import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverRepository } from "../discover.js";
import { initProject } from "../init.js";
import { classifyProjectPath } from "./index.js";
import { safeManifestScript } from "./tools.js";
import * as stackTools from "./tools.js";

describe("stack discovery regressions", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps Node source files as application while leaving unsupported service files unknown", () => {
    const root = temp();
    write(root, "package.json", JSON.stringify({ scripts: { test: "node -e process.exit(0)" } }));
    write(root, "src/plain.ts", "export const value = 1;\n");
    write(root, "services/foo.xyz", "unknown service artifact\n");
    write(root, "services/typed/index.ts", "export const value = 1;\n");
    const discovery = discoverRepository(root);
    expect(discovery.languages).toContain("TypeScript");
    expect(classifyProjectPath("src/plain.ts")).toMatchObject({ adapter: "node", category: "APPLICATION" });
    expect(classifyProjectPath("services/foo.xyz")).toMatchObject({ adapter: "path", category: "UNKNOWN", role: "unknown" });
    expect(classifyProjectPath("services/typed/index.ts")).toMatchObject({ adapter: "node", category: "APPLICATION" });
  });

  it("uses confirmed Flutter SDK metadata and ignores folder names and YAML comments", () => {
    const real = temp();
    write(real, "pubspec.yaml", "name: mobile\ndependencies:\n  flutter:\n    sdk: flutter\n");
    write(real, "lib/main.dart", "void main() {}\n");
    expect(moduleAt(discoverRepository(real).modules, ".").frameworks).toContain("Flutter");

    for (const [name, pubspec] of [
      ["folder-only", null],
      ["comment-only", "name: sample\n# dependencies:\n#   flutter:\n#     sdk: flutter\n"],
    ] as const) {
      const root = temp();
      if (pubspec) write(root, "pubspec.yaml", pubspec);
      write(root, "flutter/lib/main.dart", "void main() {}\n");
      expect(discoverRepository(root).modules.some((module) => module.frameworks.includes("Flutter")), name).toBe(false);
    }
  });

  it("does not treat Flutter lib/pages files as a browser application", () => {
    const root = temp();
    write(root, "pubspec.yaml", "name: mobile\ndependencies:\n  flutter:\n    sdk: flutter\n");
    write(root, "lib/pages/home_page.dart", "class HomePage {}\n");
    const discovery = discoverRepository(root);
    expect(discovery.frontend).toContain("Flutter");
    expect(discovery.browserApp).toBe(false);
  });

  it("preserves detection provenance and manifest invalidation metadata", () => {
    const root = temp();
    write(root, "pubspec.yaml", "name: mobile\ndependencies:\n  flutter:\n    sdk: flutter\n");
    write(root, "lib/main.dart", "void main() {}\n");
    const module = moduleAt(discoverRepository(root).modules, ".");

    expect(module.detections.frameworks).toContainEqual(expect.objectContaining({
      name: "Flutter",
      source: "pubspec.yaml dependencies.flutter.sdk",
      adapter: "dart",
      confidence: "observed",
    }));
    expect(module.manifests).toContainEqual(expect.objectContaining({ name: "pubspec.yaml", source: "pubspec.yaml", adapter: "dart" }));
    expect(module.commands.length).toBeGreaterThan(0);
    expect(module.commands.every((command) => command.invalidatesOn.includes("pubspec.yaml"))).toBe(true);
  });

  it("retains unavailable module commands while excluding them from executable checks", () => {
    vi.spyOn(stackTools, "toolOnPath").mockReturnValue(false);
    const root = temp();
    write(root, "pubspec.yaml", "name: mobile\ndependencies:\n  flutter:\n    sdk: flutter\n");
    write(root, "lib/main.dart", "void main() {}\n");
    const discovery = discoverRepository(root);
    const module = moduleAt(discovery.modules, ".");

    expect(module.commands.map((command) => command.id)).toEqual(expect.arrayContaining(["flutter-analyze", "flutter-test"]));
    expect(module.commands.every((command) => !command.ready)).toBe(true);
    expect(discovery.commands).toEqual([]);
  });

  it("uses bun run for package scripts", () => {
    const root = temp();
    write(root, "package.json", JSON.stringify({ packageManager: "bun@1.2.0", scripts: { test: "node -e process.exit(0)" } }));
    write(root, "bun.lock", "\n");
    const module = moduleAt(discoverRepository(root).modules, ".");
    expect(module.commands.find((command) => command.id === "test")).toMatchObject({ command: "bun", args: ["run", "test"] });
  });

  it("preserves verification YAML comments and respects discover_baseline false", () => {
    vi.spyOn(stackTools, "toolOnPath").mockReturnValue(true);
    const root = temp();
    write(root, "package.json", JSON.stringify({ scripts: { test: "node -e process.exit(0)" } }));
    const verification = ".projectgate/verification.yml";
    const original = [
      "schema_version: 1",
      "# Keep this hand-written comment.",
      "discover_baseline: false",
      "commands: []",
      "",
    ].join("\n");
    write(root, verification, original);

    const result = initProject(root, "Demo");
    const updated = fs.readFileSync(path.join(root, verification), "utf8");

    expect(result.discovery.commands.map((command) => command.id)).toContain("test");
    expect(updated).toBe(original);
    expect(updated).not.toContain("id: test");
  });

  it("rejects mutating lint and referenced pretest scripts but accepts lint check mode", () => {
    expect(safeManifestScript({ lint: "eslint . --fix" }, "lint")).toBe(false);
    expect(safeManifestScript({ pretest: "npm run mutate", mutate: "prettier --write .", test: "vitest run" }, "test")).toBe(false);
    expect(safeManifestScript({ lint: "eslint . --check" }, "lint")).toBe(true);
  });

  it("uses vendored Go modules in offline module commands", () => {
    vi.spyOn(stackTools, "toolOnPath").mockReturnValue(true);
    const root = temp();
    write(root, "go.mod", "module example.test/app\n\ngo 1.22\n");
    write(root, "vendor/modules.txt", "# example.test/dependency v1.0.0\n");
    write(root, "main.go", "package main\nfunc main() {}\n");
    const module = moduleAt(discoverRepository(root).modules, ".");

    expect(module.commands.find((command) => command.id === "go-test")).toMatchObject({
      args: ["test", "-mod=vendor", "./..."],
      env: { GOPROXY: "off", GOTOOLCHAIN: "local", GOSUMDB: "off" },
      ready: true,
    });
    expect(module.commands.find((command) => command.id === "go-vet")?.args).toEqual(["vet", "-mod=vendor", "./..."]);
  });

  it("detects ASP.NET Core from a csproj even when a solution sorts first", () => {
    const root = temp();
    write(root, "A.sln", "Microsoft Visual Studio Solution File\n");
    write(root, "Z.Web.csproj", "<Project Sdk=\"Microsoft.NET.Sdk.Web\"></Project>\n");
    write(root, "Program.cs", "class Program {}\n");
    const module = moduleAt(discoverRepository(root).modules, ".");

    expect(module.frameworks).toContain("ASP.NET Core");
  });

  it("keeps Rust test command unavailable when Cargo.lock is missing", () => {
    vi.spyOn(stackTools, "toolOnPath").mockReturnValue(true);
    const root = temp();
    write(root, "Cargo.toml", "[package]\nname = \"demo\"\nversion = \"0.1.0\"\n");
    write(root, "src/main.rs", "fn main() {}\n");
    const module = moduleAt(discoverRepository(root).modules, ".");

    expect(module.commands.find((command) => command.id === "cargo-test")).toMatchObject({ args: ["test", "--offline", "--locked"], ready: false });
    expect(module.capabilities.find((capability) => capability.name === "cargo test")?.ready).toBe(false);
  });
});

function moduleAt<T extends { path: string }>(modules: readonly T[], modulePath: string): T {
  const module = modules.find((item) => item.path === modulePath);
  if (!module) throw new Error(`missing ${modulePath}`);
  return module;
}

function temp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pg-stack-regression-"));
}

function write(root: string, file: string, text: string): void {
  const absolute = path.join(root, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, text);
}
