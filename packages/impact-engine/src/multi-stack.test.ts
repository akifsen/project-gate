import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeImpact } from "./analyze.js";
import { classifyFile } from "./classify.js";
import { routesInFile } from "./routes.js";

describe("multi-stack classification", () => {
  it("classifies Flutter files and keeps unknown files visible", () => {
    expect(classifyFile("lib/main.dart")).toMatchObject({ category: "APPLICATION", adapter: "dart" });
    expect(classifyFile("lib/features/profile/profile_screen.dart")).toMatchObject({ category: "APPLICATION", subtype: "SCREEN", role: "ui" });
    expect(classifyFile("test/profile_test.dart").category).toBe("TEST");
    expect(classifyFile("integration_test/app_test.dart").category).toBe("TEST");
    expect(classifyFile(".projectgate/contract.yml").category).toBe("PROJECT_GATE_INTERNAL");
    expect(classifyFile(".projectgate/runtime/runs/log.txt").category).toBe("PROJECT_GATE_INTERNAL");
    expect(classifyFile("src/main.zig")).toMatchObject({ category: "UNKNOWN", role: "unknown" });

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-dart-impact-"));
    write(root, "lib/features/profile/profile_screen.dart", "class ProfileScreen {}\n");
    write(root, "lib/features/profile/profile_controller.dart", "class ProfileController { final screen = ProfileScreen(); }\n");
    write(root, "test/features/profile/profile_test.dart", "void main() {}\n");
    const impact = analyzeImpact({
      root,
      changed: [
        { path: "lib/features/profile/profile_screen.dart", status: "modified" },
        { path: "lib/features/profile/profile_controller.dart", status: "modified" },
        { path: "test/features/profile/profile_test.dart", status: "modified" },
        { path: "src/main.zig", status: "modified" },
        { path: ".projectgate/contract.yml", status: "modified" },
      ],
    });
    expect(impact.changedFiles.filter((file) => file.category === "APPLICATION")).toHaveLength(2);
    expect(impact.changedFiles.filter((file) => file.category === "TEST")).toHaveLength(1);
    expect(impact.changedFiles.filter((file) => file.category === "PROJECT_GATE_INTERNAL")).toHaveLength(1);
    expect(impact.unresolvedFiles).toEqual(["src/main.zig"]);
    expect(impact.surfaces.some((surface) => surface.id === "screen:ProfileScreen")).toBe(true);
    expect(impact.edges.some((edge) => edge.confidence === "inferred" && edge.to === "ProfileScreen")).toBe(true);
  });

  it("maps a Spring controller to an API surface and a service dependency", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-spring-impact-"));
    const controller = [
      "import com.example.UserService;",
      "@RestController",
      "@RequestMapping(\"/api/users\")",
      "class UserController {",
      "  UserController(UserService userService) {}",
      "  @PatchMapping(\"/{id}\")",
      "  void update() {}",
      "}",
    ].join("\n");
    write(root, "src/main/java/com/example/UserController.java", controller);
    write(root, "src/main/java/com/example/UserService.java", "class UserService {}\n");
    write(root, "src/test/java/com/example/UserControllerTest.java", "class UserControllerTest {}\n");
    expect(routesInFile("src/main/java/com/example/UserController.java", controller)[0]).toMatchObject({
      path: "PATCH /api/users/{id}",
      source: "@PatchMapping",
    });
    const impact = analyzeImpact({
      root,
      changed: [
        { path: "src/main/java/com/example/UserController.java", status: "modified" },
        { path: "src/main/java/com/example/UserService.java", status: "modified" },
        { path: "src/test/java/com/example/UserControllerTest.java", status: "modified" },
      ],
    });
    expect(impact.changedFiles.filter((file) => file.category === "APPLICATION")).toHaveLength(2);
    expect(impact.changedFiles.filter((file) => file.category === "TEST")).toHaveLength(1);
    expect(impact.unresolvedFiles).toEqual([]);
    expect(impact.surfaces.some((surface) => surface.id === "route:PATCH /api/users/{id}" && surface.confidence === "observed")).toBe(true);
    expect(impact.edges.some((edge) => edge.from.endsWith("UserController.java") && edge.to.endsWith("UserService.java") && edge.confidence === "observed")).toBe(true);
    expect(impact.surfaces.some((surface) => surface.id.includes("UserService"))).toBe(false);
  });

  it("reads other ecosystem routes without treating them as product classes", () => {
    expect(routesInFile("app/main.py", "@app.get('/items/{id}')\ndef read():\n    return {}\n")[0]?.path).toBe("GET /items/{id}");
    expect(routesInFile("app/urls.py", "path('users/', view)\n")[0]).toMatchObject({ path: "/users/", source: "django-url" });
    expect(routesInFile("Program.cs", "app.MapGet(\"/health\", () => \"ok\");\n")[0]?.path).toBe("GET /health");
    expect(routesInFile("routes.go", "r.Get(\"/users\", nil)\n")[0]?.path).toBe("GET /users");
    expect(classifyFile("src/main/java/com/example/UserMapper.java")).toMatchObject({ category: "APPLICATION", subtype: "OTHER" });
    expect(classifyFile("mvnw.cmd").category).toBe("CONFIGURATION");
    expect(classifyFile("gradlew").category).toBe("CONFIGURATION");
  });
});

function write(root: string, file: string, text: string): void {
  const absolute = path.join(root, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, text);
}
