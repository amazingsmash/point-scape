(function initPointScapeLodSystem(globalScope) {
  class PointScapeLodSystem {
    constructor({
      config,
      tileSelection,
      getSummary = () => null,
      getCrsByFile = () => new Map(),
      lngLatToWebMercatorMeters,
      lngLatToUtm,
    }) {
      this.config = config;
      this.tileSelection = tileSelection;
      this.getSummary = getSummary;
      this.getCrsByFile = getCrsByFile;
      this.lngLatToWebMercatorMeters = lngLatToWebMercatorMeters;
      this.lngLatToUtm = lngLatToUtm;
      this.activeTileIds = new Set();
      this.expandedTileIds = new Set();
    }

    reset() {
      this.activeTileIds = new Set();
      this.expandedTileIds = new Set();
    }

    selectActiveTiles(records, map) {
      const mapCenter = map?.getCenter?.();
      const useAccumulatedLod = this.getSummary()?.indexingMode === "m3no";
      const { activeTiles, nextExpandedTileIds } =
        this.tileSelection.selectActiveTiles(records, {
          useAccumulatedLod,
          previousExpandedTileIds: this.expandedTileIds,
          isTileVisible: (tile) => this.isTileLoadableInMap(tile, map, mapCenter),
          shouldExpandTile: (tile) => this.shouldExpandTile(tile, map, mapCenter),
        });

      this.expandedTileIds = nextExpandedTileIds;
      this.activeTileIds = new Set(activeTiles.map((tile) => tile.id));

      return activeTiles;
    }

    shouldExpandTile(tile, map, mapCenter) {
      const wasExpanded = this.expandedTileIds.has(tile.id);
      const angularDiagonalDegrees = this.getTileAngularDiagonalDegrees(
        tile,
        map,
        mapCenter,
      );
      const angularThresholdDegrees =
        this.config.fullResolutionAngularDiagonalDegrees *
        (wasExpanded ? 1 - this.config.tileCollapseHysteresisRatio : 1);

      return angularDiagonalDegrees >= angularThresholdDegrees;
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
      return !this.isTileCompletelyBehindMapCamera(tile, map, mapCenter);
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
      const pitchExpansion = 1 / Math.max(Math.cos(pitchRadians), 0.28);
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
