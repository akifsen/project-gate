import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { authorizeAvatarUpdate } from "./auth.mjs";
import { validateAvatar } from "./mime.mjs";
import { createStore } from "./store.mjs";

const root = process.cwd();
const publicDir = path.join(root, "public");
const store = createStore();
const port = Number(process.env.PORT ?? 4173);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/health") return send(response, 200, "ok", "text/plain");
    if (url.pathname === "/api/error-probe") return send(response, 500, { error: "forced" });
    const avatar = /^\/api\/users\/([^/]+)\/avatar$/.exec(url.pathname);
    if (avatar && request.method === "POST") return handleUpload(request, response, decodeURIComponent(avatar[1]));
    if (avatar && request.method === "GET") return handleImage(request, response, decodeURIComponent(avatar[1]));
    const meta = /^\/api\/users\/([^/]+)\/avatar-meta$/.exec(url.pathname);
    if (meta && request.method === "GET") {
      const userId = decodeURIComponent(meta[1]);
      const saved = store.get(storeKey(request, userId));
      return send(response, 200, { url: saved ? `/api/users/${userId}/avatar` : null });
    }
    return serveStatic(url.pathname, response);
  } catch (error) {
    return send(response, 500, { error: error instanceof Error ? error.message : "error" });
  }
});

server.listen(port, "127.0.0.1");

async function handleUpload(request, response, userId) {
  const file = await readUpload(request);
  if (!file) return send(response, 400, { error: "missing_file" });
  const validation = validateAvatar(file.contentType, file.bytes.length);
  if (!validation.ok) return send(response, validation.status, { error: validation.error });
  const actor = header(request, "x-user-id");
  const authz = authorizeAvatarUpdate(actor, userId);
  if (!authz.ok) return send(response, authz.status, { error: authz.error });
  store.save(storeKey(request, userId), file.bytes, file.contentType);
  return send(response, 201, { url: `/api/users/${userId}/avatar` });
}

function handleImage(request, response, userId) {
  const saved = store.get(storeKey(request, userId));
  if (!saved) return send(response, 404, { error: "missing" });
  response.writeHead(200, { "content-type": saved.contentType, "cache-control": "no-store" });
  response.end(saved.bytes);
}

async function readUpload(request) {
  const body = await readBody(request);
  const contentType = header(request, "content-type") ?? "";
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!boundary) return null;
  const marker = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  let cursor = 0;
  while (cursor < body.length) {
    const start = body.indexOf(marker, cursor);
    if (start < 0) break;
    const next = body.indexOf(marker, start + marker.length);
    if (next < 0) break;
    let part = body.subarray(start + marker.length, next);
    if (part.subarray(0, 2).equals(Buffer.from("\r\n"))) part = part.subarray(2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd >= 0) {
      const headerText = part.subarray(0, headerEnd).toString("utf8");
      if (/name="avatar"/i.test(headerText)) {
        let bytes = part.subarray(headerEnd + 4);
        if (bytes.subarray(-2).equals(Buffer.from("\r\n"))) bytes = bytes.subarray(0, -2);
        const type = /Content-Type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() ?? "application/octet-stream";
        const filename = /filename="([^"]*)"/i.exec(headerText)?.[1] ?? "upload.bin";
        return { filename, contentType: type, bytes };
      }
    }
    cursor = next;
  }
  return null;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function serveStatic(pathname, response) {
  const requested = pathname === "/" || pathname === "/profile" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, requested));
  const relative = path.relative(publicDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return send(response, 404, { error: "not_found" });
  }
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
  response.writeHead(200, { "content-type": types[path.extname(filePath)] ?? "application/octet-stream", "cache-control": "no-store" });
  response.end(fs.readFileSync(filePath));
}

function storeKey(request, userId) {
  const cookie = header(request, "cookie") ?? "";
  const session = /(?:^|;\s*)avatar-session=([^;]+)/.exec(cookie)?.[1] ?? "api";
  return `${session}:${userId}`;
}

function header(request, name) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function send(response, status, body, contentType = "application/json") {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  response.writeHead(status, { "content-type": contentType, "cache-control": "no-store" });
  response.end(payload);
}
