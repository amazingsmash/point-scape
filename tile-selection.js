(function initPointScapeTileSelection(globalScope) {
  function selectActiveTiles(records, options = {}) {
    const {
      isTileVisible = () => true,
      shouldExpandTile = () => false,
      useAccumulatedLod = false,
      previousExpandedTileIds = new Set(),
    } = options;
    const recordsById = new Map(records.map((record) => [record.id, record]));
    const rootTiles = records
      .filter((record) => !record.parentId)
      .sort((left, right) => (left.fileIndex || 0) - (right.fileIndex || 0));
    const activeTiles = [];
    const nextExpandedTileIds = new Set();

    rootTiles.forEach((tile) => {
      collectActiveTiles({
        tile,
        recordsById,
        isTileVisible,
        shouldExpandTile,
        useAccumulatedLod,
        previousExpandedTileIds,
        activeTiles,
        nextExpandedTileIds,
      });
    });

    return {
      activeTiles,
      nextExpandedTileIds,
    };
  }

  function collectActiveTiles({
    tile,
    recordsById,
    isTileVisible,
    shouldExpandTile,
    useAccumulatedLod,
    previousExpandedTileIds,
    activeTiles,
    nextExpandedTileIds,
  }) {
    if (!isTileVisible(tile)) {
      return;
    }

    if (useAccumulatedLod) {
      activeTiles.push(tile);
    }

    const childTiles = (tile.childIds || [])
      .map((childId) => recordsById.get(childId))
      .filter(Boolean);

    if (!childTiles.length) {
      if (!useAccumulatedLod) {
        activeTiles.push(tile);
      }
      return;
    }

    if (!shouldExpandTile(tile, previousExpandedTileIds)) {
      if (!useAccumulatedLod) {
        activeTiles.push(tile);
      }
      return;
    }

    nextExpandedTileIds.add(tile.id);
    const activeTileCountBeforeChildren = activeTiles.length;
    childTiles.forEach((childTile) => {
      collectActiveTiles({
        tile: childTile,
        recordsById,
        isTileVisible,
        shouldExpandTile,
        useAccumulatedLod,
        previousExpandedTileIds,
        activeTiles,
        nextExpandedTileIds,
      });
    });

    if (
      !useAccumulatedLod &&
      activeTiles.length === activeTileCountBeforeChildren
    ) {
      activeTiles.push(tile);
    }
  }

  function isTileCompletelyBehindCamera(tile, camera) {
    const bounds = tile?.bounds;
    const cameraPosition = camera?.position;
    const forward = camera?.forward;

    if (!bounds || !cameraPosition || !forward) {
      return false;
    }

    const forwardLength = Math.hypot(forward.x || 0, forward.y || 0);

    if (!Number.isFinite(forwardLength) || forwardLength <= 0) {
      return false;
    }

    const corners = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.minX, y: bounds.maxY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
    ];

    return corners.every((corner) => {
      const dot =
        (corner.x - cameraPosition.x) * forward.x +
        (corner.y - cameraPosition.y) * forward.y;

      return dot <= 0;
    });
  }

  const api = {
    isTileCompletelyBehindCamera,
    selectActiveTiles,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.PointScapeTileSelection = api;
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : this,
);
