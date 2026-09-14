(function initPointScapeLodSystem(globalScope) {
  class PointScapeLodSystem {
    constructor({
      config,
      tileSelection,
      getSummary = () => null,
      getCrsByFile = () => new Map(),
      lngLatToWebMercatorMeters,
      lngLatToUtm,
      getScreenBounds = () => null,
      isFullEnabled = () => true,
      now = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
    }) {
      this.config = config;
      this.tileSelection = tileSelection;
      this.getSummary = getSummary;
      this.getCrsByFile = getCrsByFile;
      this.lngLatToWebMercatorMeters = lngLatToWebMercatorMeters;
      this.lngLatToUtm = lngLatToUtm;
      this.getScreenBounds = getScreenBounds;
      this.isFullEnabled = isFullEnabled;
      this.now = now;
      this.activeTileIds = new Set();
      this.expandedTileIds = new Set();
      this.fullResolutionTileIds = new Set();
      this.visibilityByTileId = new Map();
    }

    reset() {
      this.activeTileIds = new Set();
      this.expandedTileIds = new Set();
      this.fullResolutionTileIds = new Set();
      this.visibilityByTileId = new Map();
    }

    selectActiveTiles(records, map) {
      const mapCenter = map?.getCenter?.();
      this.selectionNow = this.now();
      this.screenBounds = new Map();
      this.visibilityEvaluations = new Map();
      const useAccumulatedLod = this.getSummary()?.indexingMode === "m3no";
      const { activeTiles, nextExpandedTileIds, nextFullTileIds, nextFullPointCounts } =
        this.tileSelection.selectActiveTiles(records, {
          useAccumulatedLod,
          pointBudget: this.config.residentPointBudget || 500000,
          getTilePointCost: (tile) => tile.sampledPointCount || 0,
          getFullPointCost: (tile) => tile.fullPointCount || 0,
          shouldUseFull: (tile) => this.isFullEnabled() && tile.fullPointCount > 0 &&
            this.shouldExpandTile(tile, map, mapCenter, this.fullResolutionTileIds.has(tile.id)),
          previousActiveTileIds: this.activeTileIds,
          previousFullTileIds: this.fullResolutionTileIds,
          previousExpandedTileIds: this.expandedTileIds,
          swapHysteresis: this.config.lodSwapHysteresisRatio ?? 0.2,
          isTileVisible: (tile) => this.isTileLoadableInMap(tile, map, mapCenter),
          shouldExpandTile: (tile) => this.shouldExpandTile(tile, map, mapCenter),
          getTilePriority: (tile) => this.getVisualPriority(tile, map, mapCenter),
        });

      this.expandedTileIds = nextExpandedTileIds;
      this.fullResolutionTileIds = nextFullTileIds;
      this.fullPointCounts = nextFullPointCounts;
      this.activeTileIds = new Set(activeTiles.map((tile) => tile.id));

      const recordIds = new Set(records.map(tile => tile.id));
      for (const tileId of this.visibilityByTileId.keys()) {
        if (!recordIds.has(tileId)) this.visibilityByTileId.delete(tileId);
      }

      return activeTiles;
    }

    shouldUseFullResolution(tile, map) {
      const useFull = this.shouldExpandTile(tile, map, map?.getCenter?.(), this.fullResolutionTileIds.has(tile.id));
      if (useFull) this.fullResolutionTileIds.add(tile.id);
      else this.fullResolutionTileIds.delete(tile.id);
      return useFull;
    }

    shouldExpandTile(tile, map, mapCenter, wasExpanded = this.expandedTileIds.has(tile.id)) {
      const metric = this.getTileScreenSpaceMetric(tile, map, mapCenter);
      const threshold = metric.units === "pixels"
        ? this.getAngularThresholdPixels(map)
        : this.config.fullResolutionAngularDiagonalDegrees;
      const stableThreshold = threshold *
        (wasExpanded ? 1 - this.config.tileCollapseHysteresisRatio : 1);

      return metric.value >= stableThreshold;
    }

    getTileAngularDiagonalDegrees(tile, map, mapCenter) {
      const diagonalMeters = this.getTileDiagonalMeters(tile);
      const distanceMeters = this.getTileDistanceMeters(tile, mapCenter, map);

      if (!Number.isFinite(diagonalMeters) || diagonalMeters <= 0) {
        return 0;
      }

      if (distanceMeters === 0) {
        return Infinity;
      }

      if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
        return 0;
      }

      const angularDiagonalRadians =
        2 * Math.atan(diagonalMeters / (2 * distanceMeters));

      return angularDiagonalRadians * (180 / Math.PI);
    }

    isTileLoadableInMap(tile, map, mapCenter) {
      return this.getStableVisibility(tile, map, mapCenter).visible;
    }

    getCachedScreenBounds(tile, margin = 1.08) {
      this.screenBounds ||= new Map();
      const key = `${tile.id}:${margin}`;
      if (!this.screenBounds.has(key)) this.screenBounds.set(key, this.getScreenBounds(tile, margin));
      return this.screenBounds.get(key);
    }

    getStableVisibility(tile, map, mapCenter) {
      this.visibilityEvaluations ||= new Map();
      if (this.visibilityEvaluations.has(tile.id)) return this.visibilityEvaluations.get(tile.id);

      const now = this.selectionNow ?? this.now();
      const previous = this.visibilityByTileId.get(tile.id) || {
        visible: false,
        visibleSince: -Infinity,
        lastRawVisibleAt: -Infinity,
        metric: 0,
      };
      const enterMargin = this.config.visibilityEnterMargin ?? 1.05;
      const exitMargin = Math.max(enterMargin, this.config.visibilityExitMargin ?? 1.18);
      const screen = this.getCachedScreenBounds(tile, previous.visible ? exitMargin : enterMargin);
      const rawVisible = screen
        ? screen.visible
        : !this.isTileCompletelyBehindMapCamera(tile, map, mapCenter);
      const minimumResidenceMs = this.config.visibilityMinimumResidenceMs ?? 220;
      const lastRawVisibleAt = rawVisible ? now : previous.lastRawVisibleAt;
      const withinMinimumResidence = previous.visible &&
        now - lastRawVisibleAt < minimumResidenceMs;
      const visible = rawVisible || withinMinimumResidence;
      const metric = rawVisible
        ? Math.max(0, screen?.diagonalPixels || 0)
        : visible
          ? previous.metric
          : 0;
      const next = {
        visible,
        rawVisible,
        metric,
        screen,
        visibleSince: visible && !previous.visible ? now : previous.visibleSince,
        lastRawVisibleAt,
      };
      this.visibilityByTileId.set(tile.id, next);
      this.visibilityEvaluations.set(tile.id, next);
      return next;
    }

    getAngularThresholdPixels(map) {
      const viewportHeight = this.getMapViewportHeightPixels(map);
      const fov = this.getMapVerticalFovRadians(map);
      const angle = this.config.fullResolutionAngularDiagonalDegrees * Math.PI / 180;
      const focalLengthPixels = viewportHeight / (2 * Math.tan(fov / 2));
      return 2 * focalLengthPixels * Math.tan(angle / 2);
    }

    getTileScreenSpaceMetric(tile, map, mapCenter = map?.getCenter?.()) {
      const visibility = this.getStableVisibility(tile, map, mapCenter);
      if (visibility.screen) {
        return { value: visibility.visible ? visibility.metric : 0, units: "pixels" };
      }
      return {
        value: visibility.visible ? this.getTileAngularDiagonalDegrees(tile, map, mapCenter) : 0,
        units: "degrees",
      };
    }

    getVisualPriority(tile, map, mapCenter = map?.getCenter?.()) {
      return this.getTileScreenSpaceMetric(tile, map, mapCenter).value;
    }

    getTileCrs(tile) {
      return this.getCrsByFile().get(tile.fileIndex) || {
        kind: tile.crsKind,
        code: tile.crsCode,
        zone: tile.crsZone,
        northern: tile.crsNorthern,
      };
    }

    projectLngLatToTileMetric(lng, lat, tile) {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return null;
      }

      const crs = this.getTileCrs(tile);

      if (crs.kind === "geographic" || crs.kind === "web-mercator") {
        return this.lngLatToWebMercatorMeters(lng, lat);
      }

      if (crs.kind === "utm" && crs.zone) {
        return this.lngLatToUtm(lng, lat, crs.zone, crs.northern !== false);
      }

      if (crs.kind === "proj4" && crs.transformer?.inverse) {
        const [x, y] = crs.transformer.inverse([lng, lat]);
        return { x, y };
      }

      return this.lngLatToWebMercatorMeters(lng, lat);
    }

    isTileCompletelyBehindMapCamera(tile, map, mapCenter) {
      const pitch = map?.getPitch?.() ?? 0;

      if (pitch <= 1) {
        return false;
      }

      const cameraPosition = this.getApproxCameraMetricPosition(map, mapCenter, tile);
      const metricCenter = this.projectMapCenterToTileMetric(mapCenter, tile);

      if (!cameraPosition || !metricCenter) {
        return false;
      }

      const forward = {
        x: metricCenter.x - cameraPosition.x,
        y: metricCenter.y - cameraPosition.y,
      };

      return this.tileSelection.isTileCompletelyBehindCamera(tile, {
        position: cameraPosition,
        forward,
      });
    }

    getTileDistanceMeters(tile, mapCenter, map = globalScope.mapLibreMap) {
      const cameraPosition = this.getApproxCameraMetricPosition(map, mapCenter, tile);

      if (!cameraPosition) {
        return Infinity;
      }

      const horizontalDistanceMeters = this.getPointToBoundsDistanceMeters(
        cameraPosition,
        tile.bounds,
      );
      const verticalDistanceMeters = this.getPointToTileVerticalDistanceMeters(
        cameraPosition,
        tile,
      );

      return Math.hypot(horizontalDistanceMeters, verticalDistanceMeters);
    }

    getApproxCameraMetricPosition(map, mapCenter, tile) {
      // Mercator transform units: XY world pixels, altitude in meters. Derive
      // the eye from the actual center distance, including terrain elevation.
      const transform = map?.transform;
      const distance = transform?.cameraToCenterDistance;
      const worldSize = transform?.worldSize;
      const pixelsPerMeter = transform?.pixelsPerMeter;
      if (mapCenter && distance > 0 && worldSize > 0 && pixelsPerMeter > 0) {
        const lat = mapCenter.lat ?? mapCenter[1];
        const lng = mapCenter.lng ?? mapCenter[0];
        const pitch = (map.getPitch?.() || 0) * Math.PI / 180;
        const bearing = (map.getBearing?.() || 0) * Math.PI / 180;
        const groundPixels = distance * Math.sin(pitch);
        const centerY = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2;
        const eyeX = (lng + 180) / 360 - Math.sin(bearing) * groundPixels / worldSize;
        const eyeY = centerY + Math.cos(bearing) * groundPixels / worldSize;
        const eyeLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * eyeY))) * 180 / Math.PI;
        const metric = this.projectLngLatToTileMetric(eyeX * 360 - 180, eyeLat, tile);
        if (metric) return { ...metric, z: (transform.elevation || 0) + distance * Math.cos(pitch) / pixelsPerMeter };
      }
      const metricCenter = this.projectMapCenterToTileMetric(mapCenter, tile);

      if (!metricCenter) {
        return null;
      }

      const z = this.getApproxCameraAltitudeMeters(mapCenter, map);
      const pitchRadians = ((map?.getPitch?.() ?? 0) * Math.PI) / 180;
      const bearingRadians = ((map?.getBearing?.() ?? 0) * Math.PI) / 180;
      const groundOffsetMeters =
        Number.isFinite(z) && z > 0 ? z * Math.tan(pitchRadians) : 0;

      if (!Number.isFinite(groundOffsetMeters) || groundOffsetMeters <= 0) {
        return { ...metricCenter, z };
      }

      return {
        x: metricCenter.x - Math.sin(bearingRadians) * groundOffsetMeters,
        y: metricCenter.y - Math.cos(bearingRadians) * groundOffsetMeters,
        z,
      };
    }

    projectMapCenterToTileMetric(mapCenter, tile) {
      if (!mapCenter) {
        return null;
      }

      const lng = Number.isFinite(mapCenter.lng) ? mapCenter.lng : mapCenter[0];
      const lat = Number.isFinite(mapCenter.lat) ? mapCenter.lat : mapCenter[1];

      return this.projectLngLatToTileMetric(lng, lat, tile);
    }

    getPointToBoundsDistanceMeters(point, bounds) {
      const dx =
        point.x < bounds.minX
          ? bounds.minX - point.x
          : point.x > bounds.maxX
            ? point.x - bounds.maxX
            : 0;
      const dy =
        point.y < bounds.minY
          ? bounds.minY - point.y
          : point.y > bounds.maxY
            ? point.y - bounds.maxY
            : 0;

      return Math.hypot(dx, dy);
    }

    getPointToTileVerticalDistanceMeters(point, tile) {
      const cameraAltitudeMeters = Number.isFinite(point?.z) ? point.z : 0;
      const { minZ, maxZ } = this.getTileVerticalBounds(tile);

      if (cameraAltitudeMeters < minZ) {
        return minZ - cameraAltitudeMeters;
      }

      if (cameraAltitudeMeters > maxZ) {
        return cameraAltitudeMeters - maxZ;
      }

      return 0;
    }

    getTileVerticalBounds(tile) {
      const boundsMinZ = tile?.bounds?.minZ;
      const boundsMaxZ = tile?.bounds?.maxZ;
      const tileMinZ = tile?.minZ;
      const tileMaxZ = tile?.maxZ;
      const minZ = Number.isFinite(boundsMinZ)
        ? boundsMinZ
        : Number.isFinite(tileMinZ)
          ? tileMinZ
          : 0;
      const maxZ = Number.isFinite(boundsMaxZ)
        ? boundsMaxZ
        : Number.isFinite(tileMaxZ)
          ? tileMaxZ
          : minZ;

      return {
        minZ: Math.min(minZ, maxZ),
        maxZ: Math.max(minZ, maxZ),
      };
    }

    getTileDiagonalMeters(tile) {
      const bounds = tile?.bounds;

      if (!bounds) {
        return Number.isFinite(tile?.diagonalMeters) ? tile.diagonalMeters : 0;
      }

      const { minZ, maxZ } = this.getTileVerticalBounds(tile);
      const diagonalMeters = Math.hypot(
        bounds.maxX - bounds.minX,
        bounds.maxY - bounds.minY,
        maxZ - minZ,
      );

      return Number.isFinite(diagonalMeters) && diagonalMeters > 0
        ? diagonalMeters
        : Number.isFinite(tile?.diagonalMeters)
          ? tile.diagonalMeters
          : 0;
    }

    getApproxCameraAltitudeMeters(mapCenter, map = globalScope.mapLibreMap) {
      if (!map || !mapCenter) {
        return 0;
      }

      const pitch = map.getPitch?.() ?? 0;
      const viewportHeight = this.getMapViewportHeightPixels(map);
      const metersPerPixel = this.getApproxMetersPerPixel(map, mapCenter);
      const fovRadians = this.getMapVerticalFovRadians(map);
      const pitchRadians = pitch * (Math.PI / 180);
      const pitchExpansion = 1 / Math.max(Math.cos(pitchRadians), 0.001);
      const visibleMeters = metersPerPixel * viewportHeight;

      return visibleMeters / (2 * Math.tan(fovRadians / 2) * pitchExpansion);
    }

    getMapViewportHeightPixels(map) {
      return Math.max(
        map?.getContainer?.()?.clientHeight || globalScope.innerHeight || 900,
        1,
      );
    }

    getMapVerticalFovRadians(map) {
      const transformFov = map?.transform?.fov;

      if (Number.isFinite(transformFov) && transformFov > 0) {
        return transformFov > Math.PI
          ? transformFov * (Math.PI / 180)
          : transformFov;
      }

      return 36.87 * (Math.PI / 180);
    }

    getApproxMetersPerPixel(map, mapCenter) {
      if (!map || !mapCenter) {
        return Infinity;
      }

      const lat = Number.isFinite(mapCenter.lat) ? mapCenter.lat : mapCenter[1];
      const zoom = map.getZoom?.() ?? 0;
      const earthCircumference = 40075016.68557849;
      const latitudeScale = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);

      return (earthCircumference * latitudeScale) / (512 * 2 ** zoom);
    }
  }

  globalScope.PointScapeLodSystem = PointScapeLodSystem;
})(typeof window !== "undefined" ? window : globalThis);
