importScripts("./pointscape-octree-builder.js");
importScripts("./las-scratch-store.js");

let acknowledgeTiles = null;
self.onmessage = async (event) => {
  const { type, buffer, file, options = {}, config = {} } = event.data || {};

  if (type === "tiles-saved") {
    acknowledgeTiles?.();
    acknowledgeTiles = null;
    return;
  }

  if (type !== "parse-las") {
    return;
  }

  const octreeBuilder = new self.PointScapeOctreeBuilder(config);

  try {
    if (file) {
      const result = await octreeBuilder.parseFile(file, {
        ...options,
        onMetadata: (metadata) => self.postMessage({ type: "metadata", metadata }),
        onProgress: (processed, total, details) => self.postMessage({ type: "progress", processed, total, details }),
        onTiles: (tileRecords, details) => new Promise((resolve) => {
          acknowledgeTiles = resolve;
          self.postMessage({ type: "tiles", tileRecords, details, needsAck: true },
            octreeBuilder.collectTileRecordTransferList(tileRecords));
        }),
      });
      self.postMessage({ type: "done", result });
      return;
    }
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
