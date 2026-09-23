import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeImpact } from "./analyze.js";
import { classifyFile } from "./classify.js";
import { routesInFile } from "./routes.js";

describe("impact regressions", () => {
  it("keeps Laravel verbs distinct and follows Flutter self-package imports", () => {
    const root = temp();
    write(root, "routes/api.php", "Route::get('/users', 'read'); Route::post('/users', 'write');");
    write(root, "apps/mobile/pubspec.yaml", "name: mobile\ndependencies:\n  flutter:\n    sdk: flutter\n");
    const service = "apps/mobile/lib/profile_service.dart";
    write(root, service, "class ProfileService {}\n");
    write(root, "apps/mobile/lib/profile_screen.dart", "import 'package:mobile/profile_service.dart';\nclass ProfileScreen {}\n");
    const impact = analyzeImpact({ root, changed: [{ path: "routes/api.php", status: "modified" }, { path: service, status: "modified" }] });
    expect(impact.surfaces.map((surface) => surface.id)).toEqual(expect.arrayContaining(["route:GET /users", "route:POST /users", "screen:ProfileScreen"]));
    expect(impact.surfaces.find((surface) => surface.id === "screen:ProfileScreen")?.confidence).toBe("inferred");
  });
  it("keeps deleted unknown files unresolved", () => {
    const impact = analyzeImpact({
      root: temp(),
      changed: [{ path: "src/main.zig", status: "deleted" }],
    });

    expect(impact.changedFiles).toContainEqual(expect.objectContaining({ path: "src/main.zig", status: "deleted", category: "UNKNOWN" }));
    expect(impact.unresolvedFiles).toEqual(["src/main.zig"]);
  });

  it("does not create product surfaces for Project Gate runtime TypeScript", () => {
    const root = temp();
    write(root, ".projectgate/runtime/runs/page.tsx", "export default function Page() { return null; }\n");
    const impact = analyzeImpact({
      root,
      changed: [{ path: ".projectgate/runtime/runs/page.tsx", status: "modified" }],
    });

    expect(classifyFile(".projectgate/runtime/runs/page.tsx").category).toBe("PROJECT_GATE_INTERNAL");
    expect(impact.changedFiles[0]?.category).toBe("PROJECT_GATE_INTERNAL");
    expect(impact.surfaces).toEqual([]);
    expect(impact.unresolvedFiles).toEqual([]);
  });

  it("resolves an unchanged Spring route through an import from a changed service", () => {
    const root = temp();
    const service = "src/main/java/com/example/UserService.java";
    const controller = "src/main/java/com/example/UserController.java";
    write(root, service, "package com.example;\nclass UserService {}\n");
    write(root, controller, [
      "package com.example;",
      "import com.example.UserService;",
      "@RestController",
      "@RequestMapping(\"/api/users\")",
      "class UserController {",
      "  UserController(UserService users) {}",
      "  @GetMapping(\"/{id}\")",
      "  void get() {}",
      "}",
    ].join("\n"));

    const impact = analyzeImpact({ root, changed: [{ path: service, status: "modified" }] });
    const route = impact.surfaces.find((surface) => surface.id === "route:GET /api/users/{id}");

    expect(route).toMatchObject({ relationship: "dependent-route", source: "resolved-import", confidence: "inferred" });
    expect(route?.files).toEqual(expect.arrayContaining([service, controller]));
    expect(impact.edges).toContainEqual(expect.objectContaining({ from: service, to: controller, relationship: "dependent", source: "resolved-import" }));
  });

  it("normalizes Next page routes and ignores non-path Spring mapping arguments", () => {
    const root = temp();
    const page = "apps/web/app/profile/page.tsx";
    const controller = "src/main/java/com/example/UserController.java";
    const dynamicController = "src/main/java/com/example/DynamicController.java";
    write(root, page, "export default function ProfilePage() { return null; }\n");
    write(root, controller, [
      "@RequestMapping(\"/api/users\")",
      "class UserController {",
      "  @GetMapping(produces = \"application/json\")",
      "  void list() {}",
      "}",
    ].join("\n"));
    write(root, dynamicController, "class DynamicController { @GetMapping(PATH) void dynamic() {} }\n");

    const impact = analyzeImpact({
      root,
      changed: [
        { path: page, status: "modified" },
        { path: controller, status: "modified" },
        { path: dynamicController, status: "modified" },
      ],
    });

    expect(impact.surfaces.some((surface) => surface.id === "route:/profile" && surface.files.includes(page))).toBe(true);
    expect(routesInFile(controller, fs.readFileSync(path.join(root, controller), "utf8"))).toEqual([
      { path: "GET /api/users", source: "@GetMapping" },
    ]);
    expect(routesInFile(dynamicController, fs.readFileSync(path.join(root, dynamicController), "utf8"))).toEqual([]);
    expect(impact.surfaces.some((surface) => surface.id === "route:GET /api/users")).toBe(true);
    expect(impact.surfaces.some((surface) => surface.id === "route:GET /")).toBe(false);
  });
});

function temp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pg-impact-regression-"));
}

function write(root: string, file: string, text: string): void {
  const absolute = path.join(root, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, text);
}
