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
      getFullPointCost = () => 0,
      shouldUseFull = () => false,
      previousActiveTileIds = new Set(),
      previousFullTileIds = new Set(),
      swapHysteresis = 0.15,
    } = options;
    const recordsById = new Map(records.map((record) => [record.id, record]));
    const rootCandidates = records.filter((tile) => !tile.parentId && isTileVisible(tile))
      .sort((left, right) => {
        const stablePriority = tile => getTilePriority(tile) *
          (previousActiveTileIds.has(tile.id) ? 1 + swapHysteresis : 1);
        const priorityDifference = stablePriority(right) - stablePriority(left);
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
    const nextFullTileIds = new Set();
    const nextFullPointCounts = new Map();
    // Global max-heap: priority must not depend on file/child traversal order.
    const heap = [];
    const precedes = (a, b) => a.priority > b.priority ||
      (a.priority === b.priority && String(a.orderId) < String(b.orderId));
    function enqueue(tile) {
      if (!tile.childIds?.length && shouldUseFull(tile)) {
        push({ tile, children: [], full: true, priority: getTilePriority(tile) *
          (previousFullTileIds.has(tile.id) ? 1 + swapHysteresis : 1) });
      }
      if (!shouldExpandTile(tile, previousExpandedTileIds)) return;
      const children = (tile.childIds || []).map((id) => recordsById.get(id))
        .filter((child) => child && isTileVisible(child));
      if (!children.length) return;
      if (useAccumulatedLod) {
        for (const child of children) {
          push({ tile, children: [child], priority: getTilePriority(child) *
            (previousActiveTileIds.has(child.id) ? 1 + swapHysteresis : 1) });
        }
      } else {
        push({ tile, children, priority: getTilePriority(tile) *
          (previousExpandedTileIds.has(tile.id) ? 1 + swapHysteresis : 1) });
      }
    }
    function push(item) {
      item.orderId = item.full ? `${item.tile.id}:full` : `${item.tile.id}:${item.children.map(child => child.id).sort().join(",")}`;
      if (Number.isNaN(item.priority)) item.priority = 0;
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
      const { tile, children, full } = pop();
      if (full) {
        const current = nextFullPointCounts.get(tile.id) ?? getTilePointCost(tile);
        const maximum = getFullPointCost(tile);
        const count = Math.min(maximum, Math.max(current + 1024, current * 2));
        const extra = Math.max(0, count - current);
        if (used + extra <= pointBudget) {
          used += extra;
          nextFullTileIds.add(tile.id);
          nextFullPointCounts.set(tile.id, count);
          if (count < maximum) push({ tile, children: [], full: true,
            priority: getTilePriority(tile) * Math.sqrt(Math.max(1, getTilePointCost(tile)) / Math.max(1, count)) *
              (previousFullTileIds.has(tile.id) ? 1 + swapHysteresis : 1) });
        }
        continue;
      }
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
    return { activeTiles: [...active.values()], nextExpandedTileIds, nextFullTileIds,
      nextFullPointCounts, usedPointBudget: used, remainingPointBudget: Math.max(0, pointBudget - used) };
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
