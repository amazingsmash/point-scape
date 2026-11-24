importScripts("./pointscape-copc-reader.js", "./pointscape-voxel-impostors.js", "./vendor/copc-runtime.js");

const { Copc, createLazPerf, proj4 } = PointScapeCopcVendor;
const { createRangeReader, createProjection, decodeTile, openCopc } = PointScapeCopcReader;
let dataset;
let decoderPromise;
const projections = new Map();
const reads = new Map();

self.onmessage = async ({ data: {
  requestId, type, source, fileIndex, fileName, tileId, representation, tile, decodeInfo, progressive,
} }) => {
  if (type === "cancel") {
    reads.get(requestId)?.abort();
    return;
  }
  try {
    if (type === "open") {
      dataset = await openCopc({ read: createRangeReader(source), fileIndex, fileName, Copc, proj4, progressive });
      self.postMessage({ requestId, result: dataset.metadata });
      return;
    }
    if (type === "page" || type === "all-pages") {
      const result = type === "page" ? await dataset.loadHierarchy(tileId) : await dataset.loadAllHierarchy(4);
      self.postMessage({ requestId, result });
      return;
    }
    const controller = new AbortController();
    reads.set(requestId, controller);
    if (!projections.has(tile.fileIndex)) {
      projections.set(tile.fileIndex, createProjection(proj4, decodeInfo.wkt.trim()));
    }
    let record = await decodeTile({
      read: createRangeReader(source, controller.signal),
      tile, header: decodeInfo.header, Copc, projection: projections.get(tile.fileIndex),
      getDecoder: () => {
        decoderPromise ||= createLazPerf({
          locateFile: name => new URL(`./vendor/${name}`, self.location.href).href,
        });
        return decoderPromise;
      },
    });
    if (record?.points && representation === "voxel" && PointScapeVoxelImpostors.canVoxelize(record)) {
      record = PointScapeVoxelImpostors.voxelize(record, record.points);
    }
    const transfer = record?.points ? [record.points.lngLatAlt.buffer, record.points.classifications.buffer] : [];
    self.postMessage({ requestId, result: record }, transfer);
  } catch (error) {
    self.postMessage({ requestId, error: error.message || String(error) });
  } finally {
    reads.delete(requestId);
  }
};
