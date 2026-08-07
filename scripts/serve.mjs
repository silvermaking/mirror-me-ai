import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const HOST = process.env.MIRROR_ME_HOST || "127.0.0.1";
const requestedPort = Number.parseInt(process.env.MIRROR_ME_PORT || "4173", 10);
const PORT = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65_536
  ? requestedPort
  : 4173;

const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webp": "image/webp",
});

function projectFile(rawUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl || "/", "http://localhost").pathname);
  } catch {
    return null;
  }
  if (pathname.endsWith("/")) pathname += "index.html";
  const candidate = resolve(ROOT, `.${pathname}`);
  return candidate === ROOT || candidate.startsWith(`${ROOT}${sep}`) ? candidate : null;
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  const file = projectFile(request.url);
  if (!file) {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": info.size,
      "Content-Type": CONTENT_TYPES[extname(file).toLowerCase()] || "application/octet-stream",
    });
    if (request.method === "HEAD") response.end();
    else {
      const stream = createReadStream(file);
      stream.on("error", () => response.destroy());
      stream.pipe(response);
    }
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(PORT, HOST, () => {
  const visibleHost = HOST === "0.0.0.0" ? "localhost" : HOST;
  process.stdout.write(`Mirror Me AI: http://${visibleHost}:${PORT}\n`);
});
