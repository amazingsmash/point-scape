const test = require("node:test");
const assert = require("node:assert/strict");
require("../pointscape-lod-system.js");
const selection = require("../tile-selection.js");
function lod() {
  return new globalThis.PointScapeLodSystem({
    config: { fullResolutionAngularDiagonalDegrees: 15, tileCollapseHysteresisRatio: 0.1 },
    tileSelection: selection,
    lngLatToWebMercatorMeters: (lng, lat) => ({ x: lng, y: lat }),
  });
}

test("full leaf payload requires its own angular threshold and retains hysteresis", () => {
  const system = lod();
  let angle = 10;
  system.getTileAngularDiagonalDegrees = () => angle;
  const leaf = { id: "leaf" };
  assert.equal(system.shouldUseFullResolution(leaf, {}), false);
  angle = 16;
  assert.equal(system.shouldUseFullResolution(leaf, {}), true);
  angle = 14;
  assert.equal(system.shouldUseFullResolution(leaf, {}), true);
  angle = 13;
  assert.equal(system.shouldUseFullResolution(leaf, {}), false);
  angle = 14;
  assert.equal(system.shouldUseFullResolution(leaf, {}), false);
});

test("camera height includes terrain and high pitch has no artificial altitude floor", () => {
  const system = lod();
  let bearing = 0;
  const map = { getPitch: () => 80, getBearing: () => bearing,
    transform: { cameraToCenterDistance: 1000, worldSize: 100000, pixelsPerMeter: 2, elevation: 900 } };
  const tile = { crsKind: "geographic" };
  const eye = system.getApproxCameraMetricPosition(map, { lng: 0, lat: 0 }, tile);
  assert.ok(Math.abs(eye.z - (900 + 500 * Math.cos(80 * Math.PI / 180))) < 1e-9);
  assert.ok(eye.y < 0, "north-facing camera is south of the target");
  bearing = 90;
  const eastEye = system.getApproxCameraMetricPosition(map, { lng: 0, lat: 0 }, tile);
  assert.ok(eastEye.x < 0, "east-facing camera is west of the target");
  assert.ok(Math.abs(eastEye.y) < 1e-9);
});

test("angular size increases when approaching the same node", () => {
  const system = lod();
  system.getTileDiagonalMeters = () => 100;
  let distance = 1000;
  system.getTileDistanceMeters = () => distance;
  const far = system.getTileAngularDiagonalDegrees({}, {});
  distance = 100;
  assert.ok(system.getTileAngularDiagonalDegrees({}, {}) > far);
});
