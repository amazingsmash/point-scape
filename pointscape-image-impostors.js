(function initImageImpostors(scope) {
  const defaultTextureSize = 1024;
  const maxResident = 8;
  const padding = 2;

  function transform(matrix, x, y, z, w = 1) {
    return [0, 1, 2, 3].map(row =>
      matrix[row] * x + matrix[row + 4] * y + matrix[row + 8] * z + matrix[row + 12] * w);
  }

  function invert(matrix) {
    const rows = Array.from({ length: 4 }, (_, row) => [
      ...[0, 1, 2, 3].map(column => matrix[column * 4 + row]),
      ...[0, 1, 2, 3].map(column => Number(row === column)),
    ]);
    for (let column = 0; column < 4; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < 4; row += 1) {
        if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
      }
      [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
      const current = rows[column];
      const divisor = current[column];
      if (!Number.isFinite(divisor) || divisor === 0) return null;
      for (let i = 0; i < 8; i += 1) current[i] /= divisor;
      for (let row = 0; row < 4; row += 1) {
        if (row === column) continue;
        const factor = rows[row][column];
        for (let i = 0; i < 8; i += 1) rows[row][i] -= factor * current[i];
      }
    }
    return [0, 1, 2, 3].flatMap(column => rows.map(row => row[column + 4]));
  }

  function cameraPosition(matrix) {
    const inverse = invert(matrix);
    if (!inverse) return null;
    // The perspective eye projects to clip X=Y=W=0.
    const w = inverse[11];
    const eye = inverse.slice(8, 11).map(value => value / w);
    return eye.every(Number.isFinite) ? eye : null;
  }

  function distanceMeters(a, b, metersToMercator) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / metersToMercator;
  }

  function canReuse(capturedEye, eye, metersToMercator, captureDistance, percent) {
    return distanceMeters(capturedEye, eye, metersToMercator) <= captureDistance * percent / 100 + 1e-6;
  }

  function capture(tile, matrix, aspect, colorForClass, size = defaultTextureSize) {
    const { pointCount, pickPositions: positions, anchorMercator: anchor } = tile;
    const localMatrix = Array.from(matrix);
    localMatrix.splice(12, 4, ...transform(matrix, ...anchor));
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    const projected = new Float64Array(pointCount * 3);
    let frontCount = 0;
    for (let i = 0; i < pointCount; i += 1) {
      const offset = i * 4;
      const x = positions[offset], y = positions[offset + 1], z = positions[offset + 2];
      const w = localMatrix[3] * x + localMatrix[7] * y + localMatrix[11] * z + localMatrix[15];
      if (w <= 0) {
        projected[i * 3 + 2] = NaN;
        continue;
      }
      frontCount += 1;
      for (let axis = 0; axis < 3; axis += 1) {
        const value = (localMatrix[axis] * x + localMatrix[axis + 4] * y +
          localMatrix[axis + 8] * z + localMatrix[axis + 12]) / w;
        projected[i * 3 + axis] = value;
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }
    if (!frontCount || !min.every(Number.isFinite) || !max.every(Number.isFinite)) return null;

    // Crop the perspective frustum to the whole projected node, even if part
    // of it is outside the viewport. Retain the viewport's pixel aspect ratio.
    const span = Math.max((max[0] - min[0]) * aspect, max[1] - min[1], 1e-8) * size / (size - 2 * padding);
    const center = min.map((value, axis) => (value + max[axis]) / 2);
    const scale = [2 * aspect / span, 2 / span, 2 / Math.max((max[2] - min[2]) * 1.01, 1e-8)];
    const cameraMatrix = localMatrix.map((value, index) => {
      const row = index % 4;
      return row === 3 ? value : scale[row] * (value - center[row] * localMatrix[index - row + 3]);
    });
    const inverseCameraMatrix = invert(cameraMatrix);
    if (!inverseCameraMatrix) return null;

    const color = new Uint8ClampedArray(size * size * 4);
    const depth = new Float32Array(size * size).fill(Infinity);
    const texels = new Float32Array(frontCount);
    const classifications = new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength);
    const palette = new Map();
    let count = 0;
    for (let i = 0; i < pointCount; i += 1) {
      const x = (projected[i * 3] - center[0]) * scale[0];
      const y = (projected[i * 3 + 1] - center[1]) * scale[1];
      const z = Math.fround((projected[i * 3 + 2] - center[2]) * scale[2]);
      if (!Number.isFinite(z)) continue;
      const column = Math.floor((x + 1) * size / 2);
      const row = Math.floor((1 - y) * size / 2);
      const pixel = row * size + column;
      if (z >= depth[pixel]) continue;
      if (depth[pixel] === Infinity) texels[count++] = pixel;
      depth[pixel] = z;
      const classification = classifications[i * 16 + 12];
      if (!palette.has(classification)) palette.set(classification, colorForClass(classification).map(value => value * 255));
      color.set(palette.get(classification), pixel * 4);
    }
    return { width: size, height: size, color, depth, texels: texels.subarray(0, count),
      cameraMatrix, inverseCameraMatrix, viewProjection: Array.from(matrix), aspect };
  }

  class Cache {
    constructor(create, destroy, disk, repaint) {
      this.create = create;
      this.destroy = destroy;
      this.entries = new Map();
      this.active = new Map();
      this.captures = 0;
      this.diskHits = 0;
      this.disk = disk;
      this.repaint = repaint;
    }

    update(tiles, camera, { size, maxAreaRatio, projectedArea, reusePercent, moving, palette }, bake) {
      this.active.clear();
      if (!camera) return false;
      const maxArea = size ** 2 * maxAreaRatio;
      const candidates = tiles.filter(tile => {
        if (tile.voxelSizeMeters || !tile.pointCount) return false;
        const area = projectedArea(tile);
        return area > 0 && area <= maxArea;
      }).sort((a, b) => b.pointCount - a.pointCount || a.id.localeCompare(b.id)).slice(0, maxResident);
      const wanted = new Map(candidates.map(tile => [tile.id, tile]));
      for (const [id, entry] of this.entries) {
        if (wanted.get(id) === entry.tile && entry.size === size &&
            canReuse(entry.camera, camera, entry.tile.metersToMercator, entry.captureDistance, reusePercent)) {
          if (entry.gpu) this.active.set(id, entry.gpu);
        } else {
          if (entry.gpu) this.destroy(entry.gpu);
          this.entries.delete(id);
        }
      }
      if (moving) return false;
      const pending = candidates.filter(tile => !this.entries.has(tile.id));
      if (this.lookup && (this.lookup.size !== size || !pending.includes(this.lookup.tile))) this.cancelLookup();
      if (!pending.length || (this.lookup && !this.lookup.done)) return false;
      // One upload per frame. Keep drawing the source until its capture exists.
      const tile = this.lookup?.tile || pending[0];
      let restored = this.lookup?.result;
      if (this.disk?.supported && !this.lookup) {
        this.readFromDisk(tile, size, palette, camera, reusePercent);
        return false;
      }
      this.lookup = null;
      if (restored && !canReuse(restored.metadata.cameraPositionMercator, camera, tile.metersToMercator,
          restored.metadata.captureDistanceMeters, reusePercent)) restored = null;
      const textures = restored?.textures || bake(tile);
      const gpu = textures?.texels.length ? this.create(textures) : null;
      const captureDistance = restored?.metadata.captureDistanceMeters ?? distanceMeters(camera, tile.anchorMercator, tile.metersToMercator);
      const captureEye = restored?.metadata.cameraPositionMercator ?? camera;
      this.entries.set(tile.id, { tile, camera: captureEye, size, captureDistance, gpu });
      if (gpu) {
        if (restored) this.diskHits += 1;
        else {
          this.captures += 1;
          if (this.disk?.supported) this.disk.save(tile, palette, textures, captureEye, captureDistance);
        }
        this.active.set(tile.id, gpu);
      }
      return pending.length > 1;
    }

    readFromDisk(tile, size, palette, camera, reusePercent) {
      const controller = new AbortController();
      const lookup = { tile, size, controller, done: false };
      this.lookup = lookup;
      this.disk.read(tile, size, palette, camera, reusePercent, controller.signal)
        .catch(() => null).then(result => {
          if (this.lookup !== lookup) return;
          lookup.result = result;
          lookup.done = true;
          this.repaint();
        });
    }

    cancelLookup() {
      this.lookup?.controller.abort();
      this.lookup = null;
    }

    clear() {
      this.cancelLookup();
      for (const { gpu } of this.entries.values()) if (gpu) this.destroy(gpu);
      this.entries.clear();
      this.active.clear();
      this.captures = 0;
      this.diskHits = 0;
    }
  }

  class NodeTimings {
    constructor(gl, extension) {
      this.gl = gl;
      this.extension = extension;
      this.pending = [];
      this.clear();
    }

    prepareFrame(tiles, images) {
      this.collect();
      this.frame = new Map();
      this.needsFrame = false;
      if (!images?.size) this.wasImage = new WeakSet();
      if (this.unavailable || !images?.size ||
          this.gl.getQuery(this.extension.TIME_ELAPSED_EXT, this.gl.CURRENT_QUERY)) return;
      const visibleImages = new Set(images.values());
      for (const image of this.requested) if (!visibleImages.has(image)) this.requested.delete(image);
      const canMeasure = this.pending.length < 2;
      for (const tile of tiles) {
        const image = images.get(tile.id);
        if (!image) {
          this.wasImage.delete(tile);
          continue;
        }
        if (!this.wasImage.has(tile) && this.pointTransitions.get(tile) !== image) {
          // Time the last real points frame before this node switches to its image.
          images.delete(tile.id);
          this.needsFrame = true;
          if (canMeasure) {
            this.pointTransitions.set(tile, image);
            this.frame.set(tile, { tile, queries: [] });
          }
          continue;
        }
        this.wasImage.add(tile);
        const pendingImage = this.pending.some(batch => batch.samples.some(sample => sample.image === image));
        if (canMeasure && (this.requested.has(image) || !this.images.has(image)) && !pendingImage) {
          this.frame.set(tile, { image, queries: [] });
          this.requested.delete(image);
        }
      }
    }

    requestRefresh(images) {
      for (const image of images.values()) this.requested.add(image);
    }

    beginDraw(tile) {
      const sample = this.frame?.get(tile);
      if (!sample || this.unavailable) return false;
      const query = this.gl.createQuery();
      if (!query) {
        this.unavailable = true;
        return false;
      }
      sample.queries.push(query);
      this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
      return true;
    }

    endDraw() {
      this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    }

    finishFrame() {
      const samples = [...this.frame.values()].filter(sample => sample.queries.length);
      this.frame = null;
      if (this.unavailable) {
        samples.forEach(sample => sample.queries.forEach(query => this.gl.deleteQuery(query)));
        return false;
      }
      if (samples.length) {
        this.pending.push({ samples, started: performance.now() });
        this.gl.flush();
      }
      return this.needsFrame || this.pending.length > 0;
    }

    collect() {
      if (!this.pending.length) return;
      const gl = this.gl;
      const disjoint = gl.getParameter(this.extension.GPU_DISJOINT_EXT);
      this.disjointFrames = disjoint ? this.disjointFrames + 1 : 0;
      if (this.disjointFrames >= 3) this.unavailable = true;
      while (this.pending.length) {
        const { samples, started } = this.pending[0];
        const ready = samples.every(sample =>
          sample.queries.every(query => gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)));
        const expired = !ready && performance.now() - started > 2000;
        if (expired) this.unavailable = true;
        if (!disjoint && !expired && !ready) return;
        this.pending.shift();
        for (const sample of samples) {
          if (!disjoint && !expired && !this.unavailable) {
            const ms = sample.queries.reduce((sum, query) => sum + gl.getQueryParameter(query, gl.QUERY_RESULT), 0) / 1e6;
            if (Number.isFinite(ms) && ms >= 0) {
              if (sample.image) this.images.set(sample.image, ms);
              else this.points.set(sample.tile, ms);
            }
          }
          sample.queries.forEach(query => gl.deleteQuery(query));
        }
      }
    }

    clear() {
      for (const { samples } of this.pending) {
        for (const sample of samples) sample.queries.forEach(query => this.gl.deleteQuery(query));
      }
      this.pending.length = 0;
      this.frame = null;
      this.points = new WeakMap();
      this.images = new WeakMap();
      this.pointTransitions = new WeakMap();
      this.wasImage = new WeakSet();
      this.requested = new Set();
      this.unavailable = false;
      this.disjointFrames = 0;
    }
  }

  const api = { defaultTextureSize, transform, cameraPosition, capture, canReuse, Cache, NodeTimings };
  scope.PointScapeImageImpostors = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
