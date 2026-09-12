const test = require("node:test");
const assert = require("node:assert/strict");
require("../pointscape-octree-builder.js");

function lasFixture(count, { coincident = false, recordLength = 20 } = {}) {
  const header = new Uint8Array(227);
  const view = new DataView(header.buffer);
  header.set(Buffer.from("LASF"));
  view.setUint8(24, 1);
  view.setUint8(25, 2);
  view.setUint16(94, 227, true);
  view.setUint32(96, 227, true);
  view.setUint16(105, recordLength, true);
  view.setUint32(107, count, true);
  for (const offset of [131, 139, 147]) view.setFloat64(offset, 0.000001, true);
  for (const [offset, value] of [[179, -15.4], [187, -15.5], [195, 28.2], [203, 28.1], [211, 100], [219, 0]]) {
    view.setFloat64(offset, value, true);
  }
  let maxRead = 0;
  let reads = 0;
  // A virtual File lets us exercise 500+ MB input without materializing it.
  return {
    size: 227 + count * recordLength,
    name: "synthetic.las",
    get maxRead() { return maxRead; },
    get reads() { return reads; },
    arrayBuffer() { throw new Error("Whole-file reads are forbidden"); },
    slice(start, end) {
      return { async arrayBuffer() {
        end = Math.min(end, 227 + count * recordLength);
        const bytes = new Uint8Array(end - start);
        reads += 1;
        maxRead = Math.max(maxRead, bytes.byteLength);
        if (start < 227) bytes.set(header.subarray(start, Math.min(end, 227)));
        const first = Math.max(0, Math.floor((start - 227) / recordLength));
        const last = Math.min(count, Math.ceil((end - 227) / recordLength));
        for (let index = first; index < last; index += 1) {
          const point = new Uint8Array(20);
          const pv = new DataView(point.buffer);
          pv.setInt32(0, -15450000 + (coincident ? 0 : index % 1000), true);
          pv.setInt32(4, 28150000 + (coincident ? 0 : index % 777), true);
          pv.setInt32(8, index % 100000000, true);
          pv.setUint8(15, index % 8);
          const pointStart = 227 + index * recordLength;
          for (let byte = Math.max(0, start - pointStart); byte < Math.min(20, end - pointStart); byte += 1) {
            bytes[pointStart + byte - start] = point[byte];
          }
        }
        return bytes.buffer;
      } };
    },
  };
}

function memoryScratch() {
  const blocks = new Map();
  return {
    closed: false,
    getCalls: 0,
    putCalls: 0,
    removeCalls: 0,
    getManyCalls: 0,
    putManyCalls: 0,
    removeManyCalls: 0,
    async get(key) { this.getCalls += 1; return blocks.get(key); },
    async put(key, value) { this.putCalls += 1; blocks.set(key, value); },
    async remove(key) { this.removeCalls += 1; blocks.delete(key); },
    async getMany(keys) { this.getManyCalls += 1; return keys.map((key) => blocks.get(key)); },
    async putMany(entries) { this.putManyCalls += 1; for (const [key, value] of entries) blocks.set(key, value); },
    async removeMany(keys) { this.removeManyCalls += 1; for (const key of keys) blocks.delete(key); },
    async close() { blocks.clear(); this.closed = true; },
  };
}

for (const indexingMode of ["quadtree", "m3no"]) {
  test(`${indexingMode}: bounded leaves preserve every point including coincident XY`, async () => {
    const count = 120001;
    const file = lasFixture(count, { coincident: true });
    const scratchStore = memoryScratch();
    const builder = new globalThis.PointScapeOctreeBuilder({ tileMaxDepth: 1, m3noGridCellsPerAxis: 8 });
    let savedPoints = 0;
    let altitudeSum = 0;
    let pendingWrites = 0;
    let maxPendingWrites = 0;
    const sampledAltitudes = new Set();
    const result = await builder.parseFile(file, {
      indexingMode, scratchStore,
      runtimeCapabilities: { mobileApple: true },
      onTiles: async (records) => {
        pendingWrites += 1;
        maxPendingWrites = Math.max(maxPendingWrites, pendingWrites);
        await new Promise((resolve) => setTimeout(resolve, 1));
        for (const record of records) {
          assert.ok(record.fullPoints.pointCount <= 50000);
          savedPoints += record.fullPoints.pointCount;
          for (let index = 2; index < record.fullPoints.lngLatAlt.length; index += 3) altitudeSum += record.fullPoints.lngLatAlt[index];
          if (indexingMode === "m3no") {
            for (let index = 2; index < record.points.lngLatAlt.length; index += 3) {
              const altitude = record.points.lngLatAlt[index];
              assert.equal(sampledAltitudes.has(altitude), false, "M3NO must not duplicate samples across levels");
              sampledAltitudes.add(altitude);
            }
          }
          // Simulate the real sink stripping transferred payloads after saving.
          record.points = null;
          record.fullPoints = null;
        }
        pendingWrites -= 1;
      },
    });
    assert.equal(savedPoints, count);
    assert.equal(result.validPointCount, count);
    assert.ok(Math.abs(altitudeSum - (count * (count - 1) / 2) * 0.000001) < 0.001);
    assert.equal(maxPendingWrites, 1);
    assert.ok(file.maxRead <= 4 * 1024 * 1024);
    assert.ok(result.memoryProfile.peakBufferedBytes <= result.memoryProfile.workingSetBytes);
    assert.equal(result.memoryProfile.memoryTier, "compact");
    assert.equal(result.memoryProfile.singlePassNodes, true);
    assert.ok(scratchStore.getManyCalls > 0);
    assert.ok(scratchStore.putManyCalls > 0);
    assert.ok(scratchStore.removeManyCalls > 0);
    assert.equal(scratchStore.getCalls + scratchStore.putCalls + scratchStore.removeCalls, 0);
    assert.equal(result.tileRecords.length, 0);
    assert.equal(scratchStore.closed, true);
    const ids = new Set(result.tiles.map((tile) => tile.id));
    for (const tile of result.tiles) for (const childId of tile.childIds) assert.ok(ids.has(childId));
  });
}

test("a file over 500 MB is sliced and saved without a whole-file allocation", async () => {
  // Large extra-byte records, valid for LAS; a single bounded leaf avoids keeping
  // a second 500 MB copy in this test's in-memory scratch implementation.
  const file = lasFixture(10001, { recordLength: 50000 });
  const scratchStore = memoryScratch();
  let saved = 0;
  const result = await new globalThis.PointScapeOctreeBuilder({ tileMaxDepth: 0 }).parseFile(file, {
    scratchStore,
    onTiles: async ([record]) => { saved += record.fullPoints.pointCount; },
  });
  assert.ok(file.size > 500000000);
  assert.equal(saved, 10001);
  assert.ok(file.maxRead <= result.memoryProfile.blockBytes);
  assert.ok(file.reads < 200);
  assert.equal(result.validPointCount, 10001);
});

test("storage failure stops the producer and clears temporary partitions", async () => {
  const scratchStore = memoryScratch();
  const failure = new Error("QuotaExceededError");
  let writes = 0;
  await assert.rejects(new globalThis.PointScapeOctreeBuilder({ tileMaxDepth: 1 }).parseFile(lasFixture(100), {
    scratchStore,
    onTiles: async () => { writes += 1; throw failure; },
  }), failure);
  assert.equal(writes, 1);
  assert.equal(scratchStore.closed, true);
});

test("truncated LAS is rejected before indexing", async () => {
  const file = lasFixture(100);
  file.size -= 20;
  await assert.rejects(new globalThis.PointScapeOctreeBuilder().parseFile(file, {}), /truncated/);
});
