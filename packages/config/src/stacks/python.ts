import { emptyContribution, fact, type FileClassification, type ModuleContribution, type ModuleScan, type StackAdapter } from "./types.js";
import { pythonRoutes } from "./surfaces.js";
import { command, globs, moduleFile, modulePrefix, toolOnPath } from "./tools.js";

export const pythonAdapter: StackAdapter = {
  id: "python",
  routes: (file, text) => file.endsWith(".py") ? pythonRoutes(file, text) : [],
  classify(file: string): FileClassification | null {
    const base = file.split("/").pop() ?? file;
    if (/(^|\/)(pyproject\.toml|requirements.*\.txt|Pipfile|poetry\.lock|uv\.lock|setup\.py|setup\.cfg|pytest\.ini|manage\.py)$/.test(file)) {
      return hit("config", "CONFIGURATION", "CONFIG", "observed", "python-manifest");
    }
    if (!base.endsWith(".py")) return null;
    if (/(^|\/)tests?\//.test(file) || /_test\.py$|test_.*\.py$/.test(base)) return hit("test", "TEST", "TEST", "observed", "python-test");
    if (base === "urls.py") return hit("api-server", "APPLICATION", "ROUTE", "observed", "python-urls");
    if (/views\.py$|viewsets\.py$/.test(base)) return hit("api-server", "APPLICATION", "CONTROLLER", "inferred", "python-view");
    if (/models\.py$/.test(base)) return hit("unknown", "APPLICATION", "MODEL", "inferred", "python-model");
    return hit("unknown", "APPLICATION", "OTHER", "observed", "python-source");
  },
  inspect(scan: ModuleScan): ModuleContribution | null {
    const manifests = ["pyproject.toml", "requirements.txt", "requirements-dev.txt", "Pipfile", "setup.py", "setup.cfg"].filter((file) => scan.exists(file));
    const manifest = manifests[0];
    const pythonFiles = scan.files.some((file) => file.endsWith(".py"));
    if (!manifest && !pythonFiles) return null;
    const text = manifests.map((file) => scan.read(moduleFile(scan, file)) ?? "").join("\n").replace(/^\s*#.*$/gm, "").toLowerCase();
    const result = emptyContribution();
    result.languages.push(fact("Python", manifest ?? "python file", "python"));
    if (scan.exists("manage.py") || text.includes("django")) result.frameworks.push(fact("Django", scan.exists("manage.py") ? "manage.py" : "django dependency", "python"));
    if (text.includes("fastapi")) result.frameworks.push(fact("FastAPI", "fastapi dependency", "python"));
    if (text.includes("flask")) result.frameworks.push(fact("Flask", "flask dependency", "python"));
    const manager = text.includes("[tool.poetry]") || scan.exists("poetry.lock") ? "Poetry" : scan.exists("uv.lock") || text.includes("[tool.uv]") ? "uv" : scan.exists("Pipfile") ? "Pipenv" : "pip";
    if (manifest) result.packageManagers.push(fact(manager, manifest, "python"));
    const python = toolOnPath("python") ? "python" : toolOnPath("python3") ? "python3" : toolOnPath("py") ? "py" : null;
    const pytest = scan.exists("pytest.ini") || scan.exists("conftest.py") || text.includes("pytest");
    const django = result.frameworks.some((item) => item.name === "Django");
    const tests = scan.files.some((file) => file.endsWith(".py") && (/test_.*\.py$|_test\.py$|(^|\/)tests?\//.test(file)));
    const prefix = modulePrefix(scan.path);
    const patterns = globs(scan.path, [".py"]);
    const cwd = scan.path === "." ? {} : { cwd: scan.path };
    if (pytest) {
      result.commands.push(command({ id: `${prefix}pytest`, title: "pytest", command: python ?? "python", args: ["-m", "pytest"], group: "Test", invalidatesOn: patterns, ...cwd, ready: Boolean(python) }));
    } else if (django && scan.exists("manage.py")) {
      result.commands.push(command({ id: `${prefix}django-test`, title: "Django test", command: python ?? "python", args: ["manage.py", "test"], group: "Test", invalidatesOn: patterns, ...cwd, ready: Boolean(python) }));
    } else if (tests) {
      result.commands.push(command({ id: `${prefix}unittest`, title: "unittest", command: python ?? "python", args: ["-m", "unittest", "discover"], group: "Test", invalidatesOn: patterns, ...cwd, ready: Boolean(python) }));
    }
    result.capabilities.push({ name: "pytest", ready: Boolean(python && pytest), adapter: "python", source: pytest ? "pytest configuration" : "not configured", confidence: pytest ? "observed" : "inferred" });
    if (text.includes("ruff") || scan.exists("ruff.toml")) {
      const ruff = toolOnPath("ruff");
      result.capabilities.push({ name: "ruff", ready: ruff, adapter: "python", source: "ruff configuration", confidence: "observed" });
      if (ruff) result.commands.push(command({ id: `${prefix}ruff`, title: "ruff", command: "ruff", args: ["check"], group: "Lint", invalidatesOn: patterns, ...cwd, ready: true }));
    }
    if (text.includes("mypy")) {
      const mypy = toolOnPath("mypy");
      result.capabilities.push({ name: "mypy", ready: mypy, adapter: "python", source: "mypy configuration", confidence: "observed" });
      if (mypy) result.commands.push(command({ id: `${prefix}mypy`, title: "mypy", command: "mypy", args: ["."], group: "Typecheck", invalidatesOn: patterns, ...cwd, ready: true }));
    }
    if (text.includes("black")) {
      result.capabilities.push({ name: "black --check", ready: toolOnPath("black"), adapter: "python", source: "black configuration; format writes are not run", confidence: "observed" });
    }
    for (const tool of ["pyright", "coverage"]) {
      if (text.includes(tool) || scan.exists(`${tool}.json`) || scan.exists(`.${tool}rc`)) result.capabilities.push({ name: tool, ready: toolOnPath(tool), adapter: "python", source: "Python tool configuration", confidence: "observed" });
    }
    for (const dir of ["src", "app"]) if (scan.exists(dir)) result.sourceRoots.push(moduleFile(scan, dir));
    for (const dir of ["test", "tests"]) if (scan.exists(dir)) result.testRoots.push(moduleFile(scan, dir));
    return result;
  },
};

function hit(role: FileClassification["role"], category: FileClassification["category"], subtype: string, confidence: FileClassification["confidence"], source: string): FileClassification {
  return { role, category, subtype, adapter: "python", confidence, source };
}
