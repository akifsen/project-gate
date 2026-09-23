import { emptyContribution, fact, type FileClassification, type ModuleContribution, type ModuleScan, type StackAdapter } from "./types.js";
import { dartRoutes } from "./surfaces.js";
import { command, globs, modulePrefix, toolOnPath } from "./tools.js";
import { parse } from "yaml";

export function usesFlutter(pubspec: string): boolean {
  try {
    const value = parse(pubspec) as { dependencies?: { flutter?: { sdk?: string } }; dev_dependencies?: { flutter?: { sdk?: string } } } | null;
    return value?.dependencies?.flutter?.sdk === "flutter" || value?.dev_dependencies?.flutter?.sdk === "flutter";
  } catch { return false; }
}

export const dartAdapter: StackAdapter = {
  id: "dart",
  routes: (file, text) => file.endsWith(".dart") ? dartRoutes(text) : [],
  classify(file: string): FileClassification | null {
    const base = file.split("/").pop() ?? file;
    if (/(^|\/)(pubspec\.yaml|pubspec\.lock|analysis_options\.yaml)$/.test(file)) {
      return hit("config", "CONFIGURATION", "CONFIG", "observed", "dart-manifest");
    }
    if (base.endsWith(".g.dart") || base.endsWith(".freezed.dart")) return hit("config", "GENERATED", "GENERATED", "observed", "dart-generated");
    if (!base.endsWith(".dart")) return null;
    if (/(^|\/)(test|integration_test)\//.test(file)) {
      return hit("test", "TEST", "TEST", "observed", "dart-test");
    }
    const subtype = dartSubtype(base);
    const ui = subtype === "SCREEN" || subtype === "PAGE" || subtype === "COMPONENT" || subtype === "STYLE";
    return hit(ui ? "ui" : "unknown", "APPLICATION", subtype, ui ? "inferred" : "observed", "dart-lib");
  },
  inspect(scan: ModuleScan): ModuleContribution | null {
    if (!scan.exists("pubspec.yaml") && !scan.files.some((file) => file.endsWith(".dart"))) return null;
    const pubspec = scan.read(scan.path === "." ? "pubspec.yaml" : `${scan.path}/pubspec.yaml`) ?? "";
    const flutter = usesFlutter(pubspec);
    const result = emptyContribution();
    result.languages.push(fact("Dart", scan.exists("pubspec.yaml") ? "pubspec.yaml" : "dart file", "dart"));
    if (flutter) result.frameworks.push(fact("Flutter", "pubspec.yaml dependencies.flutter.sdk", "dart"));
    if (scan.exists("pubspec.yaml")) result.packageManagers.push(fact(flutter ? "Flutter Pub" : "Dart Pub", "pubspec.yaml", "dart"));
    const tool = flutter ? "flutter" : "dart";
    const ready = toolOnPath(tool);
    const prefix = modulePrefix(scan.path);
    const patterns = globs(scan.path, [".dart"]);
    const cwd = scan.path === "." ? {} : { cwd: scan.path };
    if (flutter) {
      result.commands.push(
        command({ id: `${prefix}flutter-analyze`, title: "Flutter analyze", command: "flutter", args: ["analyze", "--no-pub"], group: "Static analysis", invalidatesOn: patterns, ...cwd, ready }),
        command({ id: `${prefix}flutter-test`, title: "Flutter test", command: "flutter", args: ["test", "--no-pub"], group: "Test", invalidatesOn: patterns, ...cwd, ready }),
      );
      result.capabilities.push(
        { name: "flutter analyze", ready, adapter: "dart", source: "Flutter SDK", confidence: ready ? "observed" : "inferred" },
        { name: "flutter test", ready, adapter: "dart", source: "Flutter SDK", confidence: ready ? "observed" : "inferred" },
      );
    } else if (scan.exists("pubspec.yaml")) {
      result.commands.push(command({ id: `${prefix}dart-analyze`, title: "Dart analyze", command: "dart", args: ["analyze"], group: "Static analysis", invalidatesOn: patterns, ...cwd, ready }));
      if (scan.exists("test")) {
        result.capabilities.push({ name: "dart test", ready: false, adapter: "dart", source: "test/; dart test may resolve dependencies and has no --no-pub; configure explicitly after setup", confidence: "observed" });
      }
    }
    const tests = scan.files.filter((file) => /(?:^|\/)(?:test|integration_test)\/.*\.dart$/.test(file));
    const testText = tests.map((file) => scan.read(file) ?? "").join("\n");
    for (const [name, expression] of [["unit tests", /\btest\s*\(/], ["widget tests", /\btestWidgets\s*\(/], ["golden tests", /\bmatchesGoldenFile\s*\(/]] as const) {
      if (expression.test(testText)) result.capabilities.push({ name, ready, adapter: "dart", source: `Dart test source: ${expression.source}`, confidence: "observed" });
    }
    if (tests.some((file) => /(?:^|\/)integration_test\//.test(file))) result.capabilities.push({ name: "integration tests", ready: false, adapter: "dart", source: "integration_test/; device execution requires configuration", confidence: "observed" });
    if (scan.exists("lib")) result.sourceRoots.push(scan.path === "." ? "lib" : `${scan.path}/lib`);
    if (scan.exists("test")) result.testRoots.push(scan.path === "." ? "test" : `${scan.path}/test`);
    if (scan.exists("integration_test")) result.testRoots.push(scan.path === "." ? "integration_test" : `${scan.path}/integration_test`);
    return result;
  },
};

function hit(role: FileClassification["role"], category: FileClassification["category"], subtype: string, confidence: FileClassification["confidence"], source: string): FileClassification {
  return { role, category, subtype, adapter: "dart", confidence, source, ...(subtype === "SCREEN" || subtype === "PAGE" ? { surface: "MOBILE_SCREEN" as const } : {}) };
}

function dartSubtype(base: string): string {
  if (/_screen\.dart$|_view\.dart$/.test(base)) return "SCREEN";
  if (/_page\.dart$/.test(base)) return "PAGE";
  if (/_widget\.dart$|widget\.dart$/.test(base)) return "COMPONENT";
  if (/_bloc\.dart$|_cubit\.dart$/.test(base)) return "CONTROLLER";
  if (/provider\.dart$/.test(base)) return "CONTROLLER";
  if (/_controller\.dart$/.test(base)) return "CONTROLLER";
  if (/_repository\.dart$/.test(base)) return "REPOSITORY";
  if (/_service\.dart$/.test(base)) return "SERVICE";
  if (/_model\.dart$|_entity\.dart$/.test(base)) return "MODEL";
  if (/route/.test(base)) return "ROUTE";
  if (/theme/.test(base)) return "STYLE";
  return "OTHER";
}
