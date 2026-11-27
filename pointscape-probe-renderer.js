(function (scope) {
  const { faces, viewProjection, center, corners } = scope.PointScapeProbeOctree;
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const uniformNames = {
    matrix: "matrix", anchorClip: "anchor_clip", pointRadiusMeters: "point_radius_meters",
    minimumPointRadius: "min_point_radius_px", maximumPointRadius: "max_point_radius_px",
    projectionPixelsPerMercator: "projection_pixels_per_mercator", metersToMercator: "meters_to_mercator",
    explodedOffset: "exploded_offset", depthBias: "depth_bias", classCount: "class_count",
    classCodes: "class_codes[0]", classColors: "class_colors[0]", fallbackColor: "fallback_color",
    edlDepthPass: "edl_depth_pass", edlEnabled: "edl_enabled", voxelEnabled: "voxel",
    imageEnabled: "image", imageColor: "image_color", imageDepth: "image_depth", imageInverse: "capture_inverse",
  };

  class Renderer {
    constructor(canvas, deps, bounds) {
      this.deps = deps;
      this.canvas = canvas;
      this.gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
      if (!this.gl) throw new Error("El modo de probes requiere WebGL 2");
      const gl = this.gl;
      this.program = deps.createProgram(gl);
      for (const [key, name] of Object.entries(uniformNames)) {
        this[`${key}Location`] = gl.getUniformLocation(this.program, `u_${name}`);
      }
      this.positionLocation = gl.getAttribLocation(this.program, "a_position");
      this.classificationLocation = gl.getAttribLocation(this.program, "a_classification");
      this.isolated = true;
      this.live = new Map();
      this.analysis = new Map();
      this.images = new Map();
      this.preparedImages = new WeakSet();
      this.imageBytes = 0;
      this.setBounds(bounds);
      this.style = deps.pointStyle();
      this.style.hardwareMax = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] / 2;
    }

    setBounds(bounds) {
      this.span = Math.max(0.01, Math.hypot(...bounds.max.map((value, axis) => value - bounds.min[axis])));
      this.near = Math.max(0.0001, this.span / 20000);
    }

    upload(id, points, convert, bounds) {
      const gl = this.gl;
      const storage = new ArrayBuffer(points.pointCount * 16);
      const positions = new Float32Array(storage);
      const bytes = new Uint8Array(storage);
      for (let i = 0; i < points.pointCount; i++) {
        convert(points.lngLatAlt, i * 3, positions, i * 4);
        bytes[i * 16 + 12] = points.classifications[i];
        if (bounds) {
          for (let axis = 0; axis < 3; axis++) {
            const value = positions[i * 4 + axis];
            bounds.min[axis] = Math.min(bounds.min[axis], value);
            bounds.max[axis] = Math.max(bounds.max[axis], value);
          }
        }
      }
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, storage, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      return { id, buffer, pointCount: points.pointCount, pickPositions: positions,
        anchorMercator: [0, 0, 0], metersToMercator: 1 };
    }

    updateLive(tiles, convert) {
      const keep = new Set(tiles.map(tile => tile.id));
      for (const [id, tile] of this.live) {
        if (!keep.has(id) || this.analysis.has(id)) {
          this.gl.deleteBuffer(tile.buffer);
          this.live.delete(id);
        }
      }
      for (const tile of tiles) {
        if (!this.live.has(tile.id) && !this.analysis.has(tile.id) && tile.points?.pointCount) {
          const gpu = this.upload(tile.id, tile.points, convert);
          delete gpu.pickPositions;
          this.live.set(tile.id, gpu);
        }
      }
      this.liveIds = keep;
    }

    async *preload(nodes, read, convert, signal, keepPositions) {
      const pending = nodes.filter(node => node.pointCount > 0);
      const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      let done = 0;
      for (const node of pending) {
        signal.throwIfAborted();
        const tile = await read(node.id, signal);
        if (!tile?.points || tile.points.pointCount !== node.pointCount) {
          throw new Error(`Faltan puntos de referencia en ${node.id}`);
        }
        await nextFrame();
        signal.throwIfAborted();
        const gpu = this.upload(node.id, tile.points, convert, bounds);
        if (!keepPositions) delete gpu.pickPositions;
        this.analysis.set(node.id, gpu);
        const redundant = this.live.get(node.id);
        if (redundant) {
          this.gl.deleteBuffer(redundant.buffer);
          this.live.delete(node.id);
        }
        done++;
        if (done % 4 === 0 || done === pending.length) yield { done, total: pending.length };
      }
      if (![...bounds.min, ...bounds.max].every(Number.isFinite)) throw new Error("La nube COPC no contiene posiciones válidas");
      return bounds;
    }

    clearAnalysis() {
      for (const tile of this.analysis.values()) this.gl.deleteBuffer(tile.buffer);
      for (const image of this.images.values()) this.deps.deleteImage(this.gl, image);
      this.analysis.clear();
      this.images.clear();
      this.preparedImages = new WeakSet();
      this.imageBytes = 0;
    }

    visible(nodes, matrix, width, height) {
      return nodes.filter(node => this.deps.projectBounds(node.localCorners, matrix, width, height)?.visible);
    }

    draw(matrix, width, height, buffers, images, pixelRatio, target = null) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.uniformMatrix4fv(this.matrixLocation, false, matrix);
      gl.uniform1f(this.pointRadiusMetersLocation, this.style.radius);
      gl.uniform1f(this.minimumPointRadiusLocation, Math.min(this.style.min * pixelRatio, this.style.hardwareMax));
      gl.uniform1f(this.maximumPointRadiusLocation, Math.min(this.style.max * pixelRatio, this.style.hardwareMax));
      gl.uniform1f(this.projectionPixelsPerMercatorLocation, Math.hypot(matrix[1], matrix[5], matrix[9]) * height / 2);
      gl.uniform1f(this.depthBiasLocation, 0);
      gl.uniform1i(this.edlDepthPassLocation, 0);
      gl.uniform1i(this.edlEnabledLocation, 0);
      gl.uniform1i(this.imageEnabledLocation, 0);
      gl.uniform1i(this.voxelEnabledLocation, 0);
      this.deps.applyPalette(gl, this, this.style);
      gl.enableVertexAttribArray(this.positionLocation);
      gl.enableVertexAttribArray(this.classificationLocation);
      this.deps.drawPasses(this, gl, matrix, pixelRatio, buffers, images);
      gl.disableVertexAttribArray(this.positionLocation);
      gl.disableVertexAttribArray(this.classificationLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    orderedBuffers(nodes) {
      return nodes.slice().sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))
        .map(node => this.analysis.get(node.id)).filter(Boolean);
    }

    drawMain(matrix, width, height, pixelRatio, selection) {
      const buffers = selection ? this.orderedBuffers(this.visible(selection.nodes, matrix, width, height)) :
        [...(this.liveIds || [])].map(id => this.analysis.get(id) ?? this.live.get(id)).filter(Boolean);
      this.draw(matrix, width, height, buffers, selection?.representation === "image" ? this.images : null, pixelRatio);
      return buffers.length;
    }

    async prepareImages(nodes, size, signal) {
      for (const node of nodes) {
        const tile = this.analysis.get(node.id);
        if (!tile || this.images.has(node.id)) continue;
        if (this.imageBytes + size ** 2 * 12 > 64 * 1024 ** 2) {
          throw new scope.PointScapeProbeOctree.Limit("Límite de memoria del impostor de imagen");
        }
        await nextFrame();
        signal.throwIfAborted();
        const target = center(node.localBounds);
        const radius = Math.max(0.1, Math.hypot(...node.localBounds.max.map((value, axis) => value - target[axis])));
        const offset = [1.35, -1.85, 1.3].map(value => value * radius);
        const eye = target.map((value, axis) => value + offset[axis]);
        const bake = viewProjection(eye, offset.map(value => -value), [0, 0, 1], radius / 1000, radius * 8);
        const textures = this.deps.captureImage(tile, bake, 1, this.style.color, size);
        if (!textures?.texels.length) throw new Error(`No se pudo generar el impostor de ${node.id}`);
        this.images.set(node.id, this.deps.uploadImage(this.gl, textures));
        delete tile.pickPositions;
        this.imageBytes += size ** 2 * 8 + textures.texels.byteLength;
      }
    }

    async capture(position, face, selection, size, impostorSize, signal) {
      const gl = this.gl;
      const { direction, up } = faces[face];
      const matrix = viewProjection(position, direction, up, this.near, this.span * 4);
      const drawNodes = this.visible(selection.nodes, matrix, size, size);
      if (selection.representation === "image" && !this.preparedImages.has(selection)) {
        await this.prepareImages(selection.nodes, impostorSize, signal);
        this.preparedImages.add(selection);
      }
      await nextFrame();
      signal.throwIfAborted();
      if (this.target?.width !== size) {
        this.deps.deleteTarget(gl, this.target);
        this.target = this.deps.createTarget(gl, size, size);
        if (!this.target) throw new Error("No se pudo crear el framebuffer del cubemap");
      }
      const buffers = this.orderedBuffers(drawNodes);
      this.draw(matrix, size, size, buffers, selection.representation === "image" ? this.images : null, 1, this.target);
      const pixels = new Uint8Array(size ** 2 * 4);
      const pack = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pack);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, pixels.byteLength, gl.STREAM_READ);
      gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      try {
        if (!fence) throw new Error("No se pudo iniciar la lectura del cubemap");
        const deadline = performance.now() + 2000;
        for (;;) {
          await nextFrame();
          signal.throwIfAborted();
          const result = gl.clientWaitSync(fence, 0, 0);
          if (result === gl.WAIT_FAILED) throw new Error("Falló la lectura del cubemap");
          if (result !== gl.TIMEOUT_EXPIRED) break;
          if (performance.now() >= deadline) {
            throw new scope.PointScapeProbeOctree.Limit("La GPU no terminó de leer una cara del cubemap");
          }
        }
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pack);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      } finally {
        if (fence) gl.deleteSync(fence);
        gl.deleteBuffer(pack);
      }
      return pixels;
    }

    dispose() {
      this.clearAnalysis();
      for (const tile of this.live.values()) this.gl.deleteBuffer(tile.buffer);
      this.live.clear();
      this.deps.deleteTarget(this.gl, this.target);
      this.gl.deleteProgram(this.program);
    }
  }

  function localDataset(records, bounds) {
    const scale = Math.cos(Math.atan(Math.sinh((bounds.minY + bounds.maxY) / (2 * 6378137))));
    const x0 = (bounds.minX + bounds.maxX) / 2;
    const y0 = (bounds.minY + bounds.maxY) / 2;
    const z0 = (bounds.minZ + bounds.maxZ) / 2;
    const radians = Math.PI / 180;
    const convert = (source, start, dest, offset) => {
      const lat = Math.max(-85.05112878, Math.min(85.05112878, source[start + 1]));
      dest[offset] = (6378137 * radians * source[start] - x0) * scale;
      dest[offset + 1] = (6378137 * Math.asinh(Math.tan(lat * radians)) - y0) * scale;
      dest[offset + 2] = source[start + 2] - z0;
    };
    const local = ({ minX, minY, minZ, maxX, maxY, maxZ }) => ({
      min: [(minX - x0) * scale, (minY - y0) * scale, minZ - z0],
      max: [(maxX - x0) * scale, (maxY - y0) * scale, maxZ - z0],
    });
    const cache = new WeakMap();
    const localRecords = list => list.map(record => {
      if (!cache.has(record)) {
        const localBounds = local(record.bounds);
        cache.set(record, { ...record, localBounds, localCorners: corners(localBounds).map(([x, y, z]) => ({ x, y, z })) });
      }
      return cache.get(record);
    });
    return { convert, localRecords, bounds: local(bounds), records: () => localRecords(records()) };
  }

  scope.PointScapeProbeRenderer = { Renderer, localDataset, nextFrame };
})(globalThis);
