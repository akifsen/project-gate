import { emptyContribution, fact, type FileClassification, type ModuleContribution, type ModuleScan, type StackAdapter } from "./types.js";
import { springRoutes } from "./surfaces.js";
import { command, globs, moduleFile, modulePrefix, toolOnPath, wrapper } from "./tools.js";

export const javaAdapter: StackAdapter = {
  id: "java",
  routes: (file, text) => /\.(java|kt)$/.test(file) ? springRoutes(text) : [],
  classify(file: string): FileClassification | null {
    const base = file.split("/").pop() ?? file;
    if (/(^|\/)(pom\.xml|build\.gradle|build\.gradle\.kts|settings\.gradle|settings\.gradle\.kts|gradle\.properties|mvnw|mvnw\.cmd|gradlew|gradlew\.bat)$/.test(file)) {
      return hit("config", "CONFIGURATION", "CONFIG", "observed", "java-manifest");
    }
    if (!/\.(java|kt|kts)$/.test(base)) return null;
    if (/(^|\/)src\/(?:test|androidTest|integrationTest)\//.test(file) || /Test\.(java|kt)$/.test(base) || /Tests\.(java|kt)$/.test(base)) {
      return hit("test", "TEST", "TEST", "observed", "java-test");
    }
    if (/Controller\.(java|kt)$/.test(base)) return hit("api-server", "APPLICATION", "CONTROLLER", "observed", "java-controller");
    if (/Service\.(java|kt)$/.test(base)) return hit("unknown", "APPLICATION", "SERVICE", "observed", "java-service");
    if (/Repository\.(java|kt)$/.test(base)) return hit("unknown", "APPLICATION", "REPOSITORY", "observed", "java-repository");
    if (/Entity\.(java|kt)$/.test(base)) return hit("unknown", "APPLICATION", "ENTITY", "observed", "java-entity");
    if (/Dto\.(java|kt)$/.test(base)) return hit("unknown", "APPLICATION", "DTO", "inferred", "java-dto");
    return hit("unknown", "APPLICATION", "OTHER", "observed", "java-source");
  },
  inspect(scan: ModuleScan): ModuleContribution | null {
    const maven = scan.exists("pom.xml");
    const gradle = scan.exists("build.gradle") || scan.exists("build.gradle.kts");
    const javaFiles = scan.files.some((file) => file.endsWith(".java") || file.endsWith(".kt"));
    if (!maven && !gradle && !javaFiles) return null;
    const result = emptyContribution();
    const pom = scan.read(moduleFile(scan, "pom.xml")) ?? "";
    const gradleText = `${scan.read(moduleFile(scan, "build.gradle")) ?? ""}\n${scan.read(moduleFile(scan, "build.gradle.kts")) ?? ""}`;
    const android = /com\.android\.(application|library)/.test(gradleText) || scan.exists("AndroidManifest.xml");
    const kotlin = scan.files.some((file) => file.endsWith(".kt") || file.endsWith(".kts")) || gradleText.includes("kotlin");
    const java = scan.files.some((file) => file.endsWith(".java")) || maven || (gradle && !kotlin);
    if (java) result.languages.push(fact("Java", maven ? "pom.xml" : "java source", "java"));
    if (kotlin) result.languages.push(fact("Kotlin", "kotlin source or gradle", "java"));
    const spring = pom.includes("org.springframework.boot") || gradleText.includes("org.springframework.boot");
    if (android) result.frameworks.push(fact("Android", "com.android plugin or AndroidManifest.xml", "java"));
    if (spring) result.frameworks.push(fact("Spring Boot", "org.springframework.boot", "java"));
    const prefix = modulePrefix(scan.path);
    const patterns = globs(scan.path, [".java", ".kt", ".kts"]);
    const cwd = scan.path === "." ? {} : { cwd: scan.path };
    if (maven) {
      const wrapped = wrapper(scan, "mvnw.cmd", "mvnw");
      const commandName = wrapped?.command ?? "mvn";
      const ready = wrapped ? wrapped.ready : toolOnPath("mvn");
      result.packageManagers.push(fact(wrapped ? "Maven Wrapper" : "Maven", wrapped ? commandName : "pom.xml", "java"));
      result.commands.push(command({ id: `${prefix}maven-test`, title: "Maven test", command: commandName, args: ["--offline", "test"], group: "Test", invalidatesOn: patterns, ...cwd, ready }));
      result.capabilities.push({ name: "mvn test", ready, adapter: "java", source: "pom.xml", confidence: "observed" });
      result.capabilities.push({ name: "mvn verify", ready, adapter: "java", source: "available Maven lifecycle, not run by default", confidence: "inferred" });
    }
    if (gradle && !android) {
      const wrapped = wrapper(scan, "gradlew.bat", "gradlew");
      const commandName = wrapped?.command ?? "gradle";
      const ready = wrapped ? wrapped.ready : toolOnPath("gradle");
      result.packageManagers.push(fact(wrapped ? "Gradle Wrapper" : "Gradle", wrapped ? commandName : "build.gradle", "java"));
      result.commands.push(command({ id: `${prefix}gradle-test`, title: "Gradle test", command: commandName, args: ["--offline", "test"], group: "Test", invalidatesOn: patterns, ...cwd, ready }));
      result.capabilities.push({ name: "gradle test", ready, adapter: "java", source: "Gradle build", confidence: "observed" });
      result.capabilities.push({ name: "gradle check", ready, adapter: "java", source: "available Gradle lifecycle, not run by default", confidence: "inferred" });
    }
    if (android && scan.files.some((file) => file.includes("/androidTest/"))) {
      result.capabilities.push({ name: "instrumentation tests", ready: false, adapter: "java", source: "androidTest source set; emulators are not started", confidence: "observed" });
    }
    if (android && gradle) {
      const wrapped = wrapper(scan, "gradlew.bat", "gradlew");
      const commandName = wrapped?.command ?? "gradle";
      const ready = wrapped ? wrapped.ready : toolOnPath("gradle");
      result.packageManagers.push(fact(wrapped ? "Gradle Wrapper" : "Gradle", "Android Gradle", "java"));
      result.commands.push(command({ id: `${prefix}android-test`, title: "Android unit test", command: commandName, args: ["--offline", "test"], group: "Test", invalidatesOn: patterns, ...cwd, ready }));
      result.capabilities.push({ name: "android unit test", ready, adapter: "java", source: "Gradle test task; emulators are not started", confidence: "observed" });
    }
    for (const tool of ["junit", "mockito", "assertj", "testcontainers", "archunit", "checkstyle", "pmd", "spotbugs", "jacoco", "error_prone", "sonar", "spring-boot-starter-test"]) {
      if (pom.toLowerCase().includes(tool) || gradleText.toLowerCase().includes(tool)) {
        result.capabilities.push({ name: tool, ready: false, adapter: "java", source: "build manifest; dependency detected, execution requires configured task", confidence: "observed" });
      }
    }
    if (scan.exists("src/main/java") || scan.files.some((file) => file.includes("/src/main/java/"))) result.sourceRoots.push(scan.path === "." ? "src/main/java" : `${scan.path}/src/main/java`);
    if (scan.exists("src/main/kotlin") || scan.files.some((file) => file.includes("/src/main/kotlin/"))) result.sourceRoots.push(scan.path === "." ? "src/main/kotlin" : `${scan.path}/src/main/kotlin`);
    if (scan.exists("src/test/java") || scan.files.some((file) => file.includes("/src/test/java/"))) result.testRoots.push(scan.path === "." ? "src/test/java" : `${scan.path}/src/test/java`);
    if (scan.exists("src/test/kotlin") || scan.files.some((file) => file.includes("/src/test/kotlin/"))) result.testRoots.push(scan.path === "." ? "src/test/kotlin" : `${scan.path}/src/test/kotlin`);
    return result;
  },
};

function hit(role: FileClassification["role"], category: FileClassification["category"], subtype: string, confidence: FileClassification["confidence"], source: string): FileClassification {
  return { role, category, subtype, adapter: "java", confidence, source };
}
