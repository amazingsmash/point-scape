(function initCopcReader(globalScope) {
  const decoder = new TextDecoder();
  const rootKey = "0-0-0-0";

  function hasCopcSignature(bytes) {
    if (bytes.byteLength < 429) return false;
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return decoder.decode(bytes.subarray(0, 4)) === "LASF" &&
      header.getUint16(24, true) === 0x0401 &&
      header.getUint16(94, true) === 375 &&
      header.getUint32(100, true) > 0 &&
      decoder.decode(bytes.subarray(377, 393)).replace(/\0+$/, "") === "copc" &&
      header.getUint16(393, true) === 1 &&
      header.getUint16(395, true) === 160;
  }

  function createRangeReader(source, signal) {
    return async (begin, end) => {
      signal?.throwIfAborted();
      if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end) || begin < 0 || end <= begin) {
        throw new Error("Invalid COPC byte range.");
      }
      if (source instanceof Blob) {
        // copc.js prefetches 64 KiB even for very small files.
        const bytes = new Uint8Array(await source.slice(begin, end).arrayBuffer());
        signal?.throwIfAborted();
        if (bytes.byteLength === end - begin || (begin === 0 && end === 65536)) return bytes;
        throw new Error("The COPC file ends before the requested range.");
      }
      for (let attempt = 0; ; attempt++) {
        signal?.throwIfAborted();
        try {
          const response = await fetch(source, { signal, headers: { Range: `bytes=${begin}-${end - 1}` } });
          if (response.status !== 206) {
            await response.body?.cancel();
            const message = `The COPC server did not return a byte range (HTTP ${response.status}).`;
            if (response.status === 429 || response.status >= 500) throw new TypeError(message);
            throw new Error(message);
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          const range = response.headers.get("Content-Range");
          if (bytes.byteLength !== end - begin || (range && !range.startsWith(`bytes ${begin}-${end - 1}/`))) {
            throw new Error("The COPC server returned a different byte range.");
          }
          return bytes;
        } catch (error) {
          if (signal?.aborted || !(error instanceof TypeError) || attempt >= 2) throw error;
          await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
        }
      }
    };
  }

  function wktParts(wkt) {
    // Keep nested WKT and quoted strings intact when splitting top-level fields.
    const opening = wkt.search(/[[(]/);
    const content = wkt.slice(opening + 1, -1);
    const parts = [];
    let depth = 0;
    let start = 0;
    for (const { 0: token, index } of content.matchAll(/"(?:[^"]|"")*"|[\[\](),]/g)) {
      if (token === "[" || token === "(") depth++;
      if (token === "]" || token === ")") depth--;
      if (token === "," && depth === 0) {
        parts.push(content.slice(start, index).trim());
        start = index + 1;
      }
    }
    parts.push(content.slice(start).trim());
    return parts;
  }

  function createProjection(proj4, wkt) {
    if (!wkt) throw new Error("The COPC file does not declare a coordinate system (WKT).");
    const parts = wktParts(wkt);
    const compound = /^(?:COMPD_CS|COMPOUNDCRS)\s*[[(]/i.test(wkt);
    const horizontal = compound ? parts[1] : wkt;
    const vertical = compound ? parts.find(part => /^(?:VERT_CS|VERTCRS)\s*[[(]/i.test(part)) : null;
    try {
      const projection = new proj4.Proj(horizontal);
      if (projection.projName === "geocent") throw new Error("Geocentric coordinates");
      const verticalParts = vertical ? wktParts(vertical) : [];
      const isLinearUnit = part => /^(?:UNIT|LENGTHUNIT)\s*[[(]/i.test(part);
      const unit = verticalParts.find(isLinearUnit) || verticalParts
        .filter(part => /^AXIS\s*[[(]/i.test(part))
        .flatMap(wktParts).find(isLinearUnit);
      const zScale = unit ? Number(wktParts(unit)[1]) :
        (projection.projName === "longlat" ? 1 : projection.to_meter || 1);
      if (!Number.isFinite(zScale) || zScale <= 0) throw new Error("Invalid vertical units");
      const authority = wktParts(horizontal).find(part =>
        /^(?:AUTHORITY|ID)\s*[[(]\s*"EPSG"\s*,/i.test(part));
      const sourceCode = authority ? Number(wktParts(authority)[1].replace(/"/g, "")) : null;
      return {
        transform: proj4(projection, "EPSG:4326"),
        zScale,
        crs: {
          // Bounds use the same metric space as the existing geographic tile path.
          kind: "geographic",
          code: sourceCode,
          label: sourceCode ? `EPSG:${sourceCode} (COPC WKT)` : parts[0].replace(/"/g, ""),
        },
      };
    } catch {
      throw new Error("The COPC coordinate system is unsupported by this viewer.");
    }
  }

  const earthRadius = 6378137;
  const radians = Math.PI / 180;
  function projectBounds(cube, key, transform, zScale) {
    const [depth, x, y, z] = key;
    const intervals = 2 ** depth;
    const lower = [x, y, z].map((value, axis) => cube[axis] + value * (cube[axis + 3] - cube[axis]) / intervals);
    const upper = [x, y, z].map((value, axis) => cube[axis] + (value + 1) * (cube[axis + 3] - cube[axis]) / intervals);
    const corners = [[lower[0], lower[1]], [upper[0], lower[1]], [upper[0], upper[1]], [lower[0], upper[1]]]
      .map(corner => transform.forward(corner));
    const [lng, lat] = transform.forward([(lower[0] + upper[0]) / 2, (lower[1] + upper[1]) / 2]);
    const mercatorX = corners.map(([longitude]) => earthRadius * longitude * radians);
    const mercatorY = corners.map(([, latitude]) => {
      const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
      return earthRadius * Math.log(Math.tan(Math.PI / 4 + clamped * radians / 2));
    });
    const minZ = lower[2] * zScale;
    const maxZ = upper[2] * zScale;
    const bounds = { minX: Math.min(...mercatorX), minY: Math.min(...mercatorY),
      maxX: Math.max(...mercatorX), maxY: Math.max(...mercatorY), minZ, maxZ };
    if (![lng, lat, ...Object.values(bounds)].every(Number.isFinite)) {
      throw new Error("The COPC bounds could not be projected onto the map.");
    }
    const latitudeScale = Math.cos(lat * radians);
    const diagonalMeters = Math.hypot((bounds.maxX - bounds.minX) * latitudeScale,
      (bounds.maxY - bounds.minY) * latitudeScale, maxZ - minZ);
    return { bounds, corners, center: { lng, lat }, minZ, maxZ, diagonalMeters };
  }

  async function decodeTile({ read, tile, header, Copc, projection, getDecoder }) {
    const node = tile.copcChunk;
    if (!node?.pointCount) return { ...tile, points: null, fullPoints: null };
    const { transform, zScale } = projection;
    const [compressed, decoderInstance] = await Promise.all([
      Copc.loadCompressedPointDataBuffer(read, node),
      getDecoder(),
    ]);
    const buffer = await Copc.loadPointDataBuffer(() => compressed, header, node, decoderInstance);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const lngLatAlt = new Float64Array(node.pointCount * 3);
    const classifications = new Uint8Array(node.pointCount);
    for (let i = 0; i < node.pointCount; i++) {
      const offset = i * header.pointDataRecordLength;
      const x = view.getInt32(offset, true) * header.scale[0] + header.offset[0];
      const y = view.getInt32(offset + 4, true) * header.scale[1] + header.offset[1];
      const z = view.getInt32(offset + 8, true) * header.scale[2] + header.offset[2];
      const [lng, lat] = transform.forward([x, y]);
      lngLatAlt[i * 3] = lng;
      lngLatAlt[i * 3 + 1] = lat;
      lngLatAlt[i * 3 + 2] = z * zScale;
      classifications[i] = view.getUint8(offset + 16);
    }
    return { ...tile, points: { pointCount: node.pointCount, lngLatAlt, classifications }, fullPoints: null };
  }

  async function openCopc({ read, fileIndex, fileName, Copc, proj4, progressive = false }) {
    if (!hasCopcSignature(await read(0, 429))) {
      throw new Error("This file is not COPC. Select a COPC .laz or an uncompressed .las file.");
    }
    const copc = await Copc.create(read);
    const { header, info, wkt } = copc;
    const minimumRecordLength = { 6: 30, 7: 36, 8: 38 }[header.pointDataRecordFormat];
    if (!minimumRecordLength || header.pointDataRecordLength < minimumRecordLength ||
        !info.cube.every(Number.isFinite) || info.cube[0] >= info.cube[3]) {
      throw new Error("The COPC header contains an invalid point format or octree extent.");
    }
    const projection = createProjection(proj4, wkt?.trim());
    const { transform, zScale, crs } = projection;
    const idFor = key => `copc:${fileIndex}:${key}`;
    const rootId = idFor(rootKey);
    const tiles = new Map();
    const pages = new Map([[rootId, info.rootHierarchyPage]]);
    const pageOffsets = new Set([info.rootHierarchyPage.pageOffset]);
    const inFlight = new Map();
    let pointsDiscovered = 0;

    function makeTile(key, node) {
      const voxel = key.split("-").map(Number);
      const [depth, x, y, z] = voxel;
      if (voxel.length !== 4 || depth > 32 || !voxel.every(Number.isInteger) ||
          [x, y, z].some(coordinate => coordinate < 0 || coordinate >= 2 ** depth) ||
          (node?.pointCount > 0 && (node.pointDataLength <= 0 || node.pointDataOffset < header.pointDataOffset))) {
        throw new Error(`Invalid COPC node ${key}.`);
      }
      const id = idFor(key);
      const parentKey = depth ? [depth - 1, Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2)].join("-") : null;
      const prior = tiles.get(id);
      const pointCount = node?.pointCount || 0;
      return {
        id, key: id, parentId: parentKey ? idFor(parentKey) : null, childIds: prior?.childIds || [],
        format: "copc", fileIndex, fileName, depth,
        hierarchyPending: !node,
        copcChunk: node,
        decodeBytes: pointCount * header.pointDataRecordLength,
        crsLabel: crs.label, crsKind: crs.kind, crsCode: crs.code,
        pointCount, originalPointCount: pointCount,
        sourcePointCount: pointCount, sampledPointCount: pointCount, fullPointCount: 0,
        ...projectBounds(info.cube, voxel, transform, zScale),
      };
    }

    async function readPage(id, page) {
      if (page.pageLength <= 0 || page.pageLength % 32 !== 0) throw new Error("Invalid COPC hierarchy page.");
      const hierarchy = await Copc.loadHierarchyPage(read, page);
      const patch = new Map();
      const pointers = new Map();
      const newOffsets = new Set();
      let newPointCount = 0;
      for (const [key, node] of Object.entries(hierarchy.nodes)) {
        const tile = makeTile(key, node);
        if (tiles.has(tile.id) && (tile.id !== id || !tiles.get(tile.id).hierarchyPending)) {
          throw new Error(`Duplicate COPC node ${key}.`);
        }
        newPointCount += tile.sampledPointCount;
        patch.set(tile.id, tile);
      }
      for (const [key, childPage] of Object.entries(hierarchy.pages)) {
        const tile = makeTile(key, null);
        if ((tiles.has(tile.id) && tile.id !== id) || patch.has(tile.id) ||
            pageOffsets.has(childPage.pageOffset) || newOffsets.has(childPage.pageOffset)) {
          throw new Error(`Repeated COPC hierarchy page at ${key}.`);
        }
        newOffsets.add(childPage.pageOffset);
        pointers.set(tile.id, childPage);
        patch.set(tile.id, tile);
      }
      if (!patch.has(id)) throw new Error(`Missing COPC page root ${id}.`);
      for (const tile of [...patch.values()]) {
        if (!tile.parentId) continue;
        const parent = patch.get(tile.parentId) || tiles.get(tile.parentId);
        if (!parent) throw new Error(`The COPC octree is missing the parent of ${tile.id}.`);
        if (!parent.childIds.includes(tile.id)) {
          patch.set(parent.id, { ...parent, childIds: [...parent.childIds, tile.id] });
        }
      }
      const total = pointsDiscovered + newPointCount;
      if (total > header.pointCount ||
          (pages.size === 1 && !pointers.size && total !== header.pointCount)) {
        throw new Error("The COPC hierarchy point count does not match its file header.");
      }
      pointsDiscovered = total;
      pages.delete(id);
      for (const [tileId, nextPage] of pointers) pages.set(tileId, nextPage);
      for (const offset of newOffsets) pageOffsets.add(offset);
      for (const [tileId, tile] of patch) tiles.set(tileId, tile);
      return [...patch.values()];
    }

    function loadHierarchy(id) {
      if (inFlight.has(id)) return inFlight.get(id);
      const page = pages.get(id);
      if (!page) return Promise.resolve([]);
      const pending = readPage(id, page).finally(() => inFlight.delete(id));
      inFlight.set(id, pending);
      return pending;
    }

    async function loadAllHierarchy(concurrency = 1) {
      while (pages.size) {
        await Promise.all([...pages.keys()].slice(0, concurrency).map(loadHierarchy));
      }
      return [...tiles.values()];
    }

    if (!header.pointCount) throw new Error("The COPC file is empty.");
    if (progressive) {
      while (pages.has(rootId)) await loadHierarchy(rootId);
    } else {
      await loadAllHierarchy();
    }
    return {
      metadata: { fileIndex, crs, crsLabel: crs.label, sourcePointCount: header.pointCount,
        validPointCount: header.pointCount, tiles: [...tiles.values()], decodeInfo: { header, wkt } },
      loadHierarchy,
      loadAllHierarchy,
      async readTile(id, getDecoder) {
        const tile = tiles.get(id);
        return tile ? decodeTile({ read, tile, header, Copc, projection, getDecoder }) : null;
      },
    };
  }

  const api = { createRangeReader, createProjection, decodeTile, hasCopcSignature, openCopc };
  if (typeof module !== "undefined") module.exports = api;
  globalScope.PointScapeCopcReader = api;
})(globalThis);
