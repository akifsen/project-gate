export interface RouteHit {
  path: string;
  source: string;
  method?: string;
}

export function nodeRoutes(file: string, text: string): RouteHit[] {
  const hits: RouteHit[] = [];
  const next = /(?:^|\/)app\/(?:(.*?)\/)?page\.[jt]sx?$/.exec(file);
  if (next) {
    const body = next?.[1] ?? "";
    const route = `/${body}`.replace(/\/\([^/]+\)/g, "").replace(/\/+/g, "/") || "/";
    hits.push({ path: route === "/" ? "/" : route.replace(/\/$/, ""), source: "next-app-router" });
  }
  collect(text, /<Route[^>]*\spath=["']([^"']+)["']/g, "react-router", hits, 1);
  collect(text, /\bpath\s*:\s*["'](\/[^"']*)["']/g, "react-router", hits, 1);
  for (const match of text.matchAll(/\b(?:app|router|server)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)) {
    if (match[1] && match[2]) hits.push({ path: `${match[1].toUpperCase()} ${match[2]}`, source: "node-http-route" });
  }
  return hits;
}

export function laravelRoutes(text: string): RouteHit[] {
  const hits: RouteHit[] = [];
  for (const match of text.matchAll(/Route::(get|post|put|patch|delete)\(\s*['"]([^'"]*)['"]/g)) {
    if (match[1] && match[2] !== undefined) hits.push({ path: normalizeRoute(match[2]), method: match[1].toUpperCase(), source: "laravel-route" });
  }
  return hits;
}

export function springRoutes(text: string): RouteHit[] {
  const classAt = text.search(/\b(?:class|interface|object|record)\s+/);
  const head = classAt >= 0 ? text.slice(0, classAt) : "";
  const body = classAt >= 0 ? text.slice(classAt) : text;
  const prefixes = mappingPaths(head.match(/@RequestMapping\s*\(([^)]*)\)/)?.[1] ?? "");
  const hits: RouteHit[] = [];
  for (const match of body.matchAll(/@(Get|Post|Put|Patch|Delete|Request)Mapping\s*(\(([^)]*)\))?/g)) {
    const kind = match[1] ?? "Request";
    const verb = kind === "Request" ? requestVerb(match[3] ?? "") : kind.toUpperCase();
    if (!verb) continue;
    for (const prefix of prefixes) for (const suffix of mappingPaths(match[3] ?? "")) {
      hits.push({ path: `${verb} ${joinRoute(prefix, suffix)}`, source: `@${kind}Mapping` });
    }
  }
  return hits;
}

export function pythonRoutes(file: string, text: string): RouteHit[] {
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

export function dotNetRoutes(text: string): RouteHit[] {
  const hits: RouteHit[] = [];
  const classAt = text.search(/\bclass\s+/);
  const head = classAt >= 0 ? text.slice(0, classAt) : "";
  const controller = text.match(/\bclass\s+(\w+)Controller\b/)?.[1];
  const prefix = (head.match(/\[Route\(\s*"([^"]+)"\s*\)/)?.[1] ?? "").replace(/\[controller\]/gi, controller ?? "[controller]");
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

export function goRoutes(text: string): RouteHit[] {
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

export function dartRoutes(text: string): RouteHit[] {
  const hits: RouteHit[] = [];
  collect(text, /\bpath\s*:\s*['"](\/[^'"]*)['"]/g, "dart-route", hits, 1);
  return hits;
}

function mappingPaths(args: string): string[] {
  const named = args.match(/\b(?:value|path)\s*=\s*(\{[^}]*\}|"[^"]*"|[^,]+)/)?.[1];
  const positional = args.trim().match(/^(\{[^}]*\}|"[^"]*")/)?.[1];
  const value = named ?? positional;
  if (!value) return /^\s*$/.test(args) || /^\s*\w+\s*=/.test(args) ? [""] : [];
  return [...value.matchAll(/"([^"]*)"/g)].map((match) => match[1] ?? "");
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
