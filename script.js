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
  pointCloudLayer: "las-palmas-webgl-point-cloud",
};

const pointCloudConfig = {
  maxLasPoints: 1000000,
  flyToClearanceMeters: 1000,
};

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
const pointSizeControl = document.querySelector("#point-size-control");
const pointSizeValue = document.querySelector("#point-size-value");
const depthBiasControl = document.querySelector("#depth-bias-control");
const depthBiasValue = document.querySelector("#depth-bias-value");
const classificationLegend = document.querySelector("#classification-legend");
const lasFileInput = document.querySelector("#las-file");
const lasDrop = document.querySelector("#las-drop");
const lasStatus = document.querySelector("#las-status");
const flyToPointCloudButton = document.querySelector("#fly-to-point-cloud");

let currentPointCloudPoints = [];

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
    window.pointCloudLayer = createWebGlPointCloudLayer();
    map.addLayer(window.pointCloudLayer);
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
      this.pointBuffer = createPointCloudBuffer(
        this.points,
        map,
        terrainToggle.checked,
      );
      this.gl = gl;

      const isWebGl2 =
        typeof WebGL2RenderingContext !== "undefined" &&
        gl instanceof WebGL2RenderingContext;
      const shaders = createPointCloudShaders(isWebGl2);

      this.program = createProgram(gl, shaders.vertex, shaders.fragment);
      this.positionLocation = gl.getAttribLocation(this.program, "a_position");
      this.colorLocation = gl.getAttribLocation(this.program, "a_color");
      this.matrixLocation = gl.getUniformLocation(this.program, "u_matrix");
      this.pointSizeLocation = gl.getUniformLocation(this.program, "u_point_size");
      this.depthBiasLocation = gl.getUniformLocation(this.program, "u_depth_bias");

      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.pointBuffer, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },

    updateElevationBuffer(map) {
      if (!this.gl || !this.buffer || !this.points) {
        return;
      }

      this.pointBuffer = createPointCloudBuffer(
        this.points,
        map,
        terrainToggle.checked,
      );

      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, this.pointBuffer, this.gl.DYNAMIC_DRAW);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
      if (typeof map.triggerRepaint === "function") {
        map.triggerRepaint();
      }
    },

    setPoints(points, map) {
      if (!this.gl || !this.buffer) {
        return;
      }

      this.points = points;
      this.pointCount = points.length;
      this.updateElevationBuffer(map);
    },

    render(gl, args) {
      const matrix =
        args?.defaultProjectionData?.mainMatrix ||
        args?.modelViewProjectionMatrix ||
        args;

      gl.useProgram(this.program);
      gl.uniformMatrix4fv(this.matrixLocation, false, matrix);
      gl.uniform1f(this.pointSizeLocation, getPointSizePixels());
      gl.uniform1f(this.depthBiasLocation, getDepthBias());

      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.enableVertexAttribArray(this.positionLocation);
      gl.vertexAttribPointer(this.positionLocation, 3, gl.FLOAT, false, 28, 0);
      gl.enableVertexAttribArray(this.colorLocation);
      gl.vertexAttribPointer(this.colorLocation, 4, gl.FLOAT, false, 28, 12);

      const wasDepthTestEnabled = gl.isEnabled(gl.DEPTH_TEST);
      const wasBlendEnabled = gl.isEnabled(gl.BLEND);
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

      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.colorMask(false, false, false, false);
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.POINTS, 0, this.pointCount);

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
      gl.drawArrays(gl.POINTS, 0, this.pointCount);

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
      gl.disableVertexAttribArray(this.positionLocation);
      gl.disableVertexAttribArray(this.colorLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
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

function createPointCloudBuffer(points, map, useTerrainElevation) {
  const positions = new Float32Array(points.length * 7);
  const verticalExaggeration = useTerrainElevation ? getTerrainExaggeration() : 1;
  const pointOffsetMeters = getPointCloudOffsetMeters();

  points.forEach((point, index) => {
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

    const color = getLasClassColor(point.classification);
    const offset = index * 7;

    positions[offset] = mercator.x;
    positions[offset + 1] = mercator.y;
    positions[offset + 2] = mercator.z;
    positions[offset + 3] = color[0];
    positions[offset + 4] = color[1];
    positions[offset + 5] = color[2];
    positions[offset + 6] = color[3];
  });

  return positions;
}

function getLasClassColor(classification = 0) {
  return lasClassColors.get(classification) || fallbackLasClassColor;
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
        uniform float u_point_size;
        uniform float u_depth_bias;
        in vec3 a_position;
        in vec4 a_color;
        out vec4 v_color;

        void main() {
          gl_Position = u_matrix * vec4(a_position, 1.0);
          gl_Position.z -= u_depth_bias * gl_Position.w;
          gl_PointSize = u_point_size;
          v_color = a_color;
        }
      `,
      fragment: `#version 300 es
        precision highp float;
        in vec4 v_color;
        out vec4 fragColor;

        void main() {
          vec2 centered = gl_PointCoord - vec2(0.5);
          float distanceFromCenter = length(centered);
          if (distanceFromCenter > 0.5) {
            discard;
          }
          fragColor = v_color;
        }
      `,
    };
  }

  return {
    vertex: `
      precision highp float;
      uniform mat4 u_matrix;
      uniform float u_point_size;
      uniform float u_depth_bias;
      attribute vec3 a_position;
      attribute vec4 a_color;
      varying vec4 v_color;

      void main() {
        gl_Position = u_matrix * vec4(a_position, 1.0);
        gl_Position.z -= u_depth_bias * gl_Position.w;
        gl_PointSize = u_point_size;
        v_color = a_color;
      }
    `,
    fragment: `
      precision highp float;
      varying vec4 v_color;

      void main() {
        vec2 centered = gl_PointCoord - vec2(0.5);
        float distanceFromCenter = length(centered);
        if (distanceFromCenter > 0.5) {
          discard;
        }
        gl_FragColor = v_color;
      }
    `,
  };
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
  renderClassificationLegend();

  menuToggle.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    menuContent.hidden = isOpen;
  });

  baseLayerInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) {
        setBaseLayer(input.value);
      }
    });
  });

  terrainToggle.addEventListener("change", () => {
    setElevationEnabled(terrainToggle.checked);
  });

  pitchControl.addEventListener("input", () => {
    const pitch = Number(pitchControl.value);
    pitchValue.textContent = `${pitch}\u00b0`;
    window.mapLibreMap.easeTo({
      pitch,
      duration: 120,
    });
  });

  terrainExaggerationControl.addEventListener("input", () => {
    const exaggeration = getTerrainExaggeration();
    terrainExaggerationValue.textContent = `${exaggeration.toFixed(1)}x`;

    if (terrainToggle.checked) {
      applyTerrainExaggeration();
      refreshPointCloudElevation();
    }
  });

  pointOffsetControl.addEventListener("input", () => {
    const offset = getPointCloudOffsetMeters();
    pointOffsetValue.textContent = `${offset.toFixed(offset % 1 ? 1 : 0)} m`;
    refreshPointCloudElevation();
  });

  pointSizeControl.addEventListener("input", () => {
    const size = getPointSizePixels();
    pointSizeValue.textContent = `${size.toFixed(size % 1 ? 1 : 0)} px`;
    window.mapLibreMap?.triggerRepaint();
  });

  depthBiasControl.addEventListener("input", () => {
    depthBiasValue.textContent = getDepthBias().toFixed(4);
    window.mapLibreMap?.triggerRepaint();
  });

  lasFileInput.addEventListener("change", () => {
    const files = getLasFiles(lasFileInput.files);
    if (files.length) {
      loadLasFiles(files);
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    lasDrop.addEventListener(eventName, (event) => {
      event.preventDefault();
      lasDrop.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    lasDrop.addEventListener(eventName, (event) => {
      event.preventDefault();
      lasDrop.classList.remove("is-dragging");
    });
  });

  lasDrop.addEventListener("drop", (event) => {
    const files = getLasFiles(event.dataTransfer.files);
    if (files.length) {
      loadLasFiles(files);
    } else {
      lasStatus.textContent = "Drop one or more files with the .las extension.";
    }
  });

  flyToPointCloudButton.addEventListener("click", () => {
    flyToCurrentPointCloud();
  });
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

function getPointSizePixels() {
  return Number(pointSizeControl.value) || 3;
}

function getDepthBias() {
  return Number(depthBiasControl.value) || 0;
}

function refreshPointCloudElevation() {
  if (window.pointCloudLayer?.updateElevationBuffer && window.mapLibreMap) {
    window.pointCloudLayer.updateElevationBuffer(window.mapLibreMap);
  }
}

function getLasFiles(fileList) {
  return Array.from(fileList || []).filter((file) =>
    file.name.toLowerCase().endsWith(".las"),
  );
}

async function loadLasFiles(files) {
  if (!window.pointCloudLayer || !window.mapLibreMap) {
    lasStatus.textContent = "Wait for the map to finish loading.";
    return;
  }

  const fileLabel =
    files.length === 1 ? files[0].name : `${files.length} LAS files`;
  lasStatus.textContent = `Preparing ${fileLabel}...`;

  try {
    const metadata = await Promise.all(
      files.map(async (file) => {
        const headerBuffer = await file.slice(0, 375).arrayBuffer();
        const view = new DataView(headerBuffer);

        if (view.byteLength < 227 || readAscii(view, 0, 4) !== "LASF") {
          throw new Error(`${file.name} does not appear to be a valid LAS file.`);
        }

        return {
          file,
          pointCount: readLasHeader(view).pointCount,
        };
      }),
    );
    const globalClassCounts = new Map();

    for (let index = 0; index < metadata.length; index += 1) {
      const { file } = metadata[index];
      lasStatus.textContent = `Analyzing classifications in ${file.name} (${index + 1}/${files.length})...`;
      const buffer = await file.arrayBuffer();
      const classCounts = countLasClassifications(buffer);
      metadata[index].classCounts = classCounts;

      classCounts.forEach((count, classification) => {
        globalClassCounts.set(
          classification,
          (globalClassCounts.get(classification) || 0) + count,
        );
      });
    }

    const globalClassBudgets = allocateRareClassBudgets(
      globalClassCounts,
      pointCloudConfig.maxLasPoints,
    );
    const fileClassBudgets = metadata.map(() => new Map());

    globalClassBudgets.forEach((classBudget, classification) => {
      const allocations = allocateProportionalBudgets(
        metadata.map(
          ({ classCounts }) => classCounts.get(classification) || 0,
        ),
        classBudget,
      );

      allocations.forEach((allocation, fileIndex) => {
        if (allocation > 0) {
          fileClassBudgets[fileIndex].set(classification, allocation);
        }
      });
    });

    const results = [];

    for (let index = 0; index < metadata.length; index += 1) {
      const { file } = metadata[index];
      lasStatus.textContent = `Reading ${file.name} (${index + 1}/${files.length})...`;
      const buffer = await file.arrayBuffer();
      results.push(
        await parseLasPointCloud(buffer, {
          classCounts: metadata[index].classCounts,
          classTargets: fileClassBudgets[index],
        }),
      );
    }

    const points = results.flatMap((result) => result.points);
    window.pointCloudLayer.setPoints(points, window.mapLibreMap);
    currentPointCloudPoints = points;
    flyToPointCloudButton.hidden = false;

    if (!terrainToggle.checked) {
      terrainToggle.checked = true;
      setElevationEnabled(true, { moveCamera: false });
    } else {
      refreshPointCloudElevation();
    }

    flyToCurrentPointCloud();
    const crsLabels = [...new Set(results.map((result) => result.crsLabel))];
    const crsSummary =
      crsLabels.length === 1
        ? crsLabels[0]
        : `${crsLabels.length} coordinate systems`;
    lasStatus.textContent = `${files.length} ${files.length === 1 ? "file" : "files"} - ${points.length.toLocaleString("en-US")} LAS points - ${crsSummary}`;
  } catch (error) {
    console.error(error);
    lasStatus.textContent =
      error.message || "The LAS files could not be read.";
  } finally {
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

function allocateProportionalBudgets(counts, maximumPoints) {
  const totalPoints = counts.reduce((sum, count) => sum + count, 0);
  const budgetLimit = Math.min(maximumPoints, totalPoints);

  if (totalPoints <= budgetLimit) {
    return [...counts];
  }

  const exactBudgets = counts.map(
    (count) => (count / totalPoints) * budgetLimit,
  );
  const budgets = exactBudgets.map((budget) => Math.floor(budget));
  const assigned = budgets.reduce((sum, count) => sum + count, 0);
  const remaining = budgetLimit - assigned;

  exactBudgets
    .map((budget, index) => ({
      index,
      remainder: budget - Math.floor(budget),
    }))
    .filter(({ index }) => budgets[index] < counts[index])
    .sort((left, right) => right.remainder - left.remainder)
    .slice(0, remaining)
    .forEach(({ index }) => {
      budgets[index] += 1;
    });

  return budgets;
}

function flyToCurrentPointCloud() {
  flyToLasPoints(currentPointCloudPoints);
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

function getPointCloudMaxRenderedAltitude(points) {
  if (!points.length || !window.mapLibreMap) {
    return 0;
  }

  const useTerrainElevation = terrainToggle.checked;
  const verticalExaggeration = useTerrainElevation ? getTerrainExaggeration() : 1;
  const pointOffsetMeters = getPointCloudOffsetMeters();
  let maxAltitude = 0;
  const stride = Math.max(1, Math.ceil(points.length / 2000));

  for (let index = 0; index < points.length; index += stride) {
    const point = points[index];
    const altitude = Number.isFinite(point.altitudeMeters)
      ? point.altitudeMeters * verticalExaggeration + pointOffsetMeters
      : useTerrainElevation
        ? getTerrainElevation(window.mapLibreMap, point) * verticalExaggeration +
          pointOffsetMeters
        : pointOffsetMeters;

    maxAltitude = Math.max(maxAltitude, altitude);
  }

  return maxAltitude;
}

function getZoomForApproxCameraAltitude(lat, altitudeMeters, pitch) {
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

  return Math.min(Math.max(zoom, 8), 18);
}

function getPointCloudCenter(points) {
  if (!points.length) {
    return { lng: lasPalmas.coordinates[0], lat: lasPalmas.coordinates[1] };
  }

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  points.forEach((point) => {
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
    return points[0];
  }

  return {
    lng: (minLng + maxLng) / 2,
    lat: (minLat + maxLat) / 2,
  };
}

async function parseLasPointCloud(buffer, options = {}) {
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
  const classCounts =
    options.classCounts || countLasClassifications(buffer, header);
  const classTargets =
    options.classTargets ||
    allocateRareClassBudgets(classCounts, pointCloudConfig.maxLasPoints);
  const samplingStates = new Map(
    [...classCounts.entries()].map(([classification, count]) => [
      classification,
      {
        accumulator: 0,
        count,
        target: classTargets.get(classification) || 0,
      },
    ]),
  );
  const points = [];

  for (let pointIndex = 0; pointIndex < totalPoints; pointIndex += 1) {
    const offset = header.pointDataOffset + pointIndex * header.pointRecordLength;

    if (offset + 12 > view.byteLength) {
      break;
    }

    const classification = readLasClassification(view, offset, header.pointFormat);
    const samplingState = samplingStates.get(classification);

    if (!samplingState || samplingState.target === 0) {
      continue;
    }

    samplingState.accumulator += samplingState.target;
    if (samplingState.accumulator < samplingState.count) {
      continue;
    }
    samplingState.accumulator -= samplingState.count;

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
      projected.classification = classification;
      points.push(projected);
    }
  }

  if (!points.length) {
    throw new Error("No valid points could be projected from the LAS file.");
  }

  return {
    points,
    crsLabel: crs.label,
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

function readAscii(view, offset, length) {
  return new TextDecoder("utf-8").decode(
    new Uint8Array(view.buffer, view.byteOffset + offset, length),
  );
}

async function start() {
  setStatus("Loading MapLibre...");

  try {
    await loadMapLibre();
    setStatus("Loading map...");
    initMap();
  } catch (error) {
    console.error(error);
    showMapError();
  }
}

start();
