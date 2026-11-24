const assert = require("node:assert/strict");
const test = require("node:test");
const voxels = require("../pointscape-voxel-impostors.js");
const { LodStreamer } = require("../pointscape-lod-streaming.js");
const { selectActiveTiles } = require("../tile-selection.js");

test("voxel occupancy is three-dimensional and retains the dominant classification", () => {
  const tile = {
    format: "copc", depth: 1, sampledPointCount: 5,
    center: { lat: 0 }, bounds: { minX: 0, minY: 0, minZ: 0, maxX: 96, maxY: 96, maxZ: 96 },
  };
  const points = {
    pointCount: 5,
    lngLatAlt: new Float64Array([
      0, 0, 0.1, 0, 0, 0.2, 0, 0, 0.3,
      0, 0, 2.1, 0.00003, 0, 0.2,
    ]),
    classifications: new Uint8Array([2, 2, 5, 5, 6]),
  };
  assert.equal(voxels.canVoxelize(tile), true);
  assert.equal(voxels.canVoxelize({ ...tile, depth: 0 }), false);
  assert.equal(voxels.canVoxelize({ ...tile, depth: 2 }), false);
  assert.equal(voxels.canVoxelize({ ...tile, format: "las" }), false);
  const result = voxels.voxelize(tile, points);
  assert.equal(result.voxelSizeMeters, 2);
  assert.equal(result.points.pointCount, 3);
  assert.deepEqual([...result.points.classifications], [2, 5, 6]);
  assert.deepEqual([result.points.lngLatAlt[2], result.points.lngLatAlt[5]], [1, 3]);
});

test("distance thresholds follow perspective and use 20 percent hysteresis", () => {
  const distances = voxels.getSwitchDistances(10, 1000, 5);
  assert.deepEqual(distances, { enterMeters: 2000, exitMeters: 1600 });
  assert.equal(voxels.shouldUseVoxels(1999, distances, false), false);
  assert.equal(voxels.shouldUseVoxels(2000, distances, false), true);
  assert.equal(voxels.shouldUseVoxels(1600, distances, true), true);
  assert.equal(voxels.shouldUseVoxels(1599, distances, true), false);
  assert.equal(voxels.getSwitchDistances(20, 1000, 5).enterMeters, 4000);
  assert.equal(voxels.getSwitchDistances(10, 1000, 5, 2).enterMeters, 4000);
});

test("the streamer holds the same node's coverage in both directions of a voxel swap", async () => {
  const records = [
    { id: "root", format: "copc", sampledPointCount: 10, childIds: ["child"] },
    { id: "child", format: "copc", parentId: "root", sampledPointCount: 40, childIds: [] },
  ];
  const pending = [];
  const streamer = new LodStreamer({
    select: selectActiveTiles,
    read: (id, source) => new Promise(resolve => pending.push({ id, source, resolve })),
    publish: () => {},
  });
  const plan = {
    records, activeTiles: records, fullIds: new Set(), expandedIds: new Set(["root"]),
    budget: 50, priority: () => 1, voxelIds: new Set(["child"]),
  };
  const readExpected = async (id, source, count, voxelSizeMeters) => {
    const read = pending.shift();
    assert.equal(read.id, id);
    assert.equal(read.source, source);
    read.resolve({ points: { pointCount: count }, voxelSizeMeters });
    await new Promise(resolve => setImmediate(resolve));
  };
  const frame = () => streamer.displayed.map(tile => [tile.id, tile.source, tile.pointCount]);

  const farFrame = streamer.update(plan);
  await readExpected("root", "sample", 10);
  await readExpected("child", "voxel", 4, 10);
  await farFrame;
  assert.deepEqual(frame(), [["root", "sample", 10], ["child", "voxel", 4]]);

  const nearFrame = streamer.update({ ...plan, voxelIds: new Set() });
  assert.deepEqual(frame(), [["root", "sample", 10], ["child", "voxel", 4]]);
  await readExpected("child", "sample", 40);
  await nearFrame;
  assert.deepEqual(frame(), [["root", "sample", 10], ["child", "sample", 40]]);
  assert.equal(streamer.cache.has("child:voxel"), false);

  const farAgain = streamer.update(plan);
  assert.deepEqual(frame(), [["root", "sample", 10], ["child", "sample", 40]]);
  await readExpected("child", "voxel", 4, 10);
  await farAgain;
  assert.deepEqual(frame(), [["root", "sample", 10], ["child", "voxel", 4]]);
  assert.equal(streamer.cache.has("child:sample"), false);
});
