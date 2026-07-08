const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isTileCompletelyBehindCamera,
  selectActiveTiles,
} = require("../tile-selection.js");

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
