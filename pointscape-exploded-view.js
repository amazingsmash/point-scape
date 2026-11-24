(function initPointScapeExplodedView(scope) {
  function createLayout(tiles, verticalScale = 1) {
    if (!tiles?.length) return { maxDepth: 0, levelSpacingMeters: 0 };
    const maxDepth = Math.max(0, ...tiles.map((tile) => tile.depth || 0));
    const roots = tiles.filter((tile) => !tile.parentId);
    const verticalSpan = Math.max(0, ...roots.map((tile) =>
      Math.max(0, (tile.maxZ ?? tile.bounds?.maxZ ?? 0) -
        (tile.minZ ?? tile.bounds?.minZ ?? 0))));
    const horizontalSpan = Math.max(0, ...roots.map((tile) => tile.diagonalMeters || 0));
    return {
      maxDepth,
      levelSpacingMeters: Math.max(50, verticalSpan * verticalScale * 1.25, horizontalSpan * 0.08),
    };
  }

  function offsetMeters(depth, layout) {
    if (!layout?.levelSpacingMeters) return 0;
    return (Math.max(0, layout.maxDepth - (depth || 0)) + 1) *
      layout.levelSpacingMeters;
  }

  function easeInOutCubic(progress) {
    const t = Math.max(0, Math.min(1, progress));
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function sourceForNode(tile) {
    return !tile.childIds?.length && tile.fullPointCount > 0 ? "full" : "sample";
  }

  function decimatePoints(points, fraction) {
    const total = points?.pointCount || points?.classifications?.length || 0;
    if (!total) return null;
    const count = Math.min(total, Math.max(1, Math.ceil(total * fraction)));
    if (count === total) return points;
    const lngLatAlt = new Float64Array(count * 3);
    const classifications = new Uint8Array(count);
    for (let index = 0; index < count; index += 1) {
      const source = Math.floor((index + 0.5) * total / count);
      lngLatAlt.set(points.lngLatAlt.subarray(source * 3, source * 3 + 3), index * 3);
      classifications[index] = points.classifications[source];
    }
    return { lngLatAlt, classifications, pointCount: count };
  }

  class Loader {
    constructor({ read, publish, yieldFrame = () => Promise.resolve(), batchSize = 16 }) {
      Object.assign(this, { read, publish, yieldFrame, batchSize });
      this.generation = 0;
    }

    cancel() {
      this.generation += 1;
    }

    async start(tiles, fraction) {
      const generation = ++this.generation;
      const descriptors = [];
      let failedNodes = 0;
      let sourcePointCount = 0;
      let renderedPointCount = 0;
      const safeFraction = Number.isFinite(fraction)
        ? Math.max(0.01, Math.min(1, fraction)) : 0.1;
      for (let index = 0; index < tiles.length; index += 1) {
        if (generation !== this.generation) return null;
        const tile = tiles[index];
        const source = sourceForNode(tile);
        try {
          const record = await this.read(tile.id, source);
          if (generation !== this.generation) return null;
          const points = decimatePoints(record?.points, safeFraction);
          if (!points) {
            failedNodes += 1;
          } else {
            const originalCount = record.points.pointCount || record.points.classifications.length;
            sourcePointCount += originalCount;
            renderedPointCount += points.pointCount;
            descriptors.push({ id: tile.id, source, points, pointCount: points.pointCount,
              renderKey: `${tile.id}:${source}:exploded:${points.pointCount}` });
          }
        } catch (error) {
          if (generation !== this.generation) return null;
          failedNodes += 1;
          console.warn("Exploded View payload read failed", tile.id, error);
        }
        if ((index + 1) % this.batchSize === 0 || index + 1 === tiles.length) {
          this.publish(descriptors.slice(), { loadedNodes: index + 1, totalNodes: tiles.length,
            failedNodes, sourcePointCount, renderedPointCount, fraction: safeFraction });
          await this.yieldFrame();
        }
      }
      return { loadedNodes: tiles.length, failedNodes, renderedPointCount };
    }
  }

  scope.PointScapeExplodedView = {
    createLayout, offsetMeters, easeInOutCubic, sourceForNode, decimatePoints, Loader,
  };
})(typeof window !== "undefined" ? window : globalThis);
