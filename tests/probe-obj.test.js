const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOctree, parseObj } = require("../pointscape-probe-obj.js");
const { faces, frustumCorners, selectAtProbe, viewProjection } = require("../pointscape-probe-octree.js");

test("OBJ retains polygon and line edges with indexed and relative vertices", () => {
  const model = parseObj(`v 1000000 0 0
    v 1000002 0 0
    v 1000000 2 0
    f 1/2/3 2//1 -1
    l -3 -2 -1 # an open polyline`);
  assert.deepEqual([...model.positions], [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0]);
  assert.deepEqual([...model.edges], [0, 1, 1, 2, 2, 0, 0, 1, 1, 2]);
  assert.deepEqual(model.origin, [1000001, 1, 0]);
  assert.throws(() => parseObj("v 0 0 0\nf 1 2 3"), /vértice que no existe/);
});

test("the octree distributes every OBJ vertex to one payload inside its node bounds", () => {
  const positions = Float32Array.from({ length: 600 }, (_, i) => Math.sin(i * 1.71) / 2);
  const { order, root } = buildOctree(positions, { leafSize: 8 });
  const seen = new Set();
  function inspect(node) {
    for (const index of order.subarray(node.start, node.start + node.pointCount)) {
      assert(!seen.has(index));
      seen.add(index);
      const { min, max } = node.localBounds;
      for (let axis = 0; axis < 3; axis++) {
        const value = positions[index * 3 + axis];
        assert(value >= min[axis] && value <= max[axis]);
      }
    }
    node.children.forEach(inspect);
  }
  assert(root.children.length > 1);
  inspect(root);
  assert.equal(seen.size, positions.length / 3);
});

test("a similar node prunes its branch while a change on any face keeps a sibling", async () => {
  const leaf = { id: "leaf", children: [] };
  const redundant = { id: "redundant", children: [{ id: "pruned", children: [] }] };
  const visible = { id: "visible", children: [leaf] };
  const root = { id: "root", children: [redundant, visible] };
  const visited = [];
  const result = await selectAtProbe(root, {
    threshold: 0.98,
    reference: [0, 0, 0, 0, 0, 1],
    signal: new AbortController().signal,
    capture: async nodes => {
      visited.push(nodes.at(-1).id);
      return [0, 0, 0, 0, 0, nodes.includes(visible) ? 1 : 0];
    },
    compare: async (a, b) => a === b ? 1 : 0.72,
    onProgress() {},
  });
  assert.deepEqual(visited, ["root", "redundant", "visible", "leaf"]);
  assert.deepEqual(result.nodes, [root, visible]);
  assert.deepEqual(result.cubemap, [0, 0, 0, 0, 0, 1]);
  assert.equal(result.restored, 0);
});

test("cumulative detail loss restores pruned nodes until every cubemap face passes", async () => {
  const subtle = { weight: 5, children: [] };
  const noticeable = { weight: 17, children: [] };
  const middle = { weight: 11, children: [] };
  const root = { weight: 0, children: [subtle, middle, noticeable] };
  const result = await selectAtProbe(root, {
    threshold: 0.98,
    reference: [0, 0, 0, 0, 0, 33],
    signal: new AbortController().signal,
    capture: async nodes => [0, 0, 0, 0, 0, nodes.reduce((sum, node) => sum + node.weight, 0)],
    compare: async (a, b) => 1 - Math.abs(a - b) / 1000,
    onProgress() {},
  });
  assert.deepEqual(result.nodes, [root, noticeable]);
  assert.equal(result.scores[5], 0.984);
  assert.equal(result.restored, 1);
});

test("correcting the final cubemap reaches descendants of previously pruned nodes", async () => {
  const descendant = { weight: 24, children: [] };
  const branch = { weight: 6, children: [descendant] };
  const root = { weight: 0, children: [branch] };
  const result = await selectAtProbe(root, {
    threshold: 0.98,
    reference: [30, 0, 0, 0, 0, 0],
    signal: new AbortController().signal,
    capture: async nodes => [nodes.reduce((sum, node) => sum + node.weight, 0), 0, 0, 0, 0, 0],
    compare: async (a, b) => 1 - Math.abs(a - b) / 1000,
    onProgress() {},
  });
  assert.deepEqual(result.nodes, [root, branch, descendant]);
  assert.equal(result.scores[0], 1);
});

test("the drawn frustum projects to the near and far corners of each cubemap face", () => {
  const eye = [0.4, -0.2, 0.7];
  for (const face of faces) {
    const matrix = viewProjection(eye, face.direction, face.up, 0.1, 4);
    for (const [index, point] of frustumCorners(eye, face, 0.1, 4).entries()) {
      const clip = [0, 1, 2, 3].map(row => point.reduce((value, component, axis) =>
        value + matrix[axis * 4 + row] * component, matrix[12 + row]));
      for (const [axis, bit] of [1, 2, 4].entries()) {
        assert(Math.abs(clip[axis] / clip[3] - (index & bit ? 1 : -1)) < 1e-9);
      }
    }
  }
});
