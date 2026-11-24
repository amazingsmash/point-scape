(function initVoxelImpostors(scope) {
  const radians = Math.PI / 180;
  const earthRadius = 6378137;
  const gridResolution = 48;
  const hysteresis = 0.2;

  function horizontalScale(tile) {
    return Math.max(0.01, Math.cos(tile.center.lat * radians));
  }

  function getCellSizeMeters(tile) {
    const { minX, maxX, minY, maxY, minZ, maxZ } = tile.bounds;
    const scale = horizontalScale(tile);
    return Math.max((maxX - minX) * scale, (maxY - minY) * scale, maxZ - minZ) / gridResolution;
  }

  function getSwitchDistances(cellSizeMeters, focalLengthPixels, maxPixels, verticalScale = 1) {
    const enterMeters = cellSizeMeters * Math.max(1, verticalScale) * focalLengthPixels / maxPixels;
    return { enterMeters, exitMeters: enterMeters * (1 - hysteresis) };
  }

  function shouldUseVoxels(distanceMeters, distances, wasVoxel) {
    return Number.isFinite(distanceMeters) && distanceMeters >=
      (wasVoxel ? distances.exitMeters : distances.enterMeters);
  }

  function canVoxelize(tile) {
    return tile.format === "copc" && tile.depth === 1 && tile.sampledPointCount > 0;
  }

  function voxelize(tile, points) {
    const size = getCellSizeMeters(tile);
    const { minX, minY, minZ } = tile.bounds;
    const stepXY = size / horizontalScale(tile);
    const cells = new Map();
    for (let i = 0; i < points.pointCount; i++) {
      const [lng, lat, altitude] = points.lngLatAlt.subarray(i * 3, i * 3 + 3);
      const x = earthRadius * lng * radians;
      const y = earthRadius * Math.asinh(Math.tan(lat * radians));
      const column = Math.floor((x - minX) / stepXY);
      const row = Math.floor((y - minY) / stepXY);
      const level = Math.floor((altitude - minZ) / size);
      const key = `${column},${row},${level}`;
      const classification = points.classifications[i];
      let cell = cells.get(key);
      if (!cell) {
        cell = { column, row, level, classes: new Map(), dominant: classification, maximum: 0 };
        cells.set(key, cell);
      }
      const count = (cell.classes.get(classification) || 0) + 1;
      cell.classes.set(classification, count);
      if (count > cell.maximum || (count === cell.maximum && classification < cell.dominant)) {
        cell.dominant = classification;
        cell.maximum = count;
      }
    }
    const lngLatAlt = new Float64Array(cells.size * 3);
    const classifications = new Uint8Array(cells.size);
    let i = 0;
    for (const { column, row, level, dominant } of cells.values()) {
      const x = minX + (column + 0.5) * stepXY;
      const y = minY + (row + 0.5) * stepXY;
      lngLatAlt[i * 3] = x / (earthRadius * radians);
      lngLatAlt[i * 3 + 1] = Math.atan(Math.sinh(y / earthRadius)) / radians;
      lngLatAlt[i * 3 + 2] = minZ + (level + 0.5) * size;
      classifications[i++] = dominant;
    }
    return { voxelSizeMeters: size, points: { lngLatAlt, classifications, pointCount: cells.size } };
  }

  function createCubeMesh() {
    const corners = [
      [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
      [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
    ];
    // Mercator Y points south. Triangles are wound for the map's custom layer.
    const faces = [
      [0, 1, 2, 3, 0.57], [7, 6, 5, 4, 1.0], [0, 4, 5, 1, 0.84],
      [3, 2, 6, 7, 0.72], [0, 3, 7, 4, 0.79], [1, 5, 6, 2, 0.66],
    ];
    return new Float32Array(faces.flatMap(([a, b, c, d, light]) =>
      [a, b, c, a, c, d].flatMap(index => [...corners[index], light])));
  }

  const api = { horizontalScale, getCellSizeMeters, getSwitchDistances, shouldUseVoxels,
    canVoxelize, voxelize, createCubeMesh };
  if (typeof module !== "undefined") module.exports = api;
  scope.PointScapeVoxelImpostors = api;
})(globalThis);
