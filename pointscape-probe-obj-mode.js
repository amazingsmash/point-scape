(function (scope) {
  const { faces, corners, boxEdges, frustumCorners, selectAtProbe, viewProjection } = scope.PointScapeProbeOctree;
  const { Renderer, localDataset } = scope.PointScapeProbeRenderer;
  const { CopcTileSource, CopcDecodePool } = scope.PointScapeDataIngestion;
  const { paint, coordinates, screen, segment } = scope.PointScapeProbeView;
  const fov = Math.PI / 4;
  const originalId = "original";
  const number = new Intl.NumberFormat("es-ES");
  const scoreLabel = score => score == null ? "Sin puntos" : score.toFixed(4);
  const cubeRays = Array.from({ length: 8 }, (_, corner) => [corner, 8]);
  const faceEdges = [[0, 1], [0, 2], [1, 3], [2, 3], [0, 4], [1, 4], [2, 4], [3, 4]];

  class ObjMode {
    constructor(element, deps) {
      this.element = element;
      this.deps = deps;
      this.get = id => element.querySelector(`#obj-probe-${id}`);
      this.canvas = element.querySelector(".probe-cloud");
      this.overlay = element.querySelector(".probe-overlay");
      this.expanded = this.get("expanded");
      this.positionInputs = ["x", "y", "z"].map(axis => this.get(axis));
      this.previews = faces.map(({ name }, index) => {
        const button = document.createElement("button");
        const preview = document.createElement("canvas");
        const label = document.createElement("span");
        button.className = "probe-face";
        button.type = "button";
        button.setAttribute("aria-label", `Cara ${name}`);
        button.title = `Cara ${name} · doble clic para ampliar`;
        label.textContent = name;
        button.append(preview, label);
        button.onclick = () => this.selectFace(index);
        button.ondblclick = () => this.openComparison(index);
        this.get("faces").append(button);
        return { button, preview };
      });
      this.get("close").onclick = () => this.close();
      element.addEventListener("cancel", event => {
        if (event.target !== element) return;
        event.preventDefault();
        this.close();
      });
      this.get("expanded-close").onclick = () => this.expanded.close();
      this.get("enlarge").onclick = () => this.openComparison();
      for (const id of ["reference-image", "selection-image"]) {
        this.get(id).ondblclick = () => this.openComparison();
      }
      this.get("file").onchange = event => {
        const file = event.target.files[0];
        if (file) (/\.obj$/i.test(file.name) ? this.load(file) : this.loadCopc(file));
      };
      this.get("paris").onclick = () => this.loadCopc(this.deps.paris);
      this.get("settings").oninput = () => this.resetResult();
      this.get("position").oninput = () => this.readPosition();
      this.get("home").onclick = () => this.frame();
      this.get("generate").onclick = () => this.generate();
      this.get("stop").onclick = () => this.run?.abort();
      for (const id of ["original", "boxes", "frustum", "nodes"]) this.get(id).onchange = () => this.requestDraw();
      this.resize = new ResizeObserver(() => this.requestDraw());
      this.resize.observe(this.canvas);
      this.bindPointer();
      this.selectFace(0);
    }

    open() {
      this.get("file").value = "";
      this.get("status").textContent = "Carga una nube OBJ o COPC para colocar el probe.";
      this.updateControls();
      this.element.showModal();
    }

    close() {
      this.release();
      this.element.close();
    }

    release() {
      this.loader?.terminate();
      this.loader = null;
      this.copc?.controller.abort();
      this.copc?.client.close();
      this.copc?.pool.close();
      this.copc = null;
      this.run?.abort();
      this.run = null;
      this.resetResult();
      if (this.lines) {
        const gl = this.renderer.gl;
        gl.deleteBuffer(this.lines.indices);
        gl.deleteProgram(this.lines.program);
      }
      this.renderer?.dispose();
      this.model = this.renderer = this.lines = this.drag = this.marker = this.previewNodes = null;
      this.updateControls();
    }

    load(file) {
      this.release();
      this.get("status").textContent = `Leyendo ${file.name}…`;
      const worker = this.loader = new Worker("./pointscape-probe-obj.js");
      const finish = model => {
        if (this.loader !== worker) return;
        worker.terminate();
        this.loader = null;
        try {
          if (model.error) throw new Error(model.error);
          this.loadModel(model, file.name);
        } catch (error) {
          this.release();
          this.get("status").textContent = error.message;
        }
        this.updateControls();
      };
      worker.onmessage = ({ data }) => finish(data);
      worker.onerror = () => finish({ error: "No se pudo leer el archivo OBJ" });
      worker.postMessage(file);
      this.updateControls();
    }

    loadModel(model, name) {
      this.model = model;
      this.renderer = new Renderer(this.canvas, this.deps, model.bounds);
      this.renderer.setBounds(model.root.localBounds);
      this.original = { id: originalId, depth: 0, pointCount: model.positions.length / 3, localBounds: model.root.localBounds };
      this.upload(this.original);
      this.previewNodes = [this.original];
      if (model.edges.length) this.loadLines();
      this.probe = [0.65, -0.65, 0.32];
      this.get("position").querySelector("legend").textContent = "Posición del probe en el OBJ";
      this.writePosition();
      this.selectFace(0);
      this.frame();
      this.get("status").textContent = `${name} · ${number.format(this.original.pointCount)} vértices`;
    }

    async loadCopc(file) {
      this.release();
      if (file.url) this.get("file").value = "";
      const copc = this.copc = { controller: new AbortController(), client: new CopcTileSource(),
        pool: new CopcDecodePool(this.deps.copcWorkers), loading: true };
      const { signal } = copc.controller;
      this.get("status").textContent = `Abriendo ${file.name}…`;
      this.updateControls();
      try {
        let input = file;
        if (file.url) {
          this.get("status").textContent = `Descargando ${file.name}…`;
          const response = await fetch(file.url, { signal });
          if (response.status !== 200) throw new Error(`La descarga del COPC devolvió HTTP ${response.status}`);
          input = await response.blob();
        }
        const { tiles, pointBounds, decodeInfo, sourcePointCount } = await copc.client.request("open", {
          source: input, fileIndex: 0, fileName: file.name, progressive: false,
        }, signal);
        signal.throwIfAborted();
        const local = localDataset(() => tiles, pointBounds);
        const nodes = local.records().sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
        const root = nodes.find(node => !node.parentId);
        if (!root) throw new Error("El COPC no contiene una raíz");
        const totals = new Map();
        for (const node of nodes) totals.set(node.depth, (totals.get(node.depth) || 0) + node.pointCount);
        let total = 0;
        let defaultDepth = root.depth;
        const options = [];
        for (const [depth, count] of totals) {
          total += count;
          if (total <= this.deps.copcPointBudget) defaultDepth = depth;
          options.push(new Option(`Nivel ${depth} · ${number.format(total)} puntos`, depth));
        }
        const depthControl = this.get("depth");
        depthControl.replaceChildren(...options);
        const paris = file === this.deps.paris || /LHD_FXX_0648_6863_PTS_LAMB93_IGN69/i.test(file.name);
        const initialDepth = paris && totals.has(2) ? 2 : defaultDepth;
        depthControl.value = initialDepth;
        copc.read = (id, readSignal) => copc.pool.read({ source: input, decodeInfo, tile: copc.byId.get(id), representation: "sample" }, readSignal);
        copc.byId = new Map(tiles.map(tile => [tile.id, tile]));
        copc.nodes = nodes;
        copc.convert = local.convert;
        const name = paris ? this.deps.paris.name : file.name;
        this.model = { root, bounds: local.bounds, origin: [0, 0, 0], scale: 1 };
        this.renderer = new Renderer(this.canvas, this.deps.copcRenderer, local.bounds);
        this.probe = [0.32, -0.32, 0.15].map(value => value * this.renderer.span);
        if (paris) {
          copc.cameraTarget = [0, 0, 0];
          local.convert(this.deps.paris.target, 0, copc.cameraTarget, 0);
          local.convert(this.deps.paris.position, 0, this.probe, 0);
        }
        this.get("position").querySelector("legend").textContent = "Posición del probe (metros locales)";
        this.writePosition();
        this.selectFace(paris ? 2 : 0);
        this.frame();
        const preview = nodes.filter(node => node.depth <= Math.min(initialDepth, root.depth + 1));
        await this.prepareCopc(preview, signal);
        this.previewNodes = preview;
        copc.loading = false;
        this.get("status").textContent = `${name} · ${number.format(sourcePointCount)} puntos en el COPC`;
        this.updateControls();
        this.requestDraw();
      } catch (error) {
        if (this.copc !== copc) return;
        this.release();
        this.get("status").textContent = error.message;
      }
    }

    async prepareCopc(nodes, signal, onProgress) {
      const pending = nodes.filter(node => node.pointCount && !this.renderer.analysis.has(node.id));
      if (!pending.length) return;
      const { read, convert } = this.copc;
      for await (const step of this.renderer.preload(pending, read, convert, signal, false)) onProgress?.(step);
      signal.throwIfAborted();
    }

    upload(node) {
      if (this.renderer.analysis.has(node.id)) return;
      node.localCorners = corners(node.localBounds).map(([x, y, z]) => ({ x, y, z }));
      const { positions, order } = this.model;
      const buffer = this.renderer.upload(node.id, { pointCount: node.pointCount, lngLatAlt: positions }, (source, i, target, offset) => {
        const index = node.id === originalId ? i : order[node.start + i / 3] * 3;
        for (let axis = 0; axis < 3; axis++) target[offset + axis] = source[index + axis];
      });
      delete buffer.pickPositions;
      this.renderer.analysis.set(node.id, buffer);
    }

    loadLines() {
      const gl = this.renderer.gl;
      const program = this.deps.createLineProgram(gl, `#version 300 es
        in vec3 position;
        uniform mat4 matrix;
        void main() { gl_Position = matrix * vec4(position, 1.0); }`, `#version 300 es
        precision mediump float;
        out vec4 color;
        void main() { color = vec4(0.30, 0.39, 0.47, 1.0); }`);
      const indices = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.model.edges, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      this.lines = { program, indices, position: gl.getAttribLocation(program, "position"), matrix: gl.getUniformLocation(program, "matrix") };
    }

    drawLines(matrix) {
      const { gl, analysis } = this.renderer;
      const { program, indices, position, matrix: uniform } = this.lines;
      gl.useProgram(program);
      gl.uniformMatrix4fv(uniform, false, matrix);
      gl.bindBuffer(gl.ARRAY_BUFFER, analysis.get(originalId).buffer);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(position);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
      gl.enable(gl.DEPTH_TEST);
      gl.drawElements(gl.LINES, this.model.edges.length, gl.UNSIGNED_INT, 0);
      gl.disable(gl.DEPTH_TEST);
      gl.disableVertexAttribArray(position);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    writePosition() {
      const decimals = 6 - Math.floor(Math.log10(this.model.scale));
      this.positionInputs.forEach((input, axis) => {
        const value = this.model.origin[axis] + this.probe[axis] * this.model.scale;
        input.value = decimals >= 0 && decimals <= 100 ? Number(value.toFixed(decimals)) : value;
      });
    }

    readPosition() {
      if (!this.model || this.run) return;
      const position = this.positionInputs.map((input, axis) => (input.valueAsNumber - this.model.origin[axis]) / this.model.scale);
      if (position.every(Number.isFinite) && position.some((value, axis) => value !== this.probe[axis])) {
        this.probe = position;
        this.resetResult();
      }
      this.updateControls();
    }

    clipping() {
      const { min, max } = this.model.bounds;
      const far = Math.hypot(...this.probe.map((value, axis) => Math.max(Math.abs(value - min[axis]), Math.abs(value - max[axis]))));
      return { near: this.renderer.near, far: far * 1.01 };
    }

    async generate() {
      if (!this.model || this.run || !this.positionInputs.every(input => input.reportValidity())) return;
      if (!this.get("threshold").reportValidity()) return;
      this.resetResult();
      const run = this.run = new AbortController();
      const { signal } = run;
      const threshold = this.get("threshold").valueAsNumber;
      const size = this.size = Number(this.get("resolution").value);
      const renderer = this.renderer;
      const position = [...this.probe];
      const { near, far } = this.clipping();
      const worker = new Worker("./pointscape-probe-ssim.js");
      const pendingScores = new Map();
      let id = 0;
      let workerError;
      const stopWorker = error => {
        workerError = error;
        worker.terminate();
        for (const { reject } of pendingScores.values()) reject(error);
        pendingScores.clear();
      };
      signal.addEventListener("abort", () => stopWorker(signal.reason), { once: true });
      worker.onerror = () => stopWorker(new Error("Falló el cálculo de SSIM"));
      worker.onmessage = ({ data }) => {
        pendingScores.get(data.id)?.resolve(data.score);
        pendingScores.delete(data.id);
      };
      const compare = (reference, candidate) => new Promise((resolve, reject) => {
        if (workerError) return reject(workerError);
        if (reference === candidate) return resolve(1);
        const request = ++id;
        worker.postMessage({ id: request, reference, candidate, size });
        pendingScores.set(request, { resolve, reject });
      });
      const matrices = faces.map(({ direction, up }) => viewProjection(position, direction, up, near, far));
      const capture = (nodes, previous) => {
        signal.throwIfAborted();
        if (!this.copc) for (const node of nodes) this.upload(node);
        const selection = { nodes, representation: "points" };
        return Promise.all(matrices.map((matrix, index) => {
          if (previous && !renderer.visible([previous.node], matrix, size, size).length) return previous.cubemap[index];
          return renderer.capture(position, index, selection, size, 0, signal, far);
        }));
      };

      this.updateControls();
      try {
        const root = this.model.root;
        let referenceNodes = [this.original];
        if (this.copc) {
          const depth = Number(this.get("depth").value);
          referenceNodes = this.copc.nodes.filter(node => node.depth <= depth);
          const included = new Map(referenceNodes.map(node => [node.id, node]));
          for (const node of referenceNodes) node.children = node.childIds.map(id => included.get(id)).filter(Boolean);
          for (const id of renderer.analysis.keys()) {
            if (!included.has(id)) renderer.releaseAnalysis(id);
          }
          this.get("progress").textContent = "Cargando bloques COPC de referencia…";
          await this.prepareCopc(referenceNodes, signal, ({ done, total }) => {
            this.get("progress").textContent = `Cargando bloques COPC de referencia · ${done} de ${total}`;
          });
          this.previewNodes = referenceNodes;
        }
        this.get("progress").textContent = "Capturando las seis caras de referencia…";
        this.reference = await capture(referenceNodes);
        signal.throwIfAborted();
        this.refreshImages();
        const result = await selectAtProbe(root, { threshold, reference: this.reference, capture, compare, signal,
          onProgress: ({ nodes, cubemap, node, tested, pending, score, kept, restored }) => {
            if (node && !kept && !this.copc) renderer.releaseAnalysis(node.id);
            this.selection = { nodes, representation: "points" };
            if (this.cubemap !== cubemap) {
              this.cubemap = cubemap;
              this.refreshImages();
              this.requestDraw();
            }
            if (restored) {
              this.get("progress").textContent = `Ajustando a la referencia · ${node.id} recuperado · Peor SSIM ${scoreLabel(score)}`;
            } else {
              const trial = node ? ` · ${node.id} ${kept ? "conservado" : "podado"} (SSIM ${scoreLabel(score)})` : "";
              this.get("progress").textContent = `${nodes.length} ${nodes.length === 1 ? "nodo" : "nodos"} · Candidatos probados ${tested} · Pendientes ${pending}${trial}`;
            }
          },
        });
        signal.throwIfAborted();
        this.scores = result.scores;
        this.showResult(result, referenceNodes.reduce((sum, node) => sum + node.pointCount, 0), threshold);
      } catch (error) {
        if (this.run !== run) return;
        this.resetResult();
        this.get("progress").textContent = signal.aborted ? "Cálculo cancelado." : error.message;
      } finally {
        worker.terminate();
        if (this.run === run) {
          this.run = null;
          this.updateControls();
        }
      }
    }

    showResult({ nodes, tested, restored }, referencePoints, threshold) {
      const points = nodes.reduce((sum, node) => sum + node.pointCount, 0);
      const scores = this.scores.filter(score => score !== null);
      const worstScore = scores.length ? Math.min(...scores) : null;
      const worst = worstScore === null ? "" : ` · Peor SSIM final ${scoreLabel(worstScore)}`;
      const count = `${nodes.length} ${nodes.length === 1 ? "nodo seleccionado" : "nodos seleccionados"}`;
      const correction = restored ? ` · Recuperados ${restored}` : "";
      const failure = worstScore !== null && worstScore < threshold ? " · Por debajo del umbral" : "";
      this.get("progress").textContent = `${count} · ${number.format(points)} de ${number.format(referencePoints)} puntos · Pruebas ${tested}${correction}${worst}${failure}`;
      const ordered = nodes.slice().sort((a, b) => a.id.localeCompare(b.id));
      this.get("nodes").replaceChildren(new Option("Todos los nodos", ""), ...ordered.map(node =>
        new Option(`${"· ".repeat(node.depth)}${node.id} (${number.format(node.pointCount)} puntos)`, node.id)));
      this.refreshImages();
    }

    resetResult() {
      if (this.expanded.open) this.expanded.close();
      if (this.renderer && !this.copc) {
        for (const id of this.renderer.analysis.keys()) {
          if (id !== originalId) this.renderer.releaseAnalysis(id);
        }
      }
      this.reference = this.cubemap = this.scores = this.selection = null;
      this.get("nodes").replaceChildren(new Option("Todos los nodos", ""));
      this.get("original").checked = false;
      this.get("progress").textContent = "";
      this.refreshImages();
      this.updateControls();
      this.requestDraw();
    }

    selectFace(index) {
      this.face = index;
      this.previews.forEach(({ button }, i) => button.setAttribute("aria-pressed", String(i === index)));
      this.paintComparison();
      this.requestDraw();
    }

    refreshImages() {
      this.get("cubemap").hidden = !this.reference;
      for (const [i, { preview }] of this.previews.entries()) {
        paint(preview, this.size || 128, this.cubemap?.[i] || this.reference?.[i]);
      }
      this.paintComparison();
    }

    paintComparison() {
      const size = this.size || 128;
      const referenceImage = this.reference?.[this.face];
      const selectionImage = this.cubemap?.[this.face];
      paint(this.get("reference-image"), size, referenceImage);
      paint(this.get("selection-image"), size, selectionImage);
      this.get("enlarge").disabled = !referenceImage || !selectionImage;
      const reference = this.copc ? "la referencia COPC" : "la nube completa";
      this.get("face-score").textContent = this.scores
        ? `${faces[this.face].name} · SSIM frente a ${reference} ${scoreLabel(this.scores[this.face])}` : "";
      if (this.expanded.open) this.paintExpandedComparison();
    }

    openComparison(index = this.face) {
      if (!this.reference?.[index] || !this.cubemap?.[index]) return;
      if (this.face !== index) this.selectFace(index);
      this.paintExpandedComparison();
      if (!this.expanded.open) this.expanded.showModal();
    }

    paintExpandedComparison() {
      const { face, size } = this;
      paint(this.get("expanded-reference"), size, this.reference[face]);
      paint(this.get("expanded-selection"), size, this.cubemap[face]);
      this.get("expanded-title").textContent = `Comparar cara ${faces[face].name}`;
      this.get("expanded-label").textContent = this.get("reference-label").textContent;
      const score = this.scores && (this.scores[face] === null ? "Sin puntos" : `SSIM ${scoreLabel(this.scores[face])}`);
      this.get("expanded-info").textContent = `${size} × ${size} px${score ? ` · ${score}` : ""}`;
    }

    updateControls() {
      const ready = Boolean(this.model && !this.copc?.loading);
      const busy = Boolean(this.run);
      const result = Boolean(this.scores);
      this.get("camera").hidden = !ready;
      this.get("hint").hidden = !ready;
      this.get("position").disabled = this.get("settings").disabled = !ready || busy;
      this.get("file").disabled = busy;
      this.get("paris").disabled = busy || Boolean(this.copc?.loading);
      this.get("copc-depth").hidden = !this.copc || !ready;
      this.get("reference-label").textContent = this.copc ? "Referencia COPC" : "Nube completa";
      this.get("original-label").textContent = this.copc ? "Ver referencia COPC" : "Ver OBJ original";
      this.get("generate").disabled = !ready || busy || this.positionInputs.some(input => !Number.isFinite(input.valueAsNumber));
      this.get("stop").disabled = !busy;
      this.get("original").disabled = this.get("nodes").disabled = !result;
      this.get("boxes").disabled = !ready;
    }

    frame() {
      if (!this.model) return;
      const focus = this.copc?.cameraTarget;
      this.target = focus ? [...focus] : [0, 0, 0];
      this.azimuth = -1.05;
      this.elevation = focus ? 0.32 : 0.52;
      this.distance = (focus ? 600 : this.renderer.span) * Math.max(1.25, this.canvas.clientHeight / Math.max(1, this.canvas.clientWidth));
      this.requestDraw();
    }

    requestDraw() {
      if (this.framePending) return;
      this.framePending = true;
      requestAnimationFrame(() => {
        this.framePending = false;
        if (this.element.open && this.renderer) this.draw();
      });
    }

    draw() {
      const width = this.canvas.clientWidth;
      const height = this.canvas.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(2, devicePixelRatio || 1);
      const w = Math.round(width * ratio);
      const h = Math.round(height * ratio);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = this.overlay.width = w;
        this.canvas.height = this.overlay.height = h;
      }
      const planar = this.distance * Math.cos(this.elevation);
      const offset = [planar * Math.cos(this.azimuth), planar * Math.sin(this.azimuth), this.distance * Math.sin(this.elevation)];
      const eye = this.target.map((value, axis) => value + offset[axis]);
      const matrix = viewProjection(eye, offset.map(value => -value), [0, 0, 1], this.renderer.near,
        Math.hypot(...eye) + this.clipping().far + this.renderer.span * 4, fov, w / h);
      const original = !this.selection || this.get("original").checked;
      this.renderer.drawMain(matrix, w, h, ratio, original ? { nodes: this.previewNodes || [], representation: "points" } : this.selection);
      if (original && this.lines) this.drawLines(matrix);
      this.drawOverlay(matrix, width, height, ratio);
    }

    drawOverlay(matrix, width, height, ratio) {
      const ctx = this.overlay.getContext("2d");
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const wire = (points, style, lineWidth, edges = boxEdges) => {
        const clip = points.map(point => coordinates(matrix, point));
        ctx.strokeStyle = style;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        for (const [a, b] of edges) {
          const line = segment(clip[a], clip[b], width, height);
          if (!line) continue;
          ctx.moveTo(...line[0]);
          ctx.lineTo(...line[1]);
        }
        ctx.stroke();
      };
      if (this.get("boxes").checked) {
        const active = this.get("nodes").value;
        const nodes = this.selection?.nodes || [];
        for (const node of nodes) {
          if (node.id !== active) wire(corners(node.localBounds), "#7ce4b187", 1);
        }
        const selected = nodes.find(node => node.id === active);
        if (selected) wire(corners(selected.localBounds), "#a7ffce", 2.25);
      }
      const clip = coordinates(matrix, this.probe);
      this.marker = clip[2] + clip[3] >= 0 && clip[3] > 0 ? screen(clip, width, height) : null;
      if (this.marker) {
        if (this.get("frustum").checked) {
          const unitsPerPixel = 2 * clip[3] * Math.tan(fov / 2) / height;
          const radius = Math.max(16, Math.min(36, this.renderer.span * 0.032 / unitsPerPixel)) * unitsPerPixel;
          const cube = corners({ min: this.probe.map(value => value - radius), max: this.probe.map(value => value + radius) });
          // Adjacent 90° frustums share their edges and rays from the probe.
          wire(cube, "#ffbd73b8", 1.2);
          wire([...cube, this.probe], "#ffbd7380", 1, cubeRays);
          if (this.reference) {
            const face = frustumCorners(this.probe, faces[this.face], 0, radius).slice(4);
            wire([...face, this.probe], "#ffd7a5", 1.8, faceEdges);
          }
        }
        ctx.strokeStyle = "#ffbc72";
        ctx.fillStyle = "#1e1610";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(...this.marker, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    bindPointer() {
      const canvas = this.canvas;
      canvas.addEventListener("contextmenu", event => event.preventDefault());
      canvas.addEventListener("pointerdown", event => {
        if (!this.model || this.drag || ![0, 1, 2].includes(event.button)) return;
        const rect = canvas.getBoundingClientRect();
        const hit = this.marker && Math.hypot(event.clientX - rect.left - this.marker[0], event.clientY - rect.top - this.marker[1]) <= 16;
        const moveProbe = hit && event.button === 0 && !this.run;
        this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moveProbe, pan: event.shiftKey || event.button !== 0 };
        canvas.setPointerCapture(event.pointerId);
      });
      canvas.addEventListener("pointermove", event => {
        const drag = this.drag;
        if (drag?.id !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (drag.moveProbe && !this.run) this.move(dx, dy, true, event.shiftKey);
        else if (drag.pan) this.move(dx, dy);
        else {
          this.azimuth -= dx * 0.006;
          this.elevation = Math.max(-1.55, Math.min(1.55, this.elevation + dy * 0.006));
        }
        drag.x = event.clientX;
        drag.y = event.clientY;
        this.requestDraw();
      });
      canvas.addEventListener("lostpointercapture", () => { this.drag = null; });
      canvas.addEventListener("wheel", event => {
        if (!this.model) return;
        event.preventDefault();
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1);
        this.distance = Math.max(this.renderer.near * 4, Math.min(this.renderer.span * 30, this.distance * Math.exp(delta * 0.0015)));
        this.requestDraw();
      }, { passive: false });
    }

    move(dx, dy, probe = false, vertical = false) {
      const right = [-Math.sin(this.azimuth), Math.cos(this.azimuth), 0];
      const up = [-Math.cos(this.azimuth) * Math.sin(this.elevation), -Math.sin(this.azimuth) * Math.sin(this.elevation), Math.cos(this.elevation)];
      const forward = [up[0] * right[2] - up[2] * right[0], up[2] * right[1] - up[0] * right[2], up[0] * right[1] - up[1] * right[0]];
      const original = probe ? this.probe : this.target;
      const depth = this.distance + (probe ? forward.reduce((sum, value, axis) => sum + value * (this.probe[axis] - this.target[axis]), 0) : 0);
      const scale = 2 * Math.max(this.renderer.near, depth) * Math.tan(fov / 2) / this.canvas.clientHeight;
      const moved = original.map((value, axis) => value + scale * (vertical ? (axis === 2 ? -dy : 0)
        : (probe ? 1 : -1) * (dx * right[axis] - dy * up[axis])));
      if (probe) {
        this.probe = moved;
        this.writePosition();
        if (this.reference) this.resetResult();
        else this.updateControls();
      } else this.target = moved;
    }
  }

  scope.PointScapeObjProbeMode = ObjMode;
})(globalThis);
