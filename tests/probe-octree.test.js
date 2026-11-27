const test = require("node:test");
const assert = require("node:assert/strict");
const { Octree, Limit, faces, viewProjection } = require("../pointscape-probe-octree.js");
const { compare } = require("../pointscape-probe-ssim.js");

const resolution = 32;
const nodes = [
  { id: "root", depth: 0, childIds: ["middle"], pointCount: 1 },
  { id: "middle", parentId: "root", depth: 1, childIds: ["detail"], pointCount: 1 },
  { id: "detail", parentId: "middle", depth: 2, childIds: [], pointCount: 1 },
];

function image(withDetail = false) {
  const pixels = new Uint8Array(resolution ** 2 * 4);
  pixels.set([180, 180, 180, 255], 4 * (resolution * 10 + 10));
  if (withDetail) pixels.set([250, 250, 250, 255], 4 * (resolution * 16 + 18));
  return pixels;
}

function configure(options = {}, visible = () => false, hierarchy = nodes) {
  const captures = [];
  const tree = new Octree({ min: [-4, -4, -4], max: [4, 4, 4] }, {
    resolution, threshold: 0.97, maxDepth: 1, maxSize: 8,
    lookahead: 2, faceBudget: 1600, imageBudget: 32 * 1024 ** 2, representation: "points", ...options,
  }, {
    async *prepare() { return hierarchy; },
    async render(position, face, selection) {
      const detail = selection.nodes.some(node => node.id === "detail");
      captures.push({ position, face, detail });
      return image(detail && visible(position, face));
    },
    async compare(a, b) { return compare(a, b, resolution); },
  });
  return { tree, captures };
}

async function collect(generator) {
  const events = [];
  for await (const event of generator) events.push(event);
  return events;
}

test("the six projection faces share a 90° frustum and use the requested eye", () => {
  const eye = [2, -3, 4];
  const transform = (matrix, p) => Array.from({ length: 4 }, (_, row) =>
    matrix[row] * p[0] + matrix[row + 4] * p[1] + matrix[row + 8] * p[2] + matrix[row + 12]);
  for (const { direction, up } of faces) {
    const matrix = viewProjection(eye, direction, up, 0.1, 30);
    const center = transform(matrix, eye.map((value, axis) => value + direction[axis] * 5));
    const top = transform(matrix, eye.map((value, axis) => value + (direction[axis] + up[axis]) * 5));
    assert.ok(Math.abs(center[0]) < 1e-12 && Math.abs(center[1]) < 1e-12);
    assert.ok(Math.abs(center[3] - 5) < 1e-12);
    assert.ok(Math.abs(top[1] / top[3] - 1) < 1e-12);
  }
});

test("SSIM excludes remote black background and uses occupied pixels from either image", () => {
  const blank = new Uint8Array(resolution ** 2 * 4);
  const reference = image();
  assert.equal(compare(blank, blank, resolution).score, null);
  assert.equal(compare(reference, reference, resolution).score, 1);
  const missing = compare(reference, blank, resolution);
  assert.ok(missing.score < 0.05);
  assert.equal(missing.score, compare(blank, reference, resolution).score);
  assert.ok(missing.error.some(Boolean));
  assert.equal(missing.error[0], 0);
  const blackGeometry = blank.slice();
  blackGeometry[4 * (resolution * 10 + 10) + 3] = 255;
  assert.equal(compare(blackGeometry, blank, resolution).score, 1);
});

test("a flat reference resolves in seven cubemaps and validates five diagonal and two reserved poses", async () => {
  const { tree, captures } = configure({}, () => false, [{ ...nodes[0], childIds: [] }]);
  await collect(tree.generate());
  assert.equal(tree.root.status, "accepted");
  assert.equal(tree.root.probes.length, 7);
  assert.equal(captures.length, 42);
  assert.equal(tree.acceptedAt([1, 0, 0]), tree.root);
  assert.equal(tree.acceptedAt([8, 0, 0]), null);
  const events = await collect(tree.validate(tree.root));
  assert.match(tree.root.validation.reason, /1\.0000.*Cumple/);
  assert.equal(tree.root.validation.probes.filter(probe => /Diagonal/.test(probe.label)).length, 5);
  assert.equal(events.filter(event => event.phase === "validation").length, 42);
});

test("lookahead reaches detail invisible at the previous level before pruning", async () => {
  const { tree } = configure({}, (position, face) => position.every(value => value === 0) && face === 0);
  const events = await collect(tree.generate());
  assert.equal(tree.root.status, "accepted");
  assert.deepEqual(tree.root.selection.nodes.map(node => node.id), ["root", "middle", "detail"]);
  assert.ok(events.some(event => event.phase === "refine" && event.match?.score < tree.options.threshold));
});

test("a failed face creates eight cells, inherits parent poses and reuses shared reference and candidate faces", async () => {
  const isVisible = (position, face) => position[0] === 4 && position[1] === 0 && position[2] === 0 && face === 1;
  const { tree } = configure({}, isVisible);
  await collect(tree.generate());
  assert.equal(tree.root.status, "split");
  assert.match(tree.root.reason, /La cara −X \(\+X\) no alcanza el umbral/);
  assert.equal(tree.root.children.length, 8);
  assert.ok(tree.root.children.every(cell => cell.probes.length >= 8 &&
    cell.probes.some(probe => probe.pose === tree.root.probes[0].pose && probe.reusedFaces === 6)));
  const [first, second] = tree.root.children;
  const shared = first.probes.find(probe => probe.label === "+X");
  const partner = second.probes.find(probe => probe.label === "−X");
  assert.equal(shared.pose, partner.pose);
  assert.equal(partner.reusedFaces, 6);
  assert.equal(shared.matches[0].candidate, partner.matches[0].candidate);
  assert.equal(tree.acceptedAt([2, -2, -2]), null);
  assert.ok(tree.acceptedAt([-2, -2, -2]));
});

test("a shared probe uses the selection of the cell explicitly inspected", async () => {
  const { tree } = configure({ maxSize: 4 }, () => false);
  await collect(tree.generate());
  const [left, right] = tree.root.children;
  const leftFace = left.probes.find(probe => probe.label === "+X");
  const rightFace = right.probes.find(probe => probe.label === "−X");
  assert.equal(leftFace.pose, rightFace.pose);
  assert.equal(tree.acceptedAt(leftFace.pose.position), right);
  assert.equal(tree.acceptedForProbe(left, leftFace), left);
  assert.equal(tree.acceptedForProbe(right, rightFace), right);
  right.status = "pending";
  assert.equal(tree.acceptedForProbe(right, rightFace), null);
  assert.equal(tree.acceptedForProbe(left, leftFace), left);
});

test("face, depth, and reference limits keep unverified cells pending", async () => {
  const budget = configure({ faceBudget: 2 });
  await collect(budget.tree.generate());
  assert.equal(budget.tree.root.status, "pending");
  assert.match(budget.tree.root.reason, /Presupuesto de caras/);
  assert.equal(budget.tree.renders, 2);
  const depth = configure({ maxDepth: 0, maxSize: 2 });
  await collect(depth.tree.generate());
  assert.equal(depth.tree.root.status, "pending");
  assert.match(depth.tree.root.reason, /Profundidad máxima.*Lado máximo/);
  const reference = configure();
  reference.tree.prepare = async function* () { throw new Limit("Límite de puntos de referencia"); };
  await collect(reference.tree.generate());
  assert.equal(reference.tree.root.status, "pending");
  assert.equal(reference.tree.renders, 0);
});

test("held-out views can flag an interior failure independently of acceptance", async () => {
  const { tree } = configure({}, (position, face) =>
    position[0] > 0 && position[0] < 4 && position[0] === position[1] && position[1] === position[2] && face === 0);
  await collect(tree.generate());
  assert.equal(tree.root.status, "accepted");
  await collect(tree.validate(tree.root));
  assert.match(tree.root.validation.reason, /Diagonal.*\+X.*Falla/);
});
