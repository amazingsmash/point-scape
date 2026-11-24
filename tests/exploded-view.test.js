const test = require("node:test");
const assert = require("node:assert/strict");

require("../pointscape-exploded-view.js");

const { createLayout, offsetMeters, easeInOutCubic, decimatePoints, Loader } =
  globalThis.PointScapeExplodedView;

function packedPoints(count) {
  const lngLatAlt = new Float64Array(count * 3);
  const classifications = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    lngLatAlt[index * 3] = index;
    classifications[index] = index % 8;
  }
  return { lngLatAlt, classifications, pointCount: count };
}

test("each tree level has a distinct height, with the root highest", () => {
  const tiles = [
    { id: "r", depth: 0, minZ: 10, maxZ: 30, diagonalMeters: 500 },
    { id: "a", parentId: "r", depth: 1 },
    { id: "b", parentId: "a", depth: 2 },
  ];
  const layout = createLayout(tiles);
  assert.equal(layout.levelSpacingMeters, 50);
  assert.equal(offsetMeters(0, layout), 150);
  assert.equal(offsetMeters(1, layout), 100);
  assert.equal(offsetMeters(2, layout), 50);
});

test("spacing clears the vertical extent of parent boxes", () => {
  const layout = createLayout([
    { id: "r", depth: 0, minZ: -20, maxZ: 180, diagonalMeters: 100 },
    { id: "a", parentId: "r", depth: 1 },
  ]);
  assert.equal(layout.levelSpacingMeters, 250);
  assert.ok(offsetMeters(0, layout) - offsetMeters(1, layout) > 200);
  assert.equal(createLayout([
    { id: "r", depth: 0, minZ: -20, maxZ: 180 },
    { id: "a", parentId: "r", depth: 1 },
  ], 2).levelSpacingMeters, 500);
});

test("animation easing reaches both endpoints and stays bounded", () => {
  assert.equal(easeInOutCubic(-1), 0);
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.equal(easeInOutCubic(1), 1);
  assert.equal(easeInOutCubic(2), 1);
});

test("decimation keeps ten percent across the whole point set", () => {
  const result = decimatePoints(packedPoints(100), 0.1);
  assert.equal(result.pointCount, 10);
  assert.deepEqual(Array.from({ length: 10 }, (_, i) => result.lngLatAlt[i * 3]),
    [5, 15, 25, 35, 45, 55, 65, 75, 85, 95]);
  assert.equal(decimatePoints(packedPoints(3), 0.1).pointCount, 1);
});

test("loader reads every node, using full leaf points and sampled parent points", async () => {
  const reads = [];
  const updates = [];
  const loader = new Loader({
    read: async (id, source) => {
      reads.push([id, source]);
      return { points: packedPoints(source === "full" ? 100 : 20) };
    },
    publish: (tiles, progress) => updates.push({ tiles, progress }),
    batchSize: 1,
  });
  await loader.start([
    { id: "root", childIds: ["leaf"], fullPointCount: 0 },
    { id: "leaf", childIds: [], fullPointCount: 100 },
  ], 0.1);
  assert.deepEqual(reads, [["root", "sample"], ["leaf", "full"]]);
  assert.deepEqual(updates.at(-1).tiles.map((tile) => tile.pointCount), [2, 10]);
  assert.equal(updates.at(-1).progress.loadedNodes, 2);
  assert.equal(updates.at(-1).progress.renderedPointCount, 12);
});

test("cancelling an in-flight read prevents stale points from publishing", async () => {
  let finishRead;
  const updates = [];
  const loader = new Loader({
    read: () => new Promise((resolve) => { finishRead = resolve; }),
    publish: (tiles) => updates.push(tiles),
  });
  const pending = loader.start([{ id: "old", childIds: [] }], 0.1);
  loader.cancel();
  finishRead({ points: packedPoints(10) });
  assert.equal(await pending, null);
  assert.equal(updates.length, 0);
});
