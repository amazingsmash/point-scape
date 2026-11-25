const test = require("node:test");
const assert = require("node:assert/strict");
const { pickPoint, createGeometry, createImpostorTextures, createLodDiagnosticGroups } = require("../node-inspector.js");
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

test("picking follows the animated exploded height", () => {
  const buffer = tile("raised", 0, 0, 0);
  buffer.explodedOffsetMercator = 2;
  buffer.explodedProgress = 1;
  assert.equal(pickPoint([buffer], identity, 50, 50, 100, 100), null);
  buffer.explodedProgress = 0;
  assert.equal(pickPoint([buffer], identity, 50, 50, 100, 100).id, "raised");
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

test("impostor texture color and linear depth come from the same frontmost point", () => {
  const geometry = { dimensions: [10, 10, 10], count: 2,
    positions: new Float32Array([0, 0, 4, 0, 0, -2]) };
  const points = { classifications: new Uint8Array([2, 3]) };
  const textures = createImpostorTextures(geometry, points,
    (classification) => classification === 2 ? [0, 1, 0] : [1, 0, 0], { bearing: 0, pitch: 0 });
  assert.equal(textures.width, 1024);
  assert.equal(textures.height, 1024);
  assert.equal(textures.depth.length, 1024 * 1024);
  assert.equal(textures.color.length, textures.depth.length * 4);
  assert.equal(textures.depth[0], Infinity);
  assert.equal(textures.color[3], 0);
  const center = 512 * 1024 + 512;
  assert.equal(textures.depth[center], 1);
  assert.deepEqual([...textures.color.slice(center * 4, center * 4 + 4)], [0, 255, 0, 255]);
});

test("impostor follows camera orientation and keeps the node extent in the texture", () => {
  const geometry = { dimensions: [10, 10, 10], count: 2,
    positions: new Float32Array([4, 5, 5, -4, 5, 5]) };
  const points = [{ classification: 2 }, { classification: 3 }];
  const textures = createImpostorTextures(geometry, points,
    (classification) => classification === 2 ? [0, 1, 0] : [1, 0, 0], { bearing: 90, pitch: 90 });
  const edge = 2 * 1024 + 2;
  assert.equal(textures.depth[edge], 1);
  assert.deepEqual([...textures.color.slice(edge * 4, edge * 4 + 4)], [255, 0, 0, 255]);
  assert.equal(textures.depth[512 * 1024 + 512], Infinity);
});

test("LOD diagnostic rows expose the final decision, projection, thresholds and budget", () => {
  const groups = createLodDiagnosticGroups({
    decision: { active:true, expanded:false, fullResolution:false,
      passesRefinementThreshold:true, reason:"Admitido" },
    visibility: { rawVisible:true, stableVisible:true, appliedMargin:1.05,
      enterMargin:1.05, exitMargin:1.18, residenceRemainingMs:0 },
    projection: { viewportWidthPixels:1200, viewportHeightPixels:800,
      widthPixels:300, heightPixels:200, area:60000, diagonalPixels:360.555,
      projectedEquivalentAngleDegrees:17, verticalFovDegrees:36.87,
      focalLengthPixels:1200, intersectsEyePlane:false,
      ndcBounds:{ minX:-0.2, maxX:0.3, minY:-0.1, maxY:0.4 } },
    geometry: { diagonalMeters:100, distanceMeters:500, geometricAngleDegrees:11.42,
      cameraPosition:{ x:1, y:2, z:3 } },
    threshold: { configuredDegrees:15, configuredPixels:316, stablePixels:316,
      collapseHysteresisRatio:0.1 },
    budget: { pointBudget:1500000, samplePointCost:25000, fullPointCost:50000,
      admittedFullPointCount:0 },
    hierarchy: { depth:3, parentId:"r.0", childCount:4 },
    camera: { zoom:15, pitchDegrees:45, bearingDegrees:10 },
  }, { source:"sample" });
  assert.deepEqual(groups.map((group) => group.title),
    ["Decisión", "Proyección y visibilidad", "Ángulos y umbrales", "Presupuesto y jerarquía", "Cámara"]);
  assert.ok(groups.flatMap((group) => group.rows).some(([label, value]) =>
    label === "Diagonal proyectada / prioridad" && value.includes("360,56")));
  assert.ok(groups.flatMap((group) => group.rows).some(([label, value]) =>
    label === "Presupuesto total en pantalla" && value.includes("1.500.000")));
});
