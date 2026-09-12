// One temporary database per worker. Clear on open also recovers space after a
// page/process crash; transactions are awaited to apply backpressure to parsing.
(function (scope) {
  class PointScapeScratchStore {
    static async open(name = "pointscape-las-scratch") {
      if (!scope.indexedDB) throw new Error("IndexedDB is required for memory-bounded LAS loading.");
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore("blocks");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("Close other PointScape tabs to load this LAS."));
      });
      const store = new PointScapeScratchStore(db);
      try {
        await store.transaction("readwrite", (blocks) => blocks.clear());
      } catch (error) {
        db.close();
        throw error;
      }
      return store;
    }
    constructor(db) { this.db = db; }
    transaction(mode, operation) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction("blocks", mode);
        const request = operation(tx.objectStore("blocks"));
        tx.oncomplete = () => resolve(request?.result);
        tx.onabort = tx.onerror = () => reject(tx.error || new Error("Temporary LAS storage failed."));
      });
    }
    get(key) { return this.transaction("readonly", (store) => store.get(key)); }
    put(key, value) { return this.transaction("readwrite", (store) => store.put(value, key)); }
    remove(key) { return this.transaction("readwrite", (store) => store.delete(key)); }
    getMany(keys) {
      if (!keys.length) return Promise.resolve([]);
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction("blocks", "readonly");
        const store = tx.objectStore("blocks");
        const values = new Array(keys.length);
        keys.forEach((key, index) => {
          const request = store.get(key);
          request.onsuccess = () => { values[index] = request.result; };
        });
        tx.oncomplete = () => resolve(values);
        tx.onabort = tx.onerror = () => reject(tx.error || new Error("Temporary LAS storage failed."));
      });
    }
    putMany(entries) {
      if (!entries.length) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction("blocks", "readwrite");
        const store = tx.objectStore("blocks");
        for (const [key, value] of entries) store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(tx.error || new Error("Temporary LAS storage failed."));
      });
    }
    removeMany(keys) {
      if (!keys.length) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction("blocks", "readwrite");
        const store = tx.objectStore("blocks");
        for (const key of keys) store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(tx.error || new Error("Temporary LAS storage failed."));
      });
    }
    async close() {
      try { await this.transaction("readwrite", (store) => store.clear()); }
      finally { this.db.close(); }
    }
  }
  scope.PointScapeScratchStore = PointScapeScratchStore;
})(globalThis);
