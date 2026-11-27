const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createRangeReader, hasCopcSignature, openCopc } = require("../pointscape-copc-reader.js");
const { selectActiveTiles } = require("../tile-selection.js");

test("COPC uses the original octree and decodes the requested LAZ chunk on demand", async () => {
  const context = vm.createContext({ console, TextDecoder, importScripts() {} });
  context.self = context;
  context.location = { href: "http://localhost/copc.worker.js" };
  const vendor = name => path.join(__dirname, "../vendor", name);
  vm.runInContext(fs.readFileSync(vendor("copc-runtime.js"), "utf8"), context);
  const { Copc, proj4, createLazPerf } = context.PointScapeCopcVendor;

  const file = fs.readFileSync(path.join(__dirname, "fixtures/1.2-with-color.copc.laz"));
  assert.equal(hasCopcSignature(file.subarray(0, 429)), true);
  assert.equal(hasCopcSignature(file.subarray(0, 428)), false);
  const bytesWithoutCopc = Buffer.from(file.subarray(0, 429));
  bytesWithoutCopc.fill(0, 377, 393);
  assert.equal(hasCopcSignature(bytesWithoutCopc), false);

  const getBytes = createRangeReader(new Blob([file]));
  const header = await Copc.create(getBytes);
  const { nodes } = await Copc.loadHierarchyPage(getBytes, header.info.rootHierarchyPage);
  const rootChunk = nodes["0-0-0-0"];
  const ranges = [];
  const dataset = await openCopc({
    Copc, proj4, fileIndex: 3, fileName: "1.2-with-color.copc.laz",
    read: (begin, end) => {
      ranges.push([begin, end]);
      return getBytes(begin, end);
    },
  });
  const { tiles, sourcePointCount, pointBounds } = dataset.metadata;
  assert.ok(pointBounds.minZ < pointBounds.maxZ);
  assert.ok(pointBounds.minX < pointBounds.maxX && pointBounds.minY < pointBounds.maxY);
  assert.equal(sourcePointCount, 1065);
  assert.equal(tiles.length, 65);
  assert.equal(tiles.reduce((total, tile) => total + tile.sampledPointCount, 0), sourcePointCount);
  const root = tiles.find(tile => !tile.parentId);
  assert.equal(root.id, "copc:3:0-0-0-0");
  assert.equal(root.sampledPointCount, 24);
  assert.equal(root.childIds.length, 4);
  for (const id of root.childIds) assert.equal(tiles.find(tile => tile.id === id).parentId, root.id);
  const chunkRange = [rootChunk.pointDataOffset, rootChunk.pointDataOffset + rootChunk.pointDataLength];
  assert.equal(ranges.some(([start, end]) => start === chunkRange[0] && end === chunkRange[1]), false);

  const lazPerf = await createLazPerf({ wasmBinary: fs.readFileSync(vendor("laz-perf.wasm")) });
  const record = await dataset.readTile(root.id, () => lazPerf);
  assert.deepEqual(ranges.at(-1), chunkRange);
  assert.equal(record.points.pointCount, 24);
  const [longitude, latitude, elevation] = record.points.lngLatAlt;
  assert.ok(Math.abs(longitude - (-117.231264)) < 0.00001);
  assert.ok(Math.abs(latitude - 49.341496) < 0.00001);
  assert.ok(Math.abs(elevation - 163.0104) < 0.001);
  assert.equal(record.points.classifications[0], 1);

  const lasRoot = { id: "las", childIds: ["las-child"], sampledPointCount: 10 };
  const lasChild = { id: "las-child", parentId: "las", sampledPointCount: 30 };
  const selection = selectActiveTiles([...tiles, lasRoot, lasChild], {
    accumulatesChildren: tile => tile.format === "copc",
    getTilePointCost: tile => tile.sampledPointCount,
    shouldExpandTile: tile => !tile.parentId,
  });
  const selected = new Set(selection.activeTiles.map(tile => tile.id));
  assert.ok(selected.has(root.id) && root.childIds.every(id => selected.has(id)));
  assert.ok(selected.has(lasChild.id) && !selected.has(lasRoot.id));
});

test("COPC opens from the root page and resolves only the requested branch", async () => {
  const context = vm.createContext({ TextDecoder, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../vendor/copc-runtime.js"), "utf8"), context);
  const { Copc, proj4 } = context.PointScapeCopcVendor;
  const file = fs.readFileSync(path.join(__dirname, "fixtures/1.2-with-color.copc.laz"));
  const read = createRangeReader(new Blob([file]));
  const copc = await Copc.create(read);
  const native = await Copc.loadHierarchyPage(read, copc.info.rootHierarchyPage);
  const root = "0-0-0-0";
  const left = "1-0-0-0";
  const right = "1-1-0-0";
  const leaf = "2-0-0-0";
  const nodes = native.nodes;
  const leftPage = { pageOffset: 64, pageLength: 32 };
  const rightPage = { pageOffset: 96, pageLength: 32 };
  const offsets = [];
  const source = {
    async create() {
      const pointCount = [root, left, right, leaf].reduce((sum, key) => sum + nodes[key].pointCount, 0);
      return { ...copc, header: { ...copc.header, pointCount } };
    },
    async loadHierarchyPage(_get, page) {
      offsets.push(page.pageOffset);
      if (page.pageOffset === leftPage.pageOffset) {
        return { nodes: { [left]: nodes[left], [leaf]: nodes[leaf] }, pages: {} };
      }
      if (page.pageOffset === rightPage.pageOffset) return { nodes: { [right]: nodes[right] }, pages: {} };
      return { nodes: { [root]: nodes[root] }, pages: { [left]: leftPage, [right]: rightPage } };
    },
  };
  const dataset = await openCopc({ Copc: source, proj4, read, fileIndex: 0, fileName: "split.copc.laz",
    progressive: true });
  assert.deepEqual(offsets, [copc.info.rootHierarchyPage.pageOffset]);
  assert.deepEqual([...dataset.metadata.tiles].map(tile => [tile.id, tile.hierarchyPending]),
    [[`copc:0:${root}`, false], [`copc:0:${left}`, true], [`copc:0:${right}`, true]]);

  const request = dataset.loadHierarchy(`copc:0:${left}`);
  assert.equal(dataset.loadHierarchy(`copc:0:${left}`), request);
  const patch = await request;
  assert.deepEqual(offsets, [copc.info.rootHierarchyPage.pageOffset, leftPage.pageOffset]);
  assert.deepEqual(patch.find(tile => tile.id === `copc:0:${left}`).childIds, [`copc:0:${leaf}`]);
  assert.ok(patch.every(tile => !tile.hierarchyPending));

  const tiles = await dataset.loadAllHierarchy(4);
  assert.equal(offsets.at(-1), rightPage.pageOffset);
  assert.equal(tiles.length, 4);
  assert.ok(tiles.every(tile => !tile.hierarchyPending));
});
