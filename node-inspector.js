(function (scope) {
  function pointAt(points, index) {
    if (points?.lngLatAlt) return {
      lng: points.lngLatAlt[index * 3], lat: points.lngLatAlt[index * 3 + 1],
      altitudeMeters: points.lngLatAlt[index * 3 + 2],
    };
    return points?.[index] || null;
  }

  // Uses the exact anchor-relative vertices uploaded to the map's GPU buffer.
  // Pick the frontmost sprite under the pointer, or the closest within tolerance.
  function pickPoint(buffers, matrix, x, y, width, height, pointSize = 3, _pixelRatio = 1) {
    if (!matrix || !width || !height) return null;
    // pointSize is expressed in CSS pixels. With perspective sizing the caller
    // supplies the maximum diameter so every rendered sprite remains pickable.
    const radius = Math.max(6, pointSize / 2);
    const spriteRadius = Math.max(1, pointSize / 2);
    let best = null;
    for (const tile of buffers || []) {
      const data = tile.pickPositions;
      if (!data) continue;
      const a = tile.anchorMercator;
      const anchor = [0, 1, 2, 3].map((row) => matrix[row] * a[0] + matrix[row + 4] * a[1] + matrix[row + 8] * a[2] + matrix[row + 12]);
      for (let index = 0; index < tile.pointCount; index += 1) {
        const offset = index * 4;
        const px = data[offset], py = data[offset + 1], pz = data[offset + 2];
        const w = anchor[3] + matrix[3] * px + matrix[7] * py + matrix[11] * pz;
        if (w <= 0) continue;
        const z = (anchor[2] + matrix[2] * px + matrix[6] * py + matrix[10] * pz) / w;
        if (z < -1 || z > 1) continue;
        const sx = ((anchor[0] + matrix[0] * px + matrix[4] * py + matrix[8] * pz) / w + 1) * width / 2;
        const sy = (1 - (anchor[1] + matrix[1] * px + matrix[5] * py + matrix[9] * pz) / w) * height / 2;
        const distance = Math.hypot(sx - x, sy - y);
        if (distance > radius) continue;
        const inside = distance <= spriteRadius;
        if (!best || (inside && !best.inside) || (inside === best.inside &&
            (inside ? z < best.z || (z === best.z && distance < best.distance) : distance < best.distance))) {
          best = { id: tile.id, renderKey: tile.renderKey, index, distance, inside, z };
        }
      }
    }
    return best;
  }

  function createGeometry(record, points, project) {
    const count = points?.pointCount ?? points?.length ?? 0;
    if (!count) throw new Error("Este nodo no contiene puntos en la representación seleccionada.");
    const bounds = record.bounds;
    const minZ = bounds.minZ ?? record.minZ, maxZ = bounds.maxZ ?? record.maxZ;
    const center = [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, (minZ + maxZ) / 2];
    const horizontalScale = ["geographic", "web-mercator"].includes(record.crsKind)
      ? Math.cos(pointAt(points, 0).lat * Math.PI / 180) : 1;
    const toLocal = (point) => {
      const metric = project(point.lng, point.lat, record);
      return [(metric.x - center[0]) * horizontalScale,
        (metric.y - center[1]) * horizontalScale, point.altitudeMeters - center[2]];
    };
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) positions.set(toLocal(pointAt(points, index)), index * 3);
    const dimensions = [(bounds.maxX - bounds.minX) * horizontalScale,
      (bounds.maxY - bounds.minY) * horizontalScale, maxZ - minZ];
    const corners = Array.from({ length: 8 }, (_, index) => dimensions.map((d, axis) => (index & (1 << axis) ? 1 : -1) * d / 2));
    const lines = [];
    for (let index = 0; index < 8; index += 1) for (let axis = 0; axis < 3; axis += 1) {
      if (!(index & (1 << axis))) lines.push(...corners[index], ...corners[index | (1 << axis)]);
    }
    const grid = [];
    // Equal spatial cells, anchored to the whole node, never to point extrema.
    for (let axis = 0; axis < 3; axis += 1) {
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      for (let i = 0; i <= 4; i += 1) for (let j = 0; j <= 4; j += 1) {
        const start = [0, 0, 0], end = [0, 0, 0];
        start[axis] = -dimensions[axis] / 2; end[axis] = dimensions[axis] / 2;
        start[u] = end[u] = dimensions[u] * (i / 4 - 0.5);
        start[v] = end[v] = dimensions[v] * (j / 4 - 0.5);
        grid.push(...start, ...end);
      }
    }
    return { positions, lines: new Float32Array(lines), grid: new Float32Array(grid), dimensions, toLocal,
      radius: Math.max(1, Math.hypot(...dimensions) / 2), count };
  }

  class Controller {
    constructor(options) {
      Object.assign(this, options);
      this.generation = 0;
      this.menu = document.createElement("div");
      this.menu.className = "node-inspector-menu";
      this.menu.hidden = true;
      this.menu.innerHTML = '<span></span><button type="button">Inspeccionar nodo en 3D</button>';
      document.body.appendChild(this.menu);
      this.menu.querySelector("button").onclick = () => this.open();
      const canvas = this.map.getCanvas();
      canvas.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.select(event.clientX, event.clientY);
      });
      // A left click/tap also supports the initial requested gesture and iPad.
      this.map.on("click", (event) => {
        if (event.originalEvent?.button > 0) return;
        const rect = canvas.getBoundingClientRect();
        this.select(rect.left + event.point.x, rect.top + event.point.y);
      });
      this.map.on("movestart", () => { this.menu.hidden = true; });
      document.addEventListener("pointerdown", (event) => {
        if (!this.menu.contains(event.target)) this.menu.hidden = true;
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") this.menu.hidden = true;
      });
    }
    select(clientX, clientY) {
      const layer = this.getLayer(), canvas = this.map.getCanvas();
      const rect = canvas.getBoundingClientRect();
      const hit = pickPoint(layer?.tileBuffers, layer?.pickMatrix, clientX - rect.left, clientY - rect.top,
        rect.width, rect.height, this.getPointSize(), canvas.width / rect.width);
      this.menu.hidden = true;
      if (!hit) return;
      const tile = layer.tiles.find((tile) => tile.id === hit.id);
      const point = pointAt(tile?.points, hit.index);
      if (!point || !this.getMetadata(hit.id)) return;
      this.selection = { ...hit, point, source: hit.renderKey.includes(":full:") ? "full" : "sample" };
      this.menu.querySelector("span").textContent = `Nodo ${hit.id}`;
      this.menu.hidden = false;
      this.menu.style.left = `${Math.max(8, Math.min(clientX, innerWidth - this.menu.offsetWidth - 8))}px`;
      this.menu.style.top = `${Math.max(8, Math.min(clientY, innerHeight - this.menu.offsetHeight - 8))}px`;
      this.menu.querySelector("button").focus({ preventScroll: true });
    }
    async open() {
      if (!this.selection) return;
      this.close();
      const generation = ++this.generation;
      const selection = { ...this.selection };
      this.menu.hidden = true;
      const dialog = document.createElement("dialog");
      this.dialog = dialog;
      dialog.className = "node-inspector-dialog";
      dialog.setAttribute("aria-labelledby", "node-inspector-title");
      dialog.innerHTML = `
        <header><div><h2 id="node-inspector-title">Inspector de nodo 3D</h2><p class="node-inspector-info" role="status">Cargando nodo…</p></div><button type="button" data-action="close">Cerrar</button></header>
        <div class="node-inspector-tools">
          <label>Datos <select aria-label="Puntos del nodo" disabled><option value="sample">Muestra del nodo</option><option value="full">Todos los puntos de la hoja</option></select></label>
          <label>Tamaño <input aria-label="Tamaño de puntos del inspector" type="range" min="1" max="5" step="0.5" value="2"></label>
          <label><input type="checkbox" data-action="grid">Retícula 4 × 4 × 4</label>
          <button type="button" data-action="reset">Encajar</button><button type="button" data-action="top">Planta</button><button type="button" data-action="front">Frontal</button>
        </div>
        <div class="node-inspector-stage"><canvas tabindex="0" aria-label="Vista 3D del nodo. Arrastra para girar; rueda o pellizco para acercar. Flechas para girar, más y menos para zoom."></canvas></div>
        <p class="node-inspector-help">Arrastra para girar · rueda o pellizco para zoom · flechas para girar · +/− para zoom<br>Proyección ortográfica · caja del nodo en gris · punto seleccionado en amarillo · XYZ a la misma escala, sin exageración del terreno</p>`;
      document.body.appendChild(dialog);
      dialog.addEventListener("cancel", (event) => { event.preventDefault(); this.close(); });
      dialog.querySelector('[data-action="close"]').onclick = () => this.close();
      dialog.showModal();
      try {
        const record = await this.getRecord(selection.id);
        if (generation !== this.generation) return;
        if (!record) throw new Error("El nodo ya no está disponible. Selecciona un punto de la nube actual.");
        this.record = record;
        const select = dialog.querySelector("select");
        select.options[1].disabled = !record.fullPoints?.pointCount || !!record.childIds?.length;
        select.options[0].disabled = !record.points?.pointCount;
        select.value = selection.source === "full" && !select.options[1].disabled ? "full" : "sample";
        if (select.options[0].disabled) select.value = "full";
        select.disabled = false;
        this.view = new NodeView(dialog.querySelector("canvas"), () => this.showError(new Error("Se ha perdido el contexto 3D. Cierra el inspector y vuelve a abrir el nodo.")));
        const display = () => {
          const points = select.value === "full" ? record.fullPoints : record.points;
          const geometry = createGeometry(record, points, this.project);
          this.view.setGeometry(geometry, geometry.toLocal(selection.point));
          const label = select.value === "full" ? "Puntos completos de la hoja" : "Muestra del nodo (sin sumar descendientes)";
          dialog.querySelector(".node-inspector-info").textContent = `${record.fileName} · Nodo ${record.id} · profundidad ${record.depth} · ${label}: ${geometry.count.toLocaleString("es-ES")} · Caja XYZ: ${geometry.dimensions.map((d) => d.toFixed(1)).join(" × ")} m`;
        };
        select.onchange = () => { try { display(); } catch (error) { this.showError(error); } };
        dialog.querySelector('input[type="range"]').oninput = (event) => { this.view.pointSize = Number(event.target.value); this.view.draw(); };
        dialog.querySelector('[data-action="grid"]').onchange = (event) => { this.view.showGrid = event.target.checked; this.view.draw(); };
        for (const action of ["reset", "top", "front"]) dialog.querySelector(`[data-action="${action}"]`).onclick = () => this.view.reset(action);
        display();
      } catch (error) { if (generation === this.generation) this.showError(error); }
    }
    showError(error) {
      this.dialog.querySelector(".node-inspector-info").textContent = error.message;
      console.error("Node inspector", error);
    }
    close() {
      this.generation += 1;
      this.view?.dispose(); this.view = null; this.record = null;
      if (this.dialog) {
        this.dialog.close(); this.dialog.remove(); this.dialog = null;
        this.map.getCanvas().focus({ preventScroll: true });
      }
    }
    reset() { this.close(); this.selection = null; this.menu.hidden = true; }
  }

  class NodeView {
    constructor(canvas, onContextLost = () => {}) {
      this.canvas = canvas;
      this.gl = canvas.getContext("webgl", { alpha: false, antialias: true });
      if (!this.gl) throw new Error("No se pudo abrir la vista WebGL del nodo.");
      const gl = this.gl;
      const shaders = [];
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source); gl.compileShader(shader); shaders.push(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        return shader;
      };
      this.program = gl.createProgram();
      gl.attachShader(this.program, compile(gl.VERTEX_SHADER, `
        attribute vec3 a_position;
        uniform vec2 u_angles;
        uniform vec3 u_scale;
        uniform float u_size;
        void main() {
          float c = cos(u_angles.x), s = sin(u_angles.x);
          vec3 p = vec3(c*a_position.x-s*a_position.y, s*a_position.x+c*a_position.y, a_position.z);
          c = cos(u_angles.y); s = sin(u_angles.y);
          p = vec3(p.x, c*p.y-s*p.z, s*p.y+c*p.z);
          gl_Position = vec4(p*u_scale, 1.0);
          gl_PointSize = u_size;
        }`));
      gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, `
        precision mediump float;
        uniform vec4 u_color;
        uniform bool u_round;
        void main() {
          if (u_round && distance(gl_PointCoord, vec2(0.5)) > 0.5) discard;
          gl_FragColor = u_color;
        }`));
      gl.linkProgram(this.program);
      for (const shader of shaders) gl.deleteShader(shader);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      this.position = gl.getAttribLocation(this.program, "a_position");
      this.uniforms = Object.fromEntries(["angles", "scale", "size", "color", "round"].map((name) => [name, gl.getUniformLocation(this.program, `u_${name}`)]));
      this.buffers = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];
      this.pointSize = 2;
      this.pointers = new Map();
      canvas.addEventListener("pointerdown", (event) => {
        canvas.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, [event.clientX, event.clientY]);
      });
      canvas.addEventListener("pointermove", (event) => {
        const previous = this.pointers.get(event.pointerId);
        if (!previous) return;
        if (this.pointers.size === 1) {
          this.yaw += (event.clientX - previous[0]) * 0.008;
          this.pitch += (event.clientY - previous[1]) * 0.008;
        } else {
          const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)[1];
          const before = Math.hypot(previous[0] - other[0], previous[1] - other[1]);
          const after = Math.hypot(event.clientX - other[0], event.clientY - other[1]);
          if (before > 0) this.zoom = Math.min(30, Math.max(0.2, this.zoom * after / before));
        }
        this.pointers.set(event.pointerId, [event.clientX, event.clientY]); this.draw();
      });
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(event, (e) => this.pointers.delete(e.pointerId));
      canvas.addEventListener("wheel", (event) => {
        event.preventDefault(); this.zoom = Math.min(30, Math.max(0.2, this.zoom * Math.exp(-event.deltaY * 0.001))); this.draw();
      }, { passive: false });
      canvas.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-"].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "ArrowLeft") this.yaw -= 0.1;
        if (event.key === "ArrowRight") this.yaw += 0.1;
        if (event.key === "ArrowUp") this.pitch -= 0.1;
        if (event.key === "ArrowDown") this.pitch += 0.1;
        if (["+", "="].includes(event.key)) this.zoom = Math.min(30, this.zoom * 1.1);
        if (event.key === "-") this.zoom = Math.max(0.2, this.zoom / 1.1);
        this.draw();
      });
      canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        if (!this.disposed) onContextLost();
      });
      this.resize = new ResizeObserver(() => this.draw()); this.resize.observe(canvas);
      this.reset();
    }
    setGeometry(geometry, selectedPoint) {
      this.radius = geometry.radius;
      this.counts = [geometry.count, geometry.lines.length / 3, geometry.grid.length / 3, 1];
      for (const [index, data] of [geometry.positions, geometry.lines, geometry.grid, new Float32Array(selectedPoint)].entries()) {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers[index]);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
      }
      this.reset();
    }
    reset(view = "reset") {
      this.yaw = view === "reset" ? -0.5 : 0;
      this.pitch = view === "top" ? 0 : view === "front" ? -Math.PI / 2 : -0.9;
      this.zoom = 0.85; this.draw();
    }
    draw() {
      if (!this.counts || this.disposed || this.gl.isContextLost()) return;
      const gl = this.gl, canvas = this.canvas;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.useProgram(this.program);
      gl.uniform2f(this.uniforms.angles, this.yaw, this.pitch);
      const scale = this.zoom / this.radius;
      gl.uniform3f(this.uniforms.scale, scale * Math.min(1, height / width), scale * Math.min(1, width / height), -1 / (this.radius * 4));
      gl.enableVertexAttribArray(this.position);
      for (let index = 0; index < 4; index += 1) {
        if (index === 2 && !this.showGrid) continue;
        const isPoint = index === 0 || index === 3;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[index]);
        gl.vertexAttribPointer(this.position, 3, gl.FLOAT, false, 0, 0);
        gl.uniform1f(this.uniforms.size, (index === 3 ? 8 : this.pointSize) * ratio);
        gl.uniform1i(this.uniforms.round, isPoint);
        gl.uniform4fv(this.uniforms.color, index === 0 ? [0.86, 0.94, 1, 1] : index === 1 ? [0.35, 0.4, 0.45, 1] : index === 2 ? [0.16, 0.20, 0.25, 1] : [1, 0.8, 0.1, 1]);
        if (index === 3) gl.disable(gl.DEPTH_TEST);
        gl.drawArrays(isPoint ? gl.POINTS : gl.LINES, 0, this.counts[index]);
      }
    }
    dispose() {
      this.disposed = true;
      this.resize.disconnect();
      for (const buffer of this.buffers) this.gl.deleteBuffer(buffer);
      this.gl.deleteProgram(this.program);
      this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  }
  const api = { Controller, pickPoint, createGeometry };
  scope.PointScapeNodeInspector = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
