const test = require("node:test");
const assert = require("node:assert/strict");
const { transform, cameraPosition, capture, canReuse, Cache, NodeTimings } = require("../pointscape-image-impostors.js");

// Perspective camera at (0, 0, 10) facing -Z, near 1, far 100.
const projection = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -101 / 99, -1, 0, 0, 810 / 99, 10];
const palette = code => code === 2 ? [0, 1, 0, 1] : [1, 0, 0, 1];

function node(id, points, anchorMercator = [0, 0, 0]) {
  const pickPositions = new Float32Array(points.length * 4);
  const bytes = new Uint8Array(pickPositions.buffer);
  points.forEach(([x, y, z, classification], i) => {
    pickPositions.set([x, y, z], i * 4);
    bytes[i * 16 + 12] = classification;
  });
  return { id, pickPositions, pointCount: points.length, anchorMercator, metersToMercator: 1 };
}

test("color and depth select the same closest point and use transparent empty texels", () => {
  const tile = node("node", [[0, 0, -2, 3], [0, 0, 4, 2]]);
  const result = capture(tile, projection, 1, palette);
  assert.equal(result.width, 1024);
  assert.equal(result.height, 1024);
  assert.deepEqual([...result.texels], [512 * 1024 + 512]);
  assert.ok(result.depth[result.texels[0]] < 0);
  assert.equal(result.depth[0], Infinity);
  assert.equal(result.color[3], 0);
  const index = result.texels[0] * 4;
  assert.deepEqual([...result.color.slice(index, index + 4)], [0, 255, 0, 255]);
});

test("capture matrix reconstructs a perspective texel in anchor-relative space for another camera", () => {
  const tile = node("node", [[-1, 2, 4, 2], [0.5, -1, 0, 3]], [0.5, -0.25, 0.2]);
  const result = capture(tile, projection, 16 / 9, palette, 256);
  assert.equal(result.width, 256);
  assert.equal(result.height, 256);
  assert.equal(result.depth.length, 256 ** 2);
  cameraPosition(projection).forEach((value, axis) =>
    assert.ok(Math.abs(value - [0, 0, 10][axis]) < 1e-10));
  const index = result.texels[0];
  const x = 2 * (index % result.width + 0.5) / result.width - 1;
  const y = 1 - 2 * (Math.floor(index / result.width) + 0.5) / result.height;
  const local = transform(new Float32Array(result.inverseCameraMatrix), x, y, result.depth[index]);
  const point = local.slice(0, 3).map((value, axis) => value / local[3] + tile.anchorMercator[axis]);
  const original = tile.anchorMercator.map((offset, axis) => offset + tile.pickPositions[axis]);
  const moved = [...projection];
  moved[12] -= 3;
  const ndc = value => value.slice(0, 3).map(v => v / value[3]);
  const actual = ndc(transform(moved, ...point));
  const expected = ndc(transform(moved, ...original));
  actual.forEach((value, axis) => assert.ok(Math.abs(value - expected[axis]) < 0.005));
  assert.ok(Math.abs(ndc(transform(projection, ...original))[0] - actual[0]) > 0.4);
});

test("image cache reuses until the percentage of the capture distance is exceeded", () => {
  const tile = node("node", [[0, 0, 0, 2]], [0, 0, -10]);
  const options = { size: 128, maxAreaRatio: 1, projectedArea: () => 1, reusePercent: 10, moving: false };
  const discarded = [];
  const cache = new Cache(textures => textures, textures => discarded.push(textures));
  const bake = () => ({ texels: [5] });
  cache.update([tile], [0, 0, 1], options, bake);
  const first = cache.active.get(tile.id);
  assert.equal(cache.captures, 1);
  cache.update([tile], [0.6, 0.8, 1], { ...options, moving: true }, bake);
  assert.equal(cache.active.get(tile.id), first);
  cache.update([tile], [1.11, 0, 1], { ...options, moving: true }, bake);
  assert.equal(cache.active.size, 0);
  assert.deepEqual(discarded, [first]);
  cache.update([tile], [1.11, 0, 1], options, bake);
  assert.equal(cache.captures, 2);
  assert.notEqual(cache.active.get(tile.id), first);
  cache.update([tile], [1.11, 0, 1], { ...options, projectedArea: () => 0 }, bake);
  assert.equal(cache.active.size, 0);
  assert.equal(discarded.length, 2);
  assert.equal(canReuse([0, 0, 0], [0, 0, 0.01], 0.01, 10, 0), false);
});

test("image eligibility uses texture pixel area times the multiplier and changing resolution replaces captures", () => {
  const tile = node("node", [[0, 0, 0, 2]], [0, 0, -10]);
  const eye = [0, 0, 1];
  const options = { size: 128, maxAreaRatio: 2, projectedArea: () => 2 * 128 ** 2, reusePercent: 10, moving: false };
  const disposed = [];
  const cache = new Cache(textures => textures, textures => disposed.push(textures));
  const bake = () => ({ texels: [5] });
  cache.update([tile], eye, options, bake);
  const first = cache.active.get(tile.id);
  assert.ok(first);
  cache.update([tile], eye, { ...options, size: 256 }, bake);
  assert.notEqual(cache.active.get(tile.id), first);
  assert.equal(cache.captures, 2);
  assert.deepEqual(disposed, [first]);
  cache.update([tile], eye, { ...options, size: 256, maxAreaRatio: 0.49 }, bake);
  assert.equal(cache.active.size, 0);
  assert.equal(disposed.length, 2);
});

test("image cache releases old representations and bounds its resident texture pairs", () => {
  const tiles = Array.from({ length: 9 }, (_, i) => node(`node-${i}`, [[0, 0, 0, 2]], [0, 0, -10]));
  const options = { size: 128, maxAreaRatio: 1, projectedArea: () => 1, reusePercent: 10, moving: false };
  const disposed = [];
  const cache = new Cache(textures => textures, textures => disposed.push(textures));
  const bake = () => ({ texels: [5] });
  while (cache.update(tiles, [0, 0, 1], options, bake)) { /* render the next frame */ }
  assert.equal(cache.active.size, 8);
  const original = cache.active.get(tiles[0].id);
  tiles[0] = { ...tiles[0] };
  cache.update(tiles, [0, 0, 1], options, bake);
  assert.notEqual(cache.active.get(tiles[0].id), original);
  assert.equal(disposed[0], original);
  cache.clear();
  assert.equal(cache.active.size, 0);
  assert.equal(disposed.length, 9);
});

test("image timing uses the last live points draw of each node across its render passes", () => {
  const extension = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
  let query;
  let duration;
  const gl = {
    getQuery: () => null,
    getParameter: () => false,
    createQuery: () => ({}),
    beginQuery: (_, value) => { query = value; },
    endQuery: () => { query.ns = duration; },
    getQueryParameter: (value, parameter) => parameter === "ready" || value.ns,
    QUERY_RESULT_AVAILABLE: "ready",
    QUERY_RESULT: "nanoseconds",
    deleteQuery() {},
    flush() {},
  };
  const timings = new NodeTimings(gl, extension);
  const tile = { id: "node" };
  const capture = {};
  const draw = times => {
    for (const ns of times) {
      duration = ns;
      assert.equal(timings.beginDraw(tile), true);
      timings.endDraw();
    }
    timings.finishFrame();
  };
  const prepare = (image = capture) => {
    const active = new Map([[tile.id, image]]);
    timings.prepareFrame([tile], active);
    return active;
  };

  assert.equal(prepare().size, 0);
  draw([100000, 200000, 300000]);
  assert.equal(prepare().get(tile.id), capture);
  assert.equal(timings.points.get(tile), 0.6);
  draw([20000, 30000, 50000]);
  assert.equal(prepare().size, 1);
  assert.equal(timings.images.get(capture), 0.1);
  assert.equal(timings.beginDraw(tile), false);
  timings.finishFrame();

  timings.requestRefresh(new Map([[tile.id, capture]]));
  assert.equal(prepare().size, 1);
  draw([10000, 20000, 30000]);
  assert.equal(prepare().size, 1);
  assert.equal(timings.points.get(tile), 0.6);
  assert.equal(timings.images.get(capture), 0.06);
  timings.finishFrame();

  timings.prepareFrame([tile], new Map());
  timings.finishFrame();
  const recapture = {};
  assert.equal(prepare(recapture).size, 0);
  draw([50000, 100000, 150000]);
  assert.equal(prepare(recapture).size, 1);
  assert.equal(timings.points.get(tile), 0.3);
  assert.equal(timings.images.get(recapture), undefined);
  timings.finishFrame();
});
