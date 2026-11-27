const lasPalmas = {
  name: "Las Palmas de Gran Canaria",
  coordinates: [-15.4363, 28.1235],
};

const mapLibreSources = [
  "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js",
  "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.6.2/maplibre-gl.min.js",
];

const proj4Sources = [
  "https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.12.1/proj4.min.js",
  "https://cdn.jsdelivr.net/npm/proj4@2.12.1/dist/proj4.min.js",
];

const layerIds = {
  streetSource: "street-map",
  streetLayer: "street-map-layer",
  satelliteSource: "satellite-photos",
  satelliteLayer: "satellite-photos-layer",
  terrainSource: "terrain-dem",
  hillshadeLayer: "terrain-hillshade",
  blockBoundsSource: "las-block-bounds",
  blockBoundsLayer: "las-block-bounds-layer",
  blockLabelsLayer: "las-block-labels-layer",
  pointCloudLayer: "las-palmas-webgl-point-cloud",
  detailBoxesLayer: "las-lod-detail-boxes-layer",
};

const pointCloudConfig = {
  tileSamplePoints: 25000,
  m3noGridCellsPerAxis: 32,
  tileMinDiagonalMeters: 100,
  tileMaxDepth: 8,
  fullResolutionAngularDiagonalDegrees: 15,
  tileCollapseHysteresisRatio: 0.1,
  lodSwapHysteresisRatio: 0.2,
  visibilityEnterMargin: 1.05,
  visibilityExitMargin: 1.18,
  visibilityMinimumResidenceMs: 220,
  lodTransitionHoldMs: 220,
  impostorMode: "voxel",
  impostorDebug: false,
  voxelMaxPixels: 5,
  imageImpostorSize: PointScapeImageImpostors.defaultTextureSize,
  imageImpostorAreaRatio: 1,
  imageImpostorReuse: 15,
  pointRadiusCentimeters: 8,
  pointMinimumRadiusPixels: 0.75,
  pointMaximumRadiusPixels: 24,
  edlEnabled: true,
  edlStrength: 1,
  edlRadiusPixels: 2,
  edlNeighborCount: 8,
  parseYieldEveryPoints: 5000,
  progressiveLoadingPreview: true,
  progressiveTilePointInterval: 100000,
  progressiveTileMinimumMs: 300,
  indexedDbWriteBatchSize: 24,
  residentPointBudget: 1500000,
  flyToClearanceMeters: 1000,
  explodedPointFraction: 0.1,
};

const volatileTileDbConfig = {
  name: "pointscape-volatile-tiles",
  version: 2,
  storeName: "tiles",
};
const pointCloudVertexStrideBytes = 16;
const maxShaderClassColors = 32;

const lasClassifications = [
  { code: 0, label: "Created, never classified", color: [0.9, 0.04, 0.12, 0.86] },
  { code: 1, label: "Unclassified", color: [0.86, 0.08, 0.14, 0.86] },
  { code: 2, label: "Ground", color: [0.58, 0.35, 0.18, 0.9] },
  { code: 3, label: "Low vegetation", color: [0.55, 0.78, 0.28, 0.88] },
  { code: 4, label: "Medium vegetation", color: [0.28, 0.66, 0.22, 0.88] },
  { code: 5, label: "High vegetation", color: [0.1, 0.48, 0.16, 0.88] },
  { code: 6, label: "Building", color: [0.95, 0.48, 0.12, 0.9] },
  { code: 7, label: "Low point / noise", color: [0.42, 0.45, 0.5, 0.72] },
  { code: 8, label: "Model key point", color: [1, 0.95, 0.28, 0.92] },
  { code: 9, label: "Water", color: [0.1, 0.42, 0.92, 0.9] },
  { code: 10, label: "Rail", color: [0.5, 0.32, 0.9, 0.9] },
  { code: 11, label: "Road surface", color: [0.95, 0.78, 0.12, 0.9] },
  { code: 17, label: "Bridge deck", color: [0.7, 0.28, 0.96, 0.9] },
  { code: 18, label: "High noise", color: [0.98, 0.18, 0.7, 0.9] },
];
const fallbackLasClassColor = [0.94, 0.05, 0.14, 0.86];
const lasClassColors = new Map(
  lasClassifications.map(({ code, color }) => [code, color]),
);

const splashScreen = document.querySelector("#app-splash");
const splashLogo = document.querySelector(".splash-logo-card img");
const institutionalLogo = document.querySelector(".institutional-logo");
const status = document.querySelector("#map-status");
const menuToggle = document.querySelector("#menu-toggle");
const menuContent = document.querySelector("#menu-content");
const baseLayerInputs = document.querySelectorAll("input[name='base-layer']");
const terrainToggle = document.querySelector("#terrain-toggle");
const pitchControl = document.querySelector("#pitch-control");
const pitchValue = document.querySelector("#pitch-value");
const terrainExaggerationControl = document.querySelector("#terrain-exaggeration-control");
const terrainExaggerationValue = document.querySelector("#terrain-exaggeration-value");
const pointOffsetControl = document.querySelector("#point-offset-control");
const pointOffsetValue = document.querySelector("#point-offset-value");
const pointRadiusControl = document.querySelector("#point-radius-control");
const pointRadiusValue = document.querySelector("#point-radius-value");
const pointMinRadiusControl = document.querySelector("#point-min-radius-control");
const pointMinRadiusValue = document.querySelector("#point-min-radius-value");
const pointMaxRadiusControl = document.querySelector("#point-max-radius-control");
const pointMaxRadiusValue = document.querySelector("#point-max-radius-value");
const lasIndexingModeInputs = document.querySelectorAll(
  "input[name='las-indexing-mode']",
);
const fullResolutionToggle = document.querySelector("#full-resolution-toggle");
const blockBoundsToggle = document.querySelector("#block-bounds-toggle");
const blockDetailsToggle = document.querySelector("#block-details-toggle");
const lodDetailBoxesToggle = document.querySelector("#lod-detail-boxes-toggle");
const lodScreenDiagonalControl = document.querySelector(
  "#lod-screen-diagonal-control",
);
const lodScreenDiagonalValue = document.querySelector("#lod-screen-diagonal-value");
const lodHysteresisControl = document.querySelector("#lod-hysteresis-control");
const lodHysteresisValue = document.querySelector("#lod-hysteresis-value");
const lodPointBudgetControl = document.querySelector("#lod-point-budget-control");
const lodPointBudgetValue = document.querySelector("#lod-point-budget-value");
const tileMinDiagonalControl = document.querySelector("#tile-min-diagonal-control");
const tileMaxDepthControl = document.querySelector("#tile-max-depth-control");
const depthBiasControl = document.querySelector("#depth-bias-control");
const depthBiasValue = document.querySelector("#depth-bias-value");
const edlToggle = document.querySelector("#edl-toggle");
const edlStrengthControl = document.querySelector("#edl-strength-control");
const edlStrengthValue = document.querySelector("#edl-strength-value");
const edlRadiusControl = document.querySelector("#edl-radius-control");
const edlRadiusValue = document.querySelector("#edl-radius-value");
const edlNeighborsControl = document.querySelector("#edl-neighbors-control");
const edlNeighborsValue = document.querySelector("#edl-neighbors-value");
const classificationLegend = document.querySelector("#classification-legend");
const randomizeClassificationColorsButton = document.querySelector(
  "#randomize-classification-colors",
);
const pointCloudStats = document.querySelector("#point-cloud-stats");
const lasFileInput = document.querySelector("#las-file");
const lasDrop = document.querySelector("#las-drop");
const lasStatus = document.querySelector("#las-status");
const copcDemoButton = document.querySelector("#copc-demo");
const parisDemoButton = document.querySelector("#paris-demo");
const impostorMode = document.querySelector("#impostor-mode");
const impostorDebugToggle = document.querySelector("#impostor-debug-toggle");
const voxelImpostorControls = document.querySelector("#voxel-impostor-controls");
const imageImpostorControls = document.querySelector("#image-impostor-controls");
const imageImpostorSize = document.querySelector("#image-impostor-size");
const imageImpostorAreaRatio = document.querySelector("#image-impostor-area-ratio");
const imageImpostorReuse = document.querySelector("#image-impostor-reuse");
const imageImpostorStatus = document.querySelector("#image-impostor-status");
const imageImpostorCachePath = document.querySelector("#image-impostor-cache-path");
const pointscapeImageDisk = new PointScapeImpostorDisk.DiskCache((directory, writeFailed) => {
  imageImpostorCachePath.textContent = directory || "Local disk cache unavailable";
  imageImpostorCachePath.title = writeFailed ? "The last capture could not be saved" : directory || "";
});
const measureImpostorsButton = document.querySelector("#measure-impostors");
const impostorMeasurementStatus = document.querySelector("#impostor-measurement");
measureImpostorsButton.addEventListener("click", measureImpostorRenderTime);
const voxelPixelControl = document.querySelector("#voxel-pixel-control");
const voxelPixelValue = document.querySelector("#voxel-pixel-value");
const copcDemos = new Map([
  ["copc", { name: "Autzen Stadium", url: "https://s3.amazonaws.com/hobu-lidar/autzen-classified.copc.laz" }],
  ["paris", {
    name: "Paris · Eiffel Tower",
    url: "https://data.geopf.fr/telechargement/download/LiDARHD-NUALID/NUALHD_1-0__LAZ_LAMB93_KE_2025-06-06/LHD_FXX_0648_6863_PTS_LAMB93_IGN69.copc.laz",
  }],
  ["millsite", { name: "Millsite Reservoir", url: "https://s3.amazonaws.com/hobu-lidar/millsite.copc.laz" }],
]);
const copcOptions = new URLSearchParams(window.location.search);
const requestedCopcWorkers = Number(copcOptions.get("copcWorkers"));
const copcWorkerCount = [1, 2, 4].includes(requestedCopcWorkers) ? requestedCopcWorkers :
  (navigator.hardwareConcurrency >= 4 ? 2 : 1);
const progressiveCopcHierarchy = copcOptions.get("copcHierarchy") !== "eager";
const openProbesButton = document.querySelector("#open-probes");
const probeMode = new PointScapeProbeMode(document.querySelector("#probe-mode"), {
  lodConfig: pointCloudConfig,
  createProgram: gl => {
    const shader = createPointCloudShaders(true);
    return createProgram(gl, shader.vertex, shader.fragment);
  },
  pointStyle: () => {
    const palette = getShaderClassColorPalette();
    const fallback = [...fallbackLasClassColor];
    const colors = new Map([...lasClassColors].map(([code, rgba]) => [code, [...rgba]]));
    return { radius: getPointPhysicalRadiusMeters(), min: getPointMinimumRadiusPixels(),
      max: Math.max(getPointMinimumRadiusPixels(), getPointMaximumRadiusPixels()),
      palette, fallback, color: code => colors.get(code) || fallback };
  },
  applyPalette: (gl, layer, { palette, fallback }) => setPointCloudClassColorUniforms(gl, layer, palette, fallback),
  drawPasses: drawPointCloudPasses,
  createTarget: (gl, width, height) => createCloudRenderTarget(gl, width, height, gl.DEPTH_COMPONENT24),
  deleteTarget: deleteEdlDepthTarget,
  captureImage: PointScapeImageImpostors.capture,
  uploadImage: uploadImageImpostor,
  deleteImage: deleteImageImpostor,
  projectBounds: PointScapeLodStreaming.projectScreenBounds,
  returnFocus: () => openProbesButton.focus(),
});
openProbesButton.addEventListener("click", () => probeMode.open(getProbeSource()));

const flyToPointCloudButton = document.querySelector("#fly-to-point-cloud");
const explodedViewButton = document.querySelector("#exploded-view");
const explodedDecimationControl = document.querySelector("#exploded-decimation-control");
const explodedDecimationValue = document.querySelector("#exploded-decimation-value");

let currentPointCloudPoints = [];
let currentPointCloudFlyToPoints = [];
let currentPointCloudTiles = [];
let currentPointCloudSummary = null;
let currentActiveTileIds = new Set();
let currentExpandedTileIds = new Set();
let currentPendingDetailTileIds = new Set();
let currentTileIndex = [];
let currentTileCrsByFile = new Map();
let pointCloudTileRefreshId = 0;
let currentPointCloudStats = null;
let pointCloudLodRefreshQueued = false;
let pointCloudFinalFrameRefreshPending = false;
let explodedViewLayout = { maxDepth: 0, levelSpacingMeters: 0 };
let explodedViewProgress = 0;
let explodedViewActive = false;
let explodedViewAnimation = 0;
let currentTileById = new Map();

const pointscapeTileStore = new PointScapeDataIngestion.VolatileTileStore({
  ...volatileTileDbConfig,
  getBatchSize: () => pointCloudConfig.indexedDbWriteBatchSize,
  yieldToBrowser: () => yieldToBrowser(),
});
const copcTileSources = new Map();
const pendingCopcPages = new Map();
const failedCopcPages = new Set();
let copcDecodePool = null;
let copcPerformance = null;
const pointscapeLasIngestion = new PointScapeDataIngestion.LasDataIngestionService({
  getConfig: () => ({
    tileSamplePoints: pointCloudConfig.tileSamplePoints,
    m3noGridCellsPerAxis: pointCloudConfig.m3noGridCellsPerAxis,
    tileMinDiagonalMeters: pointCloudConfig.tileMinDiagonalMeters,
    tileMaxDepth: pointCloudConfig.tileMaxDepth,
    parseYieldEveryPoints: pointCloudConfig.parseYieldEveryPoints,
    progressiveLoadingPreview: pointCloudConfig.progressiveLoadingPreview,
    progressiveTilePointInterval: pointCloudConfig.progressiveTilePointInterval,
    progressiveTileMinimumMs: pointCloudConfig.progressiveTileMinimumMs,
    indexedDbWriteBatchSize: pointCloudConfig.indexedDbWriteBatchSize,
  }),
});
const lodMercatorBounds = new WeakMap();

function getNodeScreenBounds(tile, matrix, width, height, margin) {
  if (!tile || !matrix || !width || !height) return null;
  const geometryKey = `${terrainToggle.checked}:${getTerrainExaggeration()}:${getPointCloudOffsetMeters()}`;
  let cached = lodMercatorBounds.get(tile);
  if (cached?.key !== geometryKey) {
    cached = { key: geometryKey, corners: createDetailBoxMercatorCorners(tile) };
    lodMercatorBounds.set(tile, cached);
  }
  return PointScapeLodStreaming.projectScreenBounds(cached.corners, matrix, width, height, { margin });
}

const pointscapeLodSystem = new PointScapeLodSystem({
  config: pointCloudConfig,
  tileSelection: PointScapeTileSelection,
  getSummary: () => currentPointCloudSummary,
  getCrsByFile: () => currentTileCrsByFile,
  lngLatToWebMercatorMeters,
  lngLatToUtm,
  isFullEnabled: () => isFullResolutionEnabled(),
  getScreenBounds: (tile, margin) => {
    const layer = window.pointCloudLayer;
    const canvas = window.mapLibreMap?.getCanvas?.();
    return getNodeScreenBounds(tile, layer?.pickMatrix, canvas?.clientWidth, canvas?.clientHeight, margin);
  },
});
const pointscapeUiController = new PointScapeUiController({
  elements: {
    menuToggle,
    menuContent,
    baseLayerInputs,
    terrainToggle,
    pitchControl,
    pitchValue,
    terrainExaggerationControl,
    terrainExaggerationValue,
    pointOffsetControl,
    pointOffsetValue,
    pointRadiusControl,
    pointRadiusValue,
    pointMinRadiusControl,
    pointMinRadiusValue,
    pointMaxRadiusControl,
    pointMaxRadiusValue,
    fullResolutionToggle,
    blockBoundsToggle,
    blockDetailsToggle,
    lodDetailBoxesToggle,
    lodScreenDiagonalControl,
    lodHysteresisControl,
    lodPointBudgetControl,
    lodPointBudgetValue,
    tileMinDiagonalControl,
    tileMaxDepthControl,
    depthBiasControl,
    depthBiasValue,
    edlToggle,
    edlStrengthControl,
    edlStrengthValue,
    edlRadiusControl,
    edlRadiusValue,
    edlNeighborsControl,
    edlNeighborsValue,
    randomizeClassificationColorsButton,
    lasFileInput,
    lasDrop,
    lasStatus,
    copcDemoButton,
    parisDemoButton,
    impostorMode,
    impostorDebugToggle,
    voxelImpostorControls,
    imageImpostorControls,
    imageImpostorSize,
    imageImpostorAreaRatio,
    imageImpostorReuse,
    voxelPixelControl,
    voxelPixelValue,
    flyToPointCloudButton,
    explodedViewButton,
    explodedDecimationControl,
    explodedDecimationValue,
  },
  actions: {
    config: pointCloudConfig,
    getMap: () => window.mapLibreMap,
    renderClassificationLegend,
    syncLodControlsFromConfig,
    renderPointCloudStats,
    setBaseLayer,
    setElevationEnabled,
    getTerrainExaggeration,
    applyTerrainExaggeration,
    refreshPointCloudElevation,
    refreshTileBounds,
    updateDetailBoxesLayer,
    getPointCloudOffsetMeters,
    syncPointSizingControlsFromConfig,
    syncEdlControlsFromConfig,
    setBlockBoundsVisible,
    setBlockDetailsVisible,
    randomizeLasClassColors,
    applyPointCloudTileSelection,
    readNumericControl,
    updateLodControlLabels,
    getDepthBias,
    getPointCloudFiles,
    loadPointCloudFiles,
    loadCopcDemo,
    toggleExplodedView,
    restartExplodedViewLoading,
    flyToCurrentPointCloud,
  },
});

function revealLogoWhenLoaded(logo, canReveal = () => true) {
  if (!logo) {
    return () => {};
  }

  const reveal = () => {
    if (canReveal() && logo.complete && logo.naturalWidth > 0) {
      logo.classList.add("is-visible");
    }
  };

  if (logo.complete) {
    window.requestAnimationFrame(() => window.requestAnimationFrame(reveal));
  } else {
    logo.addEventListener("load", reveal, { once: true });
  }

  return reveal;
}

let mapLogoCanAppear = !splashScreen;
revealLogoWhenLoaded(splashLogo);
const revealInstitutionalLogo = revealLogoWhenLoaded(
  institutionalLogo,
  () => mapLogoCanAppear,
);

function scheduleSplashDismiss() {
  if (!splashScreen) {
    return;
  }

  const displayMs = 3000;
  const fadeMs = 900;

  window.setTimeout(() => {
    splashScreen.classList.add("is-hiding");
    window.setTimeout(() => {
      splashScreen.hidden = true;
      mapLogoCanAppear = true;
      revealInstitutionalLogo();
    }, fadeMs);
  }, displayMs);
}

function setStatus(message) {
  status.textContent = message;
  status.classList.remove("is-hidden");
}

function showMapError(message) {
  setStatus(
    message ||
      "MapLibre could not be loaded. Check your Internet connection and reload the page.",
  );
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

async function loadMapLibre() {
  if (window.maplibregl) {
    return;
  }

  let lastError;

  for (const source of mapLibreSources) {
    try {
      await loadScript(source);
      if (window.maplibregl) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("MapLibre no esta disponible.");
}

async function loadProj4() {
  if (window.proj4) {
    return window.proj4;
  }

  let lastError;

  for (const source of proj4Sources) {
    try {
      await loadScript(source);
      if (window.proj4) {
        return window.proj4;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Could not load proj4js.");
}

function initMap() {
  if (!window.maplibregl || window.mapLibreMap) {
    return;
  }

  status.classList.add("is-hidden");

  window.mapLibreMap = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {},
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "#d7edf0" },
        },
      ],
    },
    center: lasPalmas.coordinates,
    zoom: 12.4,
    pitch: 0,
    bearing: 0,
    maxPitch: 85,
    attributionControl: { compact: true },
  });

  window.mapLibreMap.on("error", (event) => {
    if (!event?.error) {
      return;
    }

    console.error(event.error);
    if (
      typeof window.mapLibreMap.loaded !== "function" ||
      !window.mapLibreMap.loaded()
    ) {
      showMapError(
        "MapLibre loaded, but the map style or tiles could not be downloaded.",
      );
    }
  });

  window.mapLibreMap.on("load", () => {
    addMapLayers();
    bindLayerMenu();
    syncInitialLayerState();
    status.classList.add("is-hidden");
    window.mapLibreMap.resize();
    copcDemoButton.disabled = false;
    parisDemoButton.disabled = false;
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (copcDemos.has(demo)) loadCopcDemo(demo);
  });

  window.mapLibreMap.on("movestart", () => {
    if (!copcPerformance) return;
    copcPerformance.moveEndedAt = null;
    copcPerformance.detailMs = null;
    renderPointCloudStats();
  });

  window.mapLibreMap.on("moveend", () => {
    failedCopcPages.clear();
    const layer = window.pointCloudLayer;
    layer?.imageTimings?.requestRefresh(layer.imageCache.active);
    if (copcPerformance) {
      copcPerformance.moveEndedAt = performance.now();
      copcPerformance.detailMs = null;
    }
    refreshTileBounds();
    pointCloudFinalFrameRefreshPending = true;
    window.mapLibreMap.triggerRepaint();
  });

  window.nodeInspector = new PointScapeNodeInspector.Controller({
    map: window.mapLibreMap,
    getLayer: () => window.pointCloudLayer,
    getMetadata: (id) => currentTileIndex.find((tile) => tile.id === id),
    getRecord: (id) => getStoredTileRecord(id),
    project: (lng, lat, tile) => pointscapeLodSystem.projectLngLatToTileMetric(lng, lat, tile),
    getPointSize: () => getPointMaximumRadiusPixels() * 2,
    captureTextures: (points, selection) => {
      const size = selection.textureSize ?? pointCloudConfig.imageImpostorSize;
      if (selection.imageSource) {
        return PointScapeImageImpostors.capture(selection.imageSource, selection.cameraMatrix,
          selection.aspect, getLasClassColor, size);
      }
      const buffer = createPointCloudBuffer(points, window.mapLibreMap, terrainToggle.checked);
      buffer.anchorMercator[2] += selection.explodedOffset;
      return PointScapeImageImpostors.capture({ ...buffer, pickPositions: new Float32Array(buffer.data) },
        selection.cameraMatrix, selection.aspect, getLasClassColor, size);
    },
    getLodDiagnostics: (tile) => pointscapeLodSystem.getTileLodDiagnostics(
      tile,
      window.mapLibreMap,
    ),
  });

  window.mapLibreMap.addControl(
    new maplibregl.NavigationControl({ visualizePitch: true }),
    "bottom-right",
  );
  window.mapLibreMap.addControl(
    new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }),
    "bottom-left",
  );

}

function addMapLayers() {
  const map = window.mapLibreMap;

  if (!map.getSource(layerIds.satelliteSource)) {
    map.addSource(layerIds.satelliteSource, {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution:
        "Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    });
  }

  if (!map.getLayer(layerIds.satelliteLayer)) {
    map.addLayer({
      id: layerIds.satelliteLayer,
      type: "raster",
      source: layerIds.satelliteSource,
      layout: {
        visibility: getSelectedBaseLayer() === "satellite" ? "visible" : "none",
      },
      paint: {
        "raster-opacity": 1,
        "raster-saturation": -0.08,
        "raster-contrast": 0.08,
      },
    });
  }

  if (!map.getSource(layerIds.terrainSource)) {
    map.addSource(layerIds.terrainSource, {
      type: "raster-dem",
      tiles: [
        "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
      ],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 15,
      attribution:
        "Elevation tiles &copy; Mapzen, Amazon Web Services, and OpenStreetMap contributors",
    });
  }

  if (!map.getLayer(layerIds.hillshadeLayer)) {
    map.addLayer({
      id: layerIds.hillshadeLayer,
      type: "hillshade",
      source: layerIds.terrainSource,
      layout: { visibility: terrainToggle.checked ? "visible" : "none" },
      paint: {
        "hillshade-exaggeration": 0.75,
        "hillshade-shadow-color": "rgba(15, 23, 42, 0.7)",
        "hillshade-highlight-color": "rgba(255, 255, 255, 0.5)",
      },
    });
  }

  if (!map.getLayer(layerIds.pointCloudLayer)) {
    addBlockBoundsLayer();
    window.pointCloudLayer = createWebGlPointCloudLayer();
    map.addLayer(window.pointCloudLayer);
    window.detailBoxesLayer = createWebGlDetailBoxesLayer();
    map.addLayer(window.detailBoxesLayer);
  }
}

function addBlockBoundsLayer() {
  const map = window.mapLibreMap;

  if (!map.getSource(layerIds.blockBoundsSource)) {
    map.addSource(layerIds.blockBoundsSource, {
      type: "geojson",
      data: createBlockBoundsGeoJson([]),
    });
  }

  if (!map.getLayer(layerIds.blockBoundsLayer)) {
    map.addLayer({
      id: layerIds.blockBoundsLayer,
      type: "line",
      source: layerIds.blockBoundsSource,
      layout: {
        visibility: blockBoundsToggle.checked ? "visible" : "none",
        "line-join": "round",
      },
      paint: {
        "line-color": "#0f766e",
        "line-opacity": 0.9,
        "line-width": 1.8,
      },
    });
  }

  if (!map.getLayer(layerIds.blockLabelsLayer)) {
    map.addLayer({
      id: layerIds.blockLabelsLayer,
      type: "symbol",
      source: layerIds.blockBoundsSource,
      layout: {
        visibility: blockDetailsToggle.checked ? "visible" : "none",
        "symbol-placement": "point",
        "text-field": ["get", "detailLabel"],
        "text-size": 11,
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-offset": [0, -0.9],
        "text-anchor": "bottom",
        "text-allow-overlap": false,
        "text-ignore-placement": false,
      },
      paint: {
        "text-color": "#073b3a",
        "text-halo-color": "rgba(255, 255, 255, 0.92)",
        "text-halo-width": 1.4,
      },
    });
  }
}

function createWebGlPointCloudLayer() {
  return {
    id: layerIds.pointCloudLayer,
    type: "custom",
    renderingMode: "3d",

    onAdd(map, gl) {
      this.pointCount = 0;
      this.points = [];
      this.tiles = [];
      this.tileBuffers = [];
      this.tileBuffersById = new Map();
      this.gl = gl;

      const isWebGl2 =
        typeof WebGL2RenderingContext !== "undefined" &&
        gl instanceof WebGL2RenderingContext;
      const shaders = createPointCloudShaders(isWebGl2);

      this.program = createProgram(gl, shaders.vertex, shaders.fragment);
      this.positionLocation = gl.getAttribLocation(this.program, "a_position");
      this.voxelCornerLocation = gl.getAttribLocation(this.program, "a_voxel_corner");
      this.voxelEnabledLocation = gl.getUniformLocation(this.program, "u_voxel");
      this.voxelExtentLocation = gl.getUniformLocation(this.program, "u_voxel_extent");
      this.impostorDebugLocation = gl.getUniformLocation(this.program, "u_impostor_debug");
      if (isWebGl2) {
        this.imagePaletteKey = JSON.stringify([[...lasClassColors], fallbackLasClassColor]);
        this.imageCache = new PointScapeImageImpostors.Cache(
          textures => uploadImageImpostor(gl, textures), capture => deleteImageImpostor(gl, capture),
          pointscapeImageDisk, () => map.triggerRepaint());
        const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
        if (timer) this.imageTimings = new PointScapeImageImpostors.NodeTimings(gl, timer);
        this.imageEnabledLocation = gl.getUniformLocation(this.program, "u_image");
        this.imageColorLocation = gl.getUniformLocation(this.program, "u_image_color");
        this.imageDepthLocation = gl.getUniformLocation(this.program, "u_image_depth");
        this.imageInverseLocation = gl.getUniformLocation(this.program, "u_capture_inverse");
        const mesh = PointScapeVoxelImpostors.createCubeMesh();
        this.voxelVertexCount = mesh.length / 4;
        this.voxelMesh = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.voxelMesh);
        gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
      }
      this.classificationLocation = gl.getAttribLocation(
        this.program,
        "a_classification",
      );
      this.matrixLocation = gl.getUniformLocation(this.program, "u_matrix");
      this.anchorClipLocation = gl.getUniformLocation(this.program, "u_anchor_clip");
      this.pointRadiusMetersLocation = gl.getUniformLocation(this.program, "u_point_radius_meters");
      this.minimumPointRadiusLocation = gl.getUniformLocation(this.program, "u_min_point_radius_px");
      this.maximumPointRadiusLocation = gl.getUniformLocation(this.program, "u_max_point_radius_px");
      this.projectionPixelsPerMercatorLocation = gl.getUniformLocation(
        this.program,
        "u_projection_pixels_per_mercator",
      );
      this.metersToMercatorLocation = gl.getUniformLocation(this.program, "u_meters_to_mercator");
      this.explodedOffsetLocation = gl.getUniformLocation(this.program, "u_exploded_offset");
      this.depthBiasLocation = gl.getUniformLocation(this.program, "u_depth_bias");
      this.classCountLocation = gl.getUniformLocation(this.program, "u_class_count");
      this.classCodesLocation = gl.getUniformLocation(
        this.program,
        "u_class_codes[0]",
      );
      this.classColorsLocation = gl.getUniformLocation(
        this.program,
        "u_class_colors[0]",
      );
      this.fallbackColorLocation = gl.getUniformLocation(
        this.program,
        "u_fallback_color",
      );
      this.edlDepthPassLocation = gl.getUniformLocation(this.program, "u_edl_depth_pass");
      this.edlEnabledLocation = gl.getUniformLocation(this.program, "u_edl_enabled");
      this.edlDepthMapLocation = gl.getUniformLocation(this.program, "u_edl_depth_map");
      this.edlTextureSizeLocation = gl.getUniformLocation(this.program, "u_edl_texture_size");
      this.edlRadiusLocation = gl.getUniformLocation(this.program, "u_edl_radius_px");
      this.edlStrengthLocation = gl.getUniformLocation(this.program, "u_edl_strength");
      this.edlNeighborsLocation = gl.getUniformLocation(this.program, "u_edl_neighbors");
    },

    updateElevationBuffer(map) {
      if (!this.gl) {
        return;
      }

      this.setTiles(this.tiles, map, { forceRebuild: true });
    },

    hasTileBuffer(tileId, renderKey) {
      const tileBuffer = this.tileBuffersById.get(tileId);
      return Boolean(tileBuffer && tileBuffer.renderKey === renderKey);
    },

    setTiles(tiles, map, options = {}) {
      if (!this.gl) {
        return;
      }

      const previousTilesById = new Map(
        (this.tiles || []).map((tile) => [tile.id, tile]),
      );
      const nextTiles = normalizeRenderableTiles(
        tiles,
        this.tileBuffersById,
      ).map((tile) => {
        if (getPointSetCount(tile.points) > 0) {
          return tile;
        }

        const previousTile = previousTilesById.get(tile.id);
        if (
          previousTile?.renderKey === tile.renderKey &&
          getPointSetCount(previousTile.points) > 0
        ) {
          return { ...tile, points: previousTile.points };
        }

        return tile;
      });
      const nextTileIds = new Set(nextTiles.map((tile) => tile.id));

      if (options.forceRebuild) {
        this.imageCache?.clear();
        this.imageTimings?.clear();
        deletePointCloudTileBuffers(this.gl, this.tileBuffers);
        this.tileBuffersById.clear();
      } else {
        this.tileBuffersById.forEach((tileBuffer, tileId) => {
          if (!nextTileIds.has(tileId)) {
            deletePointCloudTileBuffer(this.gl, tileBuffer);
            this.tileBuffersById.delete(tileId);
          }
        });
      }

      this.tiles = nextTiles;
      this.points = nextTiles
        .map((tile) => tile.points)
        .filter((pointSet) => getPointSetCount(pointSet) > 0);
      this.tileBuffers = nextTiles.map((tile) => {
        const existingBuffer = this.tileBuffersById.get(tile.id);

        if (existingBuffer?.renderKey === tile.renderKey) {
          return existingBuffer;
        }

        if (existingBuffer) {
          deletePointCloudTileBuffer(this.gl, existingBuffer);
        }

        const nextBuffer = createPointCloudTileBuffer(
          this.gl,
          tile,
          map,
          terrainToggle.checked,
        );
        this.tileBuffersById.set(tile.id, nextBuffer);
        return nextBuffer;
      });
      this.pointCount = this.tileBuffers.reduce(
        (sum, tileBuffer) => sum + tileBuffer.pointCount,
        0,
      );

      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
      if (typeof map?.triggerRepaint === "function") {
        map.triggerRepaint();
      }
    },

    setPoints(points, map) {
      if (!this.gl) {
        return;
      }

      this.setTiles(
        normalizePointBatches(points).map((pointBatch, index) => ({
          id: `point-batch:${index}`,
          points: pointBatch,
        })),
        map,
        { forceRebuild: true },
      );
    },

    render(gl, args) {
      const matrix =
        args?.defaultProjectionData?.mainMatrix ||
        args?.modelViewProjectionMatrix ||
        args;

      this.pickMatrix = Array.from(matrix);
      schedulePointCloudTileRefreshAfterRenderedFrame();
      if (this.imageCache && pointCloudConfig.impostorMode === "image" && !explodedViewActive && !explodedViewProgress) {
        pointscapeImageDisk.connect();
        const camera = PointScapeImageImpostors.cameraPosition(matrix);
        const size = pointCloudConfig.imageImpostorSize;
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const more = this.imageCache.update(this.tileBuffers, camera, {
          size,
          maxAreaRatio: pointCloudConfig.imageImpostorAreaRatio,
          projectedArea: tile => {
            const bounds = getNodeScreenBounds(currentTileById.get(tile.id), matrix, width, height, 1);
            return bounds?.visible && !bounds.intersectsEyePlane ? bounds.area : 0;
          },
          reusePercent: pointCloudConfig.imageImpostorReuse,
          palette: this.imagePaletteKey,
          moving: window.mapLibreMap.isMoving(),
        }, tile => PointScapeImageImpostors.capture(tile, matrix, width / height, getLasClassColor, size));
        if (more) window.mapLibreMap.triggerRepaint();
      } else if (this.imageCache?.entries.size || this.imageCache?.lookup) {
        this.imageCache.clear();
      }
      this.imageTimings?.prepareFrame(this.tileBuffers, this.imageCache.active);
      updateImageImpostorStats(this);
      gl.useProgram(this.program);
      gl.uniform1i(this.impostorDebugLocation, pointCloudConfig.impostorDebug);
      gl.uniformMatrix4fv(this.matrixLocation, false, matrix);
      const canvas = gl.canvas;
      const pixelRatio = Math.max(1, canvas.width / Math.max(1, canvas.clientWidth));
      const pointSizeRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
      const hardwareMaximumRadius = Math.max(0.5, pointSizeRange[1] / 2);
      const minimumRadius = Math.min(
        getPointMinimumRadiusPixels() * pixelRatio,
        hardwareMaximumRadius,
      );
      const maximumRadius = Math.min(
        Math.max(minimumRadius, getPointMaximumRadiusPixels() * pixelRatio),
        hardwareMaximumRadius,
      );
      gl.uniform1f(this.pointRadiusMetersLocation, getPointPhysicalRadiusMeters());
      gl.uniform1f(this.minimumPointRadiusLocation, minimumRadius);
      gl.uniform1f(this.maximumPointRadiusLocation, maximumRadius);
      gl.uniform1f(
        this.projectionPixelsPerMercatorLocation,
        PointScapePointSizing.getProjectionPixelsPerMercator(
          matrix,
          gl.drawingBufferWidth,
          gl.drawingBufferHeight,
        ),
      );
      gl.uniform1f(this.depthBiasLocation, getDepthBias());
      gl.uniform1i(this.edlDepthPassLocation, 0);
      gl.uniform1i(this.edlEnabledLocation, 0);
      setPointCloudClassColorUniforms(gl, this);

      gl.enableVertexAttribArray(this.positionLocation);
      gl.enableVertexAttribArray(this.classificationLocation);

      drawPointCloudPasses(this, gl, matrix, pixelRatio, this.tileBuffers, this.imageCache?.active);
      if (this.imageTimings?.finishFrame()) window.mapLibreMap.triggerRepaint();
      updateImageMeasurement(this);
      runImpostorMeasurementFrame(this, gl, matrix, pixelRatio);
      gl.disableVertexAttribArray(this.positionLocation);
      gl.disableVertexAttribArray(this.classificationLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      if (this.pointCount && copcPerformance?.firstFrameMs === null) {
        copcPerformance.firstFrameMs = performance.now() - copcPerformance.startedAt;
        renderPointCloudStats();
      }
    },

    onRemove(map, gl) {
      finishImpostorMeasurement(this, "Measurement stopped because the point cloud layer was reset.");
      this.imageCache?.clear();
      this.imageTimings?.clear();
      deleteEdlDepthTarget(gl, this.edlTarget);
      this.edlTarget = null;
      deletePointCloudTileBuffers(gl, this.tileBuffers);
      this.tileBuffers = [];
      this.tileBuffersById.clear();
      if (this.voxelMesh) gl.deleteBuffer(this.voxelMesh);
      if (this.program) {
        gl.deleteProgram(this.program);
      }
    },
  };
}

function drawPointCloudPasses(layer, gl, matrix, pixelRatio, tiles, images) {
  const wasDepthTestEnabled = gl.isEnabled(gl.DEPTH_TEST);
  const wasBlendEnabled = gl.isEnabled(gl.BLEND);
  const wasCullEnabled = gl.isEnabled(gl.CULL_FACE);
  if (tiles.some(tile => tile.voxelSizeMeters)) gl.disable(gl.CULL_FACE);
  const previousDepthFunction = gl.getParameter(gl.DEPTH_FUNC);
  const previousDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
  const previousColorMask = gl.getParameter(gl.COLOR_WRITEMASK);
  const previousBlendSourceRgb = gl.getParameter(gl.BLEND_SRC_RGB);
  const previousBlendDestinationRgb = gl.getParameter(gl.BLEND_DST_RGB);
  const previousBlendSourceAlpha = gl.getParameter(gl.BLEND_SRC_ALPHA);
  const previousBlendDestinationAlpha = gl.getParameter(gl.BLEND_DST_ALPHA);
  const previousBlendEquationRgb = gl.getParameter(gl.BLEND_EQUATION_RGB);
  const previousBlendEquationAlpha = gl.getParameter(
    gl.BLEND_EQUATION_ALPHA,
  );

  let edlTextureBinding;
  let previousActiveTexture;
  const edlActive = !layer.isolated && pointCloudConfig.edlEnabled && layer.pointCount > 0 &&
    ensureEdlDepthTarget(layer, gl);
  if (edlActive) {
    renderEdlDepthMap(layer, gl, matrix, tiles, images);
    previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
    gl.activeTexture(gl.TEXTURE0);
    edlTextureBinding = gl.getParameter(gl.TEXTURE_BINDING_2D);
    gl.bindTexture(gl.TEXTURE_2D, layer.edlTarget.texture);
    gl.uniform1i(layer.edlDepthMapLocation, 0);
    gl.uniform2f(layer.edlTextureSizeLocation, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(layer.edlRadiusLocation, pointCloudConfig.edlRadiusPixels * pixelRatio);
    gl.uniform1f(layer.edlStrengthLocation, pointCloudConfig.edlStrength);
    gl.uniform1i(layer.edlNeighborsLocation, pointCloudConfig.edlNeighborCount);
    gl.uniform1i(layer.edlEnabledLocation, 1);
  }

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  gl.colorMask(false, false, false, false);
  gl.disable(gl.BLEND);
  gl.uniform1i(layer.edlEnabledLocation, 0);
  drawPointCloudTileBuffers(layer, gl, matrix, tiles, images);

  gl.colorMask(true, true, true, true);
  gl.depthFunc(gl.EQUAL);
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
  gl.blendFuncSeparate(
    gl.SRC_ALPHA,
    gl.ONE_MINUS_SRC_ALPHA,
    gl.ONE,
    gl.ONE_MINUS_SRC_ALPHA,
  );
  gl.uniform1i(layer.edlEnabledLocation, edlActive ? 1 : 0);
  drawPointCloudTileBuffers(layer, gl, matrix, tiles, images);

  if (edlActive) {
    gl.bindTexture(gl.TEXTURE_2D, edlTextureBinding);
    gl.activeTexture(previousActiveTexture);
  }

  gl.depthFunc(previousDepthFunction);
  gl.depthMask(previousDepthMask);
  gl.colorMask(...previousColorMask);
  gl.blendFuncSeparate(
    previousBlendSourceRgb,
    previousBlendDestinationRgb,
    previousBlendSourceAlpha,
    previousBlendDestinationAlpha,
  );
  gl.blendEquationSeparate(
    previousBlendEquationRgb,
    previousBlendEquationAlpha,
  );
  if (!wasDepthTestEnabled) {
    gl.disable(gl.DEPTH_TEST);
  }
  if (!wasBlendEnabled) {
    gl.disable(gl.BLEND);
  }
  if (wasCullEnabled) gl.enable(gl.CULL_FACE);
}

function deleteEdlDepthTarget(gl, target) {
  if (!target) return;
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteRenderbuffer(target.depth);
  gl.deleteTexture(target.texture);
}

function ensureEdlDepthTarget(layer, gl) {
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  if (!width || !height) return false;
  if (layer.edlTarget?.width === width && layer.edlTarget?.height === height) {
    return true;
  }
  deleteEdlDepthTarget(gl, layer.edlTarget);
  layer.edlTarget = createCloudRenderTarget(gl, width, height);
  return Boolean(layer.edlTarget);
}

function createCloudRenderTarget(gl, width, height, depthFormat = gl.DEPTH_COMPONENT16) {
  const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const previousRenderbuffer = gl.getParameter(gl.RENDERBUFFER_BINDING);
  const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
  const target = {
    width, height,
    framebuffer: gl.createFramebuffer(),
    texture: gl.createTexture(),
    depth: gl.createRenderbuffer(),
  };
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, target.depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, depthFormat, width, height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D, target.texture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
    gl.RENDERBUFFER, target.depth);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
  gl.bindRenderbuffer(gl.RENDERBUFFER, previousRenderbuffer);
  gl.bindTexture(gl.TEXTURE_2D, previousTexture);
  if (!complete) {
    deleteEdlDepthTarget(gl, target);
    return null;
  }
  return target;
}

const impostorMeasurementSamples = 8;

function updateImageMeasurement(layer) {
  if (pointCloudConfig.impostorMode !== "image") {
    if (impostorMeasurementStatus.dataset.mode === "image") {
      delete impostorMeasurementStatus.dataset.mode;
      impostorMeasurementStatus.textContent = "";
    }
    return;
  }

  const timing = layer.imageTimings;
  const active = layer.imageCache?.active;
  let pointsTotal = 0, imagesTotal = 0, compared = 0;
  const formatTime = value => `${value.toFixed(3)} ms`;
  for (const [id, image] of active || []) {
    const points = timing?.points.get(layer.tileBuffersById.get(id));
    const imageTime = timing?.images.get(image);
    if (points !== undefined && imageTime !== undefined) {
      compared += 1;
      pointsTotal += points;
      imagesTotal += imageTime;
    }
  }
  let status;
  if (!timing || timing.unavailable) {
    status = "Image timing requires a working WebGL GPU timer.";
  } else if (!compared) {
    status = active?.size || timing.pending.length
      ? "Waiting for GPU timings…" : "Show image impostors to measure their render time.";
  } else {
    const difference = pointsTotal - imagesTotal;
    const change = difference >= 0 ? "Saved" : "Added";
    const percent = pointsTotal > 0 ? ` (${(Math.abs(difference) / pointsTotal * 100).toFixed(1)}%)` : "";
    status = `Last points ${formatTime(pointsTotal)} · Images ${formatTime(imagesTotal)} · ${change} ${formatTime(Math.abs(difference))}${percent} · ${compared}/${active.size} nodes`;
  }
  impostorMeasurementStatus.dataset.mode = "image";
  if (impostorMeasurementStatus.textContent !== status) impostorMeasurementStatus.textContent = status;
}

async function measureImpostorRenderTime() {
  const map = window.mapLibreMap;
  const layer = window.pointCloudLayer;
  if (layer?.impostorMeasurement) return;
  const mode = pointCloudConfig.impostorMode;
  if (mode === "image") {
    if (layer?.imageTimings && !layer.imageTimings.unavailable && layer.imageCache.active.size) {
      layer.imageTimings.requestRefresh(layer.imageCache.active);
      map.triggerRepaint();
    }
    if (layer) updateImageMeasurement(layer);
    return;
  }
  const tiles = layer?.tileBuffers || [];
  const voxelTiles = tiles.filter(tile => tile.voxelSizeMeters && tile.pointCount);
  const nodeCount = mode === "voxel" ? voxelTiles.length : 0;
  delete impostorMeasurementStatus.dataset.mode;
  if (!nodeCount || map?.isMoving() || layer.imageCache?.active.size) {
    impostorMeasurementStatus.textContent = "Stop the camera with at least one impostor visible, then measure again.";
    return;
  }

  const gl = layer.gl;
  const job = {
    mode, tiles, nodeCount, pointBuffers: new Map(), samples: [],
    extension: gl.getExtension("EXT_disjoint_timer_query_webgl2"),
    abort: new AbortController(),
    width: gl.drawingBufferWidth, height: gl.drawingBufferHeight,
  };
  layer.impostorMeasurement = job;
  measureImpostorsButton.disabled = true;
  impostorMeasurementStatus.textContent = "Preparing the point baseline…";
  try {
    // Compare the voxel draw with the original node payload.
    for (const tile of voxelTiles) {
      const record = await getTileRepresentation(tile.id, "sample", job.abort.signal);
      if (layer.impostorMeasurement !== job) return;
      if (!getPointSetCount(record?.points)) throw new Error("The source points for a voxel node are unavailable.");
      const previousBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      job.pointBuffers.set(tile.id, createPointCloudTileBuffer(gl, { id: tile.id, points: record.points },
        map, terrainToggle.checked));
      gl.bindBuffer(gl.ARRAY_BUFFER, previousBuffer);
    }
    job.baseline = tiles.map(tile => job.pointBuffers.get(tile.id) || tile);
    impostorMeasurementStatus.textContent = "Measuring the point cloud. Keep the camera still.";
    map.triggerRepaint();
  } catch (error) {
    if (layer.impostorMeasurement === job) finishImpostorMeasurement(layer, error.message);
  }
}

function finishImpostorMeasurement(layer, message) {
  const job = layer.impostorMeasurement;
  if (!job) return;
  layer.impostorMeasurement = null;
  job.abort.abort();
  const gl = layer.gl;
  deletePointCloudTileBuffers(gl, [...job.pointBuffers.values()]);
  deleteEdlDepthTarget(gl, job.target);
  job.queries?.forEach(query => gl.deleteQuery(query));
  measureImpostorsButton.disabled = false;
  impostorMeasurementStatus.textContent = message;
}

function runImpostorMeasurementFrame(layer, gl, matrix, pixelRatio) {
  const job = layer.impostorMeasurement;
  if (!job) return;
  const map = window.mapLibreMap;
  const activeImages = layer.imageCache?.active;
  if (map.isMoving() || layer.tileBuffers !== job.tiles || pointCloudConfig.impostorMode !== job.mode ||
      gl.drawingBufferWidth !== job.width || gl.drawingBufferHeight !== job.height ||
      activeImages?.size) {
    finishImpostorMeasurement(layer, "The view changed. Measure again once it settles.");
    return;
  }
  if (!job.baseline) return;

  if (job.queries) {
    const disjoint = gl.getParameter(job.extension.GPU_DISJOINT_EXT);
    if (disjoint || performance.now() - job.queryStarted > 4000) {
      useSynchronizedImpostorTiming(job, gl);
    } else if (job.queries.every(query => gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE))) {
      const pair = job.queries.map(query => gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
      if (pair.every(value => value > 0 && Number.isFinite(value))) {
        job.queries.forEach(query => gl.deleteQuery(query));
        job.queries = null;
        job.samples.push(pair);
      } else {
        useSynchronizedImpostorTiming(job, gl);
      }
    } else {
      map.triggerRepaint();
      return;
    }
  }

  if (job.samples.length === impostorMeasurementSamples) {
    const median = index => {
      const times = job.samples.map(pair => pair[index]).sort((a, b) => a - b);
      const middle = times.length / 2;
      return (times[middle - 1] + times[middle]) / 2;
    };
    const points = median(0), impostors = median(1);
    const difference = points - impostors;
    const change = difference >= 0 ? "Saved" : "Added";
    const percent = points > 0 ? ` (${(Math.abs(difference) / points * 100).toFixed(1)}%)` : "";
    const method = job.extension ? "GPU timer" : "CPU + GPU estimate";
    finishImpostorMeasurement(layer, `Points ${points.toFixed(2)} ms · Voxels ${impostors.toFixed(2)} ms · ${change} ${Math.abs(difference).toFixed(2)} ms${percent}. ${method}, median of ${job.samples.length} pairs · ${job.nodeCount} impostor nodes.`);
    return;
  }

  const readFramebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
  const drawFramebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
  try {
    job.target ||= createCloudRenderTarget(gl, job.width, job.height);
    if (!job.target) throw new Error("Could not create the offscreen measurement target.");
    if (job.extension && gl.getQuery(job.extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
      useSynchronizedImpostorTiming(job, gl);
    }
    measureImpostorPair(layer, gl, matrix, pixelRatio, job);
  } catch (error) {
    finishImpostorMeasurement(layer, error.message);
    return;
  } finally {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readFramebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, drawFramebuffer);
  }
  map.triggerRepaint();
}

function useSynchronizedImpostorTiming(job, gl) {
  job.queries?.forEach(query => gl.deleteQuery(query));
  job.queries = null;
  job.extension = null;
  job.samples.length = 0;
}

function measureImpostorPair(layer, gl, matrix, pixelRatio, job) {
  const viewport = gl.getParameter(gl.VIEWPORT);
  const colorMask = gl.getParameter(gl.COLOR_WRITEMASK);
  const depthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
  const scissor = gl.isEnabled(gl.SCISSOR_TEST);
  const stencil = gl.isEnabled(gl.STENCIL_TEST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, job.target.framebuffer);
  gl.viewport(0, 0, job.width, job.height);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.STENCIL_TEST);
  gl.colorMask(true, true, true, true);
  gl.depthMask(true);
  // Debug coloring bypasses EDL shading on impostors. Time the normal shader.
  gl.uniform1i(layer.impostorDebugLocation, false);
  const clearColor = new Float32Array(4);
  const clearDepth = new Float32Array([1]);
  const draw = useImpostors => {
    gl.clearBufferfv(gl.COLOR, 0, clearColor);
    gl.clearBufferfv(gl.DEPTH, 0, clearDepth);
    drawPointCloudPasses(layer, gl, matrix, pixelRatio,
      useImpostors ? job.tiles : job.baseline, null);
  };
  try {
    if (!job.warmed) {
      draw(false);
      draw(true);
      job.warmed = true;
      return;
    }
    const order = job.samples.length % 2 ? [1, 0] : [0, 1];
    if (job.extension) {
      const target = job.extension.TIME_ELAPSED_EXT;
      job.queries = [];
      job.queryStarted = performance.now();
      for (const variant of order) {
        const query = gl.createQuery();
        if (!query) throw new Error("Could not start the GPU timer.");
        job.queries[variant] = query;
        gl.beginQuery(target, query);
        try { draw(variant === 1); } finally { gl.endQuery(target); }
      }
      gl.flush();
      return;
    }
    // Average a short batch to reduce the effect of rounded browser timestamps.
    const repeats = 3;
    const pair = [];
    for (const variant of order) {
      gl.finish();
      const start = performance.now();
      for (let i = 0; i < repeats; i += 1) draw(variant === 1);
      gl.finish();
      pair[variant] = (performance.now() - start) / repeats;
    }
    job.samples.push(pair);
  } finally {
    gl.uniform1i(layer.impostorDebugLocation, pointCloudConfig.impostorDebug);
    gl.viewport(...viewport);
    gl.colorMask(...colorMask);
    gl.depthMask(depthMask);
    if (scissor) gl.enable(gl.SCISSOR_TEST);
    if (stencil) gl.enable(gl.STENCIL_TEST);
  }
}

function renderEdlDepthMap(layer, gl, matrix, tiles, images) {
  const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const previousViewport = gl.getParameter(gl.VIEWPORT);
  const previousClearColor = gl.getParameter(gl.COLOR_CLEAR_VALUE);
  const previousClearDepth = gl.getParameter(gl.DEPTH_CLEAR_VALUE);
  const scissorEnabled = gl.isEnabled(gl.SCISSOR_TEST);
  const stencilEnabled = gl.isEnabled(gl.STENCIL_TEST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, layer.edlTarget.framebuffer);
  gl.viewport(0, 0, layer.edlTarget.width, layer.edlTarget.height);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.STENCIL_TEST);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(true);
  gl.colorMask(true, true, true, true);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);
  gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniform1i(layer.edlDepthPassLocation, 1);
  gl.uniform1i(layer.edlEnabledLocation, 0);
  drawPointCloudTileBuffers(layer, gl, matrix, tiles, images);
  gl.uniform1i(layer.edlDepthPassLocation, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
  gl.viewport(...previousViewport);
  gl.clearColor(...previousClearColor);
  gl.clearDepth(previousClearDepth);
  if (scissorEnabled) gl.enable(gl.SCISSOR_TEST);
  if (stencilEnabled) gl.enable(gl.STENCIL_TEST);
}

function createWebGlDetailBoxesLayer() {
  return {
    id: layerIds.detailBoxesLayer,
    type: "custom",
    renderingMode: "3d",

    onAdd(map, gl) {
      this.tiles = [];
      this.lineVertexCount = 0;
      this.anchorMercator = [0, 0, 0];
      this.buffer = null;
      this.gl = gl;

      this.program = createProgram(
        gl,
        `
          precision highp float;
          uniform mat4 u_matrix;
          uniform vec4 u_anchor_clip;
          uniform float u_exploded_progress;
          attribute vec3 a_position;
          attribute float a_exploded_offset;

          void main() {
            gl_Position = u_anchor_clip + u_matrix *
              vec4(a_position.xy, a_position.z + a_exploded_offset * u_exploded_progress, 0.0);
          }
        `,
        `
          precision highp float;
          uniform vec4 u_color;

          void main() {
            gl_FragColor = u_color;
          }
        `,
      );
      this.positionLocation = gl.getAttribLocation(this.program, "a_position");
      this.matrixLocation = gl.getUniformLocation(this.program, "u_matrix");
      this.anchorClipLocation = gl.getUniformLocation(this.program, "u_anchor_clip");
      this.colorLocation = gl.getUniformLocation(this.program, "u_color");
      this.explodedProgressLocation = gl.getUniformLocation(this.program, "u_exploded_progress");
      this.explodedOffsetLocation = gl.getAttribLocation(this.program, "a_exploded_offset");
    },

    setTiles(tiles, map) {
      if (!this.gl) {
        return;
      }

      this.tiles = Array.isArray(tiles) ? tiles : [];
      updateDetailBoxBuffer(this, map);

      if (typeof map?.triggerRepaint === "function") {
        map.triggerRepaint();
      }
    },

    render(gl, args) {
      if (!this.buffer || !this.lineVertexCount) {
        return;
      }

      const matrix =
        args?.defaultProjectionData?.mainMatrix ||
        args?.modelViewProjectionMatrix ||
        args;

      gl.useProgram(this.program);
      gl.uniformMatrix4fv(this.matrixLocation, false, matrix);
      gl.uniform4f(this.colorLocation, 1, 0.48, 0.05, 0.92);
      gl.uniform1f(this.explodedProgressLocation, explodedViewProgress);
      gl.uniform4fv(
        this.anchorClipLocation,
        multiplyMatrixAndMercatorPoint(matrix, this.anchorMercator),
      );

      const wasDepthTestEnabled = gl.isEnabled(gl.DEPTH_TEST);
      const wasBlendEnabled = gl.isEnabled(gl.BLEND);
      const previousDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
      const previousBlendSourceRgb = gl.getParameter(gl.BLEND_SRC_RGB);
      const previousBlendDestinationRgb = gl.getParameter(gl.BLEND_DST_RGB);
      const previousBlendSourceAlpha = gl.getParameter(gl.BLEND_SRC_ALPHA);
      const previousBlendDestinationAlpha = gl.getParameter(gl.BLEND_DST_ALPHA);

      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA,
      );
      gl.lineWidth(2);
      gl.enableVertexAttribArray(this.positionLocation);
      gl.enableVertexAttribArray(this.explodedOffsetLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.vertexAttribPointer(this.positionLocation, 3, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(this.explodedOffsetLocation, 1, gl.FLOAT, false, 16, 12);
      gl.drawArrays(gl.LINES, 0, this.lineVertexCount);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.disableVertexAttribArray(this.positionLocation);
      gl.disableVertexAttribArray(this.explodedOffsetLocation);

      if (wasDepthTestEnabled) {
        gl.enable(gl.DEPTH_TEST);
      }
      gl.depthMask(previousDepthMask);
      gl.blendFuncSeparate(
        previousBlendSourceRgb,
        previousBlendDestinationRgb,
        previousBlendSourceAlpha,
        previousBlendDestinationAlpha,
      );
      if (!wasBlendEnabled) {
        gl.disable(gl.BLEND);
      }
    },

    onRemove(map, gl) {
      if (this.buffer) {
        gl.deleteBuffer(this.buffer);
      }
      if (this.program) {
        gl.deleteProgram(this.program);
      }
    },
  };
}

function normalizePointBatches(pointSets) {
  if (!pointSets) {
    return [];
  }

  if (!Array.isArray(pointSets)) {
    return getPointSetCount(pointSets) ? [pointSets] : [];
  }

  if (!pointSets.length) {
    return [];
  }

  if (pointSets.every(isPointObject)) {
    return [pointSets];
  }

  return pointSets.filter((pointSet) => getPointSetCount(pointSet) > 0);
}

function normalizeRenderableTiles(tiles, existingBuffersById = new Map()) {
  if (!Array.isArray(tiles)) {
    return [];
  }

  return tiles
    .map((tile, index) => {
      const id = tile?.id || `tile:${index}`;
      const points =
        tile && Object.prototype.hasOwnProperty.call(Object(tile), "points")
          ? tile.points
          : tile;
      const pointCount = getPointSetCount(points);
      const existingBuffer = existingBuffersById.get(id);
      const renderKey =
        tile?.renderKey ||
        `${id}:${pointCount || existingBuffer?.pointCount || 0}`;

      return {
        id,
        points,
        voxelSizeMeters: tile?.voxelSizeMeters ?? (pointCount ? 0 : existingBuffer?.voxelSizeMeters) ?? 0,
        pointCount:
          pointCount || tile?.pointCount || existingBuffer?.pointCount || 0,
        renderKey,
      };
    })
    .filter(
      (tile) =>
        getPointSetCount(tile.points) > 0 ||
        existingBuffersById.get(tile.id)?.renderKey === tile.renderKey,
    );
}

function createPointCloudTileBuffers(gl, pointBatches, map, useTerrainElevation) {
  return pointBatches.map((pointBatch, index) =>
    createPointCloudTileBuffer(
      gl,
      {
        id: `point-batch:${index}`,
        points: pointBatch,
        renderKey: `point-batch:${index}:${getPointSetCount(pointBatch)}`,
      },
      map,
      useTerrainElevation,
    ),
  );
}

function createPointCloudTileBuffer(gl, tile, map, useTerrainElevation) {
  const pointBuffer = createPointCloudBuffer(
    tile.points,
    map,
    useTerrainElevation,
  );
  const buffer = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, pointBuffer.data, gl.DYNAMIC_DRAW);

  return {
    id: tile.id,
    renderKey: tile.renderKey,
    buffer,
    voxelSizeMeters: tile.voxelSizeMeters,
    verticalScale: useTerrainElevation ? getTerrainExaggeration() : 1,
    pointCount: pointBuffer.pointCount,
    anchorMercator: pointBuffer.anchorMercator,
    metersToMercator: pointBuffer.metersToMercator,
    pickPositions: new Float32Array(pointBuffer.data),
  };
}

function deletePointCloudTileBuffers(gl, tileBuffers = []) {
  tileBuffers.forEach((tileBuffer) => {
    deletePointCloudTileBuffer(gl, tileBuffer);
  });
}

function deletePointCloudTileBuffer(gl, tileBuffer) {
  if (tileBuffer?.buffer) {
    gl.deleteBuffer(tileBuffer.buffer);
  }
}

function updateDetailBoxBuffer(layer, map) {
  const gl = layer.gl;
  const mercatorPoints = [];
  const offsets = [];

  layer.tiles.forEach((tile) => {
    const lines = createDetailBoxMercatorLinePoints(tile);
    mercatorPoints.push(...lines);
    const metersToMercator = lines[0]?.meterInMercatorCoordinateUnits?.() || 0;
    const offset = PointScapeExplodedView.offsetMeters(tile.depth, explodedViewLayout) * metersToMercator;
    for (let index = 0; index < lines.length; index += 1) offsets.push(offset);
  });

  if (layer.buffer) {
    gl.deleteBuffer(layer.buffer);
    layer.buffer = null;
  }

  layer.lineVertexCount = mercatorPoints.length;

  if (!mercatorPoints.length) {
    layer.anchorMercator = [0, 0, 0];
    return;
  }

  layer.anchorMercator = getMercatorPointCloudAnchor(mercatorPoints);
  const positions = new Float32Array(mercatorPoints.length * 4);

  mercatorPoints.forEach((point, index) => {
    const offset = index * 4;
    positions[offset] = point.x - layer.anchorMercator[0];
    positions[offset + 1] = point.y - layer.anchorMercator[1];
    positions[offset + 2] = point.z - layer.anchorMercator[2];
    positions[offset + 3] = offsets[index];
  });

  layer.buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, layer.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

function createDetailBoxMercatorLinePoints(tile) {
  const corners = createDetailBoxMercatorCorners(tile);

  if (corners.length !== 8) {
    return [];
  }

  const edgeIndexes = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];

  return edgeIndexes.flatMap(([start, end]) => [corners[start], corners[end]]);
}

function createDetailBoxMercatorCorners(tile) {
  const bounds = tile?.bounds;

  if (!bounds) {
    return [];
  }

  const { minZ, maxZ } = getTileVerticalBounds(tile);
  const coordinates = [
    [bounds.minX, bounds.minY, minZ],
    [bounds.maxX, bounds.minY, minZ],
    [bounds.maxX, bounds.maxY, minZ],
    [bounds.minX, bounds.maxY, minZ],
    [bounds.minX, bounds.minY, maxZ],
    [bounds.maxX, bounds.minY, maxZ],
    [bounds.maxX, bounds.maxY, maxZ],
    [bounds.minX, bounds.maxY, maxZ],
  ];

  return coordinates
    .map(([x, y, z]) => projectTileMetricCornerToMercator(tile, x, y, z))
    .filter(Boolean);
}

function projectTileMetricCornerToMercator(tile, x, y, z) {
  const crs = getTileCrs(tile);
  const verticalExaggeration = terrainToggle.checked ? getTerrainExaggeration() : 1;
  const altitude =
    z * verticalExaggeration + getPointCloudOffsetMeters();
  const projected =
    crs.kind === "geographic"
      ? webMercatorMetersToLngLat(x, y)
      : projectLasCoordinate(x, y, z, crs);
  const lng = projected.lng;
  const lat = projected.lat;

  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    Math.abs(lng) > 180 ||
    Math.abs(lat) > 90
  ) {
    return null;
  }

  return maplibregl.MercatorCoordinate.fromLngLat({ lng, lat }, altitude);
}

function getMercatorPointCloudAnchor(points) {
  const totals = points.reduce(
    (accumulator, point) => {
      accumulator.x += point.x;
      accumulator.y += point.y;
      accumulator.z += point.z;
      return accumulator;
    },
    { x: 0, y: 0, z: 0 },
  );

  return [
    totals.x / points.length,
    totals.y / points.length,
    totals.z / points.length,
  ];
}

function drawPointCloudTileBuffers(layer, gl, matrix, tiles, images) {
  const textureUnits = [gl.TEXTURE1, gl.TEXTURE2];
  const previousActiveUnit = images?.size ? gl.getParameter(gl.ACTIVE_TEXTURE) : null;
  const previousTextures = previousActiveUnit === null ? [] : textureUnits.map(unit => {
    gl.activeTexture(unit);
    return gl.getParameter(gl.TEXTURE_BINDING_2D);
  });
  if (images?.size) {
    gl.uniform1i(layer.imageColorLocation, 1);
    gl.uniform1i(layer.imageDepthLocation, 2);
  }
  tiles.forEach((tileBuffer) => {
    if (!tileBuffer.buffer || !tileBuffer.pointCount) {
      return;
    }

    gl.uniform4fv(
      layer.anchorClipLocation,
      multiplyMatrixAndMercatorPoint(matrix, tileBuffer.anchorMercator),
    );
    gl.uniform1f(layer.metersToMercatorLocation, tileBuffer.metersToMercator || 0);
    const metadata = layer.isolated ? null : currentTileById.get(tileBuffer.id);
    tileBuffer.explodedOffsetMercator = metadata
      ? PointScapeExplodedView.offsetMeters(metadata.depth, explodedViewLayout) *
        (tileBuffer.metersToMercator || 0) : 0;
    tileBuffer.explodedProgress = explodedViewProgress;
    gl.uniform1f(layer.explodedOffsetLocation,
      tileBuffer.explodedOffsetMercator * explodedViewProgress);
    const image = images?.get(tileBuffer.id);
    if (image) {
      gl.uniform1i(layer.voxelEnabledLocation, false);
      gl.uniform1i(layer.imageEnabledLocation, true);
      gl.uniformMatrix4fv(layer.imageInverseLocation, false, image.inverseCameraMatrix);
      for (const [index, texture] of [image.color, image.depth].entries()) {
        gl.activeTexture(textureUnits[index]);
        gl.bindTexture(gl.TEXTURE_2D, texture);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, image.buffer);
      gl.vertexAttribPointer(layer.positionLocation, 1, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(layer.classificationLocation);
      drawTimedNodePoints(layer, gl, tileBuffer, image.texelCount);
      gl.enableVertexAttribArray(layer.classificationLocation);
      gl.uniform1i(layer.imageEnabledLocation, false);
      return;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, tileBuffer.buffer);
    gl.vertexAttribPointer(
      layer.positionLocation,
      3,
      gl.FLOAT,
      false,
      pointCloudVertexStrideBytes,
      0,
    );
    gl.vertexAttribPointer(
      layer.classificationLocation,
      1,
      gl.UNSIGNED_BYTE,
      false,
      pointCloudVertexStrideBytes,
      12,
    );
    const voxel = Boolean(tileBuffer.voxelSizeMeters && layer.voxelMesh);
    gl.uniform1i(layer.voxelEnabledLocation, voxel);
    if (!voxel) {
      drawTimedNodePoints(layer, gl, tileBuffer, tileBuffer.pointCount);
      return;
    }
    const side = tileBuffer.voxelSizeMeters * tileBuffer.metersToMercator;
    gl.uniform3f(layer.voxelExtentLocation, side, side, side * tileBuffer.verticalScale);
    gl.bindBuffer(gl.ARRAY_BUFFER, layer.voxelMesh);
    gl.enableVertexAttribArray(layer.voxelCornerLocation);
    gl.vertexAttribPointer(layer.voxelCornerLocation, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(layer.positionLocation, 1);
    gl.vertexAttribDivisor(layer.classificationLocation, 1);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, layer.voxelVertexCount, tileBuffer.pointCount);
    gl.vertexAttribDivisor(layer.positionLocation, 0);
    gl.vertexAttribDivisor(layer.classificationLocation, 0);
    gl.disableVertexAttribArray(layer.voxelCornerLocation);
  });
  if (previousActiveUnit !== null) {
    previousTextures.forEach((texture, index) => {
      gl.activeTexture(textureUnits[index]);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    });
    gl.activeTexture(previousActiveUnit);
  }
}

function drawTimedNodePoints(layer, gl, tile, count) {
  const timed = layer.imageTimings?.beginDraw(tile);
  gl.drawArrays(gl.POINTS, 0, count);
  if (timed) layer.imageTimings.endDraw();
}

function uploadImageImpostor(gl, textures) {
  const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
  const previousBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  const unpackFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
  const unpackPremultiply = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  const upload = (format, layout, type, pixels) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, format, textures.width, textures.height, 0, layout, type, pixels);
    return texture;
  };
  const color = upload(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(textures.color.buffer));
  const depth = upload(gl.R32F, gl.RED, gl.FLOAT, textures.depth);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, textures.texels, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, previousBuffer);
  gl.bindTexture(gl.TEXTURE_2D, previousTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, unpackFlip);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, unpackPremultiply);
  return { color, depth, buffer, texelCount: textures.texels.length,
    cameraMatrix: textures.cameraMatrix, inverseCameraMatrix: new Float32Array(textures.inverseCameraMatrix),
    viewProjection: textures.viewProjection, aspect: textures.aspect, textureSize: textures.width };
}

function deleteImageImpostor(gl, capture) {
  gl.deleteTexture(capture.color);
  gl.deleteTexture(capture.depth);
  gl.deleteBuffer(capture.buffer);
}

function createPointCloudBuffer(points, map, useTerrainElevation) {
  const pointCount = getPointCollectionCount(points);
  const data = new ArrayBuffer(pointCount * pointCloudVertexStrideBytes);
  const positions = new Float32Array(data);
  const classifications = new Uint8Array(data);
  const verticalExaggeration = useTerrainElevation ? getTerrainExaggeration() : 1;
  const pointOffsetMeters = getPointCloudOffsetMeters();
  const anchor = createPointCloudMercatorAnchor(
    points,
    map,
    useTerrainElevation,
    verticalExaggeration,
    pointOffsetMeters,
  );
  const anchorMercator = anchor.coordinates;

  let index = 0;
  forEachPointInCollection(points, (point) => {
    const hasPointAltitude = Number.isFinite(point.altitudeMeters);
    const elevation = hasPointAltitude
      ? point.altitudeMeters * verticalExaggeration + pointOffsetMeters
      : useTerrainElevation
        ? getTerrainElevation(map, point) * verticalExaggeration +
          pointOffsetMeters
        : pointOffsetMeters;
    const mercator = maplibregl.MercatorCoordinate.fromLngLat(
      point,
      elevation,
    );

    const floatOffset = index * 4;
    const byteOffset = index * pointCloudVertexStrideBytes;

    positions[floatOffset] = mercator.x - anchorMercator[0];
    positions[floatOffset + 1] = mercator.y - anchorMercator[1];
    positions[floatOffset + 2] = mercator.z - anchorMercator[2];
    classifications[byteOffset + 12] = point.classification || 0;
    index += 1;
  });

  return {
    data,
    pointCount,
    anchorMercator,
    metersToMercator: anchor.metersToMercator,
  };
}

function createPointCloudMercatorAnchor(
  points,
  map,
  useTerrainElevation,
  verticalExaggeration,
  pointOffsetMeters,
) {
  if (!getPointCollectionCount(points)) {
    return { coordinates: [0, 0, 0], metersToMercator: 0 };
  }

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minElevation = Infinity;
  let maxElevation = -Infinity;

  forEachPointInCollection(points, (point) => {
    const hasPointAltitude = Number.isFinite(point.altitudeMeters);
    const elevation = hasPointAltitude
      ? point.altitudeMeters * verticalExaggeration + pointOffsetMeters
      : useTerrainElevation
        ? getTerrainElevation(map, point) * verticalExaggeration +
          pointOffsetMeters
        : pointOffsetMeters;

    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minElevation = Math.min(minElevation, elevation);
    maxElevation = Math.max(maxElevation, elevation);
  });

  const anchorLng = (minLng + maxLng) / 2;
  const anchorLat = (minLat + maxLat) / 2;
  const anchorElevation = (minElevation + maxElevation) / 2;
  const anchor = maplibregl.MercatorCoordinate.fromLngLat(
    { lng: anchorLng, lat: anchorLat },
    anchorElevation,
  );

  return {
    coordinates: [anchor.x, anchor.y, anchor.z],
    metersToMercator: typeof anchor.meterInMercatorCoordinateUnits === "function"
      ? anchor.meterInMercatorCoordinateUnits()
      : 1 / (40075016.68557849 * Math.max(Math.cos(anchorLat * Math.PI / 180), 0.01)),
  };
}

function multiplyMatrixAndMercatorPoint(matrix, anchorMercator = [0, 0, 0]) {
  if (!matrix) {
    return new Float32Array([0, 0, 0, 1]);
  }

  const x = anchorMercator[0] || 0;
  const y = anchorMercator[1] || 0;
  const z = anchorMercator[2] || 0;

  return new Float32Array([
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15],
  ]);
}

function getLasClassColor(classification = 0) {
  return lasClassColors.get(classification) || fallbackLasClassColor;
}

function getShaderClassColorPalette() {
  const entries = lasClassifications
    .slice(0, maxShaderClassColors)
    .map(({ code }) => ({
      code,
      color: getLasClassColor(code),
    }));
  const codes = new Float32Array(maxShaderClassColors);
  const colors = new Float32Array(maxShaderClassColors * 4);

  entries.forEach(({ code, color }, index) => {
    codes[index] = code;
    const colorOffset = index * 4;
    colors[colorOffset] = color[0];
    colors[colorOffset + 1] = color[1];
    colors[colorOffset + 2] = color[2];
    colors[colorOffset + 3] = color[3];
  });

  return { codes, colors, count: entries.length };
}

function setPointCloudClassColorUniforms(gl, layer, palette = getShaderClassColorPalette(), fallback = fallbackLasClassColor) {

  gl.uniform1i(layer.classCountLocation, palette.count);
  gl.uniform1fv(layer.classCodesLocation, palette.codes);
  gl.uniform4fv(layer.classColorsLocation, palette.colors);
  gl.uniform4fv(layer.fallbackColorLocation, fallback);
}

function randomizeLasClassColors() {
  lasClassifications.forEach(({ code }) => {
    lasClassColors.set(code, createRandomClassColor(code));
  });
  fallbackLasClassColor.splice(0, 4, ...createRandomClassColor(999));
  const layer = window.pointCloudLayer;
  if (layer?.imageCache) {
    layer.imagePaletteKey = JSON.stringify([[...lasClassColors], fallbackLasClassColor]);
    layer.imageCache.clear();
  }

  renderClassificationLegend();
  window.mapLibreMap?.triggerRepaint();
}

function createRandomClassColor(seed) {
  const hue = Math.random();
  const saturation = 0.58 + Math.random() * 0.32;
  const lightness = 0.46 + Math.random() * 0.18;
  const [red, green, blue] = hslToRgb(
    (hue + ((seed * 0.137) % 1)) % 1,
    saturation,
    lightness,
  );

  return [red, green, blue, 0.9];
}

function hslToRgb(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hueSection = hue * 6;
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
  const match = lightness - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hueSection < 1) {
    red = chroma;
    green = secondary;
  } else if (hueSection < 2) {
    red = secondary;
    green = chroma;
  } else if (hueSection < 3) {
    green = chroma;
    blue = secondary;
  } else if (hueSection < 4) {
    green = secondary;
    blue = chroma;
  } else if (hueSection < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }

  return [red + match, green + match, blue + match];
}

function getTerrainElevation(map, point) {
  if (typeof map.queryTerrainElevation !== "function") {
    return 0;
  }

  try {
    return map.queryTerrainElevation(point, { exaggerated: false }) || 0;
  } catch (error) {
    return 0;
  }
}

function createPointCloudShaders(isWebGl2) {
  if (isWebGl2) {
    return {
      vertex: `#version 300 es
        precision highp float;
        uniform mat4 u_matrix;
        uniform vec4 u_anchor_clip;
        uniform float u_point_radius_meters;
        uniform float u_min_point_radius_px;
        uniform float u_max_point_radius_px;
        uniform float u_projection_pixels_per_mercator;
        uniform float u_meters_to_mercator;
        uniform float u_exploded_offset;
        uniform float u_depth_bias;
        uniform bool u_voxel;
        uniform vec3 u_voxel_extent;
        uniform bool u_image;
        uniform highp sampler2D u_image_color;
        uniform highp sampler2D u_image_depth;
        uniform mat4 u_capture_inverse;
        uniform int u_class_count;
        uniform float u_class_codes[${maxShaderClassColors}];
        uniform vec4 u_class_colors[${maxShaderClassColors}];
        uniform vec4 u_fallback_color;
        in vec3 a_position;
        in vec4 a_voxel_corner;
        in float a_classification;
        out vec4 v_color;
        out float v_edl_depth;

        vec4 getClassColor(float classification) {
          vec4 color = u_fallback_color;

          for (int index = 0; index < ${maxShaderClassColors}; index++) {
            if (
              index < u_class_count &&
              abs(classification - u_class_codes[index]) < 0.5
            ) {
              color = u_class_colors[index];
            }
          }

          return color;
        }

        void main() {
          vec3 position = a_position + vec3(0.0, 0.0, u_exploded_offset);
          if (u_image) {
            ivec2 size = textureSize(u_image_depth, 0);
            int index = int(a_position.x);
            ivec2 pixel = ivec2(index % size.x, index / size.x);
            vec2 ndc = (vec2(pixel) + 0.5) * 2.0 / vec2(size) - 1.0;
            float depth = texelFetch(u_image_depth, pixel, 0).r;
            vec4 local = u_capture_inverse * vec4(ndc.x, -ndc.y, depth, 1.0);
            position = local.xyz / local.w;
            v_color = texelFetch(u_image_color, pixel, 0);
          } else {
            if (u_voxel) position += a_voxel_corner.xyz * u_voxel_extent;
            v_color = getClassColor(a_classification);
          }
          gl_Position = u_anchor_clip + u_matrix * vec4(position, 0.0);
          gl_Position.z -= u_depth_bias * gl_Position.w;
          v_edl_depth = log2(max(abs(gl_Position.w), 0.000001));
          float projected_radius_px =
            u_point_radius_meters * u_meters_to_mercator *
            u_projection_pixels_per_mercator / max(abs(gl_Position.w), 0.0000001);
          gl_PointSize = 2.0 * clamp(
            projected_radius_px,
            u_min_point_radius_px,
            u_max_point_radius_px
          );
          if (u_voxel) v_color = vec4(v_color.rgb * a_voxel_corner.w, 1.0);
        }
      `,
      fragment: createEdlPointFragmentShader(true),
    };
  }

  return {
      vertex: `
      precision highp float;
      uniform mat4 u_matrix;
      uniform vec4 u_anchor_clip;
      uniform float u_point_radius_meters;
      uniform float u_min_point_radius_px;
      uniform float u_max_point_radius_px;
      uniform float u_projection_pixels_per_mercator;
      uniform float u_meters_to_mercator;
      uniform float u_exploded_offset;
      uniform float u_depth_bias;
      uniform int u_class_count;
      uniform float u_class_codes[${maxShaderClassColors}];
      uniform vec4 u_class_colors[${maxShaderClassColors}];
      uniform vec4 u_fallback_color;
      attribute vec3 a_position;
      attribute float a_classification;
      varying vec4 v_color;
      varying float v_edl_depth;

      vec4 getClassColor(float classification) {
        vec4 color = u_fallback_color;

        for (int index = 0; index < ${maxShaderClassColors}; index++) {
          if (
            index < u_class_count &&
            abs(classification - u_class_codes[index]) < 0.5
          ) {
            color = u_class_colors[index];
          }
        }

        return color;
      }

      void main() {
        gl_Position = u_anchor_clip + u_matrix * vec4(a_position.xy, a_position.z + u_exploded_offset, 0.0);
        gl_Position.z -= u_depth_bias * gl_Position.w;
        v_edl_depth = log2(max(abs(gl_Position.w), 0.000001));
        float projected_radius_px =
          u_point_radius_meters * u_meters_to_mercator *
          u_projection_pixels_per_mercator / max(abs(gl_Position.w), 0.0000001);
        gl_PointSize = 2.0 * clamp(
          projected_radius_px,
          u_min_point_radius_px,
          u_max_point_radius_px
        );
        v_color = getClassColor(a_classification);
      }
    `,
    fragment: createEdlPointFragmentShader(false),
  };
}

function createEdlPointFragmentShader(isWebGl2) {
  const highlightImpostors = isWebGl2 ? "u_impostor_debug && (u_image || u_voxel)" : "false";
  return `${isWebGl2 ? "#version 300 es" : ""}
    precision highp float;
    ${isWebGl2 ? "in" : "varying"} vec4 v_color;
    ${isWebGl2 ? "in" : "varying"} float v_edl_depth;
    uniform bool u_edl_depth_pass;
    uniform bool u_voxel;
    ${isWebGl2 ? "uniform bool u_image; uniform bool u_impostor_debug;" : ""}
    uniform bool u_edl_enabled;
    uniform sampler2D u_edl_depth_map;
    uniform vec2 u_edl_texture_size;
    uniform float u_edl_radius_px;
    uniform float u_edl_strength;
    uniform int u_edl_neighbors;
    ${isWebGl2 ? "out vec4 fragColor;" : ""}

    float unpackDepth(vec4 sampleValue) {
      return (sampleValue.r * 255.0 + sampleValue.g * 65280.0) / 65535.0;
    }

    void main() {
      if (!u_voxel && length(gl_PointCoord - vec2(0.5)) > 0.5) discard;
      vec4 color = v_color;
      if (u_edl_depth_pass) {
        // Logarithmic view depth, packed into 16 bits; alpha marks occupied pixels.
        float depth = clamp((v_edl_depth + 20.0) / 40.0, 0.0, 1.0);
        float packed = floor(depth * 65535.0 + 0.5);
        color = vec4(mod(packed, 256.0) / 255.0,
                     floor(packed / 256.0) / 255.0, 0.0, 1.0);
      } else if (${highlightImpostors}) {
        color = vec4(0.224, 1.0, 0.0, 1.0);
      } else if (u_edl_enabled) {
        vec2 uv = gl_FragCoord.xy / u_edl_texture_size;
        vec4 center = ${isWebGl2 ? "texture" : "texture2D"}(u_edl_depth_map, uv);
        if (center.a > 0.5) {
          float response = 0.0;
          float centerDepth = unpackDepth(center);
          for (int i = 0; i < 16; i++) {
            if (i >= u_edl_neighbors) break;
            float angle = 6.28318530718 * float(i) / float(u_edl_neighbors);
            vec2 direction = vec2(cos(angle), sin(angle));
            vec2 neighborUv = uv + direction * u_edl_radius_px / u_edl_texture_size;
            if (neighborUv.x < 0.0 || neighborUv.x > 1.0 ||
                neighborUv.y < 0.0 || neighborUv.y > 1.0) continue;
            vec4 neighbor = ${isWebGl2 ? "texture" : "texture2D"}(u_edl_depth_map, neighborUv);
            if (neighbor.a > 0.5) {
              response += max(0.0, centerDepth - unpackDepth(neighbor));
            }
          }
          response /= float(u_edl_neighbors);
          color.rgb *= exp(-response * 12000.0 * u_edl_strength);
        }
      }
      ${isWebGl2 ? "fragColor" : "gl_FragColor"} = color;
    }
  `;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Could not link the point shader: ${message}`);
  }

  return program;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Could not compile the point shader: ${message}`);
  }

  return shader;
}

function bindLayerMenu() {
  pointscapeUiController.bind();
}
function setBaseLayer(baseLayer) {
  const map = window.mapLibreMap;
  const isSatellite = baseLayer === "satellite";

  if (!isSatellite) {
    addStreetLayer();
  }

  map.setLayoutProperty(
    layerIds.satelliteLayer,
    "visibility",
    isSatellite ? "visible" : "none",
  );

  if (isSatellite) {
    removeStreetLayer();
  }
}

function renderClassificationLegend() {
  const entries = [
    ...lasClassifications,
    { code: "Other", label: "Other classifications", color: fallbackLasClassColor },
  ];

  classificationLegend.replaceChildren(
    ...entries.map(({ code, label, color }) => {
      const item = document.createElement("div");
      item.className = "classification-item";

      const swatch = document.createElement("span");
      swatch.className = "classification-swatch";
      swatch.style.backgroundColor = `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${color[3]})`;

      const codeElement = document.createElement("span");
      codeElement.className = "classification-code";
      codeElement.textContent = String(code);

      const labelElement = document.createElement("span");
      labelElement.textContent = label;

      item.append(swatch, codeElement, labelElement);
      return item;
    }),
  );
}

function addStreetLayer() {
  const map = window.mapLibreMap;

  if (!map.getSource(layerIds.streetSource)) {
    map.addSource(layerIds.streetSource, {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    });
  }

  if (!map.getLayer(layerIds.streetLayer)) {
    map.addLayer(
      {
        id: layerIds.streetLayer,
        type: "raster",
        source: layerIds.streetSource,
      },
      layerIds.satelliteLayer,
    );
  }
}

function removeStreetLayer() {
  const map = window.mapLibreMap;

  if (map.getLayer(layerIds.streetLayer)) {
    map.removeLayer(layerIds.streetLayer);
  }
  if (map.getSource(layerIds.streetSource)) {
    map.removeSource(layerIds.streetSource);
  }
}

function setBlockDetailsVisible(visible) {
  const map = window.mapLibreMap;

  if (!map) {
    return;
  }

  if (map.getLayer(layerIds.blockLabelsLayer)) {
    map.setLayoutProperty(
      layerIds.blockLabelsLayer,
      "visibility",
      visible ? "visible" : "none",
    );
  }
}

function setBlockBoundsVisible(visible) {
  const map = window.mapLibreMap;

  if (!map) {
    return;
  }

  if (map.getLayer(layerIds.blockBoundsLayer)) {
    map.setLayoutProperty(
      layerIds.blockBoundsLayer,
      "visibility",
      visible ? "visible" : "none",
    );
  }
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function updateBlockBoundsLayer(blocks) {
  currentPointCloudTiles = blocks;
  const source = window.mapLibreMap?.getSource(layerIds.blockBoundsSource);

  if (source?.setData) {
    source.setData(createBlockBoundsGeoJson(blocks));
  }
}

function updateDetailBoxesLayer() {
  const map = window.mapLibreMap;
  const layer = window.detailBoxesLayer;

  if (!map || !layer?.setTiles) {
    return;
  }

  if (explodedViewActive || explodedViewProgress > 0) {
    const geometryKey = `${terrainToggle.checked}:${getTerrainExaggeration()}:${getPointCloudOffsetMeters()}`;
    if (layer.tiles !== currentTileIndex || layer.geometryKey !== geometryKey) {
      explodedViewLayout = PointScapeExplodedView.createLayout(currentTileIndex,
        terrainToggle.checked ? getTerrainExaggeration() : 1);
      layer.setTiles(currentTileIndex, map);
      layer.geometryKey = geometryKey;
    }
    return;
  }

  if (!lodDetailBoxesToggle?.checked) {
    layer.setTiles([], map);
    return;
  }

  const pendingTiles = currentTileIndex.filter((tile) =>
    currentPendingDetailTileIds.has(tile.id),
  );
  layer.setTiles(pendingTiles, map);
}

function resetExplodedView() {
  pointscapeExplodedLoader.cancel();
  cancelAnimationFrame(explodedViewAnimation);
  explodedViewAnimation = 0;
  explodedViewActive = false;
  explodedViewProgress = 0;
  explodedViewLayout = { maxDepth: 0, levelSpacingMeters: 0 };
  currentTileById = new Map();
  explodedViewButton.disabled = true;
  explodedViewButton.setAttribute("aria-pressed", "false");
  explodedViewButton.textContent = "Exploded View";
}

function toggleExplodedView() {
  if (explodedViewButton.disabled || !currentTileIndex.length) return;
  explodedViewActive = !explodedViewActive;
  explodedViewButton.setAttribute("aria-pressed", String(explodedViewActive));
  explodedViewButton.textContent = explodedViewActive ? "Normal View" : "Exploded View";
  if (explodedViewActive) {
    pointscapeLodStreamer.reset();
    restartExplodedViewLoading();
  } else {
    pointscapeExplodedLoader.cancel();
    applyPointCloudTileSelection({ updateStatus: true });
  }
  updateDetailBoxesLayer();
  const roots = currentTileIndex.filter((tile) => !tile.parentId);
  flyToPointCloudTiles(roots, {
    duration: 1100,
    extraAltitudeMeters: explodedViewActive
      ? PointScapeExplodedView.offsetMeters(0, explodedViewLayout) : 0,
  });

  const start = performance.now();
  const from = explodedViewProgress;
  const to = explodedViewActive ? 1 : 0;
  const duration = 1100 * Math.abs(to - from);
  cancelAnimationFrame(explodedViewAnimation);
  const animate = (now) => {
    const fraction = duration ? Math.min(1, (now - start) / duration) : 1;
    explodedViewProgress = from + (to - from) *
      PointScapeExplodedView.easeInOutCubic(fraction);
    window.mapLibreMap?.triggerRepaint();
    if (fraction < 1) {
      explodedViewAnimation = requestAnimationFrame(animate);
    } else {
      explodedViewProgress = to;
      explodedViewAnimation = 0;
      if (!explodedViewActive) updateDetailBoxesLayer();
    }
  };
  explodedViewAnimation = requestAnimationFrame(animate);
}

async function restartExplodedViewLoading() {
  if (!explodedViewActive || !window.pointCloudLayer || !window.mapLibreMap) return;
  pointscapeExplodedLoader.cancel();
  const generation = pointscapeExplodedLoader.generation;
  try {
    const incomplete = [...copcTileSources].filter(([fileIndex]) =>
      currentTileIndex.some(tile => tile.fileIndex === fileIndex && tile.hierarchyPending));
    if (incomplete.length) {
      lasStatus.textContent = "Reading the full COPC hierarchy for Exploded View…";
      for (const [fileIndex, source] of incomplete) {
        source.allPages ||= source.client.request("all-pages").catch(error => {
          source.allPages = null;
          throw error;
        });
        const tiles = await source.allPages;
        if (!explodedViewActive || generation !== pointscapeExplodedLoader.generation ||
            copcTileSources.get(fileIndex) !== source) return;
        integrateCopcTiles(tiles);
      }
      updateDetailBoxesLayer();
    }
  } catch (error) {
    if (!explodedViewActive || generation !== pointscapeExplodedLoader.generation) return;
    toggleExplodedView();
    lasStatus.textContent = `Exploded View could not read the COPC hierarchy: ${error.message}`;
    return;
  }
  window.pointCloudLayer.setTiles([], window.mapLibreMap, { forceRebuild: true });
  currentPointCloudPoints = [];
  updateLivePointCloudStats(0, 0, 0);
  pointscapeExplodedLoader.start(currentTileIndex, pointCloudConfig.explodedPointFraction)
    .catch((error) => {
      if (!explodedViewActive) return;
      console.error(error);
      lasStatus.textContent = `Exploded View could not load the point data: ${error.message}`;
    });
}

function createBlockBoundsGeoJson(blocks) {
  const mapCenter = window.mapLibreMap?.getCenter?.();
  const map = window.mapLibreMap;

  return {
    type: "FeatureCollection",
    features: blocks
      .filter((block) => block.corners?.length === 4 && block.pointCount > 0)
      .map((block) => {
        const distanceMeters = getTileDistanceMeters(block, mapCenter, map);
        const diagonalDistanceRatio = getTileDiagonalDistanceRatio(
          block,
          distanceMeters,
        );

        return {
          type: "Feature",
          properties: {
            id: block.key,
            pointCount: block.pointCount,
            detailLabel: formatTileDetailLabel(
              block,
              distanceMeters,
              diagonalDistanceRatio,
            ),
          },
          geometry: {
            type: "Polygon",
            coordinates: [[...block.corners, block.corners[0]]],
          },
        };
      }),
  };
}

function formatTileDetailLabel(tile, distanceMeters, diagonalDistanceRatio) {
  return `${getTileTypeLabel(tile)} LOD ${tile.depth || 0} - ${formatDistanceLabel(distanceMeters)} - diag/dist ${formatRatio(diagonalDistanceRatio)}`;
}

function getTileTypeLabel(tile) {
  if (!tile.parentId) {
    return "root";
  }

  if (tile.childIds?.length) {
    return "intermediate";
  }

  return "leaf";
}

function getTileDiagonalDistanceRatio(tile, distanceMeters) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return Infinity;
  }

  return getTileDiagonalMeters(tile) / distanceMeters;
}

function formatRatio(ratio) {
  if (ratio === Infinity) {
    return "inf";
  }

  if (!Number.isFinite(ratio)) {
    return "";
  }

  return `${ratio.toFixed(ratio < 10 ? 2 : 1)}x`;
}

function getLngLatDistanceMeters(from, to) {
  if (!from || !to) {
    return NaN;
  }

  const fromLng = Number.isFinite(from.lng) ? from.lng : from[0];
  const fromLat = Number.isFinite(from.lat) ? from.lat : from[1];
  const toLng = Number.isFinite(to.lng) ? to.lng : to[0];
  const toLat = Number.isFinite(to.lat) ? to.lat : to[1];

  if (
    !Number.isFinite(fromLng) ||
    !Number.isFinite(fromLat) ||
    !Number.isFinite(toLng) ||
    !Number.isFinite(toLat)
  ) {
    return NaN;
  }

  const earthRadius = 6371008.8;
  const fromPhi = fromLat * (Math.PI / 180);
  const toPhi = toLat * (Math.PI / 180);
  const deltaPhi = (toLat - fromLat) * (Math.PI / 180);
  const deltaLambda = (toLng - fromLng) * (Math.PI / 180);
  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(fromPhi) *
      Math.cos(toPhi) *
      Math.sin(deltaLambda / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistanceLabel(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) {
    return "";
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(distanceMeters < 10000 ? 1 : 0)} km`;
}

function getSelectedBaseLayer() {
  return (
    Array.from(baseLayerInputs).find((input) => input.checked)?.value ||
    "satellite"
  );
}

function syncInitialLayerState() {
  setBaseLayer(getSelectedBaseLayer());

  if (terrainToggle.checked) {
    setElevationEnabled(true, { moveCamera: false });
  }
}

function setElevationEnabled(enabled, options = {}) {
  const map = window.mapLibreMap;
  const moveCamera = options.moveCamera !== false;

  map.setLayoutProperty(
    layerIds.hillshadeLayer,
    "visibility",
    enabled ? "visible" : "none",
  );

  map.setTerrain(
    enabled
      ? {
          source: layerIds.terrainSource,
          exaggeration: getTerrainExaggeration(),
        }
      : null,
  );

  if (moveCamera) {
    const pitch = enabled ? 72 : 0;
    pitchControl.value = String(pitch);
    pitchValue.textContent = `${pitch}\u00b0`;

    map.easeTo({
      pitch,
      bearing: enabled ? -18 : 0,
      duration: 700,
    });
  }

  refreshPointCloudElevation();
  refreshTileBounds();
  updateDetailBoxesLayer();
  map.once("idle", refreshPointCloudElevation);
}

function applyTerrainExaggeration() {
  if (!window.mapLibreMap || !terrainToggle.checked) {
    return;
  }

  window.mapLibreMap.setTerrain({
    source: layerIds.terrainSource,
    exaggeration: getTerrainExaggeration(),
  });
}

function getTerrainExaggeration() {
  return Number(terrainExaggerationControl.value) || 1;
}

function getPointCloudOffsetMeters() {
  return Number(pointOffsetControl.value) || 0;
}

function getPointPhysicalRadiusMeters() {
  return pointCloudConfig.pointRadiusCentimeters / 100;
}

function getPointMinimumRadiusPixels() {
  return pointCloudConfig.pointMinimumRadiusPixels;
}

function getPointMaximumRadiusPixels() {
  return Math.max(
    getPointMinimumRadiusPixels(),
    pointCloudConfig.pointMaximumRadiusPixels,
  );
}

function syncPointSizingControlsFromConfig() {
  pointRadiusControl.value = String(pointCloudConfig.pointRadiusCentimeters);
  pointMinRadiusControl.value = String(pointCloudConfig.pointMinimumRadiusPixels);
  pointMaxRadiusControl.value = String(pointCloudConfig.pointMaximumRadiusPixels);
  pointRadiusValue.textContent = `${formatNumber(pointCloudConfig.pointRadiusCentimeters, 0)} cm`;
  pointMinRadiusValue.textContent = `${formatNumber(pointCloudConfig.pointMinimumRadiusPixels, 2)} px`;
  pointMaxRadiusValue.textContent = `${formatNumber(pointCloudConfig.pointMaximumRadiusPixels, 0)} px`;
}

function syncEdlControlsFromConfig() {
  edlToggle.checked = pointCloudConfig.edlEnabled;
  edlStrengthControl.value = String(pointCloudConfig.edlStrength);
  edlRadiusControl.value = String(pointCloudConfig.edlRadiusPixels);
  edlNeighborsControl.value = String(pointCloudConfig.edlNeighborCount);
  edlStrengthValue.textContent = pointCloudConfig.edlStrength.toFixed(1);
  edlRadiusValue.textContent = `${pointCloudConfig.edlRadiusPixels.toFixed(1)} px`;
  edlNeighborsValue.textContent = String(pointCloudConfig.edlNeighborCount);
  const disabled = !pointCloudConfig.edlEnabled;
  [edlStrengthControl, edlRadiusControl, edlNeighborsControl].forEach(
    (control) => { control.disabled = disabled; },
  );
}

function getSelectedLasIndexingMode() {
  return (
    Array.from(lasIndexingModeInputs).find((input) => input.checked)?.value ||
    "quadtree"
  );
}

function getLasIndexingModeLabel(mode = getSelectedLasIndexingMode()) {
  return mode === "m3no" ? "M3NO" : "QuadTree";
}

function syncLodControlsFromConfig() {
  if (lodScreenDiagonalControl) {
    lodScreenDiagonalControl.value = String(
      pointCloudConfig.fullResolutionAngularDiagonalDegrees,
    );
  }

  if (lodHysteresisControl) {
    lodHysteresisControl.value = String(
      pointCloudConfig.tileCollapseHysteresisRatio,
    );
  }

  if (tileMinDiagonalControl) {
    tileMinDiagonalControl.value = String(pointCloudConfig.tileMinDiagonalMeters);
  }

  if (tileMaxDepthControl) {
    tileMaxDepthControl.value = String(pointCloudConfig.tileMaxDepth);
  }

  updateLodControlLabels();
}

function updateLodControlLabels() {
  if (lodScreenDiagonalValue) {
    lodScreenDiagonalValue.textContent = `${formatNumber(
      pointCloudConfig.fullResolutionAngularDiagonalDegrees,
      2,
    )} deg`;
  }

  if (lodPointBudgetControl) {
    lodPointBudgetControl.value = String(pointCloudConfig.residentPointBudget);
  }

  if (lodHysteresisValue) {
    lodHysteresisValue.textContent = `${Math.round(
      pointCloudConfig.tileCollapseHysteresisRatio * 100,
    )}%`;
  }

  if (lodPointBudgetValue) {
    lodPointBudgetValue.textContent = formatInteger(
      pointCloudConfig.residentPointBudget,
    );
  }
}

function readNumericControl(control, fallback) {
  if (!control) {
    return fallback;
  }

  const value = Number(control.value);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  const min = Number(control.min);
  const max = Number(control.max);
  return Math.min(
    Number.isFinite(max) ? max : value,
    Math.max(Number.isFinite(min) ? min : value, value),
  );
}

function isFullResolutionEnabled() {
  return fullResolutionToggle?.checked !== false;
}

function getDepthBias() {
  return Number(depthBiasControl.value) || 0;
}

function refreshPointCloudElevation() {
  if (window.pointCloudLayer?.updateElevationBuffer && window.mapLibreMap) {
    window.pointCloudLayer.updateElevationBuffer(window.mapLibreMap);
  }
}

function refreshTileBounds() {
  if (currentPointCloudTiles.length && window.mapLibreMap) {
    updateBlockBoundsLayer(currentPointCloudTiles);
  }
}

function getPointCloudFiles(fileList) {
  return Array.from(fileList || []).filter((file) =>
    /\.(las|laz|copc)$/i.test(file.name),
  );
}

async function isCopcInput(file) {
  if (file.url) return true;
  const bytes = new Uint8Array(await file.slice(0, 429).arrayBuffer());
  if (PointScapeCopcReader.hasCopcSignature(bytes)) return true;
  if (/\.las$/i.test(file.name)) return false;
  throw new Error(`${file.name}: expected a COPC octree. Standard compressed LAZ is unsupported.`);
}

function loadCopcDemo(demo) {
  return loadPointCloudFiles([copcDemos.get(demo)]);
}

function resetVolatileTileDb() {
  return pointscapeTileStore.reset();
}

function openVolatileTileDb() {
  return pointscapeTileStore.open();
}

async function getVolatileTileDb() {
  return pointscapeTileStore.getDb();
}

async function clearVolatileTileDb() {
  return pointscapeTileStore.clear();
}

async function saveTileRecords(tileRecords) {
  return pointscapeTileStore.saveRecords(tileRecords);
}

function serializeTileRecordForStorage(record) {
  return {
    ...record,
    points: serializePointSetForStorage(record.points),
    fullPoints: serializePointSetForStorage(record.fullPoints),
  };
}

function serializePointSetForStorage(pointSet) {
  const packedPointSet = ensurePackedPointSet(pointSet);

  if (!packedPointSet || !getPointSetCount(packedPointSet)) {
    return null;
  }

  return {
    pointCount: getPointSetCount(packedPointSet),
    lngLatAltBuffer: getArrayBufferForStorage(packedPointSet.lngLatAlt),
    classificationsBuffer: getArrayBufferForStorage(packedPointSet.classifications),
  };
}

function hydrateStoredTileRecord(record) {
  return {
    ...record,
    points: hydrateStoredPointSet(record.points),
    fullPoints: hydrateStoredPointSet(record.fullPoints),
  };
}

function hydrateStoredPointSet(pointSet) {
  if (!pointSet) {
    return null;
  }

  if (isPackedPointSet(pointSet)) {
    return pointSet;
  }

  if (pointSet.lngLatAltBuffer && pointSet.classificationsBuffer) {
    return {
      pointCount: pointSet.pointCount || 0,
      lngLatAlt: new Float64Array(pointSet.lngLatAltBuffer),
      classifications: new Uint8Array(pointSet.classificationsBuffer),
    };
  }

  return ensurePackedPointSet(pointSet);
}

function ensurePackedPointSet(pointSet) {
  if (!pointSet) {
    return null;
  }

  if (isPackedPointSet(pointSet)) {
    return pointSet;
  }

  if (Array.isArray(pointSet)) {
    return packPointObjects(pointSet);
  }

  if (isPointObject(pointSet)) {
    return packPointObjects([pointSet]);
  }

  return null;
}

function packPointObjects(points) {
  const pointCount = points.length;
  const lngLatAlt = new Float64Array(pointCount * 3);
  const classifications = new Uint8Array(pointCount);

  points.forEach((point, index) => {
    const offset = index * 3;
    lngLatAlt[offset] = point.lng;
    lngLatAlt[offset + 1] = point.lat;
    lngLatAlt[offset + 2] = point.altitudeMeters;
    classifications[index] = point.classification || 0;
  });

  return {
    pointCount,
    lngLatAlt,
    classifications,
  };
}

function getArrayBufferForStorage(typedArray) {
  if (
    typedArray.byteOffset === 0 &&
    typedArray.byteLength === typedArray.buffer.byteLength
  ) {
    return typedArray.buffer;
  }

  return typedArray.buffer.slice(
    typedArray.byteOffset,
    typedArray.byteOffset + typedArray.byteLength,
  );
}

function stripTileRecordPointPayload(record) {
  record.points = null;
  record.fullPoints = null;
}

async function getStoredTileRecord(tileKey) {
  if (tileKey.startsWith("copc:")) return getTileRepresentation(tileKey, "sample");
  return pointscapeTileStore.getRecord(tileKey);
}

function getTileRepresentation(tileKey, source, signal) {
  if (tileKey.startsWith("copc:")) {
    const fileIndex = Number(tileKey.split(":", 3)[1]);
    const dataset = copcTileSources.get(fileIndex);
    const tile = currentTileById.get(tileKey);
    if (source === "full" || !dataset || !tile?.copcChunk) return null;
    return copcDecodePool.read({ source: dataset.input, decodeInfo: dataset.decodeInfo,
      tile, representation: source }, signal);
  }
  return pointscapeTileStore.getRepresentation(tileKey, source);
}

function getProbeSource() {
  const sources = [...copcTileSources.values()];
  if (pointCloudLoadInProgress || !sources.length || !currentTileIndex.length ||
      currentPointCloudSummary?.indexingMode !== "copc") return null;
  const bounds = { ...sources[0].pointBounds };
  for (const source of sources.slice(1)) {
    for (const axis of ["X", "Y", "Z"]) {
      bounds[`min${axis}`] = Math.min(bounds[`min${axis}`], source.pointBounds[`min${axis}`]);
      bounds[`max${axis}`] = Math.max(bounds[`max${axis}`], source.pointBounds[`max${axis}`]);
    }
  }
  return {
    bounds,
    pointCount: sources.reduce((sum, source) => sum + source.decodeInfo.header.pointCount, 0),
    impostorSize: pointCloudConfig.imageImpostorSize,
    records: () => currentTileIndex,
    read: (id, signal) => getTileRepresentation(id, "sample", signal),
    requestPages: requestVisibleCopcPages,
    async loadHierarchy(signal) {
      const batches = await Promise.all(sources.map(source => source.client.request("all-pages", {}, signal)));
      signal.throwIfAborted();
      const records = batches.flat();
      integrateCopcTiles(records);
      return records;
    },
  };
}

function integrateCopcTiles(tiles) {
  if (!tiles.length) return;
  currentTileIndex = mergeTileMetadataRecords(currentTileIndex, tiles);
  for (const tile of tiles) currentTileById.set(tile.id, tile);
  probeMode.recordsChanged();
  if (!currentPointCloudStats || !currentPointCloudSummary) return;
  currentPointCloudSummary.tileCount = currentTileIndex.length;
  currentPointCloudStats.tileCount = currentTileIndex.length;
  currentPointCloudStats.hierarchyPartial = currentTileIndex.some(tile => tile.hierarchyPending);
  currentPointCloudStats.maxPointsPerNode = currentTileIndex.reduce(
    (maximum, tile) => Math.max(maximum, tile.sourcePointCount || 0), 0);
  currentPointCloudStats.maxSampledPointsPerNode = currentTileIndex.reduce(
    (maximum, tile) => Math.max(maximum, tile.sampledPointCount || 0), 0);
  currentPointCloudStats.averagePointsPerNode = currentTileIndex.reduce(
    (total, tile) => total + (tile.sourcePointCount || 0), 0) / currentTileIndex.length;
  renderPointCloudStats();
}

function requestVisibleCopcPages(tiles, priority) {
  const capacity = 2 - pendingCopcPages.size;
  if (capacity <= 0) return;
  const selected = tiles.filter(tile => !pendingCopcPages.has(tile.id) && !failedCopcPages.has(tile.id))
    .sort((a, b) => priority(b) - priority(a)).slice(0, capacity);
  for (const tile of selected) {
    const source = copcTileSources.get(tile.fileIndex);
    if (!source) continue;
    const request = source.client.request("page", { tileId: tile.id });
    pendingCopcPages.set(tile.id, request);
    request.then(records => {
      if (copcTileSources.get(tile.fileIndex) === source) integrateCopcTiles(records);
    }).catch(error => {
      if (copcTileSources.get(tile.fileIndex) !== source) return;
      failedCopcPages.add(tile.id);
      console.warn("COPC hierarchy page could not be read", tile.id, error);
    }).finally(() => {
      if (pendingCopcPages.get(tile.id) !== request) return;
      pendingCopcPages.delete(tile.id);
      pointCloudFinalFrameRefreshPending = true;
      window.mapLibreMap?.triggerRepaint();
    });
  }
}

async function getStoredTileRecords(tileIds) {
  return pointscapeTileStore.getRecords(tileIds);
}

function runTileStoreTransaction(mode, operation) {
  return pointscapeTileStore.runTransaction(mode, operation);
}

window.pointscapeTileDb = {
  getTile: getStoredTileRecord,
  getAllTiles: async () => currentTileIndex,
};

function schedulePointCloudTileRefresh(options = {}) {
  if (!currentTileIndex.length) {
    return;
  }

  applyPointCloudTileSelection(options);
}

function schedulePointCloudTileRefreshAfterRenderedFrame() {
  const map = window.mapLibreMap;
  if (!map || !currentTileIndex.length) return;
  if (!map.isMoving() && !pointCloudFinalFrameRefreshPending) return;

  pointCloudFinalFrameRefreshPending = false;
  if (pointCloudLodRefreshQueued) return;
  pointCloudLodRefreshQueued = true;
  queueMicrotask(() => {
    pointCloudLodRefreshQueued = false;
    schedulePointCloudTileRefresh();
  });
}

const pointscapeLodStreamer = new PointScapeLodStreaming.LodStreamer({
  read: getTileRepresentation,
  select: PointScapeTileSelection.selectActiveTiles,
  yieldFrame: () => new Promise(resolve => requestAnimationFrame(resolve)),
  transitionHoldMs: pointCloudConfig.lodTransitionHoldMs,
  publish: (tiles) => {
    if (explodedViewActive) return;
    const map = window.mapLibreMap;
    const layer = window.pointCloudLayer;
    if (!layer || !map) return;
    layer.setTiles(tiles, map);
    currentPointCloudPoints = layer.points;
    const ids = new Set(tiles.map(tile => tile.id));
    const metadata = currentTileIndex.filter(tile => ids.has(tile.id));
    updateBlockBoundsLayer(metadata);
    const voxelTiles = tiles.filter(tile => tile.voxelSizeMeters);
    const voxelIds = new Set(voxelTiles.map(tile => tile.id));
    const voxelInfo = {
      nodeCount: voxelTiles.length,
      count: voxelTiles.reduce((sum, tile) => sum + tile.pointCount, 0),
      sourceCount: metadata.reduce((sum, tile) =>
        sum + (voxelIds.has(tile.id) ? tile.sampledPointCount || 0 : 0), 0),
    };
    const count = tiles.reduce((sum, tile) => sum + tile.pointCount, 0) - voxelInfo.count;
    const available = metadata.reduce((sum, tile) => sum + (tile.sourcePointCount || tile.fullPointCount || tile.sampledPointCount || 0), 0);
    updateLivePointCloudStats(count, available, tiles.length, voxelInfo);
    updatePointCloudStatus(count, available, tiles.length, voxelInfo);
    currentPendingDetailTileIds = getPendingDetailParentTileIds(
      (pointscapeLodStreamer.plan?.activeTiles || []).filter(tile => !ids.has(tile.id)).map(tile => tile.id));
    updateDetailBoxesLayer();
  },
});

const pointscapeExplodedLoader = new PointScapeExplodedView.Loader({
  read: getTileRepresentation,
  batchSize: 32,
  yieldFrame: () => new Promise((resolve) => requestAnimationFrame(resolve)),
  publish: (tiles, progress) => {
    if (!explodedViewActive || !window.pointCloudLayer || !window.mapLibreMap) return;
    window.pointCloudLayer.setTiles(tiles, window.mapLibreMap);
    currentPointCloudPoints = window.pointCloudLayer.points;
    updateLivePointCloudStats(progress.renderedPointCount, progress.sourcePointCount,
      tiles.length);
    const failures = progress.failedNodes
      ? `; ${progress.failedNodes} nodes could not be loaded` : "";
    lasStatus.textContent = `Exploded View: ${progress.loadedNodes.toLocaleString("en-US")} / ` +
      `${progress.totalNodes.toLocaleString("en-US")} nodes loaded, ` +
      `${progress.renderedPointCount.toLocaleString("en-US")} points ` +
      `(${Math.round(progress.fraction * 100)}% per node)${failures}.`;
  },
});

function applyPointCloudTileSelection(options = {}) {
  if (explodedViewActive || !window.pointCloudLayer || !window.mapLibreMap ||
      (pointCloudLoadInProgress && !options.updateStatus)) return Promise.resolve();
  ++pointCloudTileRefreshId;
  const map = window.mapLibreMap;
  const activeTiles = selectActiveTiles(currentTileIndex, map);
  const voxelDecisions = pointscapeLodSystem.voxelByTileId;
  updateVoxelDistanceInfo(voxelDecisions);
  const priorities = new Map();
  const byId = new Map(currentTileIndex.map(tile => [tile.id, tile]));
  for (const selected of activeTiles) {
    let tile = selected;
    while (tile && !priorities.has(tile.id)) {
      priorities.set(tile.id, pointscapeLodSystem.getVisualPriority(tile, map));
      tile = byId.get(tile.parentId);
    }
  }
  const budget = pointCloudConfig.residentPointBudget;
  const pendingPages = activeTiles.filter(tile => tile.hierarchyPending);
  const renderTiles = activeTiles.filter(tile => !tile.hierarchyPending);
  if (!pointCloudLoadInProgress) requestVisibleCopcPages(pendingPages, tile => priorities.get(tile.id) || 0);
  pointscapeLodStreamer.memoryBudgetBytes = Math.max(128 * 1024 * 1024, budget * 96);
  const completion = pointscapeLodStreamer.update({
    records: currentTileIndex,
    activeTiles: renderTiles,
    fullIds: new Set(pointscapeLodSystem.fullResolutionTileIds),
    fullCounts: new Map(pointscapeLodSystem.fullPointCounts),
    expandedIds: new Set(pointscapeLodSystem.expandedTileIds),
    voxelIds: new Set([...voxelDecisions].filter(([, decision]) => decision.useVoxels).map(([id]) => id)),
    accumulated: currentPointCloudSummary?.indexingMode === "m3no",
    budget,
    readConcurrency: copcDecodePool ? copcWorkerCount : 1,
    priority: tile => priorities.get(tile.id) || 0,
  });
  currentPendingDetailTileIds = getPendingDetailParentTileIds(activeTiles
    .filter(tile => !window.pointCloudLayer.tileBuffersById?.has(tile.id)).map(tile => tile.id));
  updateDetailBoxesLayer();
  const movement = copcPerformance?.moveEndedAt;
  if (movement != null && copcPerformance.detailMs === null && !pendingPages.length &&
    renderTiles.length && !map.isMoving()) {
    const refreshId = pointCloudTileRefreshId;
    completion.then(() => {
      if (refreshId !== pointCloudTileRefreshId || copcPerformance?.moveEndedAt !== movement ||
        map.isMoving() || !pointscapeLodStreamer.plan ||
        !pointscapeLodStreamer.areTargetRepresentationsReady(pointscapeLodStreamer.plan)) return;
      copcPerformance.detailMs = performance.now() - movement;
      renderPointCloudStats();
    });
  }
  return completion;
}

function getRenderableTileDescriptor(record) {
  const useFullResolution =
    isFullResolutionEnabled() &&
    isFullResolutionTile(record) &&
    pointscapeLodSystem.fullResolutionTileIds.has(record.id) &&
    (getPointSetCount(record.fullPoints) || record.fullPointCount);
  const source = useFullResolution ? "full" : "sample";
  const points = useFullResolution ? record.fullPoints : record.points;
  const pointCount =
    getPointSetCount(points) ||
    (useFullResolution ? record.fullPointCount : record.sampledPointCount) ||
    0;

  return {
    id: record.id,
    points: points || null,
    pointCount,
    source,
    renderKey: `${record.id}:${source}:${pointCount}`,
  };
}

function getRenderableTilePayload(record) {
  const { points, source } = getRenderableTileDescriptor(record);

  return { points, source };
}

function getRenderableTilePoints(record) {
  return getRenderableTilePayload(record).points;
}

function getPendingDetailParentTileIds(pendingTileIds) {
  if (!pendingTileIds.length || !currentExpandedTileIds.size) {
    return new Set();
  }

  const recordsById = new Map(currentTileIndex.map((tile) => [tile.id, tile]));
  const pendingParentIds = new Set();

  pendingTileIds.forEach((tileId) => {
    let tile = recordsById.get(tileId);

    while (tile?.parentId) {
      const parent = recordsById.get(tile.parentId);

      if (!parent) {
        return;
      }

      if (currentExpandedTileIds.has(parent.id)) {
        pendingParentIds.add(parent.id);
        return;
      }

      tile = parent;
    }
  });

  return pendingParentIds;
}

function isFullResolutionTile(record) {
  return !record.childIds?.length;
}

function isPackedPointSet(pointSet) {
  return Boolean(pointSet?.lngLatAlt?.buffer && pointSet?.classifications?.buffer);
}

function isPointObject(value) {
  return Number.isFinite(value?.lng) && Number.isFinite(value?.lat);
}

function getPointSetCount(pointSet) {
  if (!pointSet) {
    return 0;
  }

  if (isPackedPointSet(pointSet)) {
    return pointSet.pointCount || pointSet.classifications.length || 0;
  }

  if (isPointObject(pointSet)) {
    return 1;
  }

  return Array.isArray(pointSet) ? pointSet.length : 0;
}

function getPointCollectionCount(pointSets) {
  if (!Array.isArray(pointSets)) {
    return getPointSetCount(pointSets);
  }

  return pointSets.reduce((sum, pointSet) => sum + getPointSetCount(pointSet), 0);
}

function forEachPointInCollection(pointSets, callback) {
  if (!Array.isArray(pointSets)) {
    forEachPointInSet(pointSets, callback);
    return;
  }

  pointSets.forEach((pointSet) => {
    forEachPointInSet(pointSet, callback);
  });
}

function forEachPointInSet(pointSet, callback) {
  if (!pointSet) {
    return;
  }

  if (isPackedPointSet(pointSet)) {
    const { lngLatAlt, classifications } = pointSet;
    const pointCount = getPointSetCount(pointSet);

    for (let index = 0; index < pointCount; index += 1) {
      const offset = index * 3;
      callback({
        lng: lngLatAlt[offset],
        lat: lngLatAlt[offset + 1],
        altitudeMeters: lngLatAlt[offset + 2],
        classification: classifications[index] || 0,
      });
    }
    return;
  }

  if (Array.isArray(pointSet)) {
    pointSet.forEach(callback);
    return;
  }

  if (isPointObject(pointSet)) {
    callback(pointSet);
  }
}

function selectActiveTiles(records, map) {
  const activeTiles = pointscapeLodSystem.selectActiveTiles(records, map, {
    voxelEnabled: pointCloudConfig.impostorMode === "voxel" && Boolean(window.pointCloudLayer?.voxelMesh),
    verticalScale: terrainToggle.checked ? getTerrainExaggeration() : 1,
    offsetMeters: getPointCloudOffsetMeters(),
  });

  currentExpandedTileIds = pointscapeLodSystem.expandedTileIds;
  currentActiveTileIds = pointscapeLodSystem.activeTileIds;

  return activeTiles;
}

function shouldExpandTile(tile, map, mapCenter) {
  const wasExpanded = currentExpandedTileIds.has(tile.id);
  const angularDiagonalDegrees = getTileAngularDiagonalDegrees(
    tile,
    map,
    mapCenter,
  );
  const angularThresholdDegrees =
    pointCloudConfig.fullResolutionAngularDiagonalDegrees *
    (wasExpanded ? 1 - pointCloudConfig.tileCollapseHysteresisRatio : 1);

  return angularDiagonalDegrees >= angularThresholdDegrees;
}

function getTileAngularDiagonalDegrees(tile, map, mapCenter) {
  const diagonalMeters = getTileDiagonalMeters(tile);
  const distanceMeters = getTileDistanceMeters(tile, mapCenter, map);

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

function isTileLoadableInMap(tile, map, mapCenter) {
  return !isTileCompletelyBehindMapCamera(tile, map, mapCenter);
}

function getTileCrs(tile) {
  return currentTileCrsByFile.get(tile.fileIndex) || {
    kind: tile.crsKind,
    code: tile.crsCode,
    zone: tile.crsZone,
    northern: tile.crsNorthern,
  };
}

function projectLngLatToTileMetric(lng, lat, tile) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  const crs = getTileCrs(tile);

  if (crs.kind === "geographic" || crs.kind === "web-mercator") {
    return lngLatToWebMercatorMeters(lng, lat);
  }

  if (crs.kind === "utm" && crs.zone) {
    return lngLatToUtm(lng, lat, crs.zone, crs.northern !== false);
  }

  if (crs.kind === "proj4" && crs.transformer?.inverse) {
    const [x, y] = crs.transformer.inverse([lng, lat]);
    return { x, y };
  }

  return lngLatToWebMercatorMeters(lng, lat);
}

function isTileCompletelyBehindMapCamera(tile, map, mapCenter) {
  const pitch = map?.getPitch?.() ?? 0;

  if (pitch <= 1) {
    return false;
  }

  const cameraPosition = getApproxCameraMetricPosition(map, mapCenter, tile);
  const metricCenter = projectMapCenterToTileMetric(mapCenter, tile);

  if (!cameraPosition || !metricCenter) {
    return false;
  }

  const forward = {
    x: metricCenter.x - cameraPosition.x,
    y: metricCenter.y - cameraPosition.y,
  };

  return PointScapeTileSelection.isTileCompletelyBehindCamera(tile, {
    position: cameraPosition,
    forward,
  });
}

function getTileDistanceMeters(tile, mapCenter, map = window.mapLibreMap) {
  const cameraPosition = getApproxCameraMetricPosition(map, mapCenter, tile);

  if (!cameraPosition) {
    return Infinity;
  }

  const horizontalDistanceMeters = getPointToBoundsDistanceMeters(
    cameraPosition,
    tile.bounds,
  );
  const verticalDistanceMeters = getPointToTileVerticalDistanceMeters(
    cameraPosition,
    tile,
  );

  return Math.hypot(horizontalDistanceMeters, verticalDistanceMeters);
}

function getApproxCameraMetricPosition(map, mapCenter, tile) {
  const metricCenter = projectMapCenterToTileMetric(mapCenter, tile);

  if (!metricCenter) {
    return null;
  }

  const z = getApproxCameraAltitudeMeters(mapCenter, map);
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

function projectMapCenterToTileMetric(mapCenter, tile) {
  if (!mapCenter) {
    return null;
  }

  const lng = Number.isFinite(mapCenter.lng) ? mapCenter.lng : mapCenter[0];
  const lat = Number.isFinite(mapCenter.lat) ? mapCenter.lat : mapCenter[1];

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  const crs = getTileCrs(tile);

  if (crs.kind === "geographic" || crs.kind === "web-mercator") {
    return lngLatToWebMercatorMeters(lng, lat);
  }

  if (crs.kind === "utm" && crs.zone) {
    return lngLatToUtm(lng, lat, crs.zone, crs.northern !== false);
  }

  if (crs.kind === "proj4" && crs.transformer?.inverse) {
    const [x, y] = crs.transformer.inverse([lng, lat]);
    return { x, y };
  }

  return lngLatToWebMercatorMeters(lng, lat);
}

function getPointToBoundsDistanceMeters(point, bounds) {
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

function getPointToTileVerticalDistanceMeters(point, tile) {
  const cameraAltitudeMeters = Number.isFinite(point?.z) ? point.z : 0;
  const { minZ, maxZ } = getTileVerticalBounds(tile);

  if (cameraAltitudeMeters < minZ) {
    return minZ - cameraAltitudeMeters;
  }

  if (cameraAltitudeMeters > maxZ) {
    return cameraAltitudeMeters - maxZ;
  }

  return 0;
}

function getTileVerticalBounds(tile) {
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

function getTileDiagonalMeters(tile) {
  const bounds = tile?.bounds;

  if (!bounds) {
    return Number.isFinite(tile?.diagonalMeters) ? tile.diagonalMeters : 0;
  }

  const { minZ, maxZ } = getTileVerticalBounds(tile);
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

function getApproxCameraAltitudeMeters(mapCenter, map = window.mapLibreMap) {
  if (!map || !mapCenter) {
    return 0;
  }

  const pitch = map.getPitch?.() ?? 0;
  const viewportHeight = getMapViewportHeightPixels(map);
  const metersPerPixel = getApproxMetersPerPixel(map, mapCenter);
  const fovRadians = getMapVerticalFovRadians(map);
  const pitchRadians = pitch * (Math.PI / 180);
  const pitchExpansion = 1 / Math.max(Math.cos(pitchRadians), 0.28);
  const visibleMeters = metersPerPixel * viewportHeight;

  return visibleMeters / (2 * Math.tan(fovRadians / 2) * pitchExpansion);
}

function getMapViewportHeightPixels(map) {
  return Math.max(
    map?.getContainer?.()?.clientHeight || window.innerHeight || 900,
    1,
  );
}

function getMapVerticalFovRadians(map) {
  const transformFov = map?.transform?.fov;

  if (Number.isFinite(transformFov) && transformFov > 0) {
    return transformFov > Math.PI
      ? transformFov * (Math.PI / 180)
      : transformFov;
  }

  return 36.87 * (Math.PI / 180);
}

function getApproxMetersPerPixel(map, mapCenter) {
  if (!map || !mapCenter) {
    return Infinity;
  }

  const lat = Number.isFinite(mapCenter.lat) ? mapCenter.lat : mapCenter[1];
  const zoom = map.getZoom?.() ?? 0;
  const earthCircumference = 40075016.68557849;
  const latitudeScale = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);

  return (earthCircumference * latitudeScale) / (512 * 2 ** zoom);
}

function updateVoxelDistanceInfo(decisions) {
  const status = document.querySelector("#voxel-distance");
  const distances = [...decisions.values()];
  const formatRange = key => {
    const values = distances.map(decision => (decision[key] / 1000).toFixed(2)).sort((a, b) => a - b);
    return values[0] === values.at(-1) ? values[0] : `${values[0]}–${values.at(-1)}`;
  };
  const text = distances.length
    ? `Voxels from ~${formatRange("enterMeters")} km · points below ~${formatRange("exitMeters")} km`
    : "";
  if (status.textContent !== text) status.textContent = text;
}

function updateImageImpostorStats(layer) {
  const active = layer.imageCache?.active;
  const images = { nodeCount: active?.size || 0, texelCount: 0, sourceCount: 0 };
  for (const [id, capture] of active || []) {
    images.texelCount += capture.texelCount;
    images.sourceCount += layer.tileBuffersById.get(id).pointCount;
  }
  const maxArea = pointCloudConfig.imageImpostorSize ** 2 * pointCloudConfig.imageImpostorAreaRatio;
  const status = layer.imageCache
    ? `${formatInteger(images.nodeCount)} image nodes · ${formatInteger(layer.imageCache.captures)} captures · ${formatInteger(layer.imageCache.diskHits)} disk hits · ≤ ${formatInteger(Math.floor(maxArea))} px²`
    : "Color and depth impostors require WebGL 2.";
  if (imageImpostorStatus.textContent !== status) imageImpostorStatus.textContent = status;
  const stats = currentPointCloudStats;
  if (!stats || Object.keys(images).every(key => images[key] === (stats.images?.[key] || 0))) return;
  stats.images = images;
  renderPointCloudStats();
  if (!explodedViewActive && !explodedViewProgress) {
    updatePointCloudStatus(stats.renderedPointCount, stats.visibleSourcePointCount, stats.activeTileCount, stats.voxels ?? undefined);
  }
}

function updatePointCloudStatus(renderedPointCount, availablePointCount, activeTileCount, voxels = { count: 0 }) {
  if (!currentPointCloudSummary) {
    return;
  }

  const {
    fileCount,
    tileCount,
    crsSummary,
    indexingMode,
    indexingModeLabel = "QuadTree",
  } = currentPointCloudSummary;
  const images = currentPointCloudStats?.images;
  const points = formatInteger(Math.max(0, renderedPointCount - (images?.sourceCount || 0)));
  const pointSummary = indexingMode === "copc"
    ? `${points} points rendered`
    : `${points} points rendered from ${formatInteger(availablePointCount)} visible source points`;
  const voxelSummary = voxels.count
    ? ` + ${voxels.count.toLocaleString("en-US")} voxels (${voxels.nodeCount} nodes)` : "";
  const imageSummary = images?.nodeCount
    ? ` + ${formatInteger(images.texelCount)} reprojected texels (${images.nodeCount} nodes)` : "";
  lasStatus.textContent = `${indexingModeLabel} - ${fileCount} ${fileCount === 1 ? "file" : "files"} - ${activeTileCount.toLocaleString("en-US")} active / ${tileCount.toLocaleString("en-US")} tiles - ${pointSummary}${voxelSummary}${imageSummary} - ${crsSummary}`;
}

function updateLivePointCloudStats(renderedPointCount, availablePointCount, activeTileCount, voxels = null) {
  if (!currentPointCloudStats) {
    return;
  }

  currentPointCloudStats.renderedPointCount = renderedPointCount;
  currentPointCloudStats.visibleSourcePointCount = availablePointCount;
  currentPointCloudStats.activeTileCount = activeTileCount;
  currentPointCloudStats.voxels = voxels;
  renderPointCloudStats();
}

function renderPointCloudStats(stats = currentPointCloudStats) {
  if (!pointCloudStats) {
    return;
  }

  if (!stats) {
    pointCloudStats.replaceChildren(createStatsEmpty("No point cloud loaded."));
    return;
  }

  const copcOnly = stats.indexingMode === "copc";
  const { count: renderedVoxels = 0, sourceCount: replacedPoints = 0 } = stats.voxels ?? {};
  const savedElements = replacedPoints - renderedVoxels;
  const savingsLabel = replacedPoints > 0
    ? `${formatInteger(savedElements)} (${formatNumber(100 * savedElements / replacedPoints, 1)}%)`
    : "0";
  const groups = [
    {
      title: "Structure",
      rows: [
        ["Type", stats.indexingModeLabel],
        ["Files", formatInteger(stats.fileCount)],
        [stats.hierarchyPartial ? "Nodes discovered" : "Nodes", formatInteger(stats.tileCount)],
        ["Active nodes", formatInteger(stats.activeTileCount || 0)],
        ["Loaded node bounds", blockBoundsToggle.checked ? "On" : "Off"],
      ],
    },
    {
      title: "LOD",
      rows: [
        [
          "Angular threshold",
          `${formatNumber(
            pointCloudConfig.fullResolutionAngularDiagonalDegrees,
            2,
          )} deg`,
        ],
        [
          "Hysteresis",
          `${formatNumber(pointCloudConfig.tileCollapseHysteresisRatio * 100, 0)}%`,
        ],
        ["Max points on screen", formatInteger(pointCloudConfig.residentPointBudget)],
        ...(copcOnly ? [] : [[
          "LAS min node diagonal",
          `${formatInteger(pointCloudConfig.tileMinDiagonalMeters)} m`,
        ],
        ["LAS max tree depth", formatInteger(pointCloudConfig.tileMaxDepth)]]),
      ],
    },
    {
      title: "Points",
      rows: [
        ["Source points", formatInteger(stats.sourcePointCount)],
        ...(copcOnly ? [] : [["Valid points", formatInteger(stats.validPointCount)]]),
        ["Rendered now", formatInteger(Math.max(0, (stats.renderedPointCount || 0) - (stats.images?.sourceCount || 0)))],
        ["Visible source", formatInteger(stats.visibleSourcePointCount || 0)],
        ...(stats.images?.nodeCount ? [
          ["Image impostor nodes", formatInteger(stats.images.nodeCount)],
          ["Reprojected texels", formatInteger(stats.images.texelCount)],
        ] : []),
        ...(renderedVoxels ? [
          ["Voxels", formatInteger(renderedVoxels)],
          ["Points represented by voxels", formatInteger(replacedPoints)],
        ] : []),
        ...(stats.voxels && (copcOnly || renderedVoxels) ? [
          ["Render elements saved", savingsLabel],
        ] : []),
        ["Max / node", formatInteger(stats.maxPointsPerNode)],
        ["Avg / node", formatNumber(stats.averagePointsPerNode, 1)],
        ...(copcOnly ? [] : [
          ["Max sampled / node", formatInteger(stats.maxSampledPointsPerNode)],
          ["Max full / leaf", formatInteger(stats.maxFullPointsPerLeaf)],
        ]),
      ],
    },
    {
      title: "Projection",
      rows: [
        ["CRS", stats.crsSummary],
        ["Kinds", stats.crsKinds.join(", ") || "-"],
        ["EPSG", stats.crsCodes.join(", ") || "-"],
        ["Bounds", stats.lngLatBoundsLabel],
      ],
    },
    {
      title: "Timing",
      rows: [
        ...(copcPerformance ? [
          ["First cloud frame", Number.isFinite(copcPerformance.firstFrameMs) ?
            formatDuration(copcPerformance.firstFrameMs) : "—"],
          ["Detail after camera stops", Number.isFinite(copcPerformance.detailMs) ?
            formatDuration(copcPerformance.detailMs) : "—"],
        ] : []),
        ["Total", formatDuration(stats.totalMs)],
        ["Read", formatDuration(stats.readMs)],
        ["Index", formatDuration(stats.indexMs)],
        ["IndexedDB", formatDuration(stats.saveMs)],
        ...(copcOnly ? [] : [["Rate", `${formatNumber(stats.pointsPerSecond, 2)} pts/s`]]),
      ],
    },
  ];

  pointCloudStats.replaceChildren(
    ...groups.map((group) => createStatsGroup(group.title, group.rows)),
  );
}

function createStatsEmpty(message) {
  const element = document.createElement("p");
  element.className = "stats-empty";
  element.textContent = message;
  return element;
}

function createStatsGroup(title, rows) {
  const group = document.createElement("div");
  group.className = "stats-group";

  const heading = document.createElement("div");
  heading.className = "stats-group-title";
  heading.textContent = title;
  group.append(heading);

  rows.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "stats-row";

    const labelElement = document.createElement("span");
    labelElement.className = "stats-label";
    labelElement.textContent = label;

    const valueElement = document.createElement("span");
    valueElement.className = "stats-value";
    valueElement.textContent = value ?? "-";

    row.append(labelElement, valueElement);
    group.append(row);
  });

  return group;
}

function formatInteger(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return Math.round(value).toLocaleString("en-US");
}

function formatNumber(value, digits = 0) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) {
    return "-";
  }

  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)} ms`;
  }

  return `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 2 : 1)} s`;
}

function createLoadingStats(indexingMode, indexingModeLabel, fileCount) {
  return {
    indexingMode,
    indexingModeLabel,
    fileCount,
    tileCount: 0,
    activeTileCount: 0,
    sourcePointCount: 0,
    validPointCount: 0,
    renderedPointCount: 0,
    maxPointsPerNode: 0,
    averagePointsPerNode: 0,
    maxSampledPointsPerNode: 0,
    maxFullPointsPerLeaf: 0,
    crsSummary: "Detecting...",
    crsKinds: [],
    crsCodes: [],
    lngLatBoundsLabel: "-",
    readMs: 0,
    indexMs: 0,
    saveMs: 0,
    totalMs: 0,
    pointsPerSecond: 0,
    fileStats: [],
  };
}

function createPointCloudStats({
  indexingMode,
  indexingModeLabel,
  files,
  tiles,
  crsEntries,
  crsLabels,
  fileStats,
  loadStartedAt,
  loadFinishedAt,
}) {
  const sourcePointCount = fileStats.reduce(
    (sum, file) => sum + (file.sourcePointCount || 0),
    0,
  );
  const validPointCount = fileStats.reduce(
    (sum, file) => sum + (file.validPointCount || 0),
    0,
  );
  const readMs = fileStats.reduce((sum, file) => sum + (file.readMs || 0), 0);
  const indexMs = fileStats.reduce((sum, file) => sum + (file.indexMs || 0), 0);
  const saveMs = fileStats.reduce((sum, file) => sum + (file.saveMs || 0), 0);
  const pointCounts = tiles.map((tile) => tile.sourcePointCount || tile.pointCount || 0);
  const sampledCounts = tiles.map((tile) => tile.sampledPointCount || 0);
  const fullLeafCounts = tiles
    .filter((tile) => !tile.childIds?.length)
    .map((tile) => tile.fullPointCount || 0);
  const totalNodePointReferences = pointCounts.reduce((sum, count) => sum + count, 0);
  const uniqueCrsLabels = [...new Set(crsLabels)];
  const crsValues = [...new Map(crsEntries).values()];
  const crsKinds = [...new Set(crsValues.map((crs) => crs.kind).filter(Boolean))];
  const crsCodes = [
    ...new Set(
      crsValues
        .map((crs) => crs.code)
        .filter((code) => code !== null && code !== undefined),
    ),
  ].map((code) => `EPSG:${code}`);
  const totalMs = loadFinishedAt - loadStartedAt;

  return {
    indexingMode,
    indexingModeLabel,
    fileCount: files.length,
    tileCount: tiles.length,
    activeTileCount: 0,
    sourcePointCount,
    validPointCount,
    renderedPointCount: 0,
    maxPointsPerNode: pointCounts.reduce((max, count) => Math.max(max, count), 0),
    averagePointsPerNode: tiles.length ? totalNodePointReferences / tiles.length : 0,
    maxSampledPointsPerNode: sampledCounts.reduce((max, count) => Math.max(max, count), 0),
    maxFullPointsPerLeaf: fullLeafCounts.reduce((max, count) => Math.max(max, count), 0),
    crsSummary:
      uniqueCrsLabels.length === 1
        ? uniqueCrsLabels[0]
        : `${uniqueCrsLabels.length} coordinate systems`,
    crsKinds,
    crsCodes,
    lngLatBoundsLabel: formatLngLatBounds(getTilesLngLatBounds(tiles)),
    readMs,
    indexMs,
    saveMs,
    totalMs,
    pointsPerSecond: indexMs > 0 ? validPointCount / (indexMs / 1000) : 0,
    fileStats,
  };
}

function updateProgressivePointCloudStats({
  tiles,
  crsEntries,
  crsLabels,
  sourcePointCount,
  loadStartedAt,
}) {
  if (!currentPointCloudStats) {
    return;
  }

  const pointCounts = tiles.map((tile) => tile.sourcePointCount || tile.pointCount || 0);
  const sampledCounts = tiles.map((tile) => tile.sampledPointCount || 0);
  const fullLeafCounts = tiles
    .filter((tile) => !tile.childIds?.length)
    .map((tile) => tile.fullPointCount || 0);
  const rootTiles = tiles.filter((tile) => !tile.parentId);
  const validPointCount = rootTiles.reduce(
    (sum, tile) =>
      sum +
      Math.max(
        tile.originalPointCount || 0,
        tile.fullPointCount || 0,
        tile.pointCount || 0,
      ),
    0,
  );
  const totalNodePointReferences = pointCounts.reduce((sum, count) => sum + count, 0);
  const uniqueCrsLabels = [...new Set(crsLabels.filter(Boolean))];
  const crsValues = [...new Map(crsEntries).values()];
  const crsKinds = [...new Set(crsValues.map((crs) => crs.kind).filter(Boolean))];
  const crsCodes = [
    ...new Set(
      crsValues
        .map((crs) => crs.code)
        .filter((code) => code !== null && code !== undefined),
    ),
  ].map((code) => `EPSG:${code}`);

  currentPointCloudStats.tileCount = tiles.length;
  currentPointCloudStats.sourcePointCount = sourcePointCount;
  currentPointCloudStats.validPointCount = validPointCount;
  currentPointCloudStats.maxPointsPerNode = pointCounts.reduce((max, count) => Math.max(max, count), 0);
  currentPointCloudStats.averagePointsPerNode = tiles.length
    ? totalNodePointReferences / tiles.length
    : 0;
  currentPointCloudStats.maxSampledPointsPerNode = sampledCounts.reduce((max, count) => Math.max(max, count), 0);
  currentPointCloudStats.maxFullPointsPerLeaf = fullLeafCounts.reduce((max, count) => Math.max(max, count), 0);
  currentPointCloudStats.crsSummary =
    uniqueCrsLabels.length === 1
      ? uniqueCrsLabels[0]
      : uniqueCrsLabels.length
        ? `${uniqueCrsLabels.length} coordinate systems`
        : "Detecting...";
  currentPointCloudStats.crsKinds = crsKinds;
  currentPointCloudStats.crsCodes = crsCodes;
  currentPointCloudStats.lngLatBoundsLabel = formatLngLatBounds(
    getTilesLngLatBounds(tiles),
  );
  currentPointCloudStats.indexMs = performance.now() - loadStartedAt;
  currentPointCloudStats.totalMs = performance.now() - loadStartedAt;
  currentPointCloudStats.pointsPerSecond =
    currentPointCloudStats.indexMs > 0
      ? validPointCount / (currentPointCloudStats.indexMs / 1000)
      : 0;

  if (currentPointCloudSummary) {
    currentPointCloudSummary.tileCount = tiles.length;
    currentPointCloudSummary.crsSummary = currentPointCloudStats.crsSummary;
  }

  renderPointCloudStats();
}

function mergeTileMetadataRecords(existingRecords, nextRecords) {
  const recordsById = new Map(existingRecords.map((record) => [record.id, record]));

  nextRecords.forEach((record) => {
    if (!record?.id) {
      return;
    }

    recordsById.set(record.id, createTileMetadataRecord(record));
  });

  return [...recordsById.values()].sort(compareTileMetadata);
}

function compareTileMetadata(left, right) {
  return (
    (left.fileIndex || 0) - (right.fileIndex || 0) ||
    (left.depth || 0) - (right.depth || 0) ||
    String(left.id).localeCompare(String(right.id))
  );
}

function getTilesLngLatBounds(tiles) {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  tiles.forEach((tile) => {
    (tile.corners || []).forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });
  });

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat)
  ) {
    return null;
  }

  return { minLng, maxLng, minLat, maxLat };
}

function formatLngLatBounds(bounds) {
  if (!bounds) {
    return "-";
  }

  return `${bounds.minLng.toFixed(5)}, ${bounds.minLat.toFixed(5)} / ${bounds.maxLng.toFixed(5)}, ${bounds.maxLat.toFixed(5)}`;
}

let pointCloudLoadInProgress = false;
async function loadPointCloudFiles(files) {
  if (pointCloudLoadInProgress || !files.length) return;
  if (!window.pointCloudLayer || !window.mapLibreMap) {
    lasStatus.textContent = "Wait for the map to finish loading.";
    return;
  }

  const fileLabel =
    files.length === 1 ? files[0].name : `${files.length} point cloud files`;
  pointCloudLoadInProgress = true;
  probeMode.close(false);
  openProbesButton.disabled = true;
  lasFileInput.disabled = true;
  copcDemoButton.disabled = true;
  parisDemoButton.disabled = true;
  const loadStartedAt = performance.now();
  lasStatus.textContent = `Opening ${fileLabel}...`;
  try {
    const copcInputs = await Promise.all(files.map(isCopcInput));
    const copcOnly = copcInputs.every(Boolean);
    const lasMode = getSelectedLasIndexingMode();
    const lasModeLabel = getLasIndexingModeLabel(lasMode);
    const indexingMode = copcOnly ? "copc" : lasMode;
    const indexingModeLabel = copcOnly ? "COPC octree" :
      copcInputs.some(Boolean) ? `${lasModeLabel} + COPC octree` : lasModeLabel;
    lasStatus.textContent = `Preparing ${fileLabel} with ${indexingModeLabel}...`;
    currentPointCloudStats = createLoadingStats(indexingMode, indexingModeLabel, files.length);
    currentPointCloudSummary = {
      fileCount: files.length,
      tileCount: 0,
      crsSummary: "Detecting...",
      indexingMode,
      indexingModeLabel,
    };
    renderPointCloudStats();

    resetExplodedView();
    window.nodeInspector?.reset();
    pointCloudTileRefreshId += 1;
    pointscapeLodStreamer.reset();
    for (const source of copcTileSources.values()) source.client.close();
    copcTileSources.clear();
    pendingCopcPages.clear();
    failedCopcPages.clear();
    copcDecodePool?.close();
    const includesCopc = copcInputs.some(Boolean);
    copcDecodePool = includesCopc ? new PointScapeDataIngestion.CopcDecodePool(copcWorkerCount) : null;
    copcPerformance = includesCopc ? { startedAt: loadStartedAt, firstFrameMs: null, detailMs: null } : null;
    if (!copcOnly) await clearVolatileTileDb();
    currentPointCloudPoints = [];
    currentPointCloudFlyToPoints = [];
    currentPointCloudTiles = [];
    currentActiveTileIds = new Set();
    currentExpandedTileIds = new Set();
    currentPendingDetailTileIds = new Set();
    pointscapeLodSystem.reset();
    updateVoxelDistanceInfo(new Map());
    currentTileIndex = [];
    currentTileById = new Map();
    currentTileCrsByFile = new Map();
    window.pointCloudLayer.setTiles([], window.mapLibreMap, {
      forceRebuild: true,
    });
    updateDetailBoxesLayer();
    updateBlockBoundsLayer([]);
    renderPointCloudStats();
    let allTiles = [];
    const crsLabelByFile = new Map();
    const crsByFile = new Map();
    const sourcePointCountByFile = new Map();
    const fileStats = [];
    const useProgressiveLoadingPreview =
      pointCloudConfig.progressiveLoadingPreview === true;
    let hasFlownToProgressiveCloud = false;

    const refreshProgressiveState = () => {
      currentTileIndex = allTiles;
      currentPointCloudTiles = allTiles;
      currentTileCrsByFile = new Map(crsByFile);
      updateProgressivePointCloudStats({
        tiles: allTiles,
        crsEntries: [...crsByFile.entries()],
        crsLabels: [...crsLabelByFile.values()],
        sourcePointCount: [...sourcePointCountByFile.values()].reduce(
          (sum, count) => sum + count,
          0,
        ),
        loadStartedAt,
      });
    };

    const integrateTileMetadata = (tileRecords) => {
      allTiles = mergeTileMetadataRecords(allTiles, tileRecords);
      refreshProgressiveState();
    };

    const handleProgressiveMetadata = (metadata) => {
      if (!metadata) {
        return;
      }

      if (metadata.crs) {
        crsByFile.set(metadata.fileIndex, metadata.crs);
      }

      if (metadata.crsLabel) {
        crsLabelByFile.set(metadata.fileIndex, metadata.crsLabel);
      }

      sourcePointCountByFile.set(
        metadata.fileIndex,
        metadata.sourcePointCount || 0,
      );

      if (metadata.rootTile) {
        integrateTileMetadata([metadata.rootTile]);
        updateBlockBoundsLayer(allTiles.filter((tile) => !tile.parentId));

        if (!hasFlownToProgressiveCloud) {
          ensurePointCloudTerrainEnabled();
          hasFlownToProgressiveCloud = flyToPointCloudTiles(
            allTiles.filter((tile) => !tile.parentId),
            { duration: 900 },
          );
          flyToPointCloudButton.hidden = !hasFlownToProgressiveCloud;
        }
      } else {
        refreshProgressiveState();
      }
    };

    const handleProgressiveTiles = async (tileRecords, details = {}) => {
      if (!tileRecords.length) {
        return;
      }

      await saveTileRecords(tileRecords);
      integrateTileMetadata(tileRecords);
      schedulePointCloudTileRefresh({ updateStatus: true });

      const percent =
        details.total > 0 ? Math.round((details.processed / details.total) * 100) : 0;
      lasStatus.textContent = `Building ${lasModeLabel} tiles - ${percent}% - showing ${allTiles.length.toLocaleString("en-US")} nodes...`;
    };

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (copcInputs[index]) {
        lasStatus.textContent = `Reading the COPC hierarchy in ${file.name} (${index + 1}/${files.length})...`;
        const client = new PointScapeDataIngestion.CopcTileSource();
        const input = file.url || file;
        const readStartedAt = performance.now();
        let result;
        try {
          result = await client.request("open", { source: input, fileIndex: index, fileName: file.name,
            progressive: progressiveCopcHierarchy });
        } catch (error) {
          client.close();
          throw error;
        }
        copcTileSources.set(index, { client, input, decodeInfo: result.decodeInfo, pointBounds: result.pointBounds });
        crsLabelByFile.set(index, result.crsLabel);
        crsByFile.set(index, result.crs);
        sourcePointCountByFile.set(index, result.sourcePointCount);
        allTiles = mergeTileMetadataRecords(allTiles, result.tiles);
        fileStats.push({
          name: file.name,
          sourcePointCount: result.sourcePointCount,
          validPointCount: result.validPointCount,
          tileCount: result.tiles.length,
          readMs: performance.now() - readStartedAt,
        });
        continue;
      }
      lasStatus.textContent = `Building ${lasModeLabel} tiles from ${file.name} (${index + 1}/${files.length})...`;
      const readStartedAt = performance.now();
      // Send the File handle; the worker reads bounded slices on demand.
      const readFinishedAt = performance.now();
      const indexStartedAt = performance.now();
      let receivedProgressiveTiles = false;
      let lastProgressLog = 0;
      console.info("Progressive LAS loading", { file: file.name, bytes: file.size, memoryProfile: "adaptive" });
      const result = await parseLasPointCloud(file, {
        fileIndex: index,
        fileName: file.name,
        indexingMode,
        includePointPreview: false,
        onMetadata: useProgressiveLoadingPreview
          ? handleProgressiveMetadata
          : undefined,
        onTiles: async (tileRecords, details) => {
          receivedProgressiveTiles = true;
          // Persist before acknowledging: no queue of unsaved point buffers.
          if (useProgressiveLoadingPreview) await handleProgressiveTiles(tileRecords, details);
          else await saveTileRecords(tileRecords);
        },
        onProgress: (processed, total, details) => {
          const percent = Math.round((processed / total) * 100);
          if (details) {
            lasStatus.textContent = `Building ${lasModeLabel} - ${percent}% saved - ${details.phase} - ${(details.scanned || 0).toLocaleString("en-US")} points in node - ${details.nodes} nodes`;
            if (performance.now() - lastProgressLog > 2000 || details.phase === "complete") {
              lastProgressLog = performance.now();
              console.info("LAS progress", { percentSaved: percent, ...details });
            }
            return;
          }
          lasStatus.textContent = useProgressiveLoadingPreview
            ? `Building ${lasModeLabel} tiles from ${file.name} (${index + 1}/${files.length}) - ${percent}% - ${allTiles.length.toLocaleString("en-US")} nodes visible...`
            : `Building ${lasModeLabel} tiles from ${file.name} (${index + 1}/${files.length}) - ${percent}%...`;
        },
      });
      const indexFinishedAt = performance.now();
      console.info("LAS index saved", result.memoryProfile);

      const saveStartedAt = performance.now();
      if (!receivedProgressiveTiles) {
        lasStatus.textContent = `Saving ${result.tileRecords.length.toLocaleString("en-US")} ${lasModeLabel} tiles from ${file.name}...`;
        await saveTileRecords(result.tileRecords);
      }
      const saveFinishedAt = performance.now();
      crsLabelByFile.set(result.fileIndex, result.crsLabel);
      crsByFile.set(result.fileIndex, result.crs);
      sourcePointCountByFile.set(result.fileIndex, result.sourcePointCount || 0);
      integrateTileMetadata(result.tiles);
      result.points = [];
      result.tileRecords = [];
      fileStats.push({
        name: file.name,
        sourcePointCount: result.sourcePointCount || 0,
        validPointCount: result.validPointCount || 0,
        tileCount: result.tiles.length,
        readMs: readFinishedAt - readStartedAt,
        indexMs: indexFinishedAt - indexStartedAt,
        saveMs: saveFinishedAt - saveStartedAt,
      });
      await yieldToBrowser();
    }

    currentTileIndex = allTiles;
    currentTileById = new Map(allTiles.map((tile) => [tile.id, tile]));
    explodedViewLayout = PointScapeExplodedView.createLayout(allTiles,
      terrainToggle.checked ? getTerrainExaggeration() : 1);
    explodedViewButton.disabled = allTiles.length === 0;
    currentTileCrsByFile = new Map(crsByFile);
    updateBlockBoundsLayer(allTiles.filter((tile) => !tile.parentId));
    currentPointCloudFlyToPoints = [];
    flyToPointCloudButton.hidden = false;

    ensurePointCloudTerrainEnabled();

    if (!hasFlownToProgressiveCloud) {
      flyToCurrentPointCloud();
    }
    currentPointCloudStats = createPointCloudStats({
      indexingMode,
      indexingModeLabel,
      files,
      tiles: allTiles,
      crsEntries: [...crsByFile.entries()],
      crsLabels: [...crsLabelByFile.values()],
      fileStats,
      loadStartedAt,
      loadFinishedAt: performance.now(),
    });
    currentPointCloudSummary = {
      fileCount: files.length,
      tileCount: allTiles.length,
      crsSummary: currentPointCloudStats.crsSummary,
      indexingMode,
      indexingModeLabel,
    };
    currentPointCloudStats.hierarchyPartial = allTiles.some(tile => tile.hierarchyPending);
    renderPointCloudStats();
    if (includesCopc) {
      lasStatus.textContent = `${indexingModeLabel} ready. Loading visible nodes…`;
      pointCloudFinalFrameRefreshPending = true;
      window.mapLibreMap.triggerRepaint();
    } else {
      await applyPointCloudTileSelection({ updateStatus: true });
    }
  } catch (error) {
    console.error(error);
    lasStatus.textContent =
      error.message || "The point cloud files could not be read.";
  } finally {
    pointCloudLoadInProgress = false;
    openProbesButton.disabled = !getProbeSource();
    lasFileInput.disabled = false;
    copcDemoButton.disabled = false;
    parisDemoButton.disabled = false;
    lasFileInput.value = "";
  }
}

function allocateRareClassBudgets(classCounts, maximumPoints) {
  const entries = [...classCounts.entries()].filter(([, count]) => count > 0);
  const totalPoints = entries.reduce((sum, [, count]) => sum + count, 0);
  const budgetLimit = Math.min(maximumPoints, totalPoints);

  if (totalPoints <= budgetLimit) {
    return new Map(entries);
  }

  if (budgetLimit < entries.length) {
    return new Map(
      entries
        .sort((left, right) => left[1] - right[1])
        .slice(0, budgetLimit)
        .map(([classification]) => [classification, 1]),
    );
  }

  const budgets = new Map(entries.map(([classification]) => [classification, 1]));
  const capacities = entries.map(([, count]) => count - 1);
  const weights = entries.map(([, count]) => Math.sqrt(count));
  const remainingBudget = budgetLimit - entries.length;
  let low = 0;
  let high = 1;

  const allocatedAt = (scale) =>
    capacities.reduce(
      (sum, capacity, index) =>
        sum + Math.min(capacity, Math.floor(scale * weights[index])),
      0,
    );

  while (allocatedAt(high) < remainingBudget) {
    high *= 2;
  }

  for (let iteration = 0; iteration < 48; iteration += 1) {
    const middle = (low + high) / 2;
    if (allocatedAt(middle) <= remainingBudget) {
      low = middle;
    } else {
      high = middle;
    }
  }

  let assigned = 0;
  const remainders = entries.map(([classification], index) => {
    const exact = low * weights[index];
    const extra = Math.min(capacities[index], Math.floor(exact));
    budgets.set(classification, 1 + extra);
    assigned += extra;

    return {
      classification,
      remainder: exact - Math.floor(exact),
      hasCapacity: extra < capacities[index],
    };
  });

  remainders
    .filter(({ hasCapacity }) => hasCapacity)
    .sort((left, right) => right.remainder - left.remainder)
    .slice(0, remainingBudget - assigned)
    .forEach(({ classification }) => {
      budgets.set(classification, budgets.get(classification) + 1);
    });

  return budgets;
}

function flyToCurrentPointCloud() {
  const rootTiles = currentTileIndex.filter((tile) => !tile.parentId);

  if (rootTiles.length && flyToPointCloudTiles(rootTiles, {
    extraAltitudeMeters: explodedViewActive
      ? PointScapeExplodedView.offsetMeters(0, explodedViewLayout) : 0,
  })) {
    return;
  }

  flyToLasPoints(
    getPointCollectionCount(currentPointCloudFlyToPoints)
      ? currentPointCloudFlyToPoints
      : currentPointCloudPoints,
  );
}

function flyToLasPoints(points) {
  const center = getPointCloudCenter(points);
  const pitch = Number(pitchControl.value) || 65;
  const targetPitch = Math.min(Math.max(pitch, 65), 85);
  const cameraAltitudeMeters =
    getPointCloudMaxRenderedAltitude(points) +
    pointCloudConfig.flyToClearanceMeters;
  const targetZoom = getZoomForApproxCameraAltitude(
    center.lat,
    cameraAltitudeMeters,
    targetPitch,
  );

  if (typeof window.mapLibreMap.stop === "function") {
    window.mapLibreMap.stop();
  }

  window.mapLibreMap.flyTo({
    center: [center.lng, center.lat],
    zoom: targetZoom,
    pitch: targetPitch,
    bearing: -18,
    duration: 1200,
    essential: true,
  });

  pitchControl.value = String(targetPitch);
  pitchValue.textContent = `${pitchControl.value}\u00b0`;
}

function flyToPointCloudTiles(tiles, { duration = 1200, extraAltitudeMeters = 0 } = {}) {
  const bounds = getTilesLngLatBounds(tiles);

  if (!bounds || !window.mapLibreMap) {
    return false;
  }

  const center = {
    lng: (bounds.minLng + bounds.maxLng) / 2,
    lat: (bounds.minLat + bounds.maxLat) / 2,
  };
  const pitch = Number(pitchControl.value) || 65;
  const targetPitch = Math.min(Math.max(pitch, 65), 85);
  const maxDiagonalMeters = Math.max(
    pointCloudConfig.flyToClearanceMeters,
    ...tiles.map((tile) => tile.diagonalMeters || 0),
  );
  const maxTileAltitude = Math.max(
    0,
    ...tiles.map((tile) => (Number.isFinite(tile.maxZ) ? tile.maxZ : 0)),
  );
  const cameraAltitudeMeters =
    maxTileAltitude + extraAltitudeMeters +
    Math.max(pointCloudConfig.flyToClearanceMeters, maxDiagonalMeters * 0.7);
  const targetZoom = getZoomForApproxCameraAltitude(
    center.lat,
    cameraAltitudeMeters,
    targetPitch,
    extraAltitudeMeters > 0 ? 0 : 8,
  );

  if (typeof window.mapLibreMap.stop === "function") {
    window.mapLibreMap.stop();
  }

  window.mapLibreMap.flyTo({
    center: [center.lng, center.lat],
    zoom: targetZoom,
    pitch: targetPitch,
    bearing: -18,
    duration,
    essential: true,
  });

  pitchControl.value = String(targetPitch);
  pitchValue.textContent = `${pitchControl.value}\u00b0`;
  return true;
}

function ensurePointCloudTerrainEnabled() {
  if (!terrainToggle.checked) {
    terrainToggle.checked = true;
    setElevationEnabled(true, { moveCamera: false });
    return;
  }

  refreshPointCloudElevation();
}

function getPointCloudMaxRenderedAltitude(points) {
  if (!getPointCollectionCount(points) || !window.mapLibreMap) {
    return 0;
  }

  const useTerrainElevation = terrainToggle.checked;
  const verticalExaggeration = useTerrainElevation ? getTerrainExaggeration() : 1;
  const pointOffsetMeters = getPointCloudOffsetMeters();
  let maxAltitude = 0;
  const stride = Math.max(1, Math.ceil(getPointCollectionCount(points) / 2000));
  let visitedPointCount = 0;

  forEachPointInCollection(points, (point) => {
    visitedPointCount += 1;
    if (visitedPointCount % stride !== 0) {
      return;
    }

    const altitude = Number.isFinite(point.altitudeMeters)
      ? point.altitudeMeters * verticalExaggeration + pointOffsetMeters
      : useTerrainElevation
        ? getTerrainElevation(window.mapLibreMap, point) * verticalExaggeration +
          pointOffsetMeters
        : pointOffsetMeters;

    maxAltitude = Math.max(maxAltitude, altitude);
  });

  return maxAltitude;
}

function getZoomForApproxCameraAltitude(lat, altitudeMeters, pitch, minimumZoom = 8) {
  const viewportHeight = Math.max(window.innerHeight || 900, 1);
  const fovRadians = 36.87 * (Math.PI / 180);
  const pitchRadians = pitch * (Math.PI / 180);
  const pitchExpansion = 1 / Math.max(Math.cos(pitchRadians), 0.28);
  const visibleMeters =
    2 * Math.max(altitudeMeters, 1) * Math.tan(fovRadians / 2) * pitchExpansion;
  const metersPerPixel = visibleMeters / viewportHeight;
  const earthCircumference = 40075016.68557849;
  const latitudeScale = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const zoom = Math.log2(
    (earthCircumference * latitudeScale) / (512 * metersPerPixel),
  );

  return Math.min(Math.max(zoom, minimumZoom), 18);
}

function getPointCloudCenter(points) {
  if (!getPointCollectionCount(points)) {
    return { lng: lasPalmas.coordinates[0], lat: lasPalmas.coordinates[1] };
  }

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let firstPoint = null;

  forEachPointInCollection(points, (point) => {
    firstPoint ||= point;
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
  });

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat)
  ) {
    return firstPoint || { lng: lasPalmas.coordinates[0], lat: lasPalmas.coordinates[1] };
  }

  return {
    lng: (minLng + maxLng) / 2,
    lat: (minLat + maxLat) / 2,
  };
}

async function parseLasPointCloud(buffer, options = {}) {
  return pointscapeLasIngestion.parse(buffer, options);
}

function parseLasPointCloudInWorker(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker("./las-index.worker.js");
    const { onProgress, onMetadata, onTiles, ...workerOptions } = options;
    let tileCallbackQueue = Promise.resolve();
    let isSettled = false;

    const fail = (error) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      worker.terminate();
      reject(error);
    };

    worker.onmessage = (event) => {
      const message = event.data || {};

      if (isSettled) {
        return;
      }

      if (message.type === "progress") {
        onProgress?.(message.processed, message.total);
        return;
      }

      if (message.type === "metadata") {
        onMetadata?.(message.metadata);
        return;
      }

      if (message.type === "tiles") {
        tileCallbackQueue = tileCallbackQueue.then(() =>
          onTiles?.(message.tileRecords || [], message.details || {}),
        );
        tileCallbackQueue.catch((error) => {
          fail(error instanceof Error ? error : new Error(String(error)));
        });
        return;
      }

      if (message.type === "done") {
        tileCallbackQueue
          .then(() => {
            if (isSettled) {
              return;
            }

            isSettled = true;
            worker.terminate();
            resolve(message.result);
          })
          .catch((error) => {
            fail(error instanceof Error ? error : new Error(String(error)));
          });
        return;
      }

      if (message.type === "error") {
        fail(new Error(message.message || "The LAS file could not be indexed."));
      }
    };

    worker.onerror = (error) => {
      fail(new Error(error.message || "The LAS indexing worker failed."));
    };

    worker.postMessage(
      {
        type: "parse-las",
        buffer,
        options: workerOptions,
        config: {
          tileSamplePoints: pointCloudConfig.tileSamplePoints,
          m3noGridCellsPerAxis: pointCloudConfig.m3noGridCellsPerAxis,
          tileMinDiagonalMeters: pointCloudConfig.tileMinDiagonalMeters,
          tileMaxDepth: pointCloudConfig.tileMaxDepth,
          parseYieldEveryPoints: pointCloudConfig.parseYieldEveryPoints,
          progressiveLoadingPreview: pointCloudConfig.progressiveLoadingPreview,
          progressiveTilePointInterval:
            pointCloudConfig.progressiveTilePointInterval,
          progressiveTileMinimumMs: pointCloudConfig.progressiveTileMinimumMs,
          indexedDbWriteBatchSize: pointCloudConfig.indexedDbWriteBatchSize,
        },
      },
      [buffer],
    );
  });
}

async function parseLasPointCloudQuadtree(buffer, options = {}) {
  const view = new DataView(buffer);

  if (readAscii(view, 0, 4) !== "LASF") {
    throw new Error("The file does not appear to be a valid LAS file.");
  }

  const header = readLasHeader(view);
  if (header.pointFormat > 10) {
    throw new Error("This app supports uncompressed LAS files. LAZ requires an additional decoder.");
  }

  const crs = await detectLasCrs(view, header);
  const totalPoints = header.pointCount;
  const fileIndex = options.fileIndex || 0;
  const rootBounds = getLasMetricBounds(header, crs);
  const maxDepth = getQuadtreeMaxDepth(rootBounds);
  const tileStates = new Map();
  const rootTile = createTileState({
    id: `${fileIndex}:r`,
    parentId: null,
    fileIndex,
    depth: 0,
    bounds: rootBounds,
    crs,
  });
  tileStates.set(rootTile.id, rootTile);

  for (let pointIndex = 0; pointIndex < totalPoints; pointIndex += 1) {
    const offset = header.pointDataOffset + pointIndex * header.pointRecordLength;

    if (offset + 12 > view.byteLength) {
      break;
    }

    const classification = readLasClassification(view, offset, header.pointFormat);
    const x = view.getInt32(offset, true) * header.scaleX + header.offsetX;
    const y = view.getInt32(offset + 4, true) * header.scaleY + header.offsetY;
    const z = view.getInt32(offset + 8, true) * header.scaleZ + header.offsetZ;
    const projected = projectLasCoordinate(x, y, z, crs);

    if (
      Number.isFinite(projected.lng) &&
      Number.isFinite(projected.lat) &&
      Math.abs(projected.lng) <= 180 &&
      Math.abs(projected.lat) <= 90
    ) {
      const metric = getHorizontalMetricCoordinate(x, y, crs);
      const point = {
        lng: projected.lng,
        lat: projected.lat,
        altitudeMeters: projected.altitudeMeters,
        classification,
      };

      insertPointIntoTileTree(
        tileStates,
        rootTile,
        metric,
        point,
        z,
        maxDepth,
        crs,
      );
    }

    if (
      pointIndex > 0 &&
      pointIndex % pointCloudConfig.parseYieldEveryPoints === 0
    ) {
      options.onProgress?.(pointIndex, totalPoints);
      await yieldToBrowser();
    }
  }
  options.onProgress?.(totalPoints, totalPoints);

  if (!rootTile.originalPointCount) {
    throw new Error("No valid points could be projected from the LAS file.");
  }

  const tileRecords = await createTileRecordsAsync(
    tileStates,
    options.fileName || "",
    crs,
  );

  return {
    fileIndex,
    crs,
    points: options.includePointPreview === false ? [] : rootTile.points,
    tiles: tileRecords.map(createTileMetadataRecord),
    tileRecords,
    sourcePointCount: totalPoints,
    validPointCount: rootTile.originalPointCount,
    crsLabel: crs.label,
  };
}

async function parseLasPointCloudM3no(buffer, options = {}) {
  const view = new DataView(buffer);

  if (readAscii(view, 0, 4) !== "LASF") {
    throw new Error("The file does not appear to be a valid LAS file.");
  }

  const header = readLasHeader(view);
  if (header.pointFormat > 10) {
    throw new Error("This app supports uncompressed LAS files. LAZ requires an additional decoder.");
  }

  const crs = await detectLasCrs(view, header);
  const totalPoints = header.pointCount;
  const fileIndex = options.fileIndex || 0;
  const rootBounds = getM3noMetricBounds(header, crs);
  const maxDepth = getQuadtreeMaxDepth(rootBounds);
  const tileStates = new Map();
  const rootTile = createM3noTileState({
    id: `${fileIndex}:m3no`,
    parentId: null,
    fileIndex,
    depth: 0,
    bounds: rootBounds,
    crs,
  });
  tileStates.set(rootTile.id, rootTile);

  for (let pointIndex = 0; pointIndex < totalPoints; pointIndex += 1) {
    const offset = header.pointDataOffset + pointIndex * header.pointRecordLength;

    if (offset + 12 > view.byteLength) {
      break;
    }

    const classification = readLasClassification(view, offset, header.pointFormat);
    const x = view.getInt32(offset, true) * header.scaleX + header.offsetX;
    const y = view.getInt32(offset + 4, true) * header.scaleY + header.offsetY;
    const z = view.getInt32(offset + 8, true) * header.scaleZ + header.offsetZ;
    const projected = projectLasCoordinate(x, y, z, crs);

    if (
      Number.isFinite(projected.lng) &&
      Number.isFinite(projected.lat) &&
      Math.abs(projected.lng) <= 180 &&
      Math.abs(projected.lat) <= 90
    ) {
      const metric = getHorizontalMetricCoordinate(x, y, crs);
      const point = {
        lng: projected.lng,
        lat: projected.lat,
        altitudeMeters: projected.altitudeMeters,
        classification,
      };

      insertPointIntoM3noTree(
        tileStates,
        rootTile,
        {
          metric,
          altitudeMeters: z,
          point,
        },
        maxDepth,
        crs,
      );
      insertPointIntoM3noFullResolutionTree(
        tileStates,
        rootTile,
        metric,
        point,
        z,
        maxDepth,
        crs,
      );
    }

    if (
      pointIndex > 0 &&
      pointIndex % pointCloudConfig.parseYieldEveryPoints === 0
    ) {
      options.onProgress?.(pointIndex, totalPoints);
      await yieldToBrowser();
    }
  }
  options.onProgress?.(totalPoints, totalPoints);

  if (!rootTile.originalPointCount) {
    throw new Error("No valid points could be projected from the LAS file.");
  }

  finalizeM3noTileSamples(tileStates);
  const tileRecords = await createTileRecordsAsync(
    tileStates,
    options.fileName || "",
    crs,
  );

  return {
    fileIndex,
    crs,
    points: options.includePointPreview === false ? [] : rootTile.points,
    tiles: tileRecords.map(createTileMetadataRecord),
    tileRecords,
    sourcePointCount: totalPoints,
    validPointCount: rootTile.originalPointCount,
    crsLabel: crs.label,
  };
}

function getLasMetricBounds(header, crs) {
  if (crs.kind === "geographic") {
    const southwest = lngLatToWebMercatorMeters(header.minX, header.minY);
    const northeast = lngLatToWebMercatorMeters(header.maxX, header.maxY);

    return normalizeTileBounds({
      minX: southwest.x,
      minY: southwest.y,
      maxX: northeast.x,
      maxY: northeast.y,
    });
  }

  return normalizeTileBounds({
    minX: header.minX,
    minY: header.minY,
    maxX: header.maxX,
    maxY: header.maxY,
  });
}

function getM3noMetricBounds(header, crs) {
  const horizontalBounds = getLasMetricBounds(header, crs);
  const minZ = Math.min(header.minZ, header.maxZ);
  const maxZ = Math.max(header.minZ, header.maxZ);
  const epsilon = 0.01;

  return {
    ...horizontalBounds,
    minZ: minZ === maxZ ? minZ - epsilon : minZ,
    maxZ: minZ === maxZ ? maxZ + epsilon : maxZ,
  };
}

function normalizeTileBounds(bounds) {
  const minX = Math.min(bounds.minX, bounds.maxX);
  const maxX = Math.max(bounds.minX, bounds.maxX);
  const minY = Math.min(bounds.minY, bounds.maxY);
  const maxY = Math.max(bounds.minY, bounds.maxY);
  const epsilon = 0.01;

  return {
    minX: minX === maxX ? minX - epsilon : minX,
    minY: minY === maxY ? minY - epsilon : minY,
    maxX: minX === maxX ? maxX + epsilon : maxX,
    maxY: minY === maxY ? maxY + epsilon : maxY,
  };
}

function getQuadtreeMaxDepth(rootBounds) {
  const diagonal = getBoundsDiagonalMeters(rootBounds);
  let depth = 0;

  while (
    depth < pointCloudConfig.tileMaxDepth &&
    diagonal / 2 ** depth > pointCloudConfig.tileMinDiagonalMeters
  ) {
    depth += 1;
  }

  return depth;
}

function createTileState({ id, parentId, fileIndex, depth, bounds, crs }) {
  return {
    id,
    key: id,
    parentId,
    fileIndex,
    depth,
    bounds,
    diagonalMeters: getBoundsDiagonalMeters(bounds),
    originalPointCount: 0,
    fullPointCount: 0,
    pointCount: 0,
    minZ: Infinity,
    maxZ: -Infinity,
    points: [],
    fullPoints: [],
    childIds: [],
    center: createTileCenter(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, crs),
    corners: createTileCorners(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, crs),
  };
}

function createM3noTileState(options) {
  const tile = createTileState(options);

  return {
    ...tile,
    cellSamples: new Map(),
    attributeIndexes: {
      altitude: { min: Infinity, max: -Infinity },
      classificationBins: new Set(),
    },
  };
}

function insertPointIntoTileTree(
  tileStates,
  rootTile,
  metric,
  point,
  altitudeMeters,
  maxDepth,
  crs,
) {
  let tile = rootTile;

  while (tile) {
    addPointToTileSample(tile, point, altitudeMeters);

    if (
      tile.depth >= maxDepth ||
      tile.diagonalMeters <= pointCloudConfig.tileMinDiagonalMeters
    ) {
      addPointToTileFullResolution(tile, point, altitudeMeters);
      return;
    }

    const quadrant = getTileQuadrant(metric, tile.bounds);
    const childId = `${tile.id}.${quadrant}`;
    let childTile = tileStates.get(childId);

    if (!childTile) {
      childTile = createTileState({
        id: childId,
        parentId: tile.id,
        fileIndex: tile.fileIndex,
        depth: tile.depth + 1,
        bounds: getTileChildBounds(tile.bounds, quadrant),
        crs,
      });
      tileStates.set(childId, childTile);
      tile.childIds.push(childId);
    }

    tile = childTile;
  }
}

function insertPointIntoM3noTree(
  tileStates,
  rootTile,
  sample,
  maxDepth,
  crs,
) {
  let tile = rootTile;
  let pendingSample = sample;

  while (tile && pendingSample) {
    addPointToM3noSubtreeIndex(tile, pendingSample);
    pendingSample = addPointToM3noNodeSample(tile, pendingSample);

    if (!pendingSample) {
      return;
    }

    if (
      tile.depth >= maxDepth ||
      tile.diagonalMeters <= pointCloudConfig.tileMinDiagonalMeters
    ) {
      return;
    }

    const childIndex = getM3noChildIndex(
      pendingSample.metric,
      pendingSample.altitudeMeters,
      tile.bounds,
    );
    const childId = `${tile.id}.${childIndex}`;
    let childTile = tileStates.get(childId);

    if (!childTile) {
      childTile = createM3noTileState({
        id: childId,
        parentId: tile.id,
        fileIndex: tile.fileIndex,
        depth: tile.depth + 1,
        bounds: getM3noChildBounds(tile.bounds, childIndex),
        crs,
      });
      tileStates.set(childId, childTile);
      tile.childIds.push(childId);
    }

    tile = childTile;
  }
}

function addPointToM3noSubtreeIndex(tile, sample) {
  tile.originalPointCount += 1;
  tile.pointCount = tile.originalPointCount;
  tile.minZ = Math.min(tile.minZ, sample.altitudeMeters);
  tile.maxZ = Math.max(tile.maxZ, sample.altitudeMeters);
  tile.attributeIndexes.altitude.min = Math.min(
    tile.attributeIndexes.altitude.min,
    sample.altitudeMeters,
  );
  tile.attributeIndexes.altitude.max = Math.max(
    tile.attributeIndexes.altitude.max,
    sample.altitudeMeters,
  );
  tile.attributeIndexes.classificationBins.add(sample.point.classification);
}

function addPointToM3noNodeSample(tile, sample) {
  const key = getM3noCellKey(sample, tile.bounds);
  const distanceSq = getM3noCellCenterDistanceSq(sample, tile.bounds);
  const existing = tile.cellSamples.get(key);
  const nextSample = { ...sample, distanceSq };

  if (!existing) {
    tile.cellSamples.set(key, nextSample);
    return null;
  }

  if (distanceSq < existing.distanceSq) {
    tile.cellSamples.set(key, nextSample);
    return existing;
  }

  return nextSample;
}

function getM3noCellKey(sample, bounds) {
  const gridSize = pointCloudConfig.m3noGridCellsPerAxis;
  const x = getM3noCellIndex(sample.metric.x, bounds.minX, bounds.maxX, gridSize);
  const y = getM3noCellIndex(sample.metric.y, bounds.minY, bounds.maxY, gridSize);
  const z = getM3noCellIndex(
    sample.altitudeMeters,
    bounds.minZ,
    bounds.maxZ,
    gridSize,
  );

  return `${x}:${y}:${z}`;
}

function getM3noCellIndex(value, minValue, maxValue, gridSize) {
  const span = Math.max(maxValue - minValue, Number.EPSILON);
  const normalized = (value - minValue) / span;
  return Math.max(
    0,
    Math.min(gridSize - 1, Math.floor(normalized * gridSize)),
  );
}

function getM3noCellCenterDistanceSq(sample, bounds) {
  const gridSize = pointCloudConfig.m3noGridCellsPerAxis;
  const x = getM3noCellCenterCoordinate(
    sample.metric.x,
    bounds.minX,
    bounds.maxX,
    gridSize,
  );
  const y = getM3noCellCenterCoordinate(
    sample.metric.y,
    bounds.minY,
    bounds.maxY,
    gridSize,
  );
  const z = getM3noCellCenterCoordinate(
    sample.altitudeMeters,
    bounds.minZ,
    bounds.maxZ,
    gridSize,
  );

  return (
    (sample.metric.x - x) ** 2 +
    (sample.metric.y - y) ** 2 +
    (sample.altitudeMeters - z) ** 2
  );
}

function getM3noCellCenterCoordinate(value, minValue, maxValue, gridSize) {
  const cellIndex = getM3noCellIndex(value, minValue, maxValue, gridSize);
  return minValue + ((cellIndex + 0.5) * (maxValue - minValue)) / gridSize;
}

function getM3noChildIndex(metric, altitudeMeters, bounds) {
  const middleX = (bounds.minX + bounds.maxX) / 2;
  const middleY = (bounds.minY + bounds.maxY) / 2;
  const middleZ = (bounds.minZ + bounds.maxZ) / 2;
  const east = metric.x >= middleX ? 1 : 0;
  const north = metric.y >= middleY ? 2 : 0;
  const upper = altitudeMeters >= middleZ ? 4 : 0;

  return east + north + upper;
}

function getM3noChildBounds(bounds, childIndex) {
  const middleX = (bounds.minX + bounds.maxX) / 2;
  const middleY = (bounds.minY + bounds.maxY) / 2;
  const middleZ = (bounds.minZ + bounds.maxZ) / 2;
  const east = childIndex % 2 === 1;
  const north = childIndex % 4 >= 2;
  const upper = childIndex >= 4;

  return {
    minX: east ? middleX : bounds.minX,
    maxX: east ? bounds.maxX : middleX,
    minY: north ? middleY : bounds.minY,
    maxY: north ? bounds.maxY : middleY,
    minZ: upper ? middleZ : bounds.minZ,
    maxZ: upper ? bounds.maxZ : middleZ,
  };
}

function finalizeM3noTileSamples(tileStates) {
  tileStates.forEach((tile) => {
    if (!tile.cellSamples) {
      return;
    }

    tile.points = Array.from(tile.cellSamples.values(), (sample) => sample.point);
  });
}

function insertPointIntoM3noFullResolutionTree(
  tileStates,
  rootTile,
  metric,
  point,
  altitudeMeters,
  maxDepth,
  crs,
) {
  let tile = rootTile;

  while (tile) {
    addPointToTileFullResolutionStats(tile, altitudeMeters, point.classification);

    if (
      tile.depth >= maxDepth ||
      tile.diagonalMeters <= pointCloudConfig.tileMinDiagonalMeters
    ) {
      tile.fullPoints.push(point);
      return;
    }

    const childIndex = getM3noChildIndex(metric, altitudeMeters, tile.bounds);
    const childId = `${tile.id}.${childIndex}`;
    let childTile = tileStates.get(childId);

    if (!childTile) {
      childTile = createM3noTileState({
        id: childId,
        parentId: tile.id,
        fileIndex: tile.fileIndex,
        depth: tile.depth + 1,
        bounds: getM3noChildBounds(tile.bounds, childIndex),
        crs,
      });
      tileStates.set(childId, childTile);
      tile.childIds.push(childId);
    }

    tile = childTile;
  }
}

function addPointToTileFullResolution(tile, point, altitudeMeters) {
  addPointToTileFullResolutionStats(tile, altitudeMeters, point.classification);
  tile.fullPoints.push(point);
}

function addPointToTileFullResolutionStats(tile, altitudeMeters, classification) {
  tile.fullPointCount += 1;
  tile.minZ = Math.min(tile.minZ, altitudeMeters);
  tile.maxZ = Math.max(tile.maxZ, altitudeMeters);

  if (tile.attributeIndexes) {
    tile.attributeIndexes.altitude.min = Math.min(
      tile.attributeIndexes.altitude.min,
      altitudeMeters,
    );
    tile.attributeIndexes.altitude.max = Math.max(
      tile.attributeIndexes.altitude.max,
      altitudeMeters,
    );
    tile.attributeIndexes.classificationBins.add(classification);
  }
}

function addPointToTileSample(tile, point, altitudeMeters) {
  tile.originalPointCount += 1;
  tile.pointCount = tile.originalPointCount;
  tile.minZ = Math.min(tile.minZ, altitudeMeters);
  tile.maxZ = Math.max(tile.maxZ, altitudeMeters);

  if (tile.points.length < pointCloudConfig.tileSamplePoints) {
    tile.points.push(point);
    return;
  }

  const randomIndex = Math.floor(Math.random() * tile.originalPointCount);
  if (randomIndex < pointCloudConfig.tileSamplePoints) {
    tile.points[randomIndex] = point;
  }
}

async function createTileRecordsAsync(tileStates, fileName, crs) {
  const tiles = [...tileStates.values()].filter(
    (tile) => tile.originalPointCount > 0 || tile.fullPointCount > 0,
  );
  const records = [];

  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index];
    records.push(createTileRecord(tile, tileStates, fileName, crs));

    if (index > 0 && index % pointCloudConfig.indexedDbWriteBatchSize === 0) {
      await yieldToBrowser();
    }
  }

  return records;
}

function createTileRecord(tile, tileStates, fileName, crs) {
  return {
    id: tile.id,
    key: tile.id,
    parentId: tile.parentId,
    childIds: tile.childIds.filter((childId) => {
      const child = tileStates.get(childId);
      return child?.originalPointCount > 0 || child?.fullPointCount > 0;
    }),
    fileIndex: tile.fileIndex,
    fileName,
    crsLabel: crs.label,
    crsKind: crs.kind,
    crsCode: crs.code || null,
    crsZone: crs.zone || null,
    crsNorthern: crs.northern ?? null,
    depth: tile.depth,
    bounds: tile.bounds,
    diagonalMeters: getTileDiagonalMeters(tile),
    originalPointCount: tile.originalPointCount,
    fullPointCount: tile.fullPointCount,
    sourcePointCount: Math.max(
      tile.originalPointCount,
      tile.fullPointCount,
      tile.pointCount,
    ),
    pointCount: Math.max(tile.pointCount, tile.fullPointCount),
    sampledPointCount: tile.points.length,
    points: tile.points,
    fullPoints: tile.fullPoints,
    attributeIndexes: serializeTileAttributeIndexes(tile.attributeIndexes),
    center: tile.center,
    corners: tile.corners,
    minZ: Number.isFinite(tile.minZ) ? tile.minZ : null,
    maxZ: Number.isFinite(tile.maxZ) ? tile.maxZ : null,
  };
}

function serializeTileAttributeIndexes(attributeIndexes) {
  if (!attributeIndexes) {
    return null;
  }

  const altitude = attributeIndexes.altitude || {};

  return {
    altitude:
      Number.isFinite(altitude.min) && Number.isFinite(altitude.max)
        ? { min: altitude.min, max: altitude.max }
        : null,
    classificationBins: attributeIndexes.classificationBins
      ? [...attributeIndexes.classificationBins].sort((left, right) => left - right)
      : [],
  };
}

function createTileMetadataRecord(tileRecord) {
  const { points, fullPoints, ...metadata } = tileRecord;
  return metadata;
}

function getBoundsDiagonalMeters(bounds) {
  const minZ = Number.isFinite(bounds.minZ) ? bounds.minZ : 0;
  const maxZ = Number.isFinite(bounds.maxZ) ? bounds.maxZ : minZ;

  return Math.hypot(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    maxZ - minZ,
  );
}

function getTileQuadrant(point, bounds) {
  const middleX = (bounds.minX + bounds.maxX) / 2;
  const middleY = (bounds.minY + bounds.maxY) / 2;
  const east = point.x >= middleX ? 1 : 0;
  const north = point.y >= middleY ? 2 : 0;

  return east + north;
}

function getTileChildBounds(bounds, quadrant) {
  const middleX = (bounds.minX + bounds.maxX) / 2;
  const middleY = (bounds.minY + bounds.maxY) / 2;
  const east = quadrant % 2 === 1;
  const north = quadrant >= 2;

  return {
    minX: east ? middleX : bounds.minX,
    maxX: east ? bounds.maxX : middleX,
    minY: north ? middleY : bounds.minY,
    maxY: north ? bounds.maxY : middleY,
  };
}

function getHorizontalMetricCoordinate(x, y, crs) {
  if (crs.kind === "geographic") {
    return lngLatToWebMercatorMeters(x, y);
  }

  return { x, y };
}

function createTileCenter(minX, minY, maxX, maxY, crs) {
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  if (crs.kind === "geographic") {
    return webMercatorMetersToLngLat(centerX, centerY);
  }

  return projectLasCoordinate(centerX, centerY, 0, crs);
}

function createTileCorners(minX, minY, maxX, maxY, crs) {
  const corners =
    crs.kind === "geographic"
      ? [
          webMercatorMetersToLngLat(minX, minY),
          webMercatorMetersToLngLat(maxX, minY),
          webMercatorMetersToLngLat(maxX, maxY),
          webMercatorMetersToLngLat(minX, maxY),
        ]
      : [
          projectLasCoordinate(minX, minY, 0, crs),
          projectLasCoordinate(maxX, minY, 0, crs),
          projectLasCoordinate(maxX, maxY, 0, crs),
          projectLasCoordinate(minX, maxY, 0, crs),
        ];

  return corners
    .filter(
      (corner) =>
        Number.isFinite(corner.lng) &&
        Number.isFinite(corner.lat) &&
        Math.abs(corner.lng) <= 180 &&
        Math.abs(corner.lat) <= 90,
    )
    .map((corner) => [corner.lng, corner.lat]);
}

function lngLatToWebMercatorMeters(lng, lat) {
  const earthRadius = 6378137;
  const clampedLat = Math.min(Math.max(lat, -85.05112878), 85.05112878);

  return {
    x: earthRadius * lng * (Math.PI / 180),
    y:
      earthRadius *
      Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360)),
  };
}

function webMercatorMetersToLngLat(x, y) {
  const earthRadius = 6378137;

  return {
    lng: (x / earthRadius) * (180 / Math.PI),
    lat: (2 * Math.atan(Math.exp(y / earthRadius)) - Math.PI / 2) * (180 / Math.PI),
  };
}

function countLasClassifications(buffer, existingHeader) {
  const view = new DataView(buffer);

  if (readAscii(view, 0, 4) !== "LASF") {
    throw new Error("The file does not appear to be a valid LAS file.");
  }

  const header = existingHeader || readLasHeader(view);
  if (header.pointFormat > 10) {
    throw new Error("This app supports uncompressed LAS files. LAZ requires an additional decoder.");
  }

  const counts = new Map();

  for (let pointIndex = 0; pointIndex < header.pointCount; pointIndex += 1) {
    const offset = header.pointDataOffset + pointIndex * header.pointRecordLength;
    const classificationOffset =
      offset + (header.pointFormat >= 6 && header.pointFormat <= 10 ? 16 : 15);

    if (classificationOffset >= view.byteLength) {
      break;
    }

    const classification = readLasClassification(
      view,
      offset,
      header.pointFormat,
    );
    counts.set(classification, (counts.get(classification) || 0) + 1);
  }

  return counts;
}

function readLasClassification(view, pointOffset, pointFormat) {
  if (pointFormat >= 6 && pointFormat <= 10) {
    return view.getUint8(pointOffset + 16);
  }

  return view.getUint8(pointOffset + 15) & 0x1f;
}

function readLasHeader(view) {
  const versionMajor = view.getUint8(24);
  const versionMinor = view.getUint8(25);
  const headerSize = view.getUint16(94, true);
  const pointDataOffset = view.getUint32(96, true);
  const vlrCount = view.getUint32(100, true);
  const pointFormat = view.getUint8(104) & 0x3f;
  const pointRecordLength = view.getUint16(105, true);
  const legacyPointCount = view.getUint32(107, true);
  const scaleX = view.getFloat64(131, true);
  const scaleY = view.getFloat64(139, true);
  const scaleZ = view.getFloat64(147, true);
  const offsetX = view.getFloat64(155, true);
  const offsetY = view.getFloat64(163, true);
  const offsetZ = view.getFloat64(171, true);
  const maxX = view.getFloat64(179, true);
  const minX = view.getFloat64(187, true);
  const maxY = view.getFloat64(195, true);
  const minY = view.getFloat64(203, true);
  const maxZ = view.getFloat64(211, true);
  const minZ = view.getFloat64(219, true);

  let pointCount = legacyPointCount;
  if (versionMajor === 1 && versionMinor >= 4 && view.byteLength >= 255) {
    const extendedPointCount = Number(view.getBigUint64(247, true));
    if (extendedPointCount > 0) {
      pointCount = extendedPointCount;
    }
  }

  if (!pointCount || !pointRecordLength || pointDataOffset >= view.byteLength) {
    throw new Error("The LAS header does not contain valid points.");
  }

  return {
    versionMajor,
    versionMinor,
    headerSize,
    pointDataOffset,
    vlrCount,
    pointFormat,
    pointRecordLength,
    pointCount,
    scaleX,
    scaleY,
    scaleZ,
    offsetX,
    offsetY,
    offsetZ,
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
  };
}

async function detectLasCrs(view, header) {
  const vlrs = readLasVlrs(view, header);
  const geoKeyVlr = vlrs.find(
    (vlr) => vlr.recordId === 34735 && vlr.userId.includes("LASF_Projection"),
  );
  const wktVlr = vlrs.find(
    (vlr) => vlr.recordId === 2112 && vlr.userId.includes("LASF_Projection"),
  );

  const wktEpsg = wktVlr
    ? findAnyEpsg(readAscii(view, wktVlr.dataOffset, wktVlr.length))
    : null;
  if (wktEpsg) {
    return crsFromEpsgOrProj4(wktEpsg, "WKT");
  }

  if (geoKeyVlr) {
    const geoKeys = readGeoKeys(view, geoKeyVlr);
    const projectedCode = geoKeys.get(3072);
    const geographicCode = geoKeys.get(2048);
    const epsg = findAnyEpsg(String(projectedCode || geographicCode || ""));

    if (epsg) {
      return crsFromEpsgOrProj4(epsg, "GeoTIFF VLR");
    }
  }

  return inferCrsFromFirstPoint(view, header);
}

function readLasVlrs(view, header) {
  const vlrs = [];
  let offset = header.headerSize;

  for (let index = 0; index < header.vlrCount && offset + 54 <= view.byteLength; index += 1) {
    const userId = readAscii(view, offset + 2, 16).replace(/\0/g, "").trim();
    const recordId = view.getUint16(offset + 18, true);
    const length = view.getUint16(offset + 20, true);
    const description = readAscii(view, offset + 22, 32).replace(/\0/g, "").trim();
    const dataOffset = offset + 54;

    vlrs.push({ userId, recordId, length, description, dataOffset });
    offset = dataOffset + length;
  }

  return vlrs;
}

function readGeoKeys(view, vlr) {
  const keys = new Map();
  const keyCount = view.getUint16(vlr.dataOffset + 6, true);

  for (let index = 0; index < keyCount; index += 1) {
    const entryOffset = vlr.dataOffset + 8 + index * 8;
    if (entryOffset + 8 > vlr.dataOffset + vlr.length) {
      break;
    }

    const keyId = view.getUint16(entryOffset, true);
    const tiffTagLocation = view.getUint16(entryOffset + 2, true);
    const valueOffset = view.getUint16(entryOffset + 6, true);

    if (tiffTagLocation === 0) {
      keys.set(keyId, valueOffset);
    }
  }

  return keys;
}

function inferCrsFromFirstPoint(view, header) {
  const x = view.getInt32(header.pointDataOffset, true) * header.scaleX + header.offsetX;
  const y = view.getInt32(header.pointDataOffset + 4, true) * header.scaleY + header.offsetY;

  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    return crsFromEpsg(4326, "inferred from coordinate range");
  }

  if (Math.abs(x) <= 20037508.342789244 && Math.abs(y) <= 20037508.342789244) {
    const webMercator = projectLasCoordinate(x, y, 0, crsFromEpsg(3857, "inferred from coordinate range"));
    if (webMercator.lng > -18 && webMercator.lng < -13 && webMercator.lat > 26 && webMercator.lat < 30) {
      return crsFromEpsg(3857, "inferred from coordinate range");
    }
  }

  if (x >= 100000 && x <= 900000 && y >= 2500000 && y <= 4000000) {
    return crsFromEpsg(32628, "inferred UTM 28N for the Canary Islands");
  }

  return crsFromEpsg(
    25830,
    "default assumption: Iberian Peninsula in Spain",
  );
}

function findAnyEpsg(text) {
  const matches = String(text).match(/\d{4,5}/g) || [];
  const codes = matches.map(Number);

  return (
    codes.find(isSupportedProjectedEpsg) ||
    codes.find((code) => code === 4326 || code === 3857) ||
    codes[0] ||
    null
  );
}

function isSupportedProjectedEpsg(code) {
  return (
    (code >= 32601 && code <= 32660) ||
    (code >= 32701 && code <= 32760) ||
    (code >= 25801 && code <= 25860)
  );
}

function crsFromEpsg(code, source) {
  if (code === 4326) {
    return { kind: "geographic", code, label: `EPSG:${code} (${source})` };
  }

  if (code === 3857) {
    return { kind: "web-mercator", code, label: `EPSG:${code} (${source})` };
  }

  if (isSupportedProjectedEpsg(code)) {
    const zone = code % 100;
    const northern = code < 32700;
    return {
      kind: "utm",
      code,
      zone,
      northern,
      label: `EPSG:${code} UTM zona ${zone}${northern ? "N" : "S"} (${source})`,
    };
  }

  throw new Error(`CRS EPSG:${code} was detected but is not supported by this app.`);
}

async function crsFromEpsgOrProj4(code, source) {
  try {
    return crsFromEpsg(code, source);
  } catch (error) {
    const transformer = await createProj4Transformer(code);

    return {
      kind: "proj4",
      code,
      transformer,
      label: `EPSG:${code} (${source}, proj4js fallback)`,
    };
  }
}

async function createProj4Transformer(code) {
  const proj4 = await loadProj4();
  const sourceCode = `EPSG:${code}`;

  if (!proj4.defs(sourceCode)) {
    const definition = await fetchProj4Definition(code);
    proj4.defs(sourceCode, definition);
  }

  return proj4(sourceCode, "EPSG:4326");
}

async function fetchProj4Definition(code) {
  const urls = [
    `https://epsg.io/${code}.proj4`,
    `https://spatialreference.org/ref/epsg/${code}/proj4/`,
  ];

  let lastError;

  for (const url of urls) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const definition = (await response.text()).trim();

      if (definition.startsWith("+proj=")) {
        return definition;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Could not download the proj4 definition for EPSG:${code}. ${lastError?.message || ""}`,
  );
}

function projectLasCoordinate(x, y, z, crs) {
  if (crs.kind === "geographic") {
    return { lng: x, lat: y, altitudeMeters: z };
  }

  if (crs.kind === "web-mercator") {
    const earthRadius = 6378137;
    return {
      lng: (x / earthRadius) * (180 / Math.PI),
      lat: (2 * Math.atan(Math.exp(y / earthRadius)) - Math.PI / 2) * (180 / Math.PI),
      altitudeMeters: z,
    };
  }

  if (crs.kind === "utm") {
    const [lng, lat] = utmToLngLat(x, y, crs.zone, crs.northern);
    return { lng, lat, altitudeMeters: z };
  }

  if (crs.kind === "proj4") {
    const [lng, lat] = crs.transformer.forward([x, y]);
    return { lng, lat, altitudeMeters: z };
  }

  throw new Error("Unsupported CRS.");
}

function utmToLngLat(easting, northing, zone, northern) {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e = Math.sqrt(f * (2 - f));
  const e1sq = e * e / (1 - e * e);
  const x = easting - 500000;
  const y = northern ? northing : northing - 10000000;
  const m = y / k0;
  const mu =
    m /
    (a *
      (1 -
        (e * e) / 4 -
        (3 * Math.pow(e, 4)) / 64 -
        (5 * Math.pow(e, 6)) / 256));
  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));
  const j1 = (3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32;
  const j2 = (21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32;
  const j3 = (151 * Math.pow(e1, 3)) / 96;
  const j4 = (1097 * Math.pow(e1, 4)) / 512;
  const fp =
    mu +
    j1 * Math.sin(2 * mu) +
    j2 * Math.sin(4 * mu) +
    j3 * Math.sin(6 * mu) +
    j4 * Math.sin(8 * mu);
  const sinFp = Math.sin(fp);
  const cosFp = Math.cos(fp);
  const tanFp = Math.tan(fp);
  const c1 = e1sq * cosFp * cosFp;
  const t1 = tanFp * tanFp;
  const r1 =
    (a * (1 - e * e)) / Math.pow(1 - e * e * sinFp * sinFp, 1.5);
  const n1 = a / Math.sqrt(1 - e * e * sinFp * sinFp);
  const d = x / (n1 * k0);
  const q1 = n1 * tanFp / r1;
  const q2 = (d * d) / 2;
  const q3 =
    ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * e1sq) * Math.pow(d, 4)) /
    24;
  const q4 =
    ((61 +
      90 * t1 +
      298 * c1 +
      45 * t1 * t1 -
      252 * e1sq -
      3 * c1 * c1) *
      Math.pow(d, 6)) /
    720;
  const lat = fp - q1 * (q2 - q3 + q4);
  const q5 = d;
  const q6 = ((1 + 2 * t1 + c1) * Math.pow(d, 3)) / 6;
  const q7 =
    ((5 -
      2 * c1 +
      28 * t1 -
      3 * c1 * c1 +
      8 * e1sq +
      24 * t1 * t1) *
      Math.pow(d, 5)) /
    120;
  const lonOrigin = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const lon = lonOrigin + (q5 - q6 + q7) / cosFp;

  return [lon * (180 / Math.PI), lat * (180 / Math.PI)];
}

function lngLatToUtm(lng, lat, zone, northern) {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e = Math.sqrt(f * (2 - f));
  const eSq = e * e;
  const ePrimeSq = eSq / (1 - eSq);
  const latRad = lat * (Math.PI / 180);
  const lngRad = lng * (Math.PI / 180);
  const lonOrigin = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const tanLat = Math.tan(latRad);
  const n = a / Math.sqrt(1 - eSq * sinLat * sinLat);
  const t = tanLat * tanLat;
  const c = ePrimeSq * cosLat * cosLat;
  const longitudeDelta = (lngRad - lonOrigin) * cosLat;
  const m =
    a *
    ((1 - eSq / 4 - (3 * eSq * eSq) / 64 - (5 * eSq ** 3) / 256) *
      latRad -
      ((3 * eSq) / 8 + (3 * eSq * eSq) / 32 + (45 * eSq ** 3) / 1024) *
        Math.sin(2 * latRad) +
      ((15 * eSq * eSq) / 256 + (45 * eSq ** 3) / 1024) *
        Math.sin(4 * latRad) -
      ((35 * eSq ** 3) / 3072) * Math.sin(6 * latRad));
  const easting =
    k0 *
      n *
      (longitudeDelta +
        ((1 - t + c) * longitudeDelta ** 3) / 6 +
        ((5 - 18 * t + t * t + 72 * c - 58 * ePrimeSq) *
          longitudeDelta ** 5) /
          120) +
    500000;
  let northing =
    k0 *
    (m +
      n *
        tanLat *
        ((longitudeDelta * longitudeDelta) / 2 +
          ((5 - t + 9 * c + 4 * c * c) * longitudeDelta ** 4) / 24 +
          ((61 - 58 * t + t * t + 600 * c - 330 * ePrimeSq) *
            longitudeDelta ** 6) /
            720));

  if (!northern) {
    northing += 10000000;
  }

  return { x: easting, y: northing };
}

function readAscii(view, offset, length) {
  return new TextDecoder("utf-8").decode(
    new Uint8Array(view.buffer, view.byteOffset + offset, length),
  );
}

async function start() {
  scheduleSplashDismiss();
  setStatus("Loading MapLibre...");

  try {
    await resetVolatileTileDb();
    await loadMapLibre();
    setStatus("Loading map...");
    initMap();
  } catch (error) {
    console.error(error);
    showMapError();
  }
}

start();


