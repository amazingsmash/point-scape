(function (scope) {
  function parseObj(text) {
    const coordinates = [];
    const lines = [];
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const [line] of text.replace(/\\[ \t]*\r?\n/g, " ").matchAll(/[^\r\n]+/g)) {
      const content = line.split("#", 1)[0].trim();
      if (!/^[vfl]\s/.test(content)) continue;
      const [type, ...values] = content.split(/\s+/);
      if (type === "v") {
        const point = values.slice(0, 3).map(Number);
        if (point.length !== 3 || !point.every(Number.isFinite)) throw new Error("El OBJ contiene un vértice inválido");
        coordinates.push(...point);
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], point[axis]);
          max[axis] = Math.max(max[axis], point[axis]);
        }
        continue;
      }
      const vertexCount = coordinates.length / 3;
      const vertices = values.map(value => {
        const index = Number(value.split("/", 1)[0]);
        if (!Number.isSafeInteger(index) || index === 0 || index < -vertexCount) {
          throw new Error("El OBJ contiene un índice de vértice inválido");
        }
        return index < 0 ? vertexCount + index : index - 1;
      });
      const edgeCount = type === "f" && vertices.length >= 3 ? vertices.length : vertices.length - 1;
      for (let i = 0; i < edgeCount; i++) lines.push(vertices[i], vertices[(i + 1) % vertices.length]);
    }

    const pointCount = coordinates.length / 3;
    if (!pointCount) throw new Error("El OBJ no contiene vértices");
    if (lines.some(index => index >= pointCount)) throw new Error("El OBJ hace referencia a un vértice que no existe");
    const origin = min.map((value, axis) => value / 2 + max[axis] / 2);
    const scale = Math.max(...min.map((value, axis) => max[axis] - value)) || 1;
    if (!Number.isFinite(scale)) throw new Error("La extensión del OBJ está fuera del rango numérico");
    const positions = Float32Array.from(coordinates, (value, i) => (value - origin[i % 3]) / scale);
    const bounds = { min: min.map((value, axis) => (value - origin[axis]) / scale),
      max: max.map((value, axis) => (value - origin[axis]) / scale) };
    return { positions, edges: Uint32Array.from(lines), origin, scale, bounds };
  }

  function buildOctree(positions, { leafSize = 32, maxDepth = 6 } = {}) {
    const order = Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
    const scratch = new Uint32Array(order.length);
    const half = Math.max(0.5, order.reduce((extent, index) => Math.max(extent,
      Math.abs(positions[index * 3]), Math.abs(positions[index * 3 + 1]), Math.abs(positions[index * 3 + 2])), 0));
    function build(id, depth, start, end, min, max) {
      const count = end - start;
      const node = { id, depth, start, pointCount: count, localBounds: { min, max }, children: [] };
      if (count <= leafSize || depth === maxDepth) return node;

      // Keep disjoint payloads so successive nodes contribute only new vertices.
      node.pointCount = Math.min(256, Math.max(1, Math.floor(count / 4)));
      for (let i = 0; i < node.pointCount; i++) {
        const sample = start + Math.floor((i + 0.5) * count / node.pointCount);
        const previous = order[start + i];
        order[start + i] = order[sample];
        order[sample] = previous;
      }
      const middle = min.map((value, axis) => (value + max[axis]) / 2);
      const octant = index => {
        const offset = order[index] * 3;
        return Number(positions[offset] >= middle[0]) |
          (Number(positions[offset + 1] >= middle[1]) << 1) |
          (Number(positions[offset + 2] >= middle[2]) << 2);
      };
      const firstChild = start + node.pointCount;
      const counts = Array(8).fill(0);
      for (let i = firstChild; i < end; i++) counts[octant(i)]++;
      const offsets = [firstChild];
      for (const size of counts) offsets.push(offsets.at(-1) + size);
      const next = offsets.slice();
      for (let i = firstChild; i < end; i++) scratch[next[octant(i)]++] = order[i];
      order.set(scratch.subarray(firstChild, end), firstChild);
      for (let i = 0; i < 8; i++) {
        if (!counts[i]) continue;
        const low = min.map((value, axis) => i & (1 << axis) ? middle[axis] : value);
        const high = max.map((value, axis) => i & (1 << axis) ? value : middle[axis]);
        node.children.push(build(`${id}.${i + 1}`, depth + 1, offsets[i], offsets[i + 1], low, high));
      }
      return node;
    }
    return { order, root: build("R", 0, 0, order.length, Array(3).fill(-half), Array(3).fill(half)) };
  }

  if (typeof module !== "undefined") module.exports = { parseObj, buildOctree };
  else scope.onmessage = async ({ data: file }) => {
    try {
      const model = parseObj(await file.text());
      const tree = buildOctree(model.positions);
      scope.postMessage({ ...model, ...tree }, [model.positions.buffer, model.edges.buffer, tree.order.buffer]);
    } catch (error) {
      scope.postMessage({ error: error.message });
    }
  };
})(globalThis);
