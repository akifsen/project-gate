import { emptyContribution, fact, type FileClassification, type ModuleContribution, type ModuleScan, type StackAdapter } from "./types.js";
import { command, globs, modulePrefix, toolOnPath } from "./tools.js";

export const dotnetAdapter: StackAdapter = {
  id: "dotnet",
  classify(file: string): FileClassification | null {
    const base = file.split("/").pop() ?? file;
    if (/\.(csproj|fsproj|sln)$/.test(base) || base === "global.json" || base === "Directory.Build.props" || base === "Directory.Build.targets") {
      return hit("config", "CONFIGURATION", "CONFIG", "observed", "dotnet-manifest");
    }
    if (!/\.(cs|fs)$/.test(base)) return null;
    if (/(^|\/)tests?\//.test(file) || /Tests?\.(cs|fs)$/.test(base)) return hit("test", "TEST", "TEST", "observed", "dotnet-test");
    if (/Controller\.cs$/.test(base)) return hit("api-server", "APPLICATION", "CONTROLLER", "observed", "dotnet-controller");
    if (/DbContext\.cs$/.test(base)) return hit("unknown", "APPLICATION", "REPOSITORY", "observed", "dotnet-dbcontext");
    if (/Middleware\.cs$/.test(base)) return hit("unknown", "APPLICATION", "OTHER", "inferred", "dotnet-middleware");
    return hit("unknown", "APPLICATION", "OTHER", "observed", "dotnet-source");
  },
  inspect(scan: ModuleScan): ModuleContribution | null {
    const project = scan.files.find((file) => file.endsWith(".csproj") || file.endsWith(".fsproj") || file.endsWith(".sln"));
    const source = scan.files.some((file) => file.endsWith(".cs") || file.endsWith(".fs"));
    if (!project && !source) return null;
    const result = emptyContribution();
    if (scan.files.some((file) => file.endsWith(".fs") || file.endsWith(".fsproj"))) result.languages.push(fact("F#", project ?? "fsharp file", "dotnet"));
    if (scan.files.some((file) => file.endsWith(".cs") || file.endsWith(".csproj"))) result.languages.push(fact("C#", project ?? "csharp file", "dotnet"));
    const projectText = project ? scan.read(project) ?? "" : "";
    if (projectText.includes("Microsoft.NET.Sdk.Web") || projectText.includes("Microsoft.AspNetCore")) {
      result.frameworks.push(fact("ASP.NET Core", project ?? "csproj", "dotnet"));
    } else if (project) result.frameworks.push(fact(".NET", project, "dotnet"));
    result.packageManagers.push(fact(".NET", project ?? "dotnet project", "dotnet"));
    const ready = toolOnPath("dotnet");
    const prefix = modulePrefix(scan.path);
    const patterns = globs(scan.path, [".cs", ".fs"]);
    const cwd = scan.path === "." ? {} : { cwd: scan.path };
    if (project) {
      result.commands.push(command({ id: `${prefix}dotnet-test`, title: "dotnet test", command: "dotnet", args: ["test", "--no-restore"], group: "Test", invalidatesOn: patterns, ...cwd, ready }));
      result.capabilities.push({ name: "dotnet test", ready, adapter: "dotnet", source: "dotnet SDK; restore is not run by Project Gate", confidence: "observed" });
      result.capabilities.push({ name: "dotnet build", ready, adapter: "dotnet", source: "available, not run in addition to test", confidence: "inferred" });
    }
    return result;
  },
};

function hit(role: FileClassification["role"], category: FileClassification["category"], subtype: string, confidence: FileClassification["confidence"], source: string): FileClassification {
  return { role, category, subtype, adapter: "dotnet", confidence, source };
}
