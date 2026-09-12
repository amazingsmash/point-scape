(function initPointScapeTileSelection(globalScope) {
  function selectActiveTiles(records, options = {}) {
    const {
      isTileVisible = () => true,
      shouldExpandTile = () => false,
      useAccumulatedLod = false,
      previousExpandedTileIds = new Set(),
      pointBudget = Infinity,
      getTilePointCost = () => 0,
      getTilePriority = () => 1,
    } = options;
    const recordsById = new Map(records.map((record) => [record.id, record]));
    const rootCandidates = records.filter((tile) => !tile.parentId && isTileVisible(tile))
      .sort((left, right) => {
        const priorityDifference = getTilePriority(right) - getTilePriority(left);
        return priorityDifference || String(left.id).localeCompare(String(right.id));
      });
    const roots = [];
    let used = 0;
    for (const tile of rootCandidates) {
      const cost = getTilePointCost(tile);
      if (used + cost > pointBudget) continue;
      roots.push(tile);
      used += cost;
    }
    const active = new Map(roots.map((tile) => [tile.id, tile]));
    const nextExpandedTileIds = new Set();
    // Global max-heap: priority must not depend on file/child traversal order.
    const heap = [];
    const precedes = (a, b) => a.priority > b.priority ||
      (a.priority === b.priority && String(a.tile.id) < String(b.tile.id));
    function enqueue(tile) {
      if (!shouldExpandTile(tile, previousExpandedTileIds)) return;
      const children = (tile.childIds || []).map((id) => recordsById.get(id))
        .filter((child) => child && isTileVisible(child));
      if (!children.length) return;
      const priority = getTilePriority(tile);
      const item = { tile, children, priority: Number.isNaN(priority) ? 0 : priority };
      let index = heap.length;
      heap.push(item);
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (!precedes(item, heap[parent])) break;
        heap[index] = heap[parent];
        index = parent;
      }
      heap[index] = item;
    }
    function pop() {
      const first = heap[0];
      const last = heap.pop();
      if (heap.length) {
        let index = 0;
        while (index * 2 + 1 < heap.length) {
          let child = index * 2 + 1;
          if (child + 1 < heap.length && precedes(heap[child + 1], heap[child])) child += 1;
          if (!precedes(heap[child], last)) break;
          heap[index] = heap[child];
          index = child;
        }
        heap[index] = last;
      }
      return first;
    }
    roots.forEach(enqueue);
    while (heap.length) {
      const { tile, children } = pop();
      const extraCost = children.reduce((sum, child) => sum + getTilePointCost(child), 0)
        - (useAccumulatedLod ? 0 : getTilePointCost(tile));
      if (used + extraCost > pointBudget) continue;
      used += extraCost;
      nextExpandedTileIds.add(tile.id);
      if (!useAccumulatedLod) active.delete(tile.id);
      for (const child of children) {
        active.set(child.id, child);
        enqueue(child);
      }
    }
    return { activeTiles: [...active.values()], nextExpandedTileIds };
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
