import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PlanningContext } from "@projectgate/verifier-sdk";
import { ShellVerifier } from "@projectgate/shell-verifier";
import { discoverRepository } from "../discover.js";
import { initProject } from "../init.js";
import { loadProject } from "../load.js";
import type { DiscoveryModule } from "../discover.js";

describe("multi-stack discovery", () => {
  it("discovers a Flutter module, its screen, and baseline capabilities", () => {
    const root = temp();
    write(root, "pubspec.yaml", "name: profile_app\ndependencies:\n  flutter:\n    sdk: flutter\n");
    write(root, "lib/main.dart", "void main() {}\n");
    write(root, "lib/features/profile/profile_screen.dart", "class ProfileScreen {}\n");
    write(root, "test/profile_test.dart", "void main() {}\n");
    write(root, "android/build.gradle.kts", "plugins { id(\"com.android.application\") }\n");
    write(root, "android/app/src/main/kotlin/com/example/MainActivity.kt", "class MainActivity\n");
    write(root, "tool/gen.py", "print('catalog')\n");
    const module = only(root);
    expect(module.languages).toContain("Dart");
    expect(module.frameworks).toContain("Flutter");
    expect(module.packageManagers).toContain("Flutter Pub");
    expect(module.capabilities.map((item) => item.name)).toEqual(expect.arrayContaining(["flutter analyze", "flutter test"]));
    expect(module.commands.map((command) => command.args.join(" "))).toEqual(expect.arrayContaining(["analyze", "test"]));
    expect(module.commands.every((command) => command.command === "flutter")).toBe(true);
    expect(module.commands.some((command) => command.args.includes("build"))).toBe(false);
    expect(module.languages).not.toContain("Java");
    expect(module.languages).not.toContain("Kotlin");
    expect(module.frameworks).not.toContain("Android");
    expect(module.packageManagers).toEqual(["Flutter Pub"]);
    expect(module.commands.some((command) => command.command === "python" || command.command === "py")).toBe(false);
  });

  it("discovers Spring Boot on Maven and Gradle wrappers", () => {
    const maven = temp();
    write(maven, "pom.xml", "<project><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency><dependency><groupId>org.junit.jupiter</groupId></dependency></dependencies></project>\n");
    write(maven, "mvnw", "#!/bin/sh\n");
    write(maven, "mvnw.cmd", "@echo off\n");
    write(maven, "src/main/java/com/example/UserController.java", "class UserController {}\n");
    write(maven, "src/test/java/com/example/UserControllerTest.java", "class UserControllerTest {}\n");
    const mavenModule = only(maven);
    expect(mavenModule.languages).toContain("Java");
    expect(mavenModule.frameworks).toContain("Spring Boot");
    expect(mavenModule.packageManagers).toContain("Maven Wrapper");
    expect(mavenModule.commands.map((command) => command.id)).toContain("maven-test");
    expect(mavenModule.commands.find((command) => command.id === "maven-test")?.args).toEqual(["test"]);
    expect(mavenModule.capabilities.map((item) => item.name)).toEqual(expect.arrayContaining(["mvn test", "junit"]));

    const gradle = temp();
    write(gradle, "build.gradle.kts", "plugins {\n  kotlin(\"jvm\")\n  id(\"org.springframework.boot\")\n}\ndependencies {\n  implementation(\"org.springframework.boot:spring-boot-starter-web\")\n}\n");
    write(gradle, "gradlew", "#!/bin/sh\n");
    write(gradle, "gradlew.bat", "@echo off\n");
    write(gradle, "src/main/kotlin/com/example/UserController.kt", "class UserController\n");
    const gradleModule = only(gradle);
    expect(gradleModule.languages).toEqual(expect.arrayContaining(["Kotlin"]));
    expect(gradleModule.frameworks).toContain("Spring Boot");
    expect(gradleModule.frameworks).not.toContain("Android");
    expect(gradleModule.packageManagers).toContain("Gradle Wrapper");
    expect(gradleModule.capabilities.map((item) => item.name)).toEqual(expect.arrayContaining(["gradle test", "gradle check"]));
  });

  it("distinguishes Android from Spring and discovers the other ecosystems", () => {
    const android = temp();
    write(android, "build.gradle.kts", "plugins { id(\"com.android.application\"); id(\"org.jetbrains.kotlin.android\") }\n");
    write(android, "gradlew.bat", "@echo off\n");
    write(android, "src/main/kotlin/com/example/MainActivity.kt", "class MainActivity\n");
    const androidModule = only(android);
    expect(androidModule.frameworks).toContain("Android");
    expect(androidModule.frameworks).not.toContain("Spring Boot");
    expect(androidModule.languages).toContain("Kotlin");

    const fastapi = temp();
    write(fastapi, "pyproject.toml", "[project]\ndependencies = [\"fastapi\"]\n[tool.pytest.ini_options]\n");
    write(fastapi, "app/main.py", "from fastapi import FastAPI\napp = FastAPI()\n@app.get('/items')\ndef items():\n    return []\n");
    expect(only(fastapi).frameworks).toContain("FastAPI");

    const django = temp();
    write(django, "requirements.txt", "django\n");
    write(django, "manage.py", "#!/usr/bin/env python\n");
    write(django, "app/urls.py", "urlpatterns = [path('users/', None)]\n");
    expect(only(django).frameworks).toContain("Django");

    const dotnet = temp();
    write(dotnet, "Api.csproj", "<Project Sdk=\"Microsoft.NET.Sdk.Web\"></Project>\n");
    write(dotnet, "Program.cs", "app.MapGet(\"/health\", () => \"ok\");\n");
    const dotnetModule = only(dotnet);
    expect(dotnetModule.languages).toContain("C#");
    expect(dotnetModule.frameworks).toContain("ASP.NET Core");
    expect(dotnetModule.capabilities.map((item) => item.name)).toContain("dotnet test");

    const go = temp();
    write(go, "go.mod", "module example.com/api\n\ngo 1.22\n");
    write(go, "main.go", "package main\nfunc main() {}\n");
    expect(only(go).packageManagers).toContain("Go modules");
    expect(only(go).capabilities.map((item) => item.name)).toEqual(expect.arrayContaining(["go test", "go vet"]));

    const rust = temp();
    write(rust, "Cargo.toml", "[package]\nname = \"api\"\nversion = \"0.1.0\"\n");
    write(rust, "src/main.rs", "fn main() {}\n");
    expect(only(rust).packageManagers).toContain("Cargo");
    expect(only(rust).capabilities.map((item) => item.name)).toEqual(expect.arrayContaining(["cargo test", "cargo check"]));

    const next = temp();
    write(next, "package.json", JSON.stringify({ dependencies: { next: "15.0.0" }, scripts: { build: "next build", test: "node -e process.exit(0)" } }));
    const nextModule = only(next);
    expect(nextModule.frameworks).toContain("Next.js");
    expect(nextModule.commands.map((command) => command.id)).toEqual(["build", "test"]);
  });

  it("keeps React, Flutter, and Spring as separate modules", () => {
    const root = temp();
    write(root, "apps/web/package.json", JSON.stringify({ dependencies: { react: "19.0.0", vite: "6.0.0" }, scripts: { test: "node -e process.exit(0)" } }));
    write(root, "apps/web/vite.config.ts", "export default {};\n");
    write(root, "apps/mobile/pubspec.yaml", "name: mobile\ndependencies:\n  flutter:\n    sdk: flutter\n");
    write(root, "apps/mobile/lib/main.dart", "void main() {}\n");
    write(root, "services/api/pom.xml", "<project><dependencies><dependency><groupId>org.springframework.boot</groupId></dependency></dependencies></project>\n");
    write(root, "services/api/mvnw.cmd", "@echo off\n");
    write(root, "services/api/src/main/java/com/example/UserController.java", "class UserController {}\n");
    const discovery = discoverRepository(root);
    const paths = discovery.modules.map((module) => module.path);
    expect(paths).toEqual(expect.arrayContaining(["apps/web", "apps/mobile", "services/api"]));
    expect(moduleAt(discovery.modules, "apps/web").frameworks).toContain("React + Vite");
    expect(moduleAt(discovery.modules, "apps/mobile").frameworks).toContain("Flutter");
    expect(moduleAt(discovery.modules, "services/api").frameworks).toContain("Spring Boot");
    expect(discovery.languages).toEqual(expect.arrayContaining(["TypeScript", "Dart", "Java"]));
    expect(discovery.frontend).toContain("React + Vite");
    expect(discovery.frontend).toContain("Flutter");
    expect(discovery.backend).toContain("Spring Boot");

    const checks = new ShellVerifier().plan({
      root,
      changedFiles: ["apps/mobile/lib/main.dart"],
      contract: { acceptance: [] } as unknown as PlanningContext["contract"],
      config: {
        commands: discovery.commands.map((command) => ({
          id: command.id,
          title: command.title,
          command: command.command,
          args: command.args,
          invalidatesOn: command.invalidatesOn,
          evidence: "EXECUTABLE" as const,
          group: command.group,
          ...(command.cwd ? { cwd: command.cwd } : {}),
        })),
      } as PlanningContext["config"],
    });
    const ids = checks.map((check) => check.id);
    expect(ids.some((id) => id.includes("maven"))).toBe(false);
    expect(ids.some((id) => id.includes("apps-web"))).toBe(false);
    for (const command of moduleAt(discovery.modules, "apps/mobile").commands.filter((command) => command.ready)) {
      expect(ids).toContain(`shell:${command.id}`);
    }
  });

  it("writes discovered commands once and does not replace an existing command", () => {
    const root = temp();
    write(root, "package.json", JSON.stringify({ scripts: { test: "node -e process.exit(0)" }, dependencies: { react: "1.0.0" } }));
    write(root, "vite.config.ts", "export default {};\n");
    initProject(root, "Demo");
    const verification = path.join(root, ".projectgate", "verification.yml");
    const original = fs.readFileSync(verification, "utf8").replace("title: Test", "title: Custom test");
    fs.writeFileSync(verification, original);
    const again = initProject(root, "Demo");
    expect(again.created).not.toContain(".projectgate/project.yml");
    const text = fs.readFileSync(verification, "utf8");
    expect(text).toContain("title: Custom test");
    expect(text.match(/id: test/g)).toHaveLength(1);
    expect(loadProject(root).commands.some((command) => command.id === "test" && command.title === "Custom test")).toBe(true);
  });
});

function only(root: string): DiscoveryModule {
  const modules = discoverRepository(root).modules.filter((module) => module.languages.length > 0);
  expect(modules).toHaveLength(1);
  const module = modules[0];
  if (!module) throw new Error("missing module");
  return module;
}

function moduleAt(modules: readonly DiscoveryModule[], modulePath: string): DiscoveryModule {
  const module = modules.find((item) => item.path === modulePath);
  if (!module) throw new Error(`missing ${modulePath}`);
  return module;
}

function temp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pg-stack-"));
}

function write(root: string, file: string, text: string): void {
  const absolute = path.join(root, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, text);
}
