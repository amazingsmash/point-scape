(function (scope) {
  const { faces, center, corners, boxEdges, viewProjection, Octree, Limit } = scope.PointScapeProbeOctree;
  const { Renderer, localDataset, nextFrame } = scope.PointScapeProbeRenderer;
  const fov = Math.PI / 4;
  const colors = { active: "#64e9ff", split: "#ecb455", accepted: "#83b69b", pending: "#9ba6af" };
  const stateLabels = { active: "En evaluación", split: "Subdividida", accepted: "Resuelta", pending: "Pendiente" };

  function expandBounds({ min, max }, margin) {
    const padding = min.map((value, axis) => margin || (value === max[axis] ? 0.0005 : 0));
    return { min: min.map((value, axis) => value - padding[axis]),
      max: max.map((value, axis) => value + padding[axis]) };
  }

  function paint(canvas, size, pixels, heatmap = false) {
    if (canvas.width !== size) canvas.width = canvas.height = size;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, size, size);
    if (!pixels) return;
    const image = context.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const start = (size - y - 1) * size;
      if (!heatmap) image.data.set(pixels.subarray(start * 4, (start + size) * 4), y * size * 4);
      for (let x = 0; x < size; x++) {
        const offset = (y * size + x) * 4;
        if (heatmap) {
          const error = pixels[start + x];
          image.data[offset] = Math.min(255, error * 2);
          image.data[offset + 1] = Math.max(0, error * 2 - 100);
          image.data[offset + 2] = error / 3;
        }
        // RGB readback is already composited on black by the point shader passes.
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }

  function coordinates(matrix, [x, y, z]) {
    return [0, 1, 2, 3].map(row =>
      matrix[row] * x + matrix[row + 4] * y + matrix[row + 8] * z + matrix[row + 12]);
  }

  function screen(clip, width, height) {
    return [(clip[0] / clip[3] + 1) * width / 2, (1 - clip[1] / clip[3]) * height / 2];
  }

  function segment(a, b, width, height) {
    // Clip near the eye before perspective division, then Canvas clips to the viewport.
    const near = p => p[2] + p[3];
    if (near(a) < 0 && near(b) < 0) return null;
    if (near(a) < 0 || near(b) < 0) {
      const t = near(a) / (near(a) - near(b));
      const edge = a.map((value, axis) => value + (b[axis] - value) * t);
      if (near(a) < 0) a = edge;
      else b = edge;
    }
    return [screen(a, width, height), screen(b, width, height)];
  }

  function edgeDistance(point, [a, b]) {
    const delta = b.map((value, axis) => value - a[axis]);
    const length = delta[0] ** 2 + delta[1] ** 2;
    const projection = length ? ((point[0] - a[0]) * delta[0] + (point[1] - a[1]) * delta[1]) / length : 0;
    const t = Math.min(1, Math.max(0, projection));
    return Math.hypot(point[0] - a[0] - t * delta[0], point[1] - a[1] - t * delta[1]);
  }

  class Mode {
    constructor(element, deps) {
      this.element = element;
      this.deps = deps;
      this.get = name => element.querySelector(`#probe-${name}`);
      this.canvas = element.querySelector(".probe-cloud");
      this.overlay = element.querySelector(".probe-overlay");
      this.comparison = [...element.querySelectorAll(".probe-comparison canvas")];
      this.captions = [...element.querySelectorAll(".probe-comparison figcaption")];
      element.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        if (this.probeView) this.leaveProbeView();
        else this.close();
      });
      this.settings = [...element.querySelectorAll(".probe-settings-grid :is(input, select)")];
      this.faceButtons = faces.map(({ name }, index) => {
        const button = document.createElement("button");
        const thumbnail = document.createElement("canvas");
        const label = document.createElement("span");
        button.className = "probe-face";
        button.type = "button";
        button.append(thumbnail, label);
        button.addEventListener("click", () => {
          this.index = index;
          this.follow = false;
          this.renderInspection();
          this.renderControls();
          if (this.probeView) this.requestDraw(true);
        });
        label.textContent = name;
        this.get("faces").append(button);
        return { button, thumbnail, label };
      });
      this.get("close").onclick = () => this.close();
      this.get("home").onclick = () => this.frameCloud();
      this.get("orbit").onclick = () => {
        this.leaveProbeView();
        this.canvas.focus();
      };
      this.get("overlay-toggle").onchange = () => {
        this.get("legend").hidden = !this.get("overlay-toggle").checked;
        this.requestDraw();
      };
      this.get("start").onclick = () => this.start(true);
      this.get("pause").onclick = () => {
        this.running = !this.running;
        this.renderControls();
        if (this.running) this.advance();
      };
      this.get("step").onclick = () => this.task ? this.advance() : this.start(false);
      this.get("cell").onchange = () => this.select(this.tree.cells[Number(this.get("cell").value)]);
      this.get("position").onchange = () => this.selectProbe(this.cell, this.inspectionProbes()[Number(this.get("position").value)]);
      this.get("follow").onclick = () => {
        this.leaveProbeView();
        this.follow = true;
        this.showActivity(this.latest);
      };
      this.get("go").onclick = () => this.goToProbe();
      this.get("validate").onclick = () => this.validate();
      this.resize = new ResizeObserver(() => this.requestDraw(true));
      this.resize.observe(this.canvas);
      this.installCameraControls();
    }

    open(source) {
      this.close(false);
      this.element.hidden = false;
      this.get("close").focus();
      this.source = source;
      this.follow = true;
      this.index = 0;
      if (!source) {
        this.message = "Carga una nube COPC para abrir el modo";
        this.renderControls();
        return;
      }
      this.local = localDataset(source.records, source.bounds);
      try {
        this.renderer = new Renderer(this.canvas, this.deps, this.local.bounds);
      } catch (error) {
        this.message = error.message;
        this.renderControls();
        return;
      }
      this.message = "Listo para generar el octree";
      this.controller = new AbortController();
      const extent = Math.max(...this.local.bounds.max.map((value, axis) => value - this.local.bounds.min[axis]));
      this.get("max-size").value = Math.ceil(extent + Number(this.get("margin").value) * 2) || 1;
      this.lod = new scope.PointScapeLodSystem({
        config: this.deps.lodConfig,
        tileSelection: scope.PointScapeTileSelection,
        getScreenBounds: (tile, margin) => this.deps.projectBounds(tile.localCorners, this.matrix,
          this.canvas.clientWidth, this.canvas.clientHeight, { margin }),
        isFullEnabled: () => false,
      });
      this.streamer = new scope.PointScapeLodStreaming.LodStreamer({
        read: (id, representation, signal) => this.source.read(id, signal),
        select: scope.PointScapeTileSelection.selectActiveTiles,
        yieldFrame: nextFrame,
        publish: tiles => {
          this.renderer?.updateLive(tiles, this.local.convert);
          this.requestDraw();
        },
      });
      this.frameCloud();
      this.renderControls();
      this.renderInspection();
    }

    close(restoreFocus = true) {
      const wasOpen = !this.element.hidden;
      this.element.hidden = true;
      this.controller?.abort();
      this.stopWorker();
      this.streamer?.reset();
      this.renderer?.dispose();
      this.controller = this.streamer = this.renderer = null;
      this.source = this.local = this.lod = null;
      this.tree = this.task = this.cell = this.probe = this.latest = this.suspendedTask = this.refinement = null;
      this.advanceToken = null;
      this.running = this.busy = this.validating = false;
      this.drag = this.probeView = null;
      this.useProbeSelection = false;
      clearTimeout(this.lodTimer);
      this.lodTimer = null;
      this.lastPlan = this.matrix = this.hits = null;
      this.dirtyLod = false;
      this.optionsCount = 0;
      this.get("cell").replaceChildren();
      this.get("position").replaceChildren();
      this.get("cell").disabled = this.get("position").disabled = true;
      this.message = "";
      this.get("orbit").hidden = this.get("view-status").hidden = true;
      if (restoreFocus && wasOpen) this.deps.returnFocus();
    }

    recordsChanged() {
      if (this.renderer) this.queueLod();
    }

    readOptions() {
      const value = name => Number(this.get(name).value);
      const read = name => this.get(name).value;
      return {
        margin: value("margin"), resolution: value("resolution"), threshold: value("threshold"),
        maxDepth: value("depth"), maxSize: value("max-size"), lookahead: value("lookahead"),
        faceBudget: value("budget"), pointBudget: value("point-budget"), representation: read("representation"),
        imageBudget: 96 * 1024 ** 2,
      };
    }

    start(running) {
      if (!this.renderer || this.task) return;
      for (const field of this.settings) {
        if (!field.value || !field.reportValidity()) {
          field.focus();
          return;
        }
      }
      this.leaveProbeView();
      const options = this.readOptions();
      const bounds = expandBounds(this.local.bounds, options.margin);
      this.renderer.clearAnalysis();
      this.lastPlan = null;
      this.renderer.updateLive(this.streamer.displayed, this.local.convert);
      this.stopWorker();
      this.worker = new Worker("./pointscape-probe-ssim.js");
      this.worker.onerror = () => this.stopWorker(new Error("Falló el cálculo de SSIM"));
      const signal = this.controller.signal;
      const read = this.source.read;
      const tree = new Octree(bounds, options, {
        prepare: async function* (cell) {
          cell.reason = "Preparando la jerarquía COPC";
          yield { cell, phase: "prepare" };
          signal.throwIfAborted();
          if (this.source.pointCount > options.pointBudget) {
            throw new Limit(`La referencia requiere ${this.source.pointCount.toLocaleString()} puntos · límite ${options.pointBudget.toLocaleString()}`);
          }
          const records = await this.source.loadHierarchy(signal);
          signal.throwIfAborted();
          const nodes = this.local.localRecords(records);
          const preloader = this.renderer.preload(nodes, read, this.local.convert, signal, options.representation === "image");
          let step = await preloader.next();
          while (!step.done) {
            cell.reason = `Cargando referencia COPC · ${step.value.done}/${step.value.total} nodos`;
            yield { cell, phase: "prepare" };
            step = await preloader.next();
          }
          tree.bounds = expandBounds(step.value, options.margin);
          this.renderer.setBounds(tree.bounds);
          return nodes;
        }.bind(this),
        render: (position, face, selection) => this.renderer.capture(position, face, selection,
          options.resolution, this.source.impostorSize, signal),
        compare: (reference, candidate) => this.compare(reference, candidate, options.resolution),
        onFace: event => this.showActivity(event),
      });
      this.tree = tree;
      this.message = "";
      this.task = tree.generate();
      this.running = running;
      this.follow = true;
      this.cell = tree.root;
      this.probe = this.latest = this.refinement = null;
      this.get("cell").replaceChildren();
      this.optionsCount = 0;
      this.updateCells();
      this.renderInspection();
      this.advance();
    }

    compare(reference, candidate, size) {
      if (!this.worker) return Promise.reject(new Error("El cálculo de SSIM no está disponible"));
      return new Promise((resolve, reject) => {
        const worker = this.worker;
        this.rejectComparison = reject;
        worker.onmessage = ({ data }) => {
          this.rejectComparison = null;
          resolve(data);
        };
        worker.postMessage({ reference, candidate, size });
      });
    }

    stopWorker(error = new DOMException("Cálculo cancelado", "AbortError")) {
      this.worker?.terminate();
      this.worker = null;
      this.rejectComparison?.(error);
      this.rejectComparison = null;
    }

    async advance() {
      if (this.busy || !this.task) return;
      const task = this.task;
      const token = this.advanceToken = {};
      this.busy = true;
      this.renderControls();
      try {
        const { done, value } = await task.next();
        if (task !== this.task) return;
        if (done) {
          this.task = this.suspendedTask;
          this.suspendedTask = null;
          this.running = false;
          if (this.validating) this.validating = false;
          else {
            this.message = "Precálculo terminado";
          }
        } else {
          this.showActivity(value);
          if (value.phase === "decision" && value.cell.status === "split" && this.get("pause-on-split").checked) {
            this.running = false;
          }
          if (value.phase === "validation-done") {
            this.task = this.suspendedTask;
            this.suspendedTask = null;
            this.running = this.validating = false;
          }
        }
      } catch (error) {
        if (this.task === task) {
          this.running = false;
          this.task = null;
          this.message = error.message;
        }
      } finally {
        if (this.advanceToken === token) {
          this.busy = false;
          this.renderControls();
          if (this.task !== task) {
            this.renderInspection();
            this.requestDraw();
          }
          if (this.running) requestAnimationFrame(() => {
            if (this.task === task && this.running) this.advance();
          });
        }
      }
    }

    validate() {
      if (this.running || this.busy || this.validating || this.cell?.status !== "accepted") return;
      this.leaveProbeView();
      this.suspendedTask = this.task;
      this.validating = this.running = this.follow = true;
      this.task = this.tree.validate(this.cell);
      this.advance();
    }

    showActivity(event) {
      if (!event || this.element.hidden) return;
      if (event.phase === "refine") {
        if (this.refinement?.probe !== event.probe) this.refinement = { probe: event.probe, matches: [] };
        if (event.match) this.refinement.matches[event.index] = event.match;
      } else if (this.refinement?.probe !== this.probe || this.follow || event.phase === "cell") {
        this.refinement = null;
      }
      const previous = this.latest;
      this.latest = event;
      if (this.follow) {
        this.cell = event.cell;
        this.probe = event.probe || (previous?.cell === event.cell ? this.probe : event.cell.probes[0]);
        if (event.index !== undefined) this.index = event.index;
      }
      if (event.phase === "decision" || event.phase === "cell") this.updateCells();
      this.renderControls();
      this.renderInspection();
      this.requestDraw();
    }

    select(cell, probe = cell?.worst?.probe || cell?.probes[0]) {
      this.leaveProbeView();
      this.follow = false;
      this.cell = cell;
      this.probe = probe;
      this.index = probe?.matches.reduce((best, match, index, matches) =>
        match.occupiedPixels > (matches[best]?.occupiedPixels || 0) ? index : best, 0) || 0;
      if (probe && cell?.worst?.probe === probe && cell.status !== "accepted") this.index = cell.worst.index;
      this.renderInspection();
      this.renderControls();
      this.requestDraw();
    }

    selectProbe(cell, probe) {
      this.select(cell, probe);
      if (!this.task && probe?.matches.some(Boolean)) this.goToProbe();
    }

    inspectionProbes() {
      return [...(this.cell?.probes || []), ...(this.cell?.validation?.probes || [])];
    }

    updateCells() {
      if (!this.tree) return;
      const drop = this.get("cell");
      for (let i = this.optionsCount; i < this.tree.cells.length; i++) drop.add(new Option("", i));
      this.optionsCount = this.tree.cells.length;
      for (const [index, cell] of this.tree.cells.entries()) {
        const text = `${cell.id} · ${stateLabels[cell.status]}`;
        if (drop.options[index].text !== text) drop.options[index].text = text;
      }
    }

    renderControls() {
      const { tree } = this;
      const task = Boolean(this.task);
      this.get("start").disabled = !this.renderer || task;
      this.get("start").textContent = tree ? "Reiniciar" : "Iniciar";
      this.get("step").disabled = !this.renderer || this.running || this.busy;
      this.get("pause").disabled = !task;
      this.get("pause").textContent = this.running ? "Pausar" : "Reanudar";
      this.settings.forEach(field => { field.disabled = task; });
      this.get("validate").disabled = !this.worker || this.busy || this.running || this.validating || this.cell?.status !== "accepted";
      this.get("follow").disabled = this.follow || !this.latest;
      this.get("go").disabled = !this.probe;
      const suffix = tree
        ? ` · Caras ${tree.renders}/${tree.options.faceBudget} · Reutilizadas ${tree.reused} · Celdas ${tree.cells.length}`
        : "";
      const phase = this.running ? (this.validating ? "Validando" : "En curso")
        : task ? "En pausa" : this.message;
      const status = `${phase}${this.running && this.message ? ` · ${this.message}` : ""}${suffix}`;
      if (this.get("progress").textContent !== status) this.get("progress").textContent = status;
    }

    renderInspection() {
      const { cell, probe, latest } = this;
      const options = this.tree?.options;
      const drop = this.get("cell");
      drop.disabled = !cell;
      if (cell) drop.value = String(this.tree.cells.indexOf(cell));
      const probes = this.inspectionProbes();
      const probeDrop = this.get("position");
      probeDrop.disabled = !probes.length;
      while (probeDrop.options.length > probes.length) probeDrop.remove(probeDrop.options.length - 1);
      probes.forEach((item, index) => {
        const label = item.inherited && item.label !== "Heredado" ? `${item.label} (heredado)` : item.label;
        const option = probeDrop.options[index];
        if (!option) probeDrop.add(new Option(label, index));
        else if (option.text !== label) option.text = label;
      });
      if (probe) probeDrop.value = String(probes.indexOf(probe));
      const decision = this.get("decision");
      const activeDetail = cell && this.follow && latest?.cell === cell && latest.phase === "refine" ? latest.detail : "";
      const count = cell?.selection?.pointNodeCount;
      decision.textContent = cell
        ? `${cell.id} · ${activeDetail || cell.reason}${count ? ` · ${count} ${count === 1 ? "nodo" : "nodos"}` : ""}` : "";
      decision.dataset.state = cell?.status || "";
      this.get("validation").textContent = cell?.validation?.reason || "";
      this.get("source").textContent = probe
        ? `${probe.inherited ? "Probe heredado · " : ""}${probe.reusedFaces ? `${probe.reusedFaces}/6 caras de referencia reutilizadas` : probe.matches.length ? "Referencia nueva" : "Esperando caras"}`
        : "";
      const size = options?.resolution || 128;
      const refinement = this.refinement?.probe === probe && Boolean(probe) && !probe.matches.length;
      const matches = refinement ? this.refinement.matches : probe?.matches || [];
      this.captions[0].textContent = refinement ? "Antes" : "Referencia";
      this.captions[1].textContent = refinement ? "Refinada" : "Candidata";
      this.faceButtons.forEach(({ button, thumbnail, label }, index) => {
        const match = matches[index];
        const reference = match?.reference || probe?.pose.references[index];
        const score = match ? match.score === null ? "vacía" : match.score.toFixed(3) : "pendiente";
        label.textContent = `${faces[index].name} ${match ? score : "·"}`;
        button.setAttribute("aria-label", `Cara ${faces[index].name}, ${score}`);
        button.setAttribute("aria-pressed", String(index === this.index));
        button.dataset.active = String(latest?.probe === probe && latest?.index === index && Boolean(this.task));
        button.dataset.fail = String(match?.score != null && match.score < options.threshold && !refinement);
        button.title = match?.candidateReused ? "Referencia y candidata reutilizadas"
          : match?.reused ? "Referencia reutilizada" : match ? "Referencia nueva" : "";
        if (thumbnail.painted !== reference || thumbnail.width !== size) {
          paint(thumbnail, size, reference);
          thumbnail.painted = reference;
        }
      });
      const match = matches[this.index];
      const reference = match?.reference || probe?.pose.references[this.index];
      [reference, match?.candidate, match?.error].forEach((pixels, index) => {
        const canvas = this.comparison[index];
        if (canvas.painted !== pixels || canvas.width !== size) {
          paint(canvas, size, pixels, index === 2);
          canvas.painted = pixels;
        }
      });
      const score = this.get("score");
      const fails = match?.score != null && match.score < options.threshold;
      score.textContent = options
        ? `${faces[this.index].name} · ${match ? match.score === null ? "Cara vacía" : `SSIM ${match.score.toFixed(4)}` : "Pendiente"} · Umbral ${options.threshold}${fails && !refinement ? " · No alcanza el umbral" : ""}`
        : "";
      if (match?.reused) score.textContent += match.candidateReused
        ? " · Referencia y candidata reutilizadas" : " · Referencia reutilizada";
      score.dataset.fail = String(fails && !refinement);
    }

    requestDraw(updateLod = false) {
      this.dirtyLod ||= updateLod;
      if (this.frameRequested || !this.renderer) return;
      this.frameRequested = true;
      requestAnimationFrame(() => {
        this.frameRequested = false;
        if (this.renderer) this.draw();
      });
    }

    frameCloud() {
      if (!this.renderer) return;
      this.leaveProbeView();
      this.target = center(this.local.bounds);
      this.azimuth = -1.05;
      this.elevation = 0.55;
      this.distance = Math.max(0.05, this.renderer.span * 1.28);
      this.requestDraw(true);
    }

    cameraPosition() {
      if (this.probeView) return this.probeView.probe.pose.position;
      const planar = Math.cos(this.elevation) * this.distance;
      return [this.target[0] + Math.cos(this.azimuth) * planar,
        this.target[1] + Math.sin(this.azimuth) * planar, this.target[2] + Math.sin(this.elevation) * this.distance];
    }

    goToProbe() {
      if (!this.probe) return;
      this.follow = false;
      this.probeView = { cell: this.cell, probe: this.probe };
      this.get("orbit").hidden = this.get("view-status").hidden = false;
      this.renderControls();
      this.requestDraw(true);
    }

    leaveProbeView() {
      if (!this.probeView) return;
      this.probeView = null;
      this.get("orbit").hidden = this.get("view-status").hidden = true;
      this.requestDraw(true);
    }

    draw() {
      const width = this.canvas.clientWidth;
      const height = this.canvas.clientHeight;
      if (!width || !height) return;
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(width * pixelRatio);
      const h = Math.round(height * pixelRatio);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = this.overlay.width = w;
        this.canvas.height = this.overlay.height = h;
        this.dirtyLod = true;
      }
      const eye = this.cameraPosition();
      const view = this.probeView;
      const face = view ? faces[this.index] : null;
      const direction = face?.direction || this.target.map((value, axis) => value - eye[axis]);
      const far = view ? this.renderer.span * 4 : this.renderer.span * 5 + this.distance + Math.hypot(...eye);
      this.viewFov = view ? Math.PI / 2 : fov;
      const matrix = viewProjection(eye, direction, face?.up || [0, 0, 1], this.renderer.near, far, this.viewFov, w / h);
      this.matrix = matrix;
      const accepted = view ? this.tree.acceptedForProbe(view.cell, view.probe) : this.tree?.acceptedAt(eye);
      this.useProbeSelection = Boolean(view && accepted);
      const visible = this.renderer.drawMain(matrix, w, h, pixelRatio, accepted?.selection);
      if (view) {
        const status = this.get("view-status");
        const summary = accepted
          ? `${accepted.id} · ${accepted.selection.representation === "image" ? "Impostor de imagen" : "Selección COPC"} · ${visible}/${accepted.selection.pointNodeCount} nodos visibles`
          : `${view.cell.id} · LOD COPC habitual · ${visible} nodos activos`;
        const label = `Probe ${view.probe.label} · Cara ${face.name} · ${summary}`;
        if (status.textContent !== label) status.textContent = label;
      }
      this.drawOverlay(matrix, width, height, pixelRatio);
      if (this.dirtyLod) this.queueLod();
      this.dirtyLod = false;
    }

    queueLod() {
      if (this.lodTimer || !this.matrix || this.useProbeSelection) return;
      this.lodTimer = setTimeout(() => {
        this.lodTimer = null;
        if (this.renderer && !this.useProbeSelection) this.refreshLod();
      }, 48);
    }

    refreshLod() {
      const records = this.local.records();
      const map = { getContainer: () => this.canvas, transform: { fov: this.viewFov } };
      const selected = this.lod.selectActiveTiles(records, map);
      const pending = selected.filter(node => node.hierarchyPending);
      if (pending.length) this.source.requestPages(pending, node => this.lod.getVisualPriority(node, map));
      const activeTiles = selected.filter(node => !node.hierarchyPending && node.pointCount > 0);
      const signature = activeTiles.map(tile => tile.id).sort().join("|");
      if (signature === this.lastPlan) return;
      this.lastPlan = signature;
      this.streamer.update({ records, activeTiles, budget: this.deps.lodConfig.residentPointBudget,
        fullIds: new Set(), expandedIds: new Set(this.lod.expandedTileIds), accumulated: true, readConcurrency: 2,
        priority: node => this.lod.getVisualPriority(node, map) });
    }

    drawOverlay(matrix, width, height, ratio) {
      const context = this.overlay.getContext("2d");
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      this.hits = { cells: [], probes: [] };
      if (!this.tree || !this.get("overlay-toggle").checked) return;
      for (const cell of this.tree.cells) {
        const clip = corners(this.tree.cellBounds(cell)).map(point => coordinates(matrix, point));
        const edges = boxEdges.map(([a, b]) => segment(clip[a], clip[b], width, height)).filter(Boolean);
        const selected = cell === this.cell;
        context.strokeStyle = colors[cell.status];
        context.globalAlpha = selected ? 0.95 : cell.status === "pending" ? 0.32 : 0.58;
        context.lineWidth = selected ? 1.5 : 0.75;
        context.setLineDash(cell.status === "pending" ? [4, 4] : []);
        context.beginPath();
        for (const [a, b] of edges) {
          context.moveTo(...a);
          context.lineTo(...b);
        }
        context.stroke();
        if (edges.length) this.hits.cells.push({ cell, edges });
      }
      const unique = new Map();
      for (const cell of this.tree.cells) {
        for (const probe of [...cell.probes, ...(cell.validation?.probes || [])]) {
          if (!unique.has(probe.pose.key) || cell === this.cell) unique.set(probe.pose.key, { cell, probe });
        }
      }
      const activeProbe = this.task ? this.latest?.probe : null;
      if (activeProbe) unique.set(activeProbe.pose.key, { cell: this.latest.cell, probe: activeProbe });
      const ordered = [...unique.values()].sort((a, b) => Number(a.probe === activeProbe) - Number(b.probe === activeProbe));
      for (const { cell, probe } of ordered) {
        const clip = coordinates(matrix, probe.pose.position);
        if (clip[2] + clip[3] < 0 || clip[3] <= 0) continue;
        const point = screen(clip, width, height);
        if (point[0] < 0 || point[0] > width || point[1] < 0 || point[1] > height) continue;
        const active = probe === activeProbe;
        const selected = probe === this.probe;
        context.fillStyle = active ? colors.active : selected ? "#fff" : "#b6c4cd";
        context.globalAlpha = active || selected ? 1 : 0.56;
        context.beginPath();
        context.arc(...point, active ? 4 : selected ? 3 : 2, 0, 2 * Math.PI);
        context.fill();
        this.hits.probes.push({ cell, probe, point });
      }
    }

    pick(point) {
      if (!this.hits) return;
      let nearest = 9, hit;
      for (const entry of this.hits.probes) {
        const distance = Math.hypot(point[0] - entry.point[0], point[1] - entry.point[1]);
        if (distance <= nearest) {
          nearest = distance;
          hit = entry;
        }
      }
      if (hit) {
        this.selectProbe(hit.cell, hit.probe);
        return;
      }
      nearest = 7;
      for (const entry of this.hits.cells) {
        const distance = Math.min(...entry.edges.map(edge => edgeDistance(point, edge)));
        if (distance <= nearest) {
          nearest = distance;
          hit = entry;
        }
      }
      if (hit) this.select(hit.cell);
    }

    installCameraControls() {
      const canvas = this.canvas;
      canvas.addEventListener("contextmenu", event => event.preventDefault());
      canvas.addEventListener("pointerdown", event => {
        if (!this.renderer || this.drag || ![0, 1, 2].includes(event.button)) return;
        canvas.setPointerCapture(event.pointerId);
        this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
          travel: 0, pan: event.shiftKey || event.button !== 0 };
      });
      canvas.addEventListener("pointermove", event => {
        if (this.drag?.id !== event.pointerId) return;
        const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
        this.drag.x = event.clientX;
        this.drag.y = event.clientY;
        this.drag.travel += Math.hypot(dx, dy);
        if (this.drag.pan) this.pan(dx, dy);
        else this.orbit(dx, dy);
        this.requestDraw(true);
      });
      canvas.addEventListener("pointerup", event => {
        if (this.drag?.id !== event.pointerId) return;
        const rect = canvas.getBoundingClientRect();
        if (this.drag.travel < 4 && !this.drag.pan) this.pick([event.clientX - rect.left, event.clientY - rect.top]);
        this.drag = null;
      });
      canvas.addEventListener("lostpointercapture", () => { this.drag = null; });
      canvas.addEventListener("wheel", event => {
        if (!this.renderer) return;
        event.preventDefault();
        this.zoom(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1));
      }, { passive: false });
      canvas.addEventListener("keydown", event => {
        if (!this.renderer) return;
        const move = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[event.key];
        if (move) {
          if (event.shiftKey) this.pan(...move);
          else this.orbit(...move);
        } else if (event.key === "+" || event.key === "=") this.zoom(-100);
        else if (event.key === "-") this.zoom(100);
        else return;
        event.preventDefault();
        this.requestDraw(true);
      });
    }

    orbit(dx, dy) {
      this.leaveProbeView();
      this.azimuth -= dx * 0.006;
      this.elevation = Math.max(-1.55, Math.min(1.55, this.elevation + dy * 0.006));
    }

    pan(dx, dy) {
      this.leaveProbeView();
      const scale = 2 * this.distance * Math.tan(fov / 2) / this.canvas.clientHeight;
      const horizontal = [-Math.sin(this.azimuth), Math.cos(this.azimuth), 0];
      const vertical = [-Math.cos(this.azimuth) * Math.sin(this.elevation),
        -Math.sin(this.azimuth) * Math.sin(this.elevation), Math.cos(this.elevation)];
      this.target = this.target.map((value, axis) => value + scale * (-dx * horizontal[axis] + dy * vertical[axis]));
    }

    zoom(delta) {
      this.leaveProbeView();
      this.distance = Math.max(this.renderer.near * 4, Math.min(this.renderer.span * 30, this.distance * Math.exp(delta * 0.0015)));
      this.requestDraw(true);
    }
  }

  scope.PointScapeProbeMode = Mode;
})(globalThis);
