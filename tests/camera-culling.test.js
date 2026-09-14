const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isTileCompletelyBehindCamera,
  selectActiveTiles,
} = require("../tile-selection.js");

for (const useAccumulatedLod of [false, true]) {
  test(`LOD spends a constrained budget on largest angles independent of record order (${useAccumulatedLod})`, () => {
    const records = [
      { id: "root", childIds: ["far", "near"], cost: 10, angle: 100 },
      { id: "far", parentId: "root", childIds: ["far-detail"], cost: 10, angle: 20 },
      { id: "near", parentId: "root", childIds: ["near-detail"], cost: 10, angle: 60 },
      { id: "far-detail", parentId: "far", childIds: [], cost: 50, angle: 10 },
      { id: "near-detail", parentId: "near", childIds: [], cost: 50, angle: 30 },
    ];
    const options = { useAccumulatedLod, pointBudget: useAccumulatedLod ? 80 : 60,
      shouldExpandTile: () => true, getTilePriority: (tile) => tile.angle,
      getTilePointCost: (tile) => tile.cost };
    const run = (input) => selectActiveTiles(input, options).activeTiles.map((tile) => tile.id).sort();
    const result = run(records);
    assert.ok(result.includes("near-detail"));
    assert.ok(!result.includes("far-detail"));
    assert.deepEqual(run([...records].reverse().map((tile) => ({ ...tile, childIds: [...tile.childIds].reverse() }))), result);
    records[1].angle = 90; // Moving the camera changes which branch wins.
    records[2].angle = 20;
    records[3].angle = 45;
    records[4].angle = 10;
    assert.ok(run(records).includes("far-detail"));
    assert.ok(!run(records).includes("near-detail"));
  });
}

for (const useAccumulatedLod of [false, true]) {
  test(`LOD respects the payload budget (accumulated=${useAccumulatedLod})`, () => {
    const records = [
      { id: "r", childIds: ["a", "b"], cost: 10 },
      { id: "a", parentId: "r", childIds: ["aa"], cost: 30 },
      { id: "b", parentId: "r", childIds: [], cost: 30 },
      { id: "aa", parentId: "a", childIds: [], cost: 100 },
    ];
    const result = selectActiveTiles(records, {
      shouldExpandTile: () => true, useAccumulatedLod,
      pointBudget: 75, getTilePointCost: (tile) => tile.cost,
    });
    assert.ok(result.activeTiles.reduce((sum, tile) => sum + tile.cost, 0) <= 75);
    assert.equal(result.activeTiles.some((tile) => tile.id === "aa"), false);
    assert.equal(result.activeTiles.some((tile) => tile.id === "b"), true);
  });
}

test("LOD applies the point budget to multiple roots and keeps the highest-priority roots", () => {
  const records = [
    { id: "small", childIds: [], cost: 30000, angle: 5 },
    { id: "near", childIds: [], cost: 40000, angle: 50 },
    { id: "middle", childIds: [], cost: 35000, angle: 20 },
  ];
  const result = selectActiveTiles(records, {
    pointBudget: 60000,
    getTilePointCost: (tile) => tile.cost,
    getTilePriority: (tile) => tile.angle,
  });

  assert.deepEqual(result.activeTiles.map((tile) => tile.id), ["near"]);
  assert.ok(result.activeTiles.reduce((sum, tile) => sum + tile.cost, 0) <= 60000);
});

test("detects a tile whose bounding box is completely behind the camera", () => {
  const camera = {
    position: { x: 0, y: 0 },
    forward: { x: 0, y: 1 },
  };
  const behindTile = {
    bounds: { minX: -10, minY: -30, maxX: 10, maxY: -5 },
  };
  const partlyVisibleTile = {
    bounds: { minX: -10, minY: -5, maxX: 10, maxY: 5 },
  };

  assert.equal(isTileCompletelyBehindCamera(behindTile, camera), true);
  assert.equal(isTileCompletelyBehindCamera(partlyVisibleTile, camera), false);
});

test("does not activate or expand a tile completely behind the camera", () => {
  const camera = {
    position: { x: 0, y: 0 },
    forward: { x: 0, y: 1 },
  };
  const records = [
    {
      id: "root",
      parentId: null,
      fileIndex: 0,
      childIds: ["front-child", "behind-child"],
      bounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
    },
    {
      id: "front-child",
      parentId: "root",
      fileIndex: 0,
      childIds: [],
      bounds: { minX: -20, minY: 20, maxX: 20, maxY: 80 },
    },
    {
      id: "behind-child",
      parentId: "root",
      fileIndex: 0,
      childIds: ["behind-grandchild"],
      bounds: { minX: -20, minY: -80, maxX: 20, maxY: -20 },
    },
    {
      id: "behind-grandchild",
      parentId: "behind-child",
      fileIndex: 0,
      childIds: [],
      bounds: { minX: -20, minY: -80, maxX: 20, maxY: -50 },
    },
  ];

  const { activeTiles, nextExpandedTileIds } = selectActiveTiles(records, {
    isTileVisible: (tile) => !isTileCompletelyBehindCamera(tile, camera),
    shouldExpandTile: () => true,
  });

  assert.deepEqual(
    activeTiles.map((tile) => tile.id),
    ["front-child"],
  );
  assert.deepEqual([...nextExpandedTileIds], ["root"]);
  assert.equal(nextExpandedTileIds.has("behind-child"), false);
});
