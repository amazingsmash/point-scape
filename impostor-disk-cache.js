const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const route = /^\/api\/impostor-cache\/([a-f0-9-]{36})\/(events|[a-f0-9]{64})$/;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const maxBytes = 9 * 1024 * 1024;
const maxHeaderBytes = 4096;
const sessionBudget = 256 * 1024 * 1024;

function unpack(body) {
  if (body.length < 4) return null;
  const headerBytes = body.readUInt32LE(0);
  if (!headerBytes || headerBytes > maxHeaderBytes || headerBytes + 4 > body.length) return null;
  let envelope;
  try { envelope = JSON.parse(body.toString("utf8", 4, 4 + headerBytes)); } catch { return null; }
  if (!envelope) return null;
  const { metadata, colorBytes } = envelope;
  const split = 4 + headerBytes + colorBytes;
  if (!Number.isSafeInteger(colorBytes) || colorBytes < 45 || split + 45 > body.length) return null;
  const color = body.subarray(4 + headerBytes, split), depth = body.subarray(split);
  if (!validMetadata(metadata) || ![color, depth].every(png => png.subarray(0, 8).equals(pngSignature) &&
      png.readUInt32BE(16) === metadata.width && png.readUInt32BE(20) === metadata.height)) return null;
  return { metadata, color, depth };
}

function validMetadata(metadata) {
  const vector = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
  return metadata && metadata.version === 1 && typeof metadata.nodeId === "string" && metadata.nodeId.length <= 256 &&
    [64, 128, 256, 512, 1024].includes(metadata.width) && metadata.width === metadata.height &&
    metadata.depthEncoding === "float32-le-rgba" && Number.isFinite(metadata.aspect) && metadata.aspect > 0 &&
    vector(metadata.cameraMatrix, 16) && vector(metadata.inverseCameraMatrix, 16) && vector(metadata.viewProjection, 16) &&
    vector(metadata.anchorMercator, 3) && vector(metadata.cameraPositionMercator, 3) &&
    Number.isFinite(metadata.metersToMercator) && metadata.metersToMercator > 0 &&
    Number.isFinite(metadata.captureDistanceMeters) && metadata.captureDistanceMeters >= 0;
}

function reply(res, status, body, type = "text/plain; charset=utf-8") {
  if (res.destroyed) return;
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(body);
}

function localRequest(req, url) {
  const localAddresses = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
  return localAddresses.includes(req.socket.remoteAddress) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    req.headers["sec-fetch-site"] !== "cross-site" && (!req.headers.origin || req.headers.origin === url.origin);
}

function createImpostorDiskCache({ tempDir = os.tmpdir(), graceMs = 45000 } = {}) {
  const sessions = new Map();
  let closed = false;
  const enqueue = (session, work) => {
    const operation = session.queue.then(work);
    session.queue = operation.catch(() => {});
    return operation;
  };
  const remove = directory => fs.rm(directory, { recursive: true, force: true, maxRetries: 4 });
  function expire(id, session) {
    sessions.delete(id);
    clearTimeout(session.timer);
    for (const connection of session.connections) connection.end();
    return enqueue(session, async () => remove(await session.directory));
  }

  async function connect(id, res) {
    let session = sessions.get(id);
    if (!session) {
      session = { directory: fs.mkdtemp(path.join(tempDir, "pointscape-")), connections: new Set(),
        captures: new Map(), bytes: 0, queue: Promise.resolve(), writes: 0 };
      sessions.set(id, session);
    }
    clearTimeout(session.timer);
    session.connections.add(res);
    res.once("close", () => {
      session.connections.delete(res);
      if (sessions.get(id) !== session || session.connections.size) return;
      session.timer = setTimeout(() => expire(id, session).catch(error => console.warn("Impostor cache cleanup:", error.message)), graceMs);
      session.timer.unref();
    });
    let directory;
    try { directory = await session.directory; } catch (error) {
      sessions.delete(id);
      throw error;
    }
    if (res.destroyed) return;
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
    res.write(`event: directory\ndata: ${JSON.stringify(directory)}\n\n`);
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
    heartbeat.unref();
    res.once("close", () => clearInterval(heartbeat));
  }

  async function save(session, key, capture) {
    const { metadata, color, depth } = capture;
    const json = JSON.stringify(metadata, null, 2) + "\n";
    const directory = await fs.mkdtemp(path.join(await session.directory, `${key.slice(0, 12)}-`));
    try {
      // Wait for every handle to close before removing an incomplete set on Windows.
      const writes = await Promise.allSettled([
        fs.writeFile(path.join(directory, "color.png"), color),
        fs.writeFile(path.join(directory, "depth.png"), depth),
        fs.writeFile(path.join(directory, "camera.json"), json),
      ]);
      const failed = writes.find(write => write.status === "rejected");
      if (failed) throw failed.reason;
    } catch (error) {
      await remove(directory);
      throw error;
    }
    const size = Buffer.byteLength(json) + color.length + depth.length;
    const entry = { key, directory, metadata, size };
    session.captures.set(directory, entry);
    session.bytes += size;
    const versions = [...session.captures.values()].filter(item => item.key === key);
    while (versions.length > 3 || session.bytes > sessionBudget) {
      const oldest = versions.length > 3 ? versions[0] : session.captures.values().next().value;
      await remove(oldest.directory);
      session.captures.delete(oldest.directory);
      session.bytes -= oldest.size;
      const index = versions.indexOf(oldest);
      if (index !== -1) versions.splice(index, 1);
    }
  }

  async function retrieve(session, key, params, res) {
    const eye = params.get("eye")?.split(",").map(Number);
    const reuse = Number(params.get("reuse"));
    if (eye?.length !== 3 || !eye.every(Number.isFinite) || !Number.isFinite(reuse) || reuse < 0 || reuse > 100) {
      return reply(res, 400, "Invalid camera position");
    }
    let closest = Infinity;
    let matching;
    for (const entry of session.captures.values()) {
      if (entry.key !== key) continue;
      const { cameraPositionMercator: point, metersToMercator, captureDistanceMeters } = entry.metadata;
      const distance = Math.hypot(eye[0] - point[0], eye[1] - point[1], eye[2] - point[2]) / metersToMercator;
      if (distance <= captureDistanceMeters * reuse / 100 + 1e-6 && distance <= closest) {
        matching = entry;
        closest = distance;
      }
    }
    if (!matching) return reply(res, 404);
    let color, depth, json;
    try {
      [color, depth, json] = await Promise.all(["color.png", "depth.png", "camera.json"].map(name =>
        fs.readFile(path.join(matching.directory, name))));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      session.captures.delete(matching.directory);
      session.bytes -= matching.size;
      return reply(res, 404);
    }
    const header = Buffer.from(JSON.stringify({ metadata: JSON.parse(json), colorBytes: color.length }));
    const length = Buffer.alloc(4);
    length.writeUInt32LE(header.length);
    session.captures.delete(matching.directory);
    session.captures.set(matching.directory, matching);
    reply(res, 200, Buffer.concat([length, header, color, depth]), "application/octet-stream");
  }

  async function handle(req, res, url) {
    if (closed || !localRequest(req, url)) return reply(res, 403, "Cache available on localhost");
    const match = route.exec(url.pathname);
    if (!match) return reply(res, 404);
    const [, id, key] = match;
    if (req.method === "GET" && key === "events") return connect(id, res);
    const session = sessions.get(id);
    if (!session) return reply(res, 404);
    if (req.method === "GET") {
      return enqueue(session, () => retrieve(session, key, url.searchParams, res));
    }
    if (req.method !== "PUT" || key === "events") return reply(res, 405);
    if (req.headers.origin !== url.origin) return reply(res, 403);
    const lengthHeader = req.headers["content-length"];
    const size = Number(lengthHeader);
    if (lengthHeader !== undefined && (!Number.isSafeInteger(size) || size <= 0 || size > maxBytes)) {
      req.resume();
      return reply(res, 413, "Capture too large");
    }
    if (session.writes >= 2) {
      req.resume();
      return reply(res, 429);
    }
    session.writes += 1;
    try {
      const chunks = [];
      let received = 0;
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        received += chunk.length;
        if (received > maxBytes) {
          req.resume();
          return reply(res, 413, "Capture too large");
        }
        chunks.push(chunk);
      }
      const capture = unpack(Buffer.concat(chunks, received));
      if (!capture) return reply(res, 400, "Invalid PNG capture or metadata");
      await enqueue(session, async () => {
        if (sessions.get(id) !== session) return reply(res, 404);
        await save(session, key, capture);
        reply(res, 204);
      });
    } finally {
      session.writes -= 1;
    }
  }

  return {
    handle(req, res, url) {
      return handle(req, res, url).catch(error => {
        console.warn("Impostor disk cache:", error.message);
        if (!res.headersSent) reply(res, 503, "Impostor cache unavailable");
        else res.end();
      });
    },
    async close() {
      closed = true;
      await Promise.allSettled([...sessions].map(([id, session]) => expire(id, session)));
    },
  };
}

module.exports = { createImpostorDiskCache };
