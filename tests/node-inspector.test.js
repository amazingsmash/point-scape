const test = require("node:test");
const assert = require("node:assert/strict");
const { pickPoint, createGeometry } = require("../node-inspector.js");
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const tile = (id, x, y, z, anchor = [0, 0, 0]) => ({ id, renderKey: `${id}:sample:1`,
  pointCount: 1, anchorMercator: anchor, pickPositions: new Float32Array([x, y, z, 0]) });

test("picks the frontmost overlapping point and its exact owning node", () => {
  const hit = pickPoint([tile("back", 0, 0, 0.5), tile("front", 0, 0, -0.5)], identity, 50, 50, 100, 100);
  assert.equal(hit.id, "front");
  assert.equal(hit.index, 0);
});
test("picking handles anchor offsets, screen Y and HiDPI; empty clicks do not select a node", () => {
  const buffer = tile("offset", 0.1, 0.2, 0, [0.1, 0.2, 0]);
  assert.equal(pickPoint([buffer], identity, 60, 30, 100, 100, 6, 2).id, "offset");
  assert.equal(pickPoint([buffer], identity, 0, 0, 100, 100), null);
  assert.equal(pickPoint([tile("clipped", 0, 0, 2)], identity, 50, 50, 100, 100), null);
});
test("points behind the eye cannot be picked", () => {
  const matrix = [...identity]; matrix[15] = -1;
  assert.equal(pickPoint([tile("behind", 0, 0, 0)], matrix, 50, 50, 100, 100), null);
});
test("inspector preserves the full node extent and original metric proportions", () => {
  const record = { bounds: { minX: 100, maxX: 200, minY: 300, maxY: 500 }, minZ: 10, maxZ: 30, crsKind: "utm" };
  // Both points cluster in one corner. Framing must not shrink to that cluster.
  const points = { pointCount: 2, lngLatAlt: new Float64Array([100, 300, 10, 101, 301, 11]) };
  const geometry = createGeometry(record, points, (x, y) => ({ x, y }));
  assert.deepEqual(geometry.dimensions, [100, 200, 20]);
  assert.deepEqual([...geometry.positions], [-50, -100, -10, -49, -99, -9]);
  assert.equal(geometry.lines.length, 12 * 2 * 3);
  assert.equal(geometry.grid.length, 3 * 5 * 5 * 2 * 3);
  for (let i = 0; i < geometry.grid.length; i += 3) {
    assert.ok(Math.abs(geometry.grid[i]) <= 50);
    assert.ok(Math.abs(geometry.grid[i + 1]) <= 100);
    assert.ok(Math.abs(geometry.grid[i + 2]) <= 10);
  }
  assert.deepEqual(geometry.toLocal({ lng: 150, lat: 400, altitudeMeters: 20 }), [0, 0, 0]);
});
