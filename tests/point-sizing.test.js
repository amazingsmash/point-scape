const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getProjectionPixelsPerMercator,
  getProjectedPointRadiusPixels,
} = require("../pointscape-point-sizing.js");

test("projection scale converts Mercator offsets to framebuffer pixels", () => {
  const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  assert.equal(getProjectionPixelsPerMercator(identity, 100, 200), 100);
});

test("physical point radius follows perspective distance", () => {
  const parameters = {
    physicalRadiusMeters: 0.08,
    metersToMercator: 0.5,
    projectionPixelsPerMercator: 1000,
    minimumRadiusPixels: 0.75,
    maximumRadiusPixels: 24,
  };
  const near = getProjectedPointRadiusPixels({ ...parameters, clipW: 2 });
  const far = getProjectedPointRadiusPixels({ ...parameters, clipW: 4 });
  assert.equal(near, 20);
  assert.equal(far, 10);
});

test("projected point radius respects minimum and maximum screen clamps", () => {
  const base = {
    physicalRadiusMeters: 0.08,
    metersToMercator: 1,
    projectionPixelsPerMercator: 1000,
    minimumRadiusPixels: 0.75,
    maximumRadiusPixels: 24,
  };
  assert.equal(getProjectedPointRadiusPixels({ ...base, clipW: 10000 }), 0.75);
  assert.equal(getProjectedPointRadiusPixels({ ...base, clipW: 0.01 }), 24);
});
