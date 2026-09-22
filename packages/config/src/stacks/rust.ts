import { emptyContribution, fact, type FileClassification, type ModuleContribution, type ModuleScan, type StackAdapter } from "./types.js";
import { command, globs, moduleFile, modulePrefix, toolOnPath } from "./tools.js";

export const rustAdapter: StackAdapter = {
  id: "rust",
  classify(file: string): FileClassification | null {
    const base = file.split("/").pop() ?? file;
    if (base === "Cargo.toml" || base === "Cargo.lock") return hit("config", "CONFIGURATION", "CONFIG", "observed", "rust-manifest");
    if (!base.endsWith(".rs")) return null;
    if (/(^|\/)tests\//.test(file)) return hit("test", "TEST", "TEST", "observed", "rust-test");
    if (base === "main.rs") return hit("unknown", "APPLICATION", "COMMAND", "observed", "rust-main");
    if (base === "lib.rs") return hit("unknown", "APPLICATION", "OTHER", "observed", "rust-lib");
    return hit("unknown", "APPLICATION", "OTHER", "observed", "rust-source");
  },
  inspect(scan: ModuleScan): ModuleContribution | null {
    if (!scan.exists("Cargo.toml") && !scan.files.some((file) => file.endsWith(".rs"))) return null;
    const cargo = scan.read(moduleFile(scan, "Cargo.toml")) ?? "";
    const result = emptyContribution();
    result.languages.push(fact("Rust", scan.exists("Cargo.toml") ? "Cargo.toml" : "rust file", "rust"));
    result.packageManagers.push(fact("Cargo", "Cargo.toml", "rust"));
    const ready = toolOnPath("cargo");
    const prefix = modulePrefix(scan.path);
    const patterns = globs(scan.path, [".rs"]);
    const cwd = scan.path === "." ? {} : { cwd: scan.path };
    if (scan.exists("Cargo.toml")) {
      result.commands.push(command({ id: `${prefix}cargo-test`, title: "cargo test", command: "cargo", args: ["test"], group: "Test", invalidatesOn: patterns, ...cwd, ready }));
    }
    result.capabilities.push({ name: "cargo test", ready: ready && scan.exists("Cargo.toml"), adapter: "rust", source: "cargo test", confidence: "observed" });
    result.capabilities.push({ name: "cargo check", ready, adapter: "rust", source: "available, not run in addition to cargo test", confidence: "inferred" });
    if (scan.exists("clippy.toml") || cargo.includes("clippy")) {
      result.capabilities.push({ name: "cargo clippy", ready: false, adapter: "rust", source: "clippy configured; Project Gate does not install components", confidence: "inferred" });
    }
    if (scan.exists("src")) result.sourceRoots.push(scan.path === "." ? "src" : `${scan.path}/src`);
    if (scan.exists("tests")) result.testRoots.push(scan.path === "." ? "tests" : `${scan.path}/tests`);
    return result;
  },
};

function hit(role: FileClassification["role"], category: FileClassification["category"], subtype: string, confidence: FileClassification["confidence"], source: string): FileClassification {
  return { role, category, subtype, adapter: "rust", confidence, source };
}
