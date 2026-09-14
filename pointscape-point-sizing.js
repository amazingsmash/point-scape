(function initPointScapePointSizing(scope) {
  function getProjectionPixelsPerMercator(matrix, width, height) {
    if (!matrix?.length || !(width > 0) || !(height > 0)) return 0;
    const columnScale = (column) => Math.hypot(
      matrix[column] * width / 2,
      matrix[column + 1] * height / 2,
    );
    return Math.max(columnScale(0), columnScale(4), columnScale(8));
  }

  function getProjectedPointRadiusPixels({
    physicalRadiusMeters,
    metersToMercator,
    projectionPixelsPerMercator,
    clipW,
    minimumRadiusPixels,
    maximumRadiusPixels,
  }) {
    const minimum = Math.max(0, minimumRadiusPixels || 0);
    const maximum = Math.max(minimum, maximumRadiusPixels || minimum);
    if (!(physicalRadiusMeters > 0) || !(metersToMercator > 0) ||
        !(projectionPixelsPerMercator > 0) || !Number.isFinite(clipW)) {
      return minimum;
    }
    const projected = physicalRadiusMeters * metersToMercator *
      projectionPixelsPerMercator / Math.max(Math.abs(clipW), 1e-7);
    return Math.min(maximum, Math.max(minimum, projected));
  }

  const api = { getProjectionPixelsPerMercator, getProjectedPointRadiusPixels };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  scope.PointScapePointSizing = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
