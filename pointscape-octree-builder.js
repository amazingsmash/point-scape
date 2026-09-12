(function initPointScapeOctreeBuilder(globalScope) {
  const defaultPointCloudConfig = {
    tileSamplePoints: 25000,
    m3noGridCellsPerAxis: 32,
    tileMinDiagonalMeters: 100,
    tileMaxDepth: 8,
    parseYieldEveryPoints: 5000,
    progressiveTilePointInterval: 100000,
    progressiveTileMinimumMs: 300,
    indexedDbWriteBatchSize: 24,
  };

  let pointCloudConfig = { ...defaultPointCloudConfig };

  class PointScapeOctreeBuilder {
    constructor(config = {}) {
      this.config = { ...defaultPointCloudConfig, ...config };
    }

    parse(buffer, options = {}) {
      pointCloudConfig = { ...defaultPointCloudConfig, ...this.config };
      return parseLasPointCloud(buffer, options);
    }

    async parseFile(file, options = {}) {
      pointCloudConfig = { ...defaultPointCloudConfig, ...this.config };
      return parseLasFileProgressively(file, options);
    }

    collectResultTransferList(result) {
      return collectResultTransferList(result);
    }

    collectTileRecordTransferList(tileRecords) {
      return collectTileRecordTransferList(tileRecords);
    }
  }
// External-memory construction: only one node's sample and bounded I/O buffers
// are resident. Pending partitions live in IndexedDB, never in a point-object tree.
async function parseLasFileProgressively(file, options) {
  const capabilities = options.runtimeCapabilities || {};
  const reportedMemory = Number(capabilities.deviceMemoryGiB);
  const reportedCores = Number(capabilities.hardwareConcurrency);
  const mobileApple = capabilities.mobileApple === true;
  const memoryTier = mobileApple || (Number.isFinite(reportedMemory) && reportedMemory <= 2)
    ? "compact"
    : (Number.isFinite(reportedMemory) && reportedMemory <= 4) ||
        (!Number.isFinite(reportedMemory) && Number.isFinite(reportedCores) && reportedCores <= 4)
      ? "balanced"
      : Number.isFinite(reportedMemory) && reportedMemory > 8
        ? "large"
        : "standard";
  const memoryProfiles = {
    compact: { workingSetBytes: 64 * 1024 * 1024, blockBytes: 4 * 1024 * 1024,
      stagingBlockBytes: 512 * 1024, scratchBatchBytes: 8 * 1024 * 1024, leafPointLimit: 50000 },
    balanced: { workingSetBytes: 96 * 1024 * 1024, blockBytes: 8 * 1024 * 1024,
      stagingBlockBytes: 1024 * 1024, scratchBatchBytes: 12 * 1024 * 1024, leafPointLimit: 75000 },
    standard: { workingSetBytes: 160 * 1024 * 1024, blockBytes: 12 * 1024 * 1024,
      stagingBlockBytes: 1024 * 1024, scratchBatchBytes: 20 * 1024 * 1024, leafPointLimit: 125000 },
    large: { workingSetBytes: 256 * 1024 * 1024, blockBytes: 16 * 1024 * 1024,
      stagingBlockBytes: 2 * 1024 * 1024, scratchBatchBytes: 32 * 1024 * 1024, leafPointLimit: 200000 },
  };
  const memoryProfile = memoryProfiles[memoryTier];
  const { blockBytes, stagingBlockBytes, scratchBatchBytes, leafPointLimit: leafLimit } = memoryProfile;
  const prefix = new DataView(await file.slice(0, 375).arrayBuffer());
  if (prefix.byteLength < 227 || readAscii(prefix, 0, 4) !== "LASF") {
    throw new Error("Invalid or truncated LAS header.");
  }
  const header = readLasHeader(prefix, file.size);
  const minimumRecordLengths = [20, 28, 26, 34, 57, 63, 30, 36, 38, 59, 67];
  if (prefix.getUint8(104) & 0xc0 || header.pointFormat > 10) {
    throw new Error("Compressed LAS/LAZ is not supported.");
  }
  if (!Number.isSafeInteger(header.pointCount) ||
      header.pointRecordLength < minimumRecordLengths[header.pointFormat] ||
      header.headerSize < 227 || header.headerSize > header.pointDataOffset ||
      header.pointCount > Math.floor((file.size - header.pointDataOffset) / header.pointRecordLength)) {
    throw new Error("Invalid LAS record length, point count or truncated point data.");
  }
  // Read only projection VLRs, skipping large padding and unrelated metadata.
  const projectionVlrs = [];
  let vlrOffset = header.headerSize;
  let metadataBytes = 0;
  for (let index = 0; index < header.vlrCount; index += 1) {
    if (vlrOffset + 54 > header.pointDataOffset) throw new Error("Truncated LAS VLR.");
    const vlr = new DataView(await file.slice(vlrOffset, vlrOffset + 54).arrayBuffer());
    const length = vlr.getUint16(20, true);
    if (vlrOffset + 54 + length > header.pointDataOffset) throw new Error("Invalid LAS VLR length.");
    if (readAscii(vlr, 2, 16).includes("LASF_Projection")) {
      metadataBytes += 54 + length;
      if (metadataBytes > 2 * blockBytes) throw new Error("LAS projection metadata exceeds the bounded loading budget.");
      projectionVlrs.push(new Uint8Array(await file.slice(vlrOffset, vlrOffset + 54 + length).arrayBuffer()));
    }
    vlrOffset += 54 + length;
  }
  const crsBytes = new Uint8Array(metadataBytes + header.pointRecordLength);
  let offset = 0;
  for (const vlr of projectionVlrs) { crsBytes.set(vlr, offset); offset += vlr.length; }
  crsBytes.set(new Uint8Array(await file.slice(header.pointDataOffset, header.pointDataOffset + header.pointRecordLength).arrayBuffer()), offset);
  const crs = detectLasCrs(new DataView(crsBytes.buffer), {
    ...header, headerSize: 0, vlrCount: projectionVlrs.length, pointDataOffset: metadataBytes,
  });
  const m3no = options.indexingMode === "m3no";
  const fileIndex = options.fileIndex || 0;
  const bounds = m3no ? getM3noMetricBounds(header, crs) : getLasMetricBounds(header, crs);
  const maxDepth = getQuadtreeMaxDepth(bounds);
  const createState = m3no ? createM3noTileState : createTileState;
  const root = createState({ id: `${fileIndex}:${m3no ? "m3no" : "r"}`, parentId: null, fileIndex, depth: 0, bounds, crs });
  const scratch = options.scratchStore || await globalScope.PointScapeScratchStore.open(options.scratchName);
  const stride = header.pointRecordLength + 1;
  const recordsPerBlock = Math.max(1, Math.min(32768, Math.floor(blockBytes / header.pointRecordLength)));
  const recordsPerStagingBlock = Math.max(1, Math.min(32768, Math.floor(stagingBlockBytes / stride)));
  const metadata = [];
  let validPointCount = 0;
  let completedPoints = 0;
  let peakBufferedBytes = 0;
  let activeReadBytes = 0;
  let activeWriteBatchBytes = 0;
  const pending = [{ tile: root, blocks: 0, isRoot: true, pointCount: header.pointCount }];
  const emitProgress = (phase, scanned = 0) => options.onProgress?.(completedPoints, header.pointCount, {
    phase, scanned, nodes: metadata.length, blockBytes,
    peakBufferedBytes, leafPointLimit: leafLimit, memoryTier,
  });

  const scratchGetMany = (keys) => scratch.getMany
    ? scratch.getMany(keys)
    : Promise.all(keys.map((key) => scratch.get(key)));
  const scratchPutMany = async (entries) => {
    if (scratch.putMany) await scratch.putMany(entries);
    else for (const [key, value] of entries) await scratch.put(key, value);
  };
  const scratchRemoveMany = async (keys) => {
    if (scratch.removeMany) await scratch.removeMany(keys);
    else for (const key of keys) await scratch.remove(key);
  };

  async function* blocksFor(node) {
    if (node.isRoot) {
      for (let start = 0; start < header.pointCount; start += recordsPerBlock) {
        const count = Math.min(recordsPerBlock, header.pointCount - start);
        const buffer = await file.slice(header.pointDataOffset + start * header.pointRecordLength,
          header.pointDataOffset + (start + count) * header.pointRecordLength).arrayBuffer();
        activeReadBytes = buffer.byteLength;
        yield { bytes: new Uint8Array(buffer), stride: header.pointRecordLength, count };
        activeReadBytes = 0;
      }
    } else {
      const blocksPerRead = Math.max(1, Math.floor(scratchBatchBytes / stagingBlockBytes));
      for (let first = 0; first < node.blocks; first += blocksPerRead) {
        const keys = [];
        for (let index = first; index < Math.min(node.blocks, first + blocksPerRead); index += 1) {
          keys.push(`${node.tile.id}/${index}`);
        }
        const buffers = await scratchGetMany(keys);
        activeReadBytes = buffers.reduce((sum, buffer) => sum + (buffer?.byteLength || 0), 0);
        for (let index = 0; index < buffers.length; index += 1) {
          const buffer = buffers[index];
          if (!buffer) throw new Error("A temporary LAS partition is missing.");
          yield { bytes: new Uint8Array(buffer), stride, count: buffer.byteLength / stride, key: keys[index] };
        }
        await scratchRemoveMany(keys);
        activeReadBytes = 0;
      }
    }
  }
  function decode(block, index) {
    const view = new DataView(block.bytes.buffer, block.bytes.byteOffset, block.bytes.byteLength);
    const offset = index * block.stride;
    const x = view.getInt32(offset, true) * header.scaleX + header.offsetX;
    const y = view.getInt32(offset + 4, true) * header.scaleY + header.offsetY;
    const z = view.getInt32(offset + 8, true) * header.scaleZ + header.offsetZ;
    const projected = projectLasCoordinate(x, y, z, crs);
    if (!isValidProjectedPoint(projected) || !Number.isFinite(z)) return null;
    return {
      point: { lng: projected.lng, lat: projected.lat, altitudeMeters: projected.altitudeMeters,
        classification: readLasClassification(view, offset, header.pointFormat) },
      metric: getHorizontalMetricCoordinate(x, y, crs), altitudeMeters: z,
      eligible: block.stride === header.pointRecordLength || block.bytes[offset + header.pointRecordLength] === 1,
    };
  }
  try {
    while (pending.length) {
      if (metadata.length + pending.length > 20000) throw new Error("LAS index exceeds the 20,000-node metadata budget. Split the file into smaller areas.");
      const node = pending.pop();
      const tile = node.tile;
      const spatialEnd = tile.depth >= maxDepth || tile.diagonalMeters <= pointCloudConfig.tileMinDiagonalMeters;
      const leaf = node.pointCount <= leafLimit;
      const children = new Map();
      const writeBatch = [];
      const selectedScratchRefs = m3no && !leaf ? new Map() : null;
      let ordinal = 0;
      let validOrdinal = 0;
      function updatePeak() {
        const stagingBytes = Array.from(children.values(), (child) => child.bytes?.byteLength || 0)
          .reduce((sum, bytes) => sum + bytes, 0);
        peakBufferedBytes = Math.max(peakBufferedBytes, activeReadBytes + activeWriteBatchBytes + stagingBytes);
      }
      async function flushWriteBatch() {
        if (!writeBatch.length) return;
        await scratchPutMany(writeBatch);
        writeBatch.length = 0;
        activeWriteBatchBytes = 0;
      }
      async function flush(child) {
        if (!child.count) return;
        const blockIndex = child.blocks++;
        const buffer = child.bytes.buffer.slice(0, child.count * stride);
        writeBatch.push([`${child.tile.id}/${blockIndex}`, buffer]);
        activeWriteBatchBytes += buffer.byteLength;
        child.count = 0;
        updatePeak();
        if (activeWriteBatchBytes >= scratchBatchBytes) await flushWriteBatch();
      }
      for await (const block of blocksFor(node)) {
        for (let index = 0; index < block.count; index += 1, ordinal += 1) {
          const sample = decode(block, index);
          if (!sample) continue;
          addPointToTileFullResolutionStats(tile, sample.altitudeMeters, sample.point.classification);
          if (m3no) {
            if (sample.eligible) {
              addPointToM3noSubtreeIndex(tile, sample);
              addPointToM3noNodeSample(tile, sample);
            }
          } else {
            addPointToTileSample(tile, sample.point, sample.altitudeMeters);
          }
          if (leaf) {
            tile.fullPoints.push(sample.point);
          } else {
            const childIndex = spatialEnd
              ? (validOrdinal < Math.ceil(node.pointCount / 2) ? 0 : 1)
              : m3no ? getM3noChildIndex(sample.metric, sample.altitudeMeters, tile.bounds)
                : getTileQuadrant(sample.metric, tile.bounds);
            let child = children.get(childIndex);
            if (!child) {
              const childBounds = spatialEnd ? { ...tile.bounds } : m3no
                ? getM3noChildBounds(tile.bounds, childIndex) : getTileChildBounds(tile.bounds, childIndex);
              child = { tile: createState({ id: `${tile.id}.${childIndex}`, parentId: tile.id,
                fileIndex, depth: tile.depth + 1, bounds: childBounds, crs }), blocks: 0,
                bytes: new Uint8Array(recordsPerStagingBlock * stride), count: 0, validPointCount: 0 };
              children.set(childIndex, child);
            }
            const start = index * block.stride;
            const destination = child.count * stride;
            child.bytes.set(block.bytes.subarray(start, start + header.pointRecordLength), destination);
            child.bytes[destination + header.pointRecordLength] = sample.eligible ? 1 : 0;
            if (m3no && sample.eligible) {
              const cellKey = getM3noCellKey(sample, tile.bounds);
              const scratchRef = { child, blockIndex: child.blocks, byteOffset: destination + header.pointRecordLength };
              const selectedSample = tile.cellSamples.get(cellKey);
              if (selectedSample?.point === sample.point) selectedSample.scratchRef = scratchRef;
              selectedScratchRefs.set(cellKey, true);
            }
            child.count += 1;
            child.validPointCount += 1;
            if (child.count === recordsPerStagingBlock) await flush(child);
          }
          validOrdinal += 1;
        }
        updatePeak();
        emitProgress(leaf ? "saving" : "partitioning", ordinal);
      }
      if (node.isRoot) {
        validPointCount = tile.fullPointCount;
        if (!validPointCount) throw new Error("No valid points could be projected from the LAS file.");
      }
      if (m3no) finalizeM3noTileSamples(new Map([[tile.id, tile]]));
      const states = new Map([[tile.id, tile]]);
      for (const child of children.values()) {
        await flush(child);
        // Free output staging buffers before retaining only node descriptors.
        child.bytes = null;
        child.tile.fullPointCount = 1; // Temporary presence marker for metadata links.
        states.set(child.tile.id, child.tile);
        tile.childIds.push(child.tile.id);
      }
      await flushWriteBatch();
      if (selectedScratchRefs?.size) {
        const refsByKey = new Map();
        for (const sample of tile.cellSamples.values()) {
          const ref = sample.scratchRef;
          if (!ref) continue;
          const key = `${ref.child.tile.id}/${ref.blockIndex}`;
          if (!refsByKey.has(key)) refsByKey.set(key, []);
          refsByKey.get(key).push(ref.byteOffset);
        }
        const entries = Array.from(refsByKey.entries());
        const patchesPerBatch = Math.max(1, Math.floor(scratchBatchBytes / stagingBlockBytes));
        for (let first = 0; first < entries.length; first += patchesPerBatch) {
          const group = entries.slice(first, first + patchesPerBatch);
          const buffers = await scratchGetMany(group.map(([key]) => key));
          const patched = group.map(([key, offsets], index) => {
            if (!buffers[index]) throw new Error("A temporary LAS sample partition is missing.");
            const bytes = new Uint8Array(buffers[index]);
            for (const byteOffset of offsets) bytes[byteOffset] = 0;
            return [key, bytes.buffer];
          });
          activeReadBytes = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
          activeWriteBatchBytes = activeReadBytes;
          updatePeak();
          await scratchPutMany(patched);
          activeReadBytes = 0;
          activeWriteBatchBytes = 0;
        }
      }
      const record = createTileRecord(tile, states, options.fileName || file.name || "", crs);
      const tileMetadata = createTileMetadataRecord(record);
      metadata.push(tileMetadata);
      if (node.isRoot) options.onMetadata?.({ fileIndex, crs, crsLabel: crs.label,
        sourcePointCount: header.pointCount, rootTile: tileMetadata });
      if (leaf) completedPoints += tile.fullPointCount;
      if (!options.onTiles) throw new Error("Progressive LAS loading requires a persistent tile sink.");
      await options.onTiles([record], { processed: completedPoints, total: header.pointCount, phase: "saving" });
      tile.points = [];
      tile.fullPoints = [];
      tile.cellSamples?.clear();
      for (const child of children.values()) {
        child.tile.fullPointCount = 0;
        pending.push({ tile: child.tile, blocks: child.blocks, isRoot: false, pointCount: child.validPointCount });
      }
      emitProgress("saved");
    }
    options.onProgress?.(header.pointCount, header.pointCount, { phase: "complete", peakBufferedBytes, nodes: metadata.length });
    return { fileIndex, crs, crsLabel: crs.label, points: [], tiles: metadata, tileRecords: [],
      sourcePointCount: header.pointCount, validPointCount, streamed: true,
      memoryProfile: { ...memoryProfile, memoryTier, peakBufferedBytes, singlePassNodes: true } };
  } finally {
    await scratch.close();
  }
}

function parseLasPointCloud(buffer, options = {}) {
  if (options.indexingMode === "m3no") {
    return parseLasPointCloudM3no(buffer, options);
  }

  return parseLasPointCloudQuadtree(buffer, options);
}

function parseLasPointCloudQuadtree(buffer, options = {}) {
  const view = new DataView(buffer);

  validateLasView(view);
  const header = readLasHeader(view);
  const crs = detectLasCrs(view, header);
  const totalPoints = header.pointCount;
  const fileIndex = options.fileIndex || 0;
  const rootBounds = getLasMetricBounds(header, crs);
  const maxDepth = getQuadtreeMaxDepth(rootBounds);
  const tileStates = new Map();
  const rootTile = createTileState({
    id: `${fileIndex}:r`,
    parentId: null,
    fileIndex,
    depth: 0,
    bounds: rootBounds,
    crs,
  });
  tileStates.set(rootTile.id, rootTile);
  options.onMetadata?.(
    createLasMetadata({
      fileIndex,
      fileName: options.fileName || "",
      indexingMode: "quadtree",
      crs,
      rootTile,
      totalPoints,
    }),
  );

  const emitProgressiveTiles = createProgressiveTileEmitter({
    tileStates,
    fileName: options.fileName || "",
    crs,
    totalPoints,
    options,
  });

  for (let pointIndex = 0; pointIndex < totalPoints; pointIndex += 1) {
    const offset = header.pointDataOffset + pointIndex * header.pointRecordLength;

    if (offset + 12 > view.byteLength) {
      break;
    }

    const classification = readLasClassification(view, offset, header.pointFormat);
    const x = view.getInt32(offset, true) * header.scaleX + header.offsetX;
    const y = view.getInt32(offset + 4, true) * header.scaleY + header.offsetY;
    const z = view.getInt32(offset + 8, true) * header.scaleZ + header.offsetZ;
    const projected = projectLasCoordinate(x, y, z, crs);

    if (isValidProjectedPoint(projected)) {
      const metric = getHorizontalMetricCoordinate(x, y, crs);
      const point = {
        lng: projected.lng,
        lat: projected.lat,
        altitudeMeters: projected.altitudeMeters,
        classification,
      };

      insertPointIntoTileTree(
        tileStates,
        rootTile,
        metric,
        point,
        z,
        maxDepth,
        crs,
      );
    }

    if (
      pointIndex > 0 &&
      pointIndex % pointCloudConfig.parseYieldEveryPoints === 0
    ) {
      options.onProgress?.(pointIndex, totalPoints);
      emitProgressiveTiles(pointIndex);
    }
  }
  options.onProgress?.(totalPoints, totalPoints);

  if (!rootTile.originalPointCount) {
    throw new Error("No valid points could be projected from the LAS file.");
  }

  const tileRecords = createTileRecords(tileStates, options.fileName || "", crs);
  emitProgressiveTiles(totalPoints, { force: true });

  return {
    fileIndex,
    crs,
    points:
      options.includePointPreview === false ? [] : [packPoints(rootTile.points)],
    tiles: tileRecords.map(createTileMetadataRecord),
    tileRecords,
    sourcePointCount: totalPoints,
    validPointCount: rootTile.originalPointCount,
    crsLabel: crs.label,
  };
}

function parseLasPointCloudM3no(buffer, options = {}) {
  const view = new DataView(buffer);

  validateLasView(view);
  const header = readLasHeader(view);
  const crs = detectLasCrs(view, header);
  const totalPoints = header.pointCount;
  const fileIndex = options.fileIndex || 0;
  const rootBounds = getM3noMetricBounds(header, crs);
  const maxDepth = getQuadtreeMaxDepth(rootBounds);
  const tileStates = new Map();
  const rootTile = createM3noTileState({
    id: `${fileIndex}:m3no`,
    parentId: null,
    fileIndex,
    depth: 0,
    bounds: rootBounds,
    crs,
  });
  tileStates.set(rootTile.id, rootTile);
  options.onMetadata?.(
    createLasMetadata({
      fileIndex,
      fileName: options.fileName || "",
      indexingMode: "m3no",
      crs,
      rootTile,
      totalPoints,
    }),
  );

  const emitProgressiveTiles = createProgressiveTileEmitter({
    tileStates,
    fileName: options.fileName || "",
    crs,
    totalPoints,
    options,
    beforeSnapshot: () => finalizeM3noTileSamples(tileStates),
  });

  for (let pointIndex = 0; pointIndex < totalPoints; pointIndex += 1) {
    const offset = header.pointDataOffset + pointIndex * header.pointRecordLength;

    if (offset + 12 > view.byteLength) {
      break;
    }

    const classification = readLasClassification(view, offset, header.pointFormat);
    const x = view.getInt32(offset, true) * header.scaleX + header.offsetX;
    const y = view.getInt32(offset + 4, true) * header.scaleY + header.offsetY;
    const z = view.getInt32(offset + 8, true) * header.scaleZ + header.offsetZ;
    const projected = projectLasCoordinate(x, y, z, crs);

    if (isValidProjectedPoint(projected)) {
      const metric = getHorizontalMetricCoordinate(x, y, crs);
      const point = {
        lng: projected.lng,
        lat: projected.lat,
        altitudeMeters: projected.altitudeMeters,
        classification,
      };

      insertPointIntoM3noTree(
        tileStates,
        rootTile,
        {
          metric,
          altitudeMeters: z,
          point,
        },
        maxDepth,
        crs,
      );
      insertPointIntoM3noFullResolutionTree(
        tileStates,
        rootTile,
        metric,
        point,
        z,
        maxDepth,
        crs,
      );
    }

    if (
      pointIndex > 0 &&
      pointIndex % pointCloudConfig.parseYieldEveryPoints === 0
    ) {
      options.onProgress?.(pointIndex, totalPoints);
      emitProgressiveTiles(pointIndex);
    }
  }
  options.onProgress?.(totalPoints, totalPoints);

  if (!rootTile.originalPointCount) {
    throw new Error("No valid points could be projected from the LAS file.");
  }

  finalizeM3noTileSamples(tileStates);
  const tileRecords = createTileRecords(tileStates, options.fileName || "", crs);
  emitProgressiveTiles(totalPoints, { force: true });

  return {
    fileIndex,
    crs,
    points:
      options.includePointPreview === false ? [] : [packPoints(rootTile.points)],
    tiles: tileRecords.map(createTileMetadataRecord),
    tileRecords,
    sourcePointCount: totalPoints,
    validPointCount: rootTile.originalPointCount,
    crsLabel: crs.label,
  };
}

function validateLasView(view) {
  if (readAscii(view, 0, 4) !== "LASF") {
    throw new Error("The file does not appear to be a valid LAS file.");
  }

  const header = readLasHeader(view);
  if (header.pointFormat > 10) {
    throw new Error("This app supports uncompressed LAS files. LAZ requires an additional decoder.");
  }
}

function packPoints(points) {
  const pointCount = points.length;
  const lngLatAlt = new Float64Array(pointCount * 3);
  const classifications = new Uint8Array(pointCount);

  points.forEach((point, index) => {
    const offset = index * 3;
    lngLatAlt[offset] = point.lng;
    lngLatAlt[offset + 1] = point.lat;
    lngLatAlt[offset + 2] = point.altitudeMeters;
    classifications[index] = point.classification || 0;
  });

  return {
    pointCount,
    lngLatAlt,
    classifications,
  };
}

function collectResultTransferList(result) {
  const transfers = [];

  result.points.forEach((pointSet) => pushPointSetTransfer(transfers, pointSet));
  collectTileRecordTransferList(result.tileRecords).forEach((buffer) => {
    transfers.push(buffer);
  });

  return transfers;
}

function collectTileRecordTransferList(tileRecords) {
  const transfers = [];

  tileRecords.forEach((record) => {
    pushPointSetTransfer(transfers, record.points);
    pushPointSetTransfer(transfers, record.fullPoints);
  });

  return transfers;
}

function pushPointSetTransfer(transfers, pointSet) {
  if (!pointSet) {
    return;
  }

  transfers.push(pointSet.lngLatAlt.buffer, pointSet.classifications.buffer);
}

function createLasMetadata({
  fileIndex,
  fileName,
  indexingMode,
  crs,
  rootTile,
  totalPoints,
}) {
  return {
    fileIndex,
    fileName,
    indexingMode,
    crs,
    crsLabel: crs.label,
    sourcePointCount: totalPoints,
    rootTile: createTileMetadataRecord(
      createTileRecord(rootTile, new Map([[rootTile.id, rootTile]]), fileName, crs),
    ),
  };
}

function createProgressiveTileEmitter({
  tileStates,
  fileName,
  crs,
  totalPoints,
  options,
  beforeSnapshot,
}) {
  let lastEmittedPoint = 0;
  let lastEmittedAt = 0;

  return (processed, { force = false } = {}) => {
    if (!options.onTiles) {
      return;
    }

    const now = performance.now();
    const processedDelta = processed - lastEmittedPoint;
    const enoughPoints =
      processedDelta >= pointCloudConfig.progressiveTilePointInterval;
    const enoughTime =
      now - lastEmittedAt >= pointCloudConfig.progressiveTileMinimumMs;

    if (!force && (!enoughPoints || !enoughTime)) {
      return;
    }

    beforeSnapshot?.();
    const tileRecords = createTileRecords(tileStates, fileName, crs);

    if (!tileRecords.length) {
      return;
    }

    lastEmittedPoint = processed;
    lastEmittedAt = now;
    options.onTiles(tileRecords, {
      processed,
      total: totalPoints,
      isFinal: force,
    });
  };
}

function getLasMetricBounds(header, crs) {
  if (crs.kind === "geographic") {
    const southwest = lngLatToWebMercatorMeters(header.minX, header.minY);
    const northeast = lngLatToWebMercatorMeters(header.maxX, header.maxY);

    return normalizeTileBounds({
      minX: southwest.x,
      minY: southwest.y,
      maxX: northeast.x,
      maxY: northeast.y,
    });
  }

  return normalizeTileBounds({
    minX: header.minX,
    minY: header.minY,
    maxX: header.maxX,
    maxY: header.maxY,
  });
}

function getM3noMetricBounds(header, crs) {
  const horizontalBounds = getLasMetricBounds(header, crs);
  const minZ = Math.min(header.minZ, header.maxZ);
  const maxZ = Math.max(header.minZ, header.maxZ);
  const epsilon = 0.01;

  return {
    ...horizontalBounds,
    minZ: minZ === maxZ ? minZ - epsilon : minZ,
    maxZ: minZ === maxZ ? maxZ + epsilon : maxZ,
  };
}

function normalizeTileBounds(bounds) {
  const minX = Math.min(bounds.minX, bounds.maxX);
  const maxX = Math.max(bounds.minX, bounds.maxX);
  const minY = Math.min(bounds.minY, bounds.maxY);
  const maxY = Math.max(bounds.minY, bounds.maxY);
  const epsilon = 0.01;

  return {
    minX: minX === maxX ? minX - epsilon : minX,
    minY: minY === maxY ? minY - epsilon : minY,
    maxX: minX === maxX ? maxX + epsilon : maxX,
    maxY: minY === maxY ? maxY + epsilon : maxY,
  };
}

function getQuadtreeMaxDepth(rootBounds) {
  const diagonal = getBoundsDiagonalMeters(rootBounds);
  let depth = 0;

  while (
    depth < pointCloudConfig.tileMaxDepth &&
    diagonal / 2 ** depth > pointCloudConfig.tileMinDiagonalMeters
  ) {
    depth += 1;
  }

  return depth;
}

function createTileState({ id, parentId, fileIndex, depth, bounds, crs }) {
  return {
    id,
    key: id,
    parentId,
    fileIndex,
    depth,
    bounds,
    diagonalMeters: getBoundsDiagonalMeters(bounds),
    originalPointCount: 0,
    fullPointCount: 0,
    pointCount: 0,
    minZ: Infinity,
    maxZ: -Infinity,
    points: [],
    fullPoints: [],
    childIds: [],
    center: createTileCenter(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, crs),
    corners: createTileCorners(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, crs),
  };
}

function createM3noTileState(options) {
  const tile = createTileState(options);

  return {
    ...tile,
    cellSamples: new Map(),
    attributeIndexes: {
      altitude: { min: Infinity, max: -Infinity },
      classificationBins: new Set(),
    },
  };
}

function insertPointIntoTileTree(tileStates, rootTile, metric, point, altitudeMeters, maxDepth, crs) {
  let tile = rootTile;

  while (tile) {
    addPointToTileSample(tile, point, altitudeMeters);

    if (
      tile.depth >= maxDepth ||
      tile.diagonalMeters <= pointCloudConfig.tileMinDiagonalMeters
    ) {
      addPointToTileFullResolution(tile, point, altitudeMeters);
      return;
    }

    const quadrant = getTileQuadrant(metric, tile.bounds);
    const childId = `${tile.id}.${quadrant}`;
    let childTile = tileStates.get(childId);

    if (!childTile) {
      childTile = createTileState({
        id: childId,
        parentId: tile.id,
        fileIndex: tile.fileIndex,
        depth: tile.depth + 1,
        bounds: getTileChildBounds(tile.bounds, quadrant),
        crs,
      });
      tileStates.set(childId, childTile);
      tile.childIds.push(childId);
    }

    tile = childTile;
  }
}

function insertPointIntoM3noTree(tileStates, rootTile, sample, maxDepth, crs) {
  let tile = rootTile;
  let pendingSample = sample;

  while (tile && pendingSample) {
    addPointToM3noSubtreeIndex(tile, pendingSample);
    pendingSample = addPointToM3noNodeSample(tile, pendingSample);

    if (!pendingSample) {
      return;
    }

    if (
      tile.depth >= maxDepth ||
      tile.diagonalMeters <= pointCloudConfig.tileMinDiagonalMeters
    ) {
      return;
    }

    const childIndex = getM3noChildIndex(
      pendingSample.metric,
      pendingSample.altitudeMeters,
      tile.bounds,
    );
    const childId = `${tile.id}.${childIndex}`;
    let childTile = tileStates.get(childId);

    if (!childTile) {
      childTile = createM3noTileState({
        id: childId,
        parentId: tile.id,
        fileIndex: tile.fileIndex,
        depth: tile.depth + 1,
        bounds: getM3noChildBounds(tile.bounds, childIndex),
        crs,
      });
      tileStates.set(childId, childTile);
      tile.childIds.push(childId);
    }

    tile = childTile;
  }
}

function addPointToM3noSubtreeIndex(tile, sample) {
  tile.originalPointCount += 1;
  tile.pointCount = tile.originalPointCount;
  tile.minZ = Math.min(tile.minZ, sample.altitudeMeters);
  tile.maxZ = Math.max(tile.maxZ, sample.altitudeMeters);
  tile.attributeIndexes.altitude.min = Math.min(
    tile.attributeIndexes.altitude.min,
    sample.altitudeMeters,
  );
  tile.attributeIndexes.altitude.max = Math.max(
    tile.attributeIndexes.altitude.max,
    sample.altitudeMeters,
  );
  tile.attributeIndexes.classificationBins.add(sample.point.classification);
}

function addPointToM3noNodeSample(tile, sample) {
  const key = getM3noCellKey(sample, tile.bounds);
  const distanceSq = getM3noCellCenterDistanceSq(sample, tile.bounds);
  const existing = tile.cellSamples.get(key);
  const nextSample = { ...sample, distanceSq };

  if (!existing) {
    tile.cellSamples.set(key, nextSample);
    return null;
  }

  if (distanceSq < existing.distanceSq) {
    tile.cellSamples.set(key, nextSample);
    return existing;
  }

  return nextSample;
}

function getM3noCellKey(sample, bounds) {
  const gridSize = pointCloudConfig.m3noGridCellsPerAxis;
  const x = getM3noCellIndex(sample.metric.x, bounds.minX, bounds.maxX, gridSize);
  const y = getM3noCellIndex(sample.metric.y, bounds.minY, bounds.maxY, gridSize);
  const z = getM3noCellIndex(sample.altitudeMeters, bounds.minZ, bounds.maxZ, gridSize);

  return `${x}:${y}:${z}`;
}

function getM3noCellIndex(value, minValue, maxValue, gridSize) {
  const span = Math.max(maxValue - minValue, Number.EPSILON);
  const normalized = (value - minValue) / span;
  return Math.max(0, Math.min(gridSize - 1, Math.floor(normalized * gridSize)));
}

function getM3noCellCenterDistanceSq(sample, bounds) {
  const gridSize = pointCloudConfig.m3noGridCellsPerAxis;
  const x = getM3noCellCenterCoordinate(sample.metric.x, bounds.minX, bounds.maxX, gridSize);
  const y = getM3noCellCenterCoordinate(sample.metric.y, bounds.minY, bounds.maxY, gridSize);
  const z = getM3noCellCenterCoordinate(sample.altitudeMeters, bounds.minZ, bounds.maxZ, gridSize);

  return (
    (sample.metric.x - x) ** 2 +
    (sample.metric.y - y) ** 2 +
    (sample.altitudeMeters - z) ** 2
  );
}

function getM3noCellCenterCoordinate(value, minValue, maxValue, gridSize) {
  const cellIndex = getM3noCellIndex(value, minValue, maxValue, gridSize);
  return minValue + ((cellIndex + 0.5) * (maxValue - minValue)) / gridSize;
}

function getM3noChildIndex(metric, altitudeMeters, bounds) {
  const middleX = (bounds.minX + bounds.maxX) / 2;
  const middleY = (bounds.minY + bounds.maxY) / 2;
  const middleZ = (bounds.minZ + bounds.maxZ) / 2;
  const east = metric.x >= middleX ? 1 : 0;
  const north = metric.y >= middleY ? 2 : 0;
  const upper = altitudeMeters >= middleZ ? 4 : 0;

  return east + north + upper;
}

function getM3noChildBounds(bounds, childIndex) {
  const middleX = (bounds.minX + bounds.maxX) / 2;
  const middleY = (bounds.minY + bounds.maxY) / 2;
  const middleZ = (bounds.minZ + bounds.maxZ) / 2;
  const east = childIndex % 2 === 1;
  const north = childIndex % 4 >= 2;
  const upper = childIndex >= 4;

  return {
    minX: east ? middleX : bounds.minX,
    maxX: east ? bounds.maxX : middleX,
    minY: north ? middleY : bounds.minY,
    maxY: north ? bounds.maxY : middleY,
    minZ: upper ? middleZ : bounds.minZ,
    maxZ: upper ? bounds.maxZ : middleZ,
  };
}

function finalizeM3noTileSamples(tileStates) {
  tileStates.forEach((tile) => {
    if (!tile.cellSamples) {
      return;
    }

    tile.points = Array.from(tile.cellSamples.values(), (sample) => sample.point);
  });
}

function insertPointIntoM3noFullResolutionTree(tileStates, rootTile, metric, point, altitudeMeters, maxDepth, crs) {
  let tile = rootTile;

  while (tile) {
    addPointToTileFullResolutionStats(tile, altitudeMeters, point.classification);

    if (
      tile.depth >= maxDepth ||
      tile.diagonalMeters <= pointCloudConfig.tileMinDiagonalMeters
    ) {
      tile.fullPoints.push(point);
      return;
    }

    const childIndex = getM3noChildIndex(metric, altitudeMeters, tile.bounds);
    const childId = `${tile.id}.${childIndex}`;
    let childTile = tileStates.get(childId);

    if (!childTile) {
      childTile = createM3noTileState({
        id: childId,
        parentId: tile.id,
        fileIndex: tile.fileIndex,
        depth: tile.depth + 1,
        bounds: getM3noChildBounds(tile.bounds, childIndex),
        crs,
      });
      tileStates.set(childId, childTile);
      tile.childIds.push(childId);
    }

    tile = childTile;
  }
}

function addPointToTileFullResolution(tile, point, altitudeMeters) {
  addPointToTileFullResolutionStats(tile, altitudeMeters, point.classification);
  tile.fullPoints.push(point);
}

function addPointToTileFullResolutionStats(tile, altitudeMeters, classification) {
  tile.fullPointCount += 1;
  tile.minZ = Math.min(tile.minZ, altitudeMeters);
  tile.maxZ = Math.max(tile.maxZ, altitudeMeters);

  if (tile.attributeIndexes) {
    tile.attributeIndexes.altitude.min = Math.min(tile.attributeIndexes.altitude.min, altitudeMeters);
    tile.attributeIndexes.altitude.max = Math.max(tile.attributeIndexes.altitude.max, altitudeMeters);
    tile.attributeIndexes.classificationBins.add(classification);
  }
}

function addPointToTileSample(tile, point, altitudeMeters) {
  tile.originalPointCount += 1;
  tile.pointCount = tile.originalPointCount;
  tile.minZ = Math.min(tile.minZ, altitudeMeters);
  tile.maxZ = Math.max(tile.maxZ, altitudeMeters);

  if (tile.points.length < pointCloudConfig.tileSamplePoints) {
    tile.points.push(point);
    return;
  }

  const randomIndex = Math.floor(Math.random() * tile.originalPointCount);
  if (randomIndex < pointCloudConfig.tileSamplePoints) {
    tile.points[randomIndex] = point;
  }
}

function createTileRecords(tileStates, fileName, crs) {
  return [...tileStates.values()]
    .filter((tile) => tile.originalPointCount > 0 || tile.fullPointCount > 0)
    .map((tile) => createTileRecord(tile, tileStates, fileName, crs));
}

function createTileRecord(tile, tileStates, fileName, crs) {
  return {
    id: tile.id,
    key: tile.id,
    parentId: tile.parentId,
    childIds: tile.childIds.filter((childId) => {
      const child = tileStates.get(childId);
      return child?.originalPointCount > 0 || child?.fullPointCount > 0;
    }),
    fileIndex: tile.fileIndex,
    fileName,
    crsLabel: crs.label,
    crsKind: crs.kind,
    crsCode: crs.code || null,
    crsZone: crs.zone || null,
    crsNorthern: crs.northern ?? null,
    depth: tile.depth,
    bounds: tile.bounds,
    diagonalMeters: getTileDiagonalMeters(tile),
    originalPointCount: tile.originalPointCount,
    fullPointCount: tile.fullPointCount,
    sourcePointCount: Math.max(tile.originalPointCount, tile.fullPointCount, tile.pointCount),
    pointCount: Math.max(tile.pointCount, tile.fullPointCount),
    sampledPointCount: tile.points.length,
    points: packPoints(tile.points),
    fullPoints: packPoints(tile.fullPoints),
    attributeIndexes: serializeTileAttributeIndexes(tile.attributeIndexes),
    center: tile.center,
    corners: tile.corners,
    minZ: Number.isFinite(tile.minZ) ? tile.minZ : null,
    maxZ: Number.isFinite(tile.maxZ) ? tile.maxZ : null,
  };
}

function serializeTileAttributeIndexes(attributeIndexes) {
  if (!attributeIndexes) {
    return null;
  }

  const altitude = attributeIndexes.altitude || {};

  return {
    altitude:
      Number.isFinite(altitude.min) && Number.isFinite(altitude.max)
        ? { min: altitude.min, max: altitude.max }
        : null,
    classificationBins: attributeIndexes.classificationBins
      ? [...attributeIndexes.classificationBins].sort((left, right) => left - right)
      : [],
  };
}

function createTileMetadataRecord(tileRecord) {
  const { points, fullPoints, ...metadata } = tileRecord;
  return metadata;
}

function getTileVerticalBounds(tile) {
  const boundsMinZ = tile?.bounds?.minZ;
  const boundsMaxZ = tile?.bounds?.maxZ;
  const tileMinZ = tile?.minZ;
  const tileMaxZ = tile?.maxZ;
  const minZ = Number.isFinite(boundsMinZ)
    ? boundsMinZ
    : Number.isFinite(tileMinZ)
      ? tileMinZ
      : 0;
  const maxZ = Number.isFinite(boundsMaxZ)
    ? boundsMaxZ
    : Number.isFinite(tileMaxZ)
      ? tileMaxZ
      : minZ;

  return {
    minZ: Math.min(minZ, maxZ),
    maxZ: Math.max(minZ, maxZ),
  };
}

function getTileDiagonalMeters(tile) {
  const bounds = tile?.bounds;

  if (!bounds) {
    return Number.isFinite(tile?.diagonalMeters) ? tile.diagonalMeters : 0;
  }

  const { minZ, maxZ } = getTileVerticalBounds(tile);
  const diagonalMeters = Math.hypot(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    maxZ - minZ,
  );

  return Number.isFinite(diagonalMeters) && diagonalMeters > 0
    ? diagonalMeters
    : Number.isFinite(tile?.diagonalMeters)
      ? tile.diagonalMeters
      : 0;
}

function getBoundsDiagonalMeters(bounds) {
  const minZ = Number.isFinite(bounds.minZ) ? bounds.minZ : 0;
  const maxZ = Number.isFinite(bounds.maxZ) ? bounds.maxZ : minZ;

  return Math.hypot(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    maxZ - minZ,
  );
}

function getTileQuadrant(point, bounds) {
  const middleX = (bounds.minX + bounds.maxX) / 2;
  const middleY = (bounds.minY + bounds.maxY) / 2;
  const east = point.x >= middleX ? 1 : 0;
  const north = point.y >= middleY ? 2 : 0;

  return east + north;
}

function getTileChildBounds(bounds, quadrant) {
  const middleX = (bounds.minX + bounds.maxX) / 2;
  const middleY = (bounds.minY + bounds.maxY) / 2;
  const east = quadrant % 2 === 1;
  const north = quadrant >= 2;

  return {
    minX: east ? middleX : bounds.minX,
    maxX: east ? bounds.maxX : middleX,
    minY: north ? middleY : bounds.minY,
    maxY: north ? bounds.maxY : middleY,
  };
}

function getHorizontalMetricCoordinate(x, y, crs) {
  if (crs.kind === "geographic") {
    return lngLatToWebMercatorMeters(x, y);
  }

  return { x, y };
}

function createTileCenter(minX, minY, maxX, maxY, crs) {
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  if (crs.kind === "geographic") {
    return webMercatorMetersToLngLat(centerX, centerY);
  }

  return projectLasCoordinate(centerX, centerY, 0, crs);
}

function createTileCorners(minX, minY, maxX, maxY, crs) {
  const corners =
    crs.kind === "geographic"
      ? [
          webMercatorMetersToLngLat(minX, minY),
          webMercatorMetersToLngLat(maxX, minY),
          webMercatorMetersToLngLat(maxX, maxY),
          webMercatorMetersToLngLat(minX, maxY),
        ]
      : [
          projectLasCoordinate(minX, minY, 0, crs),
          projectLasCoordinate(maxX, minY, 0, crs),
          projectLasCoordinate(maxX, maxY, 0, crs),
          projectLasCoordinate(minX, maxY, 0, crs),
        ];

  return corners
    .filter((corner) => isValidProjectedPoint(corner))
    .map((corner) => [corner.lng, corner.lat]);
}

function isValidProjectedPoint(projected) {
  return (
    Number.isFinite(projected.lng) &&
    Number.isFinite(projected.lat) &&
    Math.abs(projected.lng) <= 180 &&
    Math.abs(projected.lat) <= 90
  );
}

function lngLatToWebMercatorMeters(lng, lat) {
  const earthRadius = 6378137;
  const clampedLat = Math.min(Math.max(lat, -85.05112878), 85.05112878);

  return {
    x: earthRadius * lng * (Math.PI / 180),
    y: earthRadius * Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360)),
  };
}

function webMercatorMetersToLngLat(x, y) {
  const earthRadius = 6378137;

  return {
    lng: (x / earthRadius) * (180 / Math.PI),
    lat: (2 * Math.atan(Math.exp(y / earthRadius)) - Math.PI / 2) * (180 / Math.PI),
  };
}

function readLasClassification(view, pointOffset, pointFormat) {
  if (pointFormat >= 6 && pointFormat <= 10) {
    return view.getUint8(pointOffset + 16);
  }

  return view.getUint8(pointOffset + 15) & 0x1f;
}

function readLasHeader(view, fileSize = view.byteLength) {
  const versionMajor = view.getUint8(24);
  const versionMinor = view.getUint8(25);
  const headerSize = view.getUint16(94, true);
  const pointDataOffset = view.getUint32(96, true);
  const vlrCount = view.getUint32(100, true);
  const pointFormat = view.getUint8(104) & 0x3f;
  const pointRecordLength = view.getUint16(105, true);
  const legacyPointCount = view.getUint32(107, true);
  const scaleX = view.getFloat64(131, true);
  const scaleY = view.getFloat64(139, true);
  const scaleZ = view.getFloat64(147, true);
  const offsetX = view.getFloat64(155, true);
  const offsetY = view.getFloat64(163, true);
  const offsetZ = view.getFloat64(171, true);
  const maxX = view.getFloat64(179, true);
  const minX = view.getFloat64(187, true);
  const maxY = view.getFloat64(195, true);
  const minY = view.getFloat64(203, true);
  const maxZ = view.getFloat64(211, true);
  const minZ = view.getFloat64(219, true);

  let pointCount = legacyPointCount;
  if (versionMajor === 1 && versionMinor >= 4 && view.byteLength >= 255) {
    const extendedPointCount = Number(view.getBigUint64(247, true));
    if (extendedPointCount > 0) {
      pointCount = extendedPointCount;
    }
  }

  if (!pointCount || !pointRecordLength || pointDataOffset >= fileSize) {
    throw new Error("The LAS header does not contain valid points.");
  }

  return {
    versionMajor,
    versionMinor,
    headerSize,
    pointDataOffset,
    vlrCount,
    pointFormat,
    pointRecordLength,
    pointCount,
    scaleX,
    scaleY,
    scaleZ,
    offsetX,
    offsetY,
    offsetZ,
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
  };
}

function detectLasCrs(view, header) {
  const vlrs = readLasVlrs(view, header);
  const geoKeyVlr = vlrs.find(
    (vlr) => vlr.recordId === 34735 && vlr.userId.includes("LASF_Projection"),
  );
  const wktVlr = vlrs.find(
    (vlr) => vlr.recordId === 2112 && vlr.userId.includes("LASF_Projection"),
  );

  const wktEpsg = wktVlr
    ? findAnyEpsg(readAscii(view, wktVlr.dataOffset, wktVlr.length))
    : null;
  if (wktEpsg) {
    return crsFromEpsg(wktEpsg, "WKT");
  }

  if (geoKeyVlr) {
    const geoKeys = readGeoKeys(view, geoKeyVlr);
    const projectedCode = geoKeys.get(3072);
    const geographicCode = geoKeys.get(2048);
    const epsg = findAnyEpsg(String(projectedCode || geographicCode || ""));

    if (epsg) {
      return crsFromEpsg(epsg, "GeoTIFF VLR");
    }
  }

  return inferCrsFromFirstPoint(view, header);
}

function readLasVlrs(view, header) {
  const vlrs = [];
  let offset = header.headerSize;

  for (let index = 0; index < header.vlrCount && offset + 54 <= view.byteLength; index += 1) {
    const userId = readAscii(view, offset + 2, 16).replace(/\0/g, "").trim();
    const recordId = view.getUint16(offset + 18, true);
    const length = view.getUint16(offset + 20, true);
    const description = readAscii(view, offset + 22, 32).replace(/\0/g, "").trim();
    const dataOffset = offset + 54;

    vlrs.push({ userId, recordId, length, description, dataOffset });
    offset = dataOffset + length;
  }

  return vlrs;
}

function readGeoKeys(view, vlr) {
  const keys = new Map();
  const keyCount = view.getUint16(vlr.dataOffset + 6, true);

  for (let index = 0; index < keyCount; index += 1) {
    const entryOffset = vlr.dataOffset + 8 + index * 8;
    if (entryOffset + 8 > vlr.dataOffset + vlr.length) {
      break;
    }

    const keyId = view.getUint16(entryOffset, true);
    const tiffTagLocation = view.getUint16(entryOffset + 2, true);
    const valueOffset = view.getUint16(entryOffset + 6, true);

    if (tiffTagLocation === 0) {
      keys.set(keyId, valueOffset);
    }
  }

  return keys;
}

function inferCrsFromFirstPoint(view, header) {
  const x = view.getInt32(header.pointDataOffset, true) * header.scaleX + header.offsetX;
  const y = view.getInt32(header.pointDataOffset + 4, true) * header.scaleY + header.offsetY;

  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    return crsFromEpsg(4326, "inferred from coordinate range");
  }

  if (Math.abs(x) <= 20037508.342789244 && Math.abs(y) <= 20037508.342789244) {
    const webMercator = projectLasCoordinate(x, y, 0, crsFromEpsg(3857, "inferred from coordinate range"));
    if (webMercator.lng > -18 && webMercator.lng < -13 && webMercator.lat > 26 && webMercator.lat < 30) {
      return crsFromEpsg(3857, "inferred from coordinate range");
    }
  }

  if (x >= 100000 && x <= 900000 && y >= 2500000 && y <= 4000000) {
    return crsFromEpsg(32628, "inferred UTM 28N for the Canary Islands");
  }

  return crsFromEpsg(25830, "default assumption: Iberian Peninsula in Spain");
}

function findAnyEpsg(text) {
  const matches = String(text).match(/\d{4,5}/g) || [];
  const codes = matches.map(Number);

  return (
    codes.find(isSupportedProjectedEpsg) ||
    codes.find((code) => code === 4326 || code === 3857) ||
    codes[0] ||
    null
  );
}

function isSupportedProjectedEpsg(code) {
  return (
    (code >= 32601 && code <= 32660) ||
    (code >= 32701 && code <= 32760) ||
    (code >= 25801 && code <= 25860)
  );
}

function crsFromEpsg(code, source) {
  if (code === 4326) {
    return { kind: "geographic", code, label: `EPSG:${code} (${source})` };
  }

  if (code === 3857) {
    return { kind: "web-mercator", code, label: `EPSG:${code} (${source})` };
  }

  if (isSupportedProjectedEpsg(code)) {
    const zone = code % 100;
    const northern = code < 32700;
    return {
      kind: "utm",
      code,
      zone,
      northern,
      label: `EPSG:${code} UTM zona ${zone}${northern ? "N" : "S"} (${source})`,
    };
  }

  throw new Error(`CRS EPSG:${code} was detected but worker indexing only supports geographic, Web Mercator, and UTM EPSG codes for now.`);
}

function projectLasCoordinate(x, y, z, crs) {
  if (crs.kind === "geographic") {
    return { lng: x, lat: y, altitudeMeters: z };
  }

  if (crs.kind === "web-mercator") {
    const earthRadius = 6378137;
    return {
      lng: (x / earthRadius) * (180 / Math.PI),
      lat: (2 * Math.atan(Math.exp(y / earthRadius)) - Math.PI / 2) * (180 / Math.PI),
      altitudeMeters: z,
    };
  }

  if (crs.kind === "utm") {
    const [lng, lat] = utmToLngLat(x, y, crs.zone, crs.northern);
    return { lng, lat, altitudeMeters: z };
  }

  throw new Error("Unsupported CRS.");
}

function utmToLngLat(easting, northing, zone, northern) {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e = Math.sqrt(f * (2 - f));
  const e1sq = e * e / (1 - e * e);
  const x = easting - 500000;
  const y = northern ? northing : northing - 10000000;
  const m = y / k0;
  const mu =
    m /
    (a *
      (1 -
        (e * e) / 4 -
        (3 * Math.pow(e, 4)) / 64 -
        (5 * Math.pow(e, 6)) / 256));
  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));
  const j1 = (3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32;
  const j2 = (21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32;
  const j3 = (151 * Math.pow(e1, 3)) / 96;
  const j4 = (1097 * Math.pow(e1, 4)) / 512;
  const fp =
    mu +
    j1 * Math.sin(2 * mu) +
    j2 * Math.sin(4 * mu) +
    j3 * Math.sin(6 * mu) +
    j4 * Math.sin(8 * mu);
  const sinFp = Math.sin(fp);
  const cosFp = Math.cos(fp);
  const tanFp = Math.tan(fp);
  const c1 = e1sq * cosFp * cosFp;
  const t1 = tanFp * tanFp;
  const r1 = (a * (1 - e * e)) / Math.pow(1 - e * e * sinFp * sinFp, 1.5);
  const n1 = a / Math.sqrt(1 - e * e * sinFp * sinFp);
  const d = x / (n1 * k0);
  const q1 = n1 * tanFp / r1;
  const q2 = (d * d) / 2;
  const q3 = ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * e1sq) * Math.pow(d, 4)) / 24;
  const q4 = ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * e1sq - 3 * c1 * c1) * Math.pow(d, 6)) / 720;
  const lat = fp - q1 * (q2 - q3 + q4);
  const q5 = d;
  const q6 = ((1 + 2 * t1 + c1) * Math.pow(d, 3)) / 6;
  const q7 = ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * e1sq + 24 * t1 * t1) * Math.pow(d, 5)) / 120;
  const lonOrigin = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const lon = lonOrigin + (q5 - q6 + q7) / cosFp;

  return [lon * (180 / Math.PI), lat * (180 / Math.PI)];
}

function readAscii(view, offset, length) {
  return new TextDecoder("utf-8").decode(
    new Uint8Array(view.buffer, view.byteOffset + offset, length),
  );
}

  globalScope.PointScapeOctreeBuilder = PointScapeOctreeBuilder;
})(typeof self !== "undefined" ? self : globalThis);
