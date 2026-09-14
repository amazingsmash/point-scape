const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// Listen on every local interface by default so the viewer is reachable from
// other devices on the same trusted LAN. HOST can still restrict this when needed.
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 5173);
const publicDir = __dirname;
const publicFiles = new Set([
  "/index.html",
  "/styles.css",
  "/node-inspector.css",
  "/js-console.js",
  "/tile-selection.js",
  "/pointscape-lod-streaming.js",
  "/pointscape-data-ingestion.js",
  "/pointscape-lod-system.js",
  "/pointscape-point-sizing.js",
  "/pointscape-ui-controller.js",
  "/node-inspector.js",
  "/script.js",
  "/las-index.worker.js",
  "/pointscape-octree-builder.js",
  "/las-scratch-store.js",
]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || host}`);
  const requestedPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;

  if (!publicFiles.has(requestedPath)) {
    send(res, 404, "Not found");
    return;
  }

  const filePath = path.resolve(publicDir, `.${decodeURIComponent(requestedPath)}`);

  if (!filePath.startsWith(publicDir)) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      send(res, 404, "Not found");
      return;
    }

    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(port, host, () => {
  console.log(`Servidor Node.js disponible en http://${host}:${port}`);
});
