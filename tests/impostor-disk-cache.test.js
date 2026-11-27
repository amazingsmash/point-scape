const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { Readable } = require("node:stream");
const { setTimeout: delay } = require("node:timers/promises");
const { createImpostorDiskCache } = require("../impostor-disk-cache.js");
const { encodePng, decodePng, encodeDepth, decodeDepth } = require("../pointscape-impostor-disk.js");

const width = 64;
const cameraMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const metadata = { version: 1, nodeId: "copc:0:1-0-0-0", width, height: width, depthEncoding: "float32-le-rgba",
  anchorMercator: [0.5, 0.45, 0], cameraPositionMercator: [0.5, 0.45, 0.01], captureDistanceMeters: 1000,
  metersToMercator: 0.00001, cameraMatrix, inverseCameraMatrix: cameraMatrix, viewProjection: cameraMatrix, aspect: 16 / 9 };

async function captureFiles() {
  const colors = new Uint8Array(width ** 2 * 4);
  colors.set([143, 76, 225, 0, 110, 67, 99, 131]);
  const depths = new Float32Array(width ** 2).fill(Infinity);
  depths.set([Math.fround(0.0000031), -0, -0.8765, 0.988]);
  const color = Buffer.from(await (await encodePng(width, width, colors)).arrayBuffer());
  const depth = Buffer.from(await (await encodePng(width, width, encodeDepth(depths))).arrayBuffer());
  return { colors, depths, color, depth };
}

test("cache PNGs preserve both RGBA and all Float32 depth bits", async () => {
  const { colors, depths, color, depth } = await captureFiles();
  assert.deepEqual(await decodePng(color, width, width), colors);
  const recovered = decodeDepth(await decodePng(depth, width, width));
  assert.deepEqual(new Uint8Array(recovered.buffer), new Uint8Array(depths.buffer));
});

function send(cache, destination, method = "GET", body, origin = "http://127.0.0.1:5173") {
  const req = Readable.from(body ? [body] : []);
  Object.assign(req, { method, headers: { origin }, socket: { remoteAddress: "127.0.0.1" } });
  const res = Object.assign(new EventEmitter(), {
    parts: [],
    writeHead(status) { this.status = status; this.headersSent = true; },
    write(data) { this.parts.push(Buffer.from(data)); },
    end(data) { if (data) this.write(data); this.emit("close"); },
  });
  return cache.handle(req, res, new URL(destination, "http://127.0.0.1:5173")).then(() => res);
}

test("temporary cache serves PNGs and JSON to a nearby camera and expires after the last viewer closes", async t => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "PointScape test "));
  const cache = createImpostorDiskCache({ tempDir, graceMs: 100 });
  t.after(async () => { await cache.close(); await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 4 }); });
  const url = "/api/impostor-cache/12345678-1234-1234-1234-123456789012";
  const key = "a".repeat(64);
  assert.equal((await send(cache, `${url}/events`, "GET", undefined, "https://other.example")).status, 403);
  const client = await send(cache, `${url}/events`);
  assert.equal(client.status, 200);
  const directory = JSON.parse(Buffer.concat(client.parts).toString().split("\n")[1].slice(6));
  assert.equal(path.dirname(directory), tempDir);
  const { color, depth } = await captureFiles();
  const header = Buffer.from(JSON.stringify({ metadata, colorBytes: color.length }));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(header.length);
  const packet = Buffer.concat([length, header, color, depth]);
  assert.equal((await send(cache, `${url}/${key}`, "PUT", packet)).status, 204);
  const [capture] = await fs.readdir(directory);
  const captureDir = path.join(directory, capture);
  assert.deepEqual((await fs.readdir(captureDir)).sort(), ["camera.json", "color.png", "depth.png"]);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(captureDir, "camera.json"), "utf8")), metadata);
  assert.deepEqual(await fs.readFile(path.join(captureDir, "color.png")), color);
  assert.deepEqual(await fs.readFile(path.join(captureDir, "depth.png")), depth);
  const hit = await send(cache, `${url}/${key}?eye=0.5005,0.45,0.01&reuse=15`);
  assert.equal(hit.status, 200);
  assert.deepEqual(Buffer.concat(hit.parts), packet);
  assert.equal((await send(cache, `${url}/${key}?eye=0.51,0.45,0.01&reuse=15`)).status, 404);
  const client2 = await send(cache, `${url}/events`);
  client.emit("close");
  await delay(150);
  await fs.access(directory);
  client2.emit("close");
  for (let i = 0; i < 20 && (await fs.readdir(tempDir)).length; i += 1) await delay(50);
  assert.deepEqual(await fs.readdir(tempDir), []);
});
