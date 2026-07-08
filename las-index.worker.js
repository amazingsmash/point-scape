importScripts("./pointscape-octree-builder.js");

self.onmessage = (event) => {
  const { type, buffer, options = {}, config = {} } = event.data || {};

  if (type !== "parse-las") {
    return;
  }

  const octreeBuilder = new self.PointScapeOctreeBuilder(config);

  try {
    const progressiveCallbacks =
      config.progressiveLoadingPreview === true
        ? {
            onMetadata: (metadata) => {
              self.postMessage({ type: "metadata", metadata });
            },
            onTiles: (tileRecords, details) => {
              self.postMessage(
                { type: "tiles", tileRecords, details },
                octreeBuilder.collectTileRecordTransferList(tileRecords),
              );
            },
          }
        : {};
    const result = octreeBuilder.parse(buffer, {
      ...options,
      onProgress: (processed, total) => {
        self.postMessage({ type: "progress", processed, total });
      },
      ...progressiveCallbacks,
    });
    const transferList = octreeBuilder.collectResultTransferList(result);
    self.postMessage({ type: "done", result }, transferList);
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error?.message || "The LAS file could not be indexed.",
    });
  }
};
