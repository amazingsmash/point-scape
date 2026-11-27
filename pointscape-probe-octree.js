(function (scope) {
  const faces = [
    { name: "+X", direction: [1, 0, 0], up: [0, 0, 1] },
    { name: "−X", direction: [-1, 0, 0], up: [0, 0, 1] },
    { name: "+Y", direction: [0, 1, 0], up: [0, 0, 1] },
    { name: "−Y", direction: [0, -1, 0], up: [0, 0, 1] },
    { name: "+Z", direction: [0, 0, 1], up: [0, 1, 0] },
    { name: "−Z", direction: [0, 0, -1], up: [0, 1, 0] },
  ];
  const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = vector => vector.map(value => value / Math.hypot(...vector));
  const interpolate = (a, b, fraction) => a.map((min, axis) => min + (b[axis] - min) * fraction[axis]);
  const center = ({ min, max }) => interpolate(min, max, [0.5, 0.5, 0.5]);
  const contains = ({ min, max }, position) =>
    position.every((value, axis) => value >= min[axis] && value <= max[axis]);
  const corners = ({ min, max }) => Array.from({ length: 8 }, (_, i) =>
    min.map((value, axis) => i & (1 << axis) ? max[axis] : value));
  const boxEdges = Array.from({ length: 8 }, (_, i) => [1, 2, 4].filter(bit => !(i & bit)).map(bit => [i, i | bit])).flat();

  function viewProjection(eye, direction, up, near, far, fov = Math.PI / 2, aspect = 1) {
    const forward = unit(direction);
    const right = unit(cross(forward, up));
    const vertical = cross(right, forward);
    const focal = 1 / Math.tan(fov / 2);
    const a = (far + near) / (far - near);
    const b = -2 * far * near / (far - near);
    const x = [...right, -dot(right, eye)].map(value => value * focal / aspect);
    const y = [...vertical, -dot(vertical, eye)].map(value => value * focal);
    const w = [...forward, -dot(forward, eye)];
    return x.flatMap((value, i) => [value, y[i], a * w[i] + (i === 3 ? b : 0), w[i]]);
  }

  function makeCell(id, depth, min, max, parent) {
    return { id, depth, min, max, parent, status: "pending", reason: "Vistas pendientes", probes: [], children: [] };
  }

  class Limit extends Error {}

  class Octree {
    constructor(bounds, options, { prepare, render, compare, onFace = () => {} }) {
      Object.assign(this, { options, prepare, render, compare, onFace });
      // Integer dyadic coordinates make boundary probes identical across levels.
      this.grid = 2 ** (options.maxDepth + 1);
      this.bounds = bounds;
      this.root = makeCell("R", 0, [0, 0, 0], Array(3).fill(this.grid), null);
      this.cells = [this.root];
      this.poses = new Map();
      this.renders = 0;
      this.reused = 0;
      this.imageBytes = 0;
      this.selections = new Map();
    }

    position(grid) {
      return interpolate(this.bounds.min, this.bounds.max, grid.map(value => value / this.grid));
    }

    cellBounds(cell) {
      return { min: this.position(cell.min), max: this.position(cell.max) };
    }

    acceptedAt(position) {
      const { min, max } = this.bounds;
      if (!contains(this.bounds, position)) return null;
      const grid = position.map((value, axis) => (value - min[axis]) / (max[axis] - min[axis]) * this.grid);
      return this.acceptedIn(this.root, grid);
    }

    acceptedForProbe(cell, probe) {
      return this.acceptedIn(cell, probe.pose.grid);
    }

    acceptedIn(cell, grid) {
      while (cell.children.length) {
        const middle = center(cell);
        const index = grid.reduce((bits, value, axis) => bits | (value >= middle[axis] ? 1 << axis : 0), 0);
        cell = cell.children[index];
      }
      return cell.status === "accepted" ? cell : null;
    }

    pose(grid) {
      const key = grid.join(",");
      if (!this.poses.has(key)) this.poses.set(key, { key, grid, position: this.position(grid), references: [], results: new Map() });
      return this.poses.get(key);
    }

    populate(cell) {
      const middle = center(cell);
      const gridPositions = [middle, ...faces.map(({ direction }) => middle.map((value, axis) =>
        direction[axis] === 0 ? value : direction[axis] > 0 ? cell.max[axis] : cell.min[axis]))];
      cell.probes = gridPositions.map((grid, index) => ({
        pose: this.pose(grid), label: index === 0 ? "Centro" : faces[index - 1].name, reusedFaces: 0, matches: [],
      }));
      const inherited = new Map((cell.parent?.probes || [])
        .filter(({ pose }) => contains(cell, pose.grid) && pose.references.some(Boolean))
        .map(probe => [probe.pose.key, probe.pose]));
      for (const probe of cell.probes) probe.inherited = inherited.delete(probe.pose.key);
      for (const pose of inherited.values()) {
        cell.probes.push({ pose, label: "Heredado", inherited: true, reusedFaces: 0, matches: [] });
      }
    }

    divide(cell) {
      const middle = center(cell);
      cell.children = Array.from({ length: 8 }, (_, index) => {
        const upper = axis => index & (1 << axis);
        return makeCell(`${cell.id}.${index + 1}`, cell.depth + 1,
          cell.min.map((v, axis) => upper(axis) ? middle[axis] : v),
          cell.max.map((v, axis) => upper(axis) ? v : middle[axis]), cell);
      });
      this.cells.push(...cell.children);
    }

    selection(nodes, representation = "points") {
      const key = `${representation}:${nodes.map(node => node.id).sort().join("|")}`;
      if (!this.selections.has(key)) {
        const pointNodeCount = nodes.filter(node => node.pointCount > 0).length;
        this.selections.set(key, { key, nodes, representation, pointNodeCount });
      }
      return this.selections.get(key);
    }

    reserve(bytes) {
      if (this.imageBytes + bytes > this.options.imageBudget) throw new Limit("Límite de memoria de cubemaps");
      this.imageBytes += bytes;
    }

    async capture(pose, index, selection) {
      if (this.renders >= this.options.faceBudget) throw new Limit("Presupuesto de caras agotado");
      this.renders++;
      return this.render(pose.position, index, selection);
    }

    async *refine(cell, rootNodes, nodesById) {
      const probe = cell.probes[0];
      const chosen = [...rootNodes];
      let baseline = [];
      const queue = [...rootNodes];
      const children = nodes => nodes.flatMap(node => node.childIds.map(id => nodesById.get(id)));
      for (let next = 0; next < queue.length; next++) {
        const branch = queue[next];
        let level = children([branch]);
        if (!level.length) continue;
        const group = [];
        for (let look = 1; level.length && look <= this.options.lookahead; look++) {
          group.push(...level);
          const selection = { nodes: [...chosen, ...group], representation: "points" };
          const trial = [];
          let worst = 1;
          for (const [index, face] of faces.entries()) {
            this.onFace({ cell, probe, index, phase: "refine", detail: `COPC · ${branch.id} · nivel ${level[0].depth}` });
            baseline[index] ||= await this.capture(probe.pose, index, { nodes: chosen, representation: "points" });
            const candidate = await this.capture(probe.pose, index, selection);
            trial[index] = candidate;
            const metric = await this.compare(baseline[index], candidate);
            if (metric.score !== null) worst = Math.min(worst, metric.score);
            yield { cell, probe, index, phase: "refine", match: { ...metric, reference: baseline[index], candidate },
              detail: `${face.name} · COPC nivel ${level[0].depth} · peor SSIM ${worst.toFixed(4)}` };
          }
          if (worst < this.options.threshold) {
            chosen.push(...group);
            baseline = trial;
            queue.push(...level);
            yield { cell, probe, phase: "refine", detail: `Se conservan ${group.length} nodos de ${branch.id} · SSIM ${worst.toFixed(4)}` };
            break;
          }
          const deeper = children(level);
          if (!deeper.length || look === this.options.lookahead) {
            yield { cell, probe, phase: "refine", detail: `Rama ${branch.id} podada tras comprobar ${look} niveles · SSIM ${worst.toFixed(4)}` };
          }
          level = deeper;
        }
      }
      return this.selection(chosen, this.options.representation);
    }

    async *check(cell, probe, selection, phase) {
      const { pose } = probe;
      for (const index of faces.keys()) {
        this.onFace({ cell, probe, index, phase });
        let reference = pose.references[index];
        let cached = pose.results.get(selection.key)?.[index];
        const reused = Boolean(reference);
        const candidateReused = Boolean(cached);
        if (reused) {
          probe.reusedFaces++;
          this.reused++;
        } else {
          if (this.imageBytes + this.options.resolution ** 2 * 4 > this.options.imageBudget) {
            throw new Limit("Límite de memoria de cubemaps");
          }
          reference = await this.capture(pose, index, this.reference);
          this.reserve(reference.byteLength);
          pose.references[index] = reference;
        }
        if (!cached) {
          const identical = selection === this.reference;
          const needed = this.options.resolution ** 2 * (identical ? 1 : 5);
          if (this.imageBytes + needed > this.options.imageBudget) throw new Limit("Límite de memoria de cubemaps");
          const candidate = identical ? reference : await this.capture(pose, index, selection);
          const metric = await this.compare(reference, candidate);
          this.reserve((identical ? 0 : candidate.byteLength) + metric.error.byteLength);
          cached = { ...metric, reference, candidate };
          if (!pose.results.has(selection.key)) pose.results.set(selection.key, []);
          pose.results.get(selection.key)[index] = cached;
        }
        const match = { ...cached, reused, candidateReused };
        probe.matches[index] = match;
        yield { cell, probe, index, phase, match };
      }
    }

    async *generate() {
      const queue = [this.root];
      let cell = this.root;
      try {
        const nodes = (yield* this.prepare(this.root)).slice().sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
        const byId = new Map(nodes.map(node => [node.id, node]));
        const roots = nodes.filter(node => !node.parentId);
        if (!roots.length || nodes.some(node => node.hierarchyPending || node.childIds.some(id => !byId.has(id)))) {
          throw new Error("Jerarquía COPC incompleta");
        }
        this.reference = this.selection(nodes);
        for (let next = 0; next < queue.length; next++) {
          cell = queue[next];
          this.populate(cell);
          cell.status = "active";
          cell.reason = "Buscando una selección COPC en el centro";
          yield { cell, phase: "cell" };
          cell.selection = yield* this.refine(cell, roots, byId);
          cell.reason = "Comparando la selección con la referencia";
          for (const probe of cell.probes) yield* this.check(cell, probe, cell.selection, "check");
          const worst = this.worst(cell.probes);
          cell.worst = worst;
          const { min, max } = this.cellBounds(cell);
          const size = Math.max(...max.map((value, axis) => value - min[axis]));
          const failure = worst && worst.score < this.options.threshold
            ? `La cara ${faces[worst.index].name} (${worst.probe.label}) no alcanza el umbral · ${worst.score.toFixed(4)}`
            : size > this.options.maxSize ? `Lado máximo ${size.toFixed(2)} m · límite ${this.options.maxSize} m` : null;
          if (!failure) {
            cell.status = "accepted";
            cell.reason = cell.probes.length === 7 ? "Las siete posiciones cumplen" : `Cumplen las ${cell.probes.length} posiciones, incluidas las heredadas`;
          } else if (cell.depth >= this.options.maxDepth || this.renders >= this.options.faceBudget) {
            cell.status = "pending";
            const limits = [];
            if (cell.depth >= this.options.maxDepth) limits.push("Profundidad máxima");
            if (this.renders >= this.options.faceBudget) limits.push("Presupuesto de caras agotado");
            cell.reason = [...limits, failure].join(" · ");
          } else {
            cell.status = "split";
            cell.reason = failure;
            this.divide(cell);
            queue.push(...cell.children);
          }
          yield { cell, phase: "decision", probe: worst?.probe, index: worst?.index };
        }
      } catch (error) {
        cell.status = "pending";
        const worst = this.worst(cell.probes);
        cell.worst = worst;
        const failure = worst && worst.score < this.options.threshold
          ? ` · La cara ${faces[worst.index].name} (${worst.probe.label}) no alcanza el umbral · ${worst.score.toFixed(4)}` : "";
        const reason = error.message || String(error);
        cell.reason = reason + failure;
        for (const queued of queue) {
          if (queued !== cell && queued.status === "pending" && queued.reason === "Vistas pendientes") queued.reason = reason;
        }
        yield { cell, phase: "decision", probe: worst?.probe, index: worst?.index };
      }
    }

    worst(probes) {
      let worst = null;
      for (const probe of probes) {
        probe.matches.forEach(({ score }, index) => {
          if (score !== null && (!worst || score < worst.score)) worst = { score, index, probe };
        });
      }
      return worst;
    }

    async *validate(cell) {
      cell.validation = { probes: [], reason: "Midiendo posiciones reservadas" };
      const locations = [
        ...[0.16, 0.32, 0.48, 0.64, 0.84].map(t => ({ fraction: [t, t, t], label: `Diagonal ${Math.round(t * 100)} %` })),
        { fraction: [0.72, 0.22, 0.39], label: "Interior 1" },
        { fraction: [0.26, 0.74, 0.62], label: "Interior 2" },
      ];
      try {
        for (const { fraction, label } of locations) {
          const pose = this.pose(interpolate(cell.min, cell.max, fraction));
          const probe = { pose, label, matches: [], reusedFaces: 0 };
          cell.validation.probes.push(probe);
          yield* this.check(cell, probe, cell.selection, "validation");
        }
        const worst = this.worst(cell.validation.probes);
        cell.validation.reason = worst
          ? `Peor SSIM ${worst.score.toFixed(4)} · ${worst.probe.label} · ${faces[worst.index].name} · ${worst.score >= this.options.threshold ? "Cumple" : "Falla"}`
          : "Vistas reservadas vacías";
        yield { cell, phase: "validation-done", probe: worst?.probe, index: worst?.index };
      } catch (error) {
        cell.validation.reason = `Verificación pendiente · ${error.message}`;
        yield { cell, phase: "validation-done" };
      }
    }
  }

  const api = { faces, viewProjection, corners, boxEdges, center, contains, Octree, Limit };
  scope.PointScapeProbeOctree = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
