(function (scope) {
  const pngSignature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
    for (let bit = 0; bit < 8; bit += 1) i = (i >>> 1) ^ (i & 1 ? 0xedb88320 : 0);
    return i;
  });

  function pngChunk(type, data = new Uint8Array()) {
    const bytes = new Uint8Array(data.length + 12);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, data.length);
    bytes.set(encoder.encode(type), 4);
    bytes.set(data, 8);
    let crc = 0xffffffff;
    for (let i = 4; i < bytes.length - 4; i += 1) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 255];
    view.setUint32(bytes.length - 4, crc ^ 0xffffffff);
    return bytes;
  }

  async function encodePng(width, height, pixels) {
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    header[8] = 8;
    header[9] = 6; // RGBA, eight bits per channel.
    const stride = width * 4;
    const rows = new Uint8Array((stride + 1) * height);
    for (let y = 0; y < height; y += 1) rows.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
    const compressed = await new Response(new Blob([rows]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer();
    return new Blob([pngSignature, pngChunk("IHDR", header), pngChunk("IDAT", new Uint8Array(compressed)), pngChunk("IEND")],
      { type: "image/png" });
  }

  async function decodePng(png, width, height) {
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    // The cache writes a single IDAT chunk and unfiltered RGBA scanlines.
    if (png.length < 57 || !pngSignature.every((byte, i) => png[i] === byte) ||
        view.getUint32(16) !== width || view.getUint32(20) !== height || png[24] !== 8 || png[25] !== 6 ||
        decoder.decode(png.subarray(37, 41)) !== "IDAT") throw new Error("Unexpected cache PNG format");
    const compressed = png.subarray(41, 41 + view.getUint32(33));
    const stride = width * 4;
    const rows = new Uint8Array((stride + 1) * height);
    const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (length + value.length > rows.length) throw new Error("Invalid cache PNG length");
        rows.set(value, length);
        length += value.length;
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    if (length !== rows.length) throw new Error("Incomplete cache PNG");
    const pixels = new Uint8Array(stride * height);
    for (let y = 0; y < height; y += 1) {
      const offset = y * (stride + 1);
      if (rows[offset] !== 0) throw new Error("Unexpected PNG row filter");
      pixels.set(rows.subarray(offset + 1, offset + 1 + stride), y * stride);
    }
    return pixels;
  }

  function encodeDepth(depth) {
    const bytes = new Uint8Array(depth.buffer, depth.byteOffset, depth.byteLength);
    if (littleEndian) return bytes;
    const encoded = new Uint8Array(bytes.length);
    const view = new DataView(encoded.buffer);
    depth.forEach((value, i) => view.setFloat32(i * 4, value, true));
    return encoded;
  }

  function decodeDepth(bytes) {
    if (littleEndian) return new Float32Array(bytes.buffer);
    const view = new DataView(bytes.buffer);
    return Float32Array.from({ length: bytes.length / 4 }, (_, i) => view.getFloat32(i * 4, true));
  }

  async function hash(data) {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function sessionId() {
    try {
      const key = "pointscape-impostor-session";
      const existing = sessionStorage.getItem(key);
      if (existing) return existing;
      const id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
      return id;
    } catch {
      return crypto.randomUUID();
    }
  }

  class DiskCache {
    constructor(reportDirectory) {
      this.reportDirectory = reportDirectory;
      this.signatures = new WeakMap();
      this.writes = Promise.resolve();
      this.supported = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) &&
        Boolean(scope.crypto?.subtle && scope.EventSource && scope.CompressionStream && scope.DecompressionStream &&
          scope.AbortSignal?.any && scope.AbortSignal?.timeout);
      if (!this.supported) {
        this.reportDirectory(null);
        return;
      }
      this.url = `/api/impostor-cache/${sessionId()}`;
      scope.addEventListener("pagehide", () => {
        this.connection?.close();
        this.connection = null;
        this.ready = null;
        this.directory = null;
      });
    }

    connect() {
      if (!this.supported) return Promise.resolve(false);
      if (this.directory) return Promise.resolve(true);
      if (!this.ready) {
        const connection = new EventSource(`${this.url}/events`);
        this.connection = connection;
        this.ready = new Promise(resolve => {
          const timer = setTimeout(() => {
            if (this.connection === connection) this.reportDirectory(null);
            resolve(false);
          }, 2000);
          connection.addEventListener("directory", event => {
            clearTimeout(timer);
            if (this.connection !== connection) return resolve(false);
            this.directory = JSON.parse(event.data);
            this.reportDirectory(this.directory);
            resolve(true);
          });
          connection.onerror = () => {
            clearTimeout(timer);
            if (this.connection !== connection) return resolve(false);
            this.directory = null;
            this.reportDirectory(null);
            resolve(false);
          };
        });
      }
      return this.ready;
    }

    async key(tile, size, palette) {
      let geometry = this.signatures.get(tile);
      if (!geometry) {
        geometry = hash(tile.pickPositions);
        this.signatures.set(tile, geometry);
      }
      return hash(encoder.encode(JSON.stringify([1, tile.id, tile.anchorMercator, size, palette, await geometry])));
    }

    async read(tile, size, palette, eye, reusePercent, signal) {
      if (!await this.connect()) return null;
      await this.writes;
      const key = await this.key(tile, size, palette);
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
      const response = await fetch(`${this.url}/${key}?eye=${eye.join(",")}&reuse=${reusePercent}`, { signal: requestSignal });
      if (!response.ok) return null;
      const body = await response.arrayBuffer();
      const headerSize = new DataView(body).getUint32(0, true);
      const { metadata, colorBytes } = JSON.parse(decoder.decode(new Uint8Array(body, 4, headerSize)));
      if (metadata.width !== size || metadata.height !== size || metadata.depthEncoding !== "float32-le-rgba") return null;
      const offset = 4 + headerSize;
      const [color, depthBytes] = await Promise.all([
        decodePng(new Uint8Array(body, offset, colorBytes), size, size),
        decodePng(new Uint8Array(body, offset + colorBytes), size, size),
      ]);
      const depth = decodeDepth(depthBytes);
      const texels = new Float32Array(depth.length);
      let count = 0;
      for (let i = 0; i < depth.length; i += 1) if (Number.isFinite(depth[i])) texels[count++] = i;
      return { metadata, textures: { ...metadata, color, depth, texels: texels.subarray(0, count) } };
    }

    save(tile, palette, textures, camera, captureDistanceMeters) {
      const write = this.writes.then(async () => {
        if (!await this.connect()) return;
        const { width, height, cameraMatrix, inverseCameraMatrix, viewProjection, aspect } = textures;
        const [key, color, depth] = await Promise.all([
          this.key(tile, width, palette),
          encodePng(width, height, textures.color),
          encodePng(width, height, encodeDepth(textures.depth)),
        ]);
        const metadata = { version: 1, nodeId: tile.id, width, height, depthEncoding: "float32-le-rgba",
          anchorMercator: tile.anchorMercator, cameraPositionMercator: camera, captureDistanceMeters,
          metersToMercator: tile.metersToMercator, cameraMatrix, inverseCameraMatrix, viewProjection, aspect };
        const header = encoder.encode(JSON.stringify({ metadata, colorBytes: color.size }));
        const length = new DataView(new ArrayBuffer(4));
        length.setUint32(0, header.length, true);
        const response = await fetch(`${this.url}/${key}`, { method: "PUT", signal: AbortSignal.timeout(10000),
          body: new Blob([length.buffer, header, color, depth], { type: "application/octet-stream" }) });
        this.reportDirectory(this.directory, !response.ok);
      });
      this.writes = write.catch(error => {
        this.reportDirectory(this.directory, true);
        console.warn("Could not save the image impostor", error);
      });
    }
  }

  const api = { DiskCache, encodePng, decodePng, encodeDepth, decodeDepth };
  scope.PointScapeImpostorDisk = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
