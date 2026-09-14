(function (scope) {
  const keyOf = (id, source) => `${id}:${source}`;

  function thinPoints(points, count) {
    const total = points?.pointCount || points?.classifications?.length || 0;
    if (!total || count >= total) return points;
    const lngLatAlt = new Float64Array(count*3), classifications = new Uint8Array(count);
    // A coprime permutation visits every source point once. All intermediate
    // levels share the same prefix, so increasing detail retains existing points.
    const gcd = (a,b) => { while (b) { const next=a%b; a=b; b=next; } return a; };
    let stride = Math.max(1, Math.floor(total*0.61803398875));
    while (gcd(stride,total) !== 1) stride++;
    for (let i=0; i<count; i++) {
      const index = (i*stride)%total;
      lngLatAlt.set(points.lngLatAlt.subarray(index*3,index*3+3), i*3);
      classifications[i] = points.classifications[index];
    }
    return { lngLatAlt, classifications, pointCount: count };
  }

  // Conservative homogeneous box clipping: reject only if all eight corners
  // are outside one plane. A box crossing the eye plane gets viewport coverage.
  function projectScreenBounds(corners, matrix, width, height, options = {}) {
    if (corners.length !== 8 || !matrix?.length) return null;
    const clips = corners.map(({ x, y, z }) => [
      matrix[0]*x + matrix[4]*y + matrix[8]*z + matrix[12],
      matrix[1]*x + matrix[5]*y + matrix[9]*z + matrix[13],
      matrix[2]*x + matrix[6]*y + matrix[10]*z + matrix[14],
      matrix[3]*x + matrix[7]*y + matrix[11]*z + matrix[15],
    ]);
    if (clips.some(p => p.some(v => !Number.isFinite(v)))) return null;
    const margin = Number.isFinite(options.margin) ? Math.max(1, options.margin) : 1.08;
    const planes = [p => p[0]+margin*p[3], p => margin*p[3]-p[0],
      p => p[1]+margin*p[3], p => margin*p[3]-p[1], p => p[2]+p[3], p => p[3]-p[2]];
    if (planes.some(plane => clips.every(p => plane(p) < 0))) {
      return { visible: false, area: 0, diagonalPixels: 0 };
    }
    if (clips.some(p => p[3] <= 0)) {
      return { visible: true, area: width * height, diagonalPixels: Math.hypot(width, height) };
    }
    const xs = clips.map(p => p[0]/p[3]), ys = clips.map(p => p[1]/p[3]);
    const span = values => Math.max(0, Math.min(1, Math.max(...values)) - Math.max(-1, Math.min(...values)));
    const projectedWidth = span(xs) * width / 2;
    const projectedHeight = span(ys) * height / 2;
    return {
      visible: true,
      area: Math.max(1, projectedWidth * projectedHeight),
      diagonalPixels: Math.max(1, Math.hypot(projectedWidth, projectedHeight)),
    };
  }

  class LodStreamer {
    constructor({
      read,
      publish,
      select,
      yieldFrame = () => Promise.resolve(),
      memoryBudgetBytes = 128*1024*1024,
      transitionHoldMs = 220,
      now = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
      setTimer = (callback, delay) => setTimeout(callback, delay),
      clearTimer = (timer) => clearTimeout(timer),
    }) {
      Object.assign(this, {
        read,
        publish,
        select,
        yieldFrame,
        memoryBudgetBytes,
        transitionHoldMs,
        now,
        setTimer,
        clearTimer,
      });
      this.cache = new Map();
      this.epoch = 0;
      this.generation = 0;
      this.displayed = [];
      this.transitionStartedAt = null;
      this.transitionTimer = null;
      this.targetSignature = "";
    }
    reset() {
      this.epoch++;
      this.generation++;
      this.plan = null;
      this.cache.clear();
      this.displayed = [];
      this.targetSignature = "";
      this.transitionStartedAt = null;
      this.cancelTransitionTimer();
    }
    update(plan) {
      this.generation++;
      this.plan = plan;
      const nextTargetSignature = plan.activeTiles.map(tile =>
        `${tile.id}:${plan.fullIds.has(tile.id) ? plan.fullCounts?.get(tile.id) || "full" : "sample"}`)
        .sort().join("|");
      if (nextTargetSignature !== this.targetSignature) {
        this.targetSignature = nextTargetSignature;
        if (this.displayed.length && this.transitionStartedAt === null) {
          this.transitionStartedAt = this.now();
        }
      }
      this.required = new Map();
      const byId = new Map(plan.records.map(t => [t.id, t]));
      const add = (tile, source) => this.required.set(keyOf(tile.id, source), { tile, source });
      for (const tile of plan.activeTiles) {
        if (plan.fullIds.has(tile.id)) add(tile, "full");
        let current = tile;
        while (current) { add(current, "sample"); current = byId.get(current.parentId); }
      }
      this.commit();
      if (!this.running) this.running = this.drain().finally(() => { this.running = null; });
      return this.running;
    }
    cancelTransitionTimer() {
      if (this.transitionTimer !== null) this.clearTimer(this.transitionTimer);
      this.transitionTimer = null;
    }
    scheduleTransitionCommit(delay) {
      if (this.transitionTimer !== null) return;
      this.transitionTimer = this.setTimer(() => {
        this.transitionTimer = null;
        this.commit();
      }, Math.max(0, delay));
      this.transitionTimer?.unref?.();
    }
    areTargetRepresentationsReady(plan) {
      return plan.activeTiles.every(tile => {
        if (!this.cache.has(keyOf(tile.id, "sample"))) return false;
        return !plan.fullIds.has(tile.id) || this.cache.has(keyOf(tile.id, "full"));
      });
    }
    retainPreviousDuringTransition(descriptors, plan) {
      if (!this.displayed.length || this.transitionStartedAt === null || this.areTargetRepresentationsReady(plan)) {
        this.transitionStartedAt = null;
        this.cancelTransitionTimer();
        return descriptors;
      }
      const elapsed = this.now() - this.transitionStartedAt;
      const remaining = this.transitionHoldMs - elapsed;
      if (remaining <= 0) {
        this.transitionStartedAt = null;
        this.cancelTransitionTimer();
        return descriptors;
      }

      // Keep the last complete frame while its successor is being read. Add any
      // newly ready representations only when they fit, so the visible budget is
      // never exceeded and a partially loaded plan cannot punch holes in the cloud.
      const retained = [];
      const retainedIds = new Set();
      let used = 0;
      for (const descriptor of this.displayed) {
        if (used + descriptor.pointCount > plan.budget) continue;
        retained.push(descriptor);
        retainedIds.add(descriptor.id);
        used += descriptor.pointCount;
      }
      for (const descriptor of descriptors) {
        if (retainedIds.has(descriptor.id) || used + descriptor.pointCount > plan.budget) continue;
        retained.push(descriptor);
        retainedIds.add(descriptor.id);
        used += descriptor.pointCount;
      }
      this.scheduleTransitionCommit(remaining);
      return retained.length ? retained : descriptors;
    }
    commit() {
      if (!this.plan) return;
      const plan = this.plan;
      const available = tile => this.cache.has(keyOf(tile.id, "sample"));
      const result = this.select(plan.records, {
        pointBudget: plan.budget,
        useAccumulatedLod: plan.accumulated,
        isTileVisible: tile => this.required.has(keyOf(tile.id, "sample")),
        getTilePointCost: tile => tile.sampledPointCount || 0,
        getFullPointCost: tile => plan.fullCounts?.get(tile.id) ?? tile.fullPointCount ?? 0,
        getTilePriority: plan.priority,
        shouldUseFull: tile => plan.fullIds.has(tile.id) && this.cache.has(keyOf(tile.id, "full")),
        shouldExpandTile: tile => plan.expandedIds.has(tile.id) &&
          (plan.accumulated || (tile.childIds || []).every(id =>
            !this.required.has(keyOf(id, "sample")) || this.cache.has(keyOf(id, "sample")))),
      });
      let descriptors = result.activeTiles.filter(available).map(tile => {
        const source = result.nextFullTileIds.has(tile.id) ? "full" : "sample";
        const resident = this.cache.get(keyOf(tile.id, source));
        const count = source === "full" ? result.nextFullPointCounts.get(tile.id) : resident.pointCount;
        if (count === resident.pointCount) return resident;
        if (resident.representation?.pointCount !== count) resident.representation = {
          id: tile.id, source, pointCount: count, points: thinPoints(resident.points, count),
          renderKey: `${tile.id}:${source}:${count}`,
        };
        return resident.representation;
      });
      // During first coverage acquisition retain a compatible previous frame.
      if (!descriptors.length && this.displayed.length && this.required.size) {
        const retained = this.displayed.filter(d => this.required.has(keyOf(d.id, "sample")));
        if (retained.reduce((n, d) => n + d.pointCount, 0) <= plan.budget) descriptors = retained;
      }
      descriptors = this.retainPreviousDuringTransition(descriptors, plan);
      const signature = descriptors.map(d => d.renderKey).sort().join("|");
      const changed = signature !== this.displayed.map(d => d.renderKey).sort().join("|");
      this.displayed = descriptors;
      if (changed) this.publish(descriptors);
      const protectedKeys = new Set(descriptors.map(d => keyOf(d.id, d.source)));
      for (const key of this.cache.keys()) {
        if (!this.required.has(key) && !protectedKeys.has(key)) this.cache.delete(key);
      }
    }
    async drain() {
      const failed = new Set();
      while (this.plan) {
        const plan = this.plan;
        const requests = [...this.required.entries()].filter(([key, {tile, source}]) => {
          if (this.cache.has(key) || failed.has(key)) return false;
          const dependency = source === "full" ? tile.id : tile.parentId;
          return !dependency || this.cache.has(keyOf(dependency, "sample"));
        });
        // Establish root coverage, then spend I/O on the most useful eligible
        // operation globally; distant branches cannot delay nearby detail.
        requests.sort((a,b) => Number(!!a[1].tile.parentId || a[1].source === "full") -
          Number(!!b[1].tile.parentId || b[1].source === "full") ||
          plan.priority(b[1].tile) - plan.priority(a[1].tile) || a[0].localeCompare(b[0]));
        if (!requests.length) break;
        const [key, { tile, source }] = requests[0];
        const count = (source === "full" ? tile.fullPointCount : tile.sampledPointCount) || 0;
        // Packed coordinates/classes: 25 bytes; CPU picking + GPU: 32 bytes.
        // Reserve the complete render budget plus the next read before allocating.
        const cacheBytes = [...this.cache.values()].reduce((n,d) => n + d.pointCount*25, 0);
        if (cacheBytes + count*25 + plan.budget*57 > this.memoryBudgetBytes) { failed.add(key); continue; }
        const epoch = this.epoch;
        let record;
        try { record = count ? await this.read(tile.id, source) : { points: null }; }
        catch (error) { console.warn("LOD payload read failed", tile.id, error); failed.add(key); continue; }
        if (epoch !== this.epoch) { failed.clear(); continue; }
        // Reads cannot always be cancelled in IndexedDB. Only adopt a result if
        // the latest camera still needs it, preventing stale uploads and starvation.
        if (!this.required.has(key)) continue;
        if (!record || (count && !record.points)) { failed.add(key); continue; }
        this.cache.set(key, { id: tile.id, source, points: record.points, pointCount: count,
          renderKey: `${tile.id}:${source}:${count}` });
        this.commit();
        await this.yieldFrame();
      }
    }
  }
  const api = { LodStreamer, projectScreenBounds, thinPoints };
  if (typeof module !== "undefined") module.exports = api;
  scope.PointScapeLodStreaming = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
