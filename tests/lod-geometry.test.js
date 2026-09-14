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

test("screen visibility has different enter/exit margins and a minimum residence", () => {
  let now = 0;
  let edge = 1.04;
  const system = new globalThis.PointScapeLodSystem({
    config: {
      fullResolutionAngularDiagonalDegrees: 15,
      tileCollapseHysteresisRatio: 0.1,
      visibilityEnterMargin: 1.05,
      visibilityExitMargin: 1.18,
      visibilityMinimumResidenceMs: 220,
    },
    tileSelection: selection,
    lngLatToWebMercatorMeters: (lng, lat) => ({ x: lng, y: lat }),
    getScreenBounds: (_tile, margin) => ({
      visible: edge <= margin,
      area: 100,
      diagonalPixels: 20,
    }),
    now: () => now,
  });
  const root = { id:"r", parentId:null, childIds:[], sampledPointCount:10 };
  const map = { getCenter:() => ({ lng:0, lat:0 }), getContainer:() => ({ clientHeight:1000 }) };
  const visible = () => system.selectActiveTiles([root], map).length === 1;

  assert.equal(visible(), true, "enters through the tighter margin");
  edge = 1.12; now = 50;
  assert.equal(visible(), true, "stays visible through the wider exit margin");
  edge = 1.3; now = 100;
  assert.equal(visible(), true, "minimum residence prevents a one-frame disappearance");
  now = 300;
  assert.equal(visible(), false, "eventually exits after the residence interval");
  edge = 1.12; now = 310;
  assert.equal(visible(), false, "does not immediately re-enter inside the hysteresis band");
  edge = 1.04; now = 320;
  assert.equal(visible(), true);
  now = 5000;
  assert.equal(visible(), true);
  edge = 1.3; now = 5001;
  assert.equal(visible(), true, "a transient miss is suppressed even after a long visible period");
  now = 5221;
  assert.equal(visible(), false);
});

test("expansion and budget priority use the same projected screen metric", () => {
  const system = new globalThis.PointScapeLodSystem({
    config: { fullResolutionAngularDiagonalDegrees:15, tileCollapseHysteresisRatio:0.1 },
    tileSelection: selection,
    lngLatToWebMercatorMeters: (lng, lat) => ({ x:lng, y:lat }),
    getScreenBounds: () => ({ visible:true, area:120000, diagonalPixels:500 }),
  });
  const map = {
    getCenter:() => ({ lng:0, lat:0 }),
    getContainer:() => ({ clientHeight:1000 }),
    transform:{ fov:36.87 * Math.PI / 180 },
  };
  const tile = { id:"r", sampledPointCount:25000 };
  system.selectionNow = 0;
  system.screenBounds = new Map();
  system.visibilityEvaluations = new Map();
  assert.equal(system.getVisualPriority(tile, map), 500);
  assert.equal(system.shouldExpandTile(tile, map, map.getCenter()), true);
});
