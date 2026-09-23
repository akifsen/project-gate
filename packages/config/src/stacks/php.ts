import { emptyContribution, fact, type FileClassification, type ModuleContribution, type ModuleScan, type StackAdapter } from "./types.js";
import { laravelRoutes } from "./surfaces.js";
import { abs, command, globs, moduleFile, modulePrefix, readJson, recordOf, toolOnPath, readOnlyScript } from "./tools.js";

export const phpAdapter: StackAdapter = {
  id: "php",
  routes: (file, text) => file.endsWith(".php") ? laravelRoutes(text) : [],
  classify(file: string): FileClassification | null {
    const base = file.split("/").pop() ?? file;
    if (/(^|\/)(composer\.json|composer\.lock|phpunit\.xml|phpunit\.xml\.dist|pest\.php)$/.test(file)) {
      return hit("config", "CONFIGURATION", "CONFIG", "observed", "php-manifest");
    }
    if (/migration/i.test(file) && base.endsWith(".php")) return hit("migration", "APPLICATION", "MIGRATION", "observed", "php-migration");
    if (/(^|\/)routes\/.+\.php$/.test(file) || /Controller\.php$/.test(base)) return hit("api-server", "APPLICATION", "CONTROLLER", "observed", "php-route");
    if (base.endsWith(".php") && /\/(Requests|Models|Policies|Jobs|Events|Listeners|Middleware|Console)\//.test(file)) return hit("api-server", "APPLICATION", phpSubtype(file), "inferred", "laravel-convention");
    if (/(Service|Repository|Policy|Request)\.php$/.test(base)) return hit("api-server", "APPLICATION", phpSubtype(base), "observed", "laravel-convention");
    if (base.endsWith(".blade.php")) return hit("ui", "APPLICATION", "PAGE", "inferred", "php-blade");
    if (base.endsWith(".php")) return hit("unknown", "APPLICATION", "OTHER", "inferred", "php-source");
    return null;
  },
  inspect(scan: ModuleScan): ModuleContribution | null {
    const composerPath = moduleFile(scan, "composer.json");
    const composer = readJson(abs(scan, "composer.json"));
    const hasPhp = composer !== null || scan.files.some((file) => file.endsWith(".php"));
    if (!hasPhp) return null;
    const result = emptyContribution();
    result.languages.push(fact("PHP", composer ? composerPath : "php file", "php"));
    const require = { ...recordOf(composer?.require), ...recordOf(composer?.["require-dev"]) };
    const laravel = scan.exists("artisan") || typeof require["laravel/framework"] === "string";
    if (laravel) result.frameworks.push(fact("Laravel", scan.exists("artisan") ? "artisan" : "composer.json laravel/framework", "php"));
    else if (composer) result.frameworks.push(fact("PHP", composerPath, "php"));
    if (composer) result.packageManagers.push(fact("Composer", composerPath, "php"));
    const scripts = recordOf(composer?.scripts);
    const prefix = modulePrefix(scan.path);
    const patterns = globs(scan.path, [".php"]);
    const cwd = scan.path === "." ? {} : { cwd: scan.path };
    const phpReady = toolOnPath("php");
    const composerReady = phpReady && toolOnPath("composer");
    if (typeof scripts.test === "string" && readOnlyScript(scripts.test)) {
      result.commands.push(command({ id: `${prefix}composer-test`, title: "Composer test", command: "composer", args: ["test"], group: "Test", invalidatesOn: patterns, ...cwd, ready: composerReady }));
    } else if (scan.exists("artisan") && (scan.exists("phpunit.xml") || scan.exists("phpunit.xml.dist") || scan.exists("tests") || scan.files.some((file) => file.includes("/tests/")))) {
      result.commands.push(command({ id: `${prefix}artisan-test`, title: "Artisan test", command: "php", args: ["artisan", "test"], group: "Test", invalidatesOn: patterns, ...cwd, ready: phpReady }));
    } else if (scan.exists("vendor/bin/phpunit") || scan.exists("vendor/bin/phpunit.bat")) {
      const binary = process.platform === "win32" && scan.exists("vendor/bin/phpunit.bat") ? "vendor/bin/phpunit.bat" : "vendor/bin/phpunit";
      result.commands.push(command({ id: `${prefix}phpunit`, title: "PHPUnit", command: binary, args: [], group: "Test", invalidatesOn: patterns, ...cwd, ready: true }));
    } else if (scan.exists("vendor/bin/pest") || scan.exists("vendor/bin/pest.bat")) {
      const binary = process.platform === "win32" && scan.exists("vendor/bin/pest.bat") ? "vendor/bin/pest.bat" : "vendor/bin/pest";
      result.commands.push(command({ id: `${prefix}pest`, title: "Pest", command: binary, args: [], group: "Test", invalidatesOn: patterns, ...cwd, ready: true }));
    }
    for (const item of [
      ["PHPStan", "vendor/bin/phpstan"],
      ["Psalm", "vendor/bin/psalm"],
      ["Laravel Pint", "vendor/bin/pint"],
    ] as const) {
      if (scan.exists(item[1]) || scan.exists(`${item[1]}.bat`)) {
        result.capabilities.push({ name: item[0], ready: true, adapter: "php", source: item[1], confidence: "observed" });
      }
    }
    if (scan.exists("app")) result.sourceRoots.push(scan.path === "." ? "app" : `${scan.path}/app`);
    if (scan.exists("tests")) result.testRoots.push(moduleFile(scan, "tests"));
    for (const item of result.commands) result.capabilities.push({ name: item.title, ready: item.ready, source: item.command === "composer" ? `${composerPath} scripts.test` : item.command, adapter: "php", confidence: "observed" });
    return result;
  },
};

function hit(role: FileClassification["role"], category: FileClassification["category"], subtype: string, confidence: FileClassification["confidence"], source: string): FileClassification {
  return { role, category, subtype, adapter: "php", confidence, source };
}

function phpSubtype(file: string): string {
  if (/Controller/i.test(file)) return "CONTROLLER";
  if (/Request/i.test(file)) return "REQUEST";
  if (/Policy/i.test(file)) return "OTHER";
  if (/Model/i.test(file)) return "MODEL";
  if (/Job/i.test(file)) return "JOB";
  if (/Event|Listener/i.test(file)) return "EVENT";
  if (/Middleware/i.test(file)) return "OTHER";
  if (/Repository/i.test(file)) return "REPOSITORY";
  if (/Service/i.test(file)) return "SERVICE";
  return "OTHER";
}
