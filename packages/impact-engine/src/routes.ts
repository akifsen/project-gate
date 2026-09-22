export interface RouteHit {
  path: string;
  source: string;
}

export function routesInFile(file: string, text: string): RouteHit[] {
  const normalized = file.replaceAll("\\", "/");
  const hits: RouteHit[] = [];
  if (/\.(tsx|jsx|js|mjs|cjs|ts)$/.test(normalized)) hits.push(...nodeRoutes(normalized, text));
  if (normalized.endsWith(".php")) hits.push(...laravelRoutes(text));
  if (/\.(java|kt)$/.test(normalized)) hits.push(...springRoutes(text));
  if (normalized.endsWith(".py")) hits.push(...pythonRoutes(normalized, text));
  if (normalized.endsWith(".cs")) hits.push(...dotNetRoutes(text));
  if (normalized.endsWith(".go")) hits.push(...goRoutes(text));
  if (normalized.endsWith(".dart")) hits.push(...dartRoutes(text));
  return dedupe(hits);
}

function nodeRoutes(file: string, text: string): RouteHit[] {
  const hits: RouteHit[] = [];
  const next = /^(?:src\/)?app\/(.*)\/page\.tsx$/.exec(file) ?? /^app\/(.*)\/page\.tsx$/.exec(file);
  if (file.endsWith("/page.tsx") || file === "app/page.tsx" || file.endsWith("app/page.tsx")) {
    const body = next?.[1] ?? "";
    const route = `/${body}`.replace(/\/\([^/]+\)/g, "").replace(/\/+/g, "/") || "/";
    hits.push({ path: route === "/" ? "/" : route.replace(/\/$/, ""), source: "next-app-router" });
  }
  collect(text, /<Route[^>]*\spath=["']([^"']+)["']/g, "react-router", hits, 1);
  collect(text, /\bpath\s*:\s*["'](\/[^"']*)["']/g, "react-router", hits, 1);
  return hits;
}

function laravelRoutes(text: string): RouteHit[] {
  const hits: RouteHit[] = [];
  collect(text, /Route::(?:get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g, "laravel-route", hits, 1);
  return hits;
}

function springRoutes(text: string): RouteHit[] {
  const classAt = text.search(/\b(?:class|interface|object|record)\s+/);
  const head = classAt >= 0 ? text.slice(0, classAt) : "";
  const body = classAt >= 0 ? text.slice(classAt) : text;
  const prefix = mappingPath(head.match(/@RequestMapping\s*\(([^)]*)\)/)?.[1] ?? "");
  const hits: RouteHit[] = [];
  for (const match of body.matchAll(/@(Get|Post|Put|Patch|Delete|Request)Mapping\s*(\(([^)]*)\))?/g)) {
    const kind = match[1] ?? "Request";
    const verb = kind === "Request" ? requestVerb(match[3] ?? "") : kind.toUpperCase();
    if (!verb) continue;
    hits.push({ path: `${verb} ${joinRoute(prefix, mappingPath(match[3] ?? ""))}`, source: `@${kind}Mapping` });
  }
  return hits;
}

function pythonRoutes(file: string, text: string): RouteHit[] {
  const hits: RouteHit[] = [];
  for (const match of text.matchAll(/@\w+\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g)) {
    const verb = match[1];
    const route = match[2];
    if (verb && route) hits.push({ path: `${verb.toUpperCase()} ${route}`, source: "python-route" });
  }
  for (const match of text.matchAll(/@\w+\.route\(\s*["']([^"']+)["'][^)]*methods\s*=\s*\[\s*["'](GET|POST|PUT|PATCH|DELETE)["']/gi)) {
    const route = match[1];
    const verb = match[2];
    if (route && verb) hits.push({ path: `${verb.toUpperCase()} ${route}`, source: "flask-route" });
  }
  if (file.endsWith("/urls.py") || file.endsWith("urls.py")) {
    for (const match of text.matchAll(/\bpath\(\s*["']([^"']+)["']/g)) {
      const route = match[1];
      if (!route) continue;
      hits.push({ path: route.startsWith("/") ? route : `/${route}`, source: "django-url" });
    }
  }
  return hits;
}

function dotNetRoutes(text: string): RouteHit[] {
  const hits: RouteHit[] = [];
  const classAt = text.search(/\bclass\s+/);
  const head = classAt >= 0 ? text.slice(0, classAt) : "";
  const prefix = head.match(/\[Route\(\s*"([^"]+)"\s*\)/)?.[1] ?? "";
  for (const match of text.matchAll(/\[Http(Get|Post|Put|Patch|Delete)(?:\(\s*"([^"]*)"\s*\))?\]/g)) {
    const verb = match[1];
    if (!verb) continue;
    hits.push({ path: `${verb.toUpperCase()} ${joinRoute(prefix, match[2] ?? "")}`, source: `Http${verb}` });
  }
  for (const match of text.matchAll(/\bMap(Get|Post|Put|Patch|Delete)\(\s*"([^"]+)"/g)) {
    const verb = match[1];
    const route = match[2];
    if (verb && route) hits.push({ path: `${verb.toUpperCase()} ${normalizeRoute(route)}`, source: `Map${verb}` });
  }
  return hits;
}

function goRoutes(text: string): RouteHit[] {
  const hits: RouteHit[] = [];
  for (const match of text.matchAll(/\.(GET|POST|PUT|PATCH|DELETE|Get|Post|Put|Patch|Delete)\(\s*"(\/[^"]*)"/g)) {
    const verb = match[1];
    const route = match[2];
    if (verb && route) hits.push({ path: `${verb.toUpperCase()} ${route}`, source: "go-route" });
  }
  for (const match of text.matchAll(/\bHandleFunc\(\s*"(\/[^"]*)"/g)) {
    const route = match[1];
    if (route) hits.push({ path: route, source: "go-handle" });
  }
  return hits;
}

function dartRoutes(text: string): RouteHit[] {
  const hits: RouteHit[] = [];
  collect(text, /\bpath\s*:\s*['"](\/[^'"]*)['"]/g, "dart-route", hits, 1);
  return hits;
}

function mappingPath(args: string): string {
  return args.match(/["']([^"']*)["']/)?.[1] ?? "";
}

function requestVerb(args: string): string | null {
  return args.match(/RequestMethod\.(GET|POST|PUT|PATCH|DELETE)/)?.[1] ?? null;
}

function joinRoute(prefix: string, suffix: string): string {
  const left = prefix === "" ? "" : prefix.startsWith("/") ? prefix : `/${prefix}`;
  if (!suffix) return left || "/";
  const right = suffix.startsWith("/") ? suffix : `/${suffix}`;
  const joined = `${left}${right}`.replace(/\/{2,}/g, "/");
  return joined.startsWith("/") ? joined : `/${joined}`;
}

function normalizeRoute(route: string): string {
  return route.startsWith("/") ? route : `/${route}`;
}

function collect(text: string, expression: RegExp, source: string, hits: RouteHit[], group: number): void {
  for (const match of text.matchAll(expression)) {
    const value = match[group];
    if (value) hits.push({ path: value, source });
  }
}

function dedupe(hits: RouteHit[]): RouteHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = `${hit.source}:${hit.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
