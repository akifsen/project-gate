import { emptyContribution, fact, type FileClassification, type ModuleContribution, type ModuleScan, type StackAdapter } from "./types.js";
import { command, globs, modulePrefix, toolOnPath } from "./tools.js";

export const goAdapter: StackAdapter = {
  id: "go",
  classify(file: string): FileClassification | null {
    const base = file.split("/").pop() ?? file;
    if (base === "go.mod" || base === "go.sum") return hit("config", "CONFIGURATION", "CONFIG", "observed", "go-manifest");
    if (!base.endsWith(".go")) return null;
    if (base.endsWith("_test.go")) return hit("test", "TEST", "TEST", "observed", "go-test");
    if (/main\.go$/.test(base)) return hit("unknown", "APPLICATION", "COMMAND", "observed", "go-main");
    return hit("unknown", "APPLICATION", "OTHER", "observed", "go-source");
  },
  inspect(scan: ModuleScan): ModuleContribution | null {
    if (!scan.exists("go.mod") && !scan.files.some((file) => file.endsWith(".go"))) return null;
    const result = emptyContribution();
    result.languages.push(fact("Go", scan.exists("go.mod") ? "go.mod" : "go file", "go"));
    result.packageManagers.push(fact("Go modules", "go.mod", "go"));
    const ready = toolOnPath("go");
    const prefix = modulePrefix(scan.path);
    const patterns = globs(scan.path, [".go"]);
    const cwd = scan.path === "." ? {} : { cwd: scan.path };
    if (scan.exists("go.mod")) {
      result.commands.push(
        command({ id: `${prefix}go-test`, title: "go test", command: "go", args: ["test", "./..."], group: "Test", invalidatesOn: patterns, ...cwd, ready }),
        command({ id: `${prefix}go-vet`, title: "go vet", command: "go", args: ["vet", "./..."], group: "Static analysis", invalidatesOn: patterns, ...cwd, ready }),
      );
    }
    result.capabilities.push({ name: "go test", ready: ready && scan.exists("go.mod"), adapter: "go", source: "go test ./...", confidence: "observed" });
    result.capabilities.push({ name: "go vet", ready: ready && scan.exists("go.mod"), adapter: "go", source: "go vet ./...", confidence: "observed" });
    if (scan.exists(".golangci.yml") || scan.exists(".golangci.yaml")) {
      result.capabilities.push({ name: "golangci-lint", ready: toolOnPath("golangci-lint"), adapter: "go", source: "golangci configuration; not installed by Project Gate", confidence: "observed" });
    }
    return result;
  },
};

function hit(role: FileClassification["role"], category: FileClassification["category"], subtype: string, confidence: FileClassification["confidence"], source: string): FileClassification {
  return { role, category, subtype, adapter: "go", confidence, source };
}
