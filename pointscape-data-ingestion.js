(function initPointScapeDataIngestion(globalScope) {
  class LasDataIngestionService {
    constructor({ workerUrl = "./las-index.worker.js", getConfig = () => ({}) } = {}) {
      this.workerUrl = workerUrl;
      this.getConfig = getConfig;
    }

    parse(buffer, options = {}) {
      if (typeof Worker === "undefined") {
        return Promise.reject(
          new Error("This browser does not support Web Workers for LAS indexing."),
        );
      }

      return new Promise((resolve, reject) => {
        const worker = new Worker(this.workerUrl);
        const { onProgress, onMetadata, onTiles, ...workerOptions } = options;
        let tileCallbackQueue = Promise.resolve();
        let isSettled = false;

        const fail = (error) => {
          if (isSettled) {
            return;
          }

          isSettled = true;
          worker.terminate();
          reject(error);
        };

        worker.onmessage = (event) => {
          const message = event.data || {};

          if (isSettled) {
            return;
          }

          if (message.type === "progress") {
            onProgress?.(message.processed, message.total);
            return;
          }

          if (message.type === "metadata") {
            onMetadata?.(message.metadata);
            return;
          }

          if (message.type === "tiles") {
            tileCallbackQueue = tileCallbackQueue.then(() =>
              onTiles?.(message.tileRecords || [], message.details || {}),
            );
            tileCallbackQueue.catch((error) => {
              fail(error instanceof Error ? error : new Error(String(error)));
            });
            return;
          }

          if (message.type === "done") {
            tileCallbackQueue
              .then(() => {
                if (isSettled) {
                  return;
                }

                isSettled = true;
                worker.terminate();
                resolve(message.result);
              })
              .catch((error) => {
                fail(error instanceof Error ? error : new Error(String(error)));
              });
            return;
          }

          if (message.type === "error") {
            fail(new Error(message.message || "The LAS file could not be indexed."));
          }
        };

        worker.onerror = (error) => {
          fail(new Error(error.message || "The LAS indexing worker failed."));
        };

        worker.postMessage(
          {
            type: "parse-las",
            buffer,
            options: workerOptions,
            config: this.getConfig(),
          },
          [buffer],
        );
      });
    }
  }

  class VolatileTileStore {
    constructor({
      name = "pointscape-volatile-tiles",
      version = 1,
      storeName = "tiles",
      getBatchSize = () => 24,
      yieldToBrowser = () => Promise.resolve(),
    } = {}) {
      this.name = name;
      this.version = version;
      this.storeName = storeName;
      this.getBatchSize = getBatchSize;
      this.yieldToBrowser = yieldToBrowser;
      this.dbPromise = null;
    }

    reset() {
      if (!("indexedDB" in globalScope)) {
        this.dbPromise = Promise.resolve(null);
        return this.dbPromise;
      }

      this.dbPromise = new Promise((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(this.name);

        deleteRequest.onerror = () => reject(deleteRequest.error);
        deleteRequest.onblocked = () => {
          console.warn("The volatile tile database reset is blocked by another tab.");
        };
        deleteRequest.onsuccess = () => {
          this.open().then(resolve, reject);
        };
      });

      return this.dbPromise;
    }

    open() {
      return new Promise((resolve, reject) => {
        const openRequest = indexedDB.open(this.name, this.version);

        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onupgradeneeded = () => {
          const db = openRequest.result;

          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, {
              keyPath: "id",
            });
          }
        };
        openRequest.onsuccess = () => {
          const db = openRequest.result;

          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
          };

          resolve(db);
        };
      });
    }

    async getDb() {
      if (!this.dbPromise) {
        this.dbPromise = this.open();
      }

      return this.dbPromise;
    }

    async clear() {
      const db = await this.getDb();

      if (!db) {
        return;
      }

      await this.runTransaction("readwrite", (store) => store.clear());
    }

    async saveRecords(tileRecords) {
      const db = await this.getDb();

      if (!db || !tileRecords.length) {
        return;
      }

      const batchSize = Math.max(1, this.getBatchSize() || 24);

      for (let startIndex = 0; startIndex < tileRecords.length; startIndex += batchSize) {
        const batch = tileRecords.slice(startIndex, startIndex + batchSize);

        await this.runTransaction("readwrite", (store) => {
          batch.forEach((record) => {
            store.put(serializeTileRecordForStorage(record));
          });
        });
        batch.forEach(stripTileRecordPointPayload);
        await this.yieldToBrowser();
      }
    }

    async getRecord(tileKey) {
      const db = await this.getDb();

      if (!db) {
        return null;
      }

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readonly");
        const store = transaction.objectStore(this.storeName);
        const request = store.get(tileKey);

        request.onsuccess = () =>
          resolve(request.result ? hydrateStoredTileRecord(request.result) : null);
        request.onerror = () => reject(request.error);
      });
    }

    async getRecords(tileIds) {
      const db = await this.getDb();

      if (!db || !tileIds.length) {
        return [];
      }

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readonly");
        const store = transaction.objectStore(this.storeName);
        const records = [];
        let pending = tileIds.length;

        tileIds.forEach((tileId) => {
          const request = store.get(tileId);

          request.onsuccess = () => {
            if (request.result) {
              records.push(hydrateStoredTileRecord(request.result));
            }
            pending -= 1;
            if (pending === 0) {
              resolve(records);
            }
          };
          request.onerror = () => reject(request.error);
        });
      });
    }

    runTransaction(mode, operation) {
      return this.getDb().then(
        (db) =>
          new Promise((resolve, reject) => {
            if (!db) {
              resolve();
              return;
            }

            const transaction = db.transaction(this.storeName, mode);
            const store = transaction.objectStore(this.storeName);

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
            operation(store);
          }),
      );
    }
  }

  function serializeTileRecordForStorage(record) {
    return {
      ...record,
      points: serializePointSetForStorage(record.points),
      fullPoints: serializePointSetForStorage(record.fullPoints),
    };
  }

  function serializePointSetForStorage(pointSet) {
    const packedPointSet = ensurePackedPointSet(pointSet);

    if (!packedPointSet || !getPointSetCount(packedPointSet)) {
      return null;
    }

    return {
      pointCount: getPointSetCount(packedPointSet),
      lngLatAltBuffer: getArrayBufferForStorage(packedPointSet.lngLatAlt),
      classificationsBuffer: getArrayBufferForStorage(packedPointSet.classifications),
    };
  }

  function hydrateStoredTileRecord(record) {
    return {
      ...record,
      points: hydrateStoredPointSet(record.points),
      fullPoints: hydrateStoredPointSet(record.fullPoints),
    };
  }

  function hydrateStoredPointSet(pointSet) {
    if (!pointSet) {
      return null;
    }

    if (isPackedPointSet(pointSet)) {
      return pointSet;
    }

    if (pointSet.lngLatAltBuffer && pointSet.classificationsBuffer) {
      return {
        pointCount: pointSet.pointCount || 0,
        lngLatAlt: new Float64Array(pointSet.lngLatAltBuffer),
        classifications: new Uint8Array(pointSet.classificationsBuffer),
      };
    }

    return ensurePackedPointSet(pointSet);
  }

  function ensurePackedPointSet(pointSet) {
    if (!pointSet) {
      return null;
    }

    if (isPackedPointSet(pointSet)) {
      return pointSet;
    }

    if (Array.isArray(pointSet)) {
      return packPointObjects(pointSet);
    }

    if (isPointObject(pointSet)) {
      return packPointObjects([pointSet]);
    }

    return null;
  }

  function packPointObjects(points) {
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

  function getArrayBufferForStorage(typedArray) {
    if (
      typedArray.byteOffset === 0 &&
      typedArray.byteLength === typedArray.buffer.byteLength
    ) {
      return typedArray.buffer;
    }

    return typedArray.buffer.slice(
      typedArray.byteOffset,
      typedArray.byteOffset + typedArray.byteLength,
    );
  }

  function stripTileRecordPointPayload(record) {
    record.points = null;
    record.fullPoints = null;
  }

  function isPackedPointSet(pointSet) {
    return Boolean(pointSet?.lngLatAlt?.buffer && pointSet?.classifications?.buffer);
  }

  function isPointObject(value) {
    return Number.isFinite(value?.lng) && Number.isFinite(value?.lat);
  }

  function getPointSetCount(pointSet) {
    if (!pointSet) {
      return 0;
    }

    if (isPackedPointSet(pointSet)) {
      return pointSet.pointCount || pointSet.classifications.length || 0;
    }

    if (isPointObject(pointSet)) {
      return 1;
    }

    return Array.isArray(pointSet) ? pointSet.length : 0;
  }

  globalScope.PointScapeDataIngestion = {
    LasDataIngestionService,
    VolatileTileStore,
  };
})(typeof window !== "undefined" ? window : globalThis);
