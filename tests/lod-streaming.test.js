const test = require('node:test');
const assert = require('node:assert/strict');
const { selectActiveTiles } = require('../tile-selection.js');
const { LodStreamer, projectScreenBounds, thinPoints } = require('../pointscape-lod-streaming.js');

const tile = (id, parentId, childIds, cost, priority = 1) => ({ id, parentId, childIds,
  sampledPointCount: cost, priority, depth: parentId ? 1 : 0 });
const selectionOptions = { useAccumulatedLod: true, shouldExpandTile: () => true,
  getTilePointCost: t => t.sampledPointCount, getTilePriority: t => t.priority };

test('M3NO admits the close child even when all siblings cannot fit', () => {
  const records = [tile('r', null, ['near', 'far'], 10), tile('near', 'r', [], 50, 100), tile('far', 'r', [], 50, 1)];
  const result = selectActiveTiles(records, { ...selectionOptions, pointBudget: 60 });
  assert.deepEqual(result.activeTiles.map(t => t.id), ['r', 'near']);
  assert.equal(result.usedPointBudget, 60);
  assert.equal(result.remainingPointBudget, 0);
});

test('full payload competes for remaining display budget instead of taxing every leaf', () => {
  const records = [tile('r', null, ['near', 'far'], 10), { ...tile('near', 'r', [], 10, 100), fullPointCount: 80 },
    { ...tile('far', 'r', [], 10), fullPointCount: 500 }];
  const result = selectActiveTiles(records, { ...selectionOptions, pointBudget: 100,
    getFullPointCost: t => t.fullPointCount, shouldUseFull: t => !!t.fullPointCount });
  assert.deepEqual([...result.nextFullTileIds], ['near']);
  assert.equal(result.activeTiles.length, 3);
});

test('hysteresis retains similar priorities but allows a clearly better branch', () => {
  const records = [tile('r', null, ['a', 'b'], 10), tile('a', 'r', [], 50, 10), tile('b', 'r', [], 50, 11)];
  const options = { ...selectionOptions, pointBudget: 60, previousActiveTileIds: new Set(['r','a']) };
  assert.equal(selectActiveTiles(records, options).activeTiles[1].id, 'a');
  records[2].priority = 20;
  assert.equal(selectActiveTiles(records, options).activeTiles[1].id, 'b');
});

function setup(accumulated = false) {
  const records = [tile('r', null, ['a','b'], 10), tile('a','r',[],20,100), tile('b','r',[],20,1)];
  const pending = [];
  const frames = [];
  const streamer = new LodStreamer({ select: selectActiveTiles,
    read: (id, source) => new Promise(resolve => pending.push({ id, source, resolve })),
    publish: ds => frames.push(ds.map(d => d.id)) });
  const plan = { records, activeTiles: accumulated ? records : records.slice(1), fullIds: new Set(),
    expandedIds: new Set(['r']), accumulated, budget: 50, priority: t => t.priority };
  const resolveNext = async () => { pending.shift().resolve({ points: { test: true } }); await new Promise(resolve => setImmediate(resolve)); };
  return { records, pending, frames, streamer, plan, resolveNext };
}

test('QuadTree retains parent until all children are ready, then swaps atomically', async () => {
  const s = setup();
  const completion = s.streamer.update(s.plan);
  await s.resolveNext();
  assert.deepEqual(s.frames.at(-1), ['r']);
  await s.resolveNext();
  assert.deepEqual(s.frames.at(-1), ['r']);
  await s.resolveNext();
  await completion;
  assert.deepEqual(s.frames.at(-1), ['a','b']);
});

test('new camera discards obsolete in-flight detail and releases old cache', async () => {
  const s = setup(true);
  const completion = s.streamer.update(s.plan);
  await s.resolveNext();
  assert.equal(s.pending[0].id, 'a');
  s.streamer.update({ ...s.plan, activeTiles: [s.records[0]], expandedIds: new Set() });
  await s.resolveNext();
  await completion;
  assert.deepEqual(s.frames.at(-1), ['r']);
  assert.equal(s.streamer.cache.has('a:sample'), false);
});

test('M3NO publishes each ready child without waiting for the entire batch', async () => {
  const s = setup(true);
  const completion = s.streamer.update(s.plan);
  await s.resolveNext();
  await s.resolveNext();
  assert.deepEqual(s.frames.at(-1), ['r','a']);
  await s.resolveNext();
  await completion;
  assert.deepEqual(s.frames.at(-1), ['r','a','b']);
});

test('frustum excludes side/depth boxes and preserves a box crossing the viewport', () => {
  const matrix = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const box = (x,z=0) => [-0.1,0.1].flatMap(dx => [-0.1,0.1].flatMap(y => [-0.1,0.1].map(dz => ({x:x+dx,y,z:z+dz}))));
  assert.equal(projectScreenBounds(box(3), matrix, 100,100).visible, false);
  assert.equal(projectScreenBounds(box(0,3), matrix, 100,100).visible, false);
  assert.equal(projectScreenBounds(box(1), matrix, 100,100).visible, true);
  assert.ok(projectScreenBounds(box(0), matrix, 100,100).area > 0);
});

test('frustum supports separate enter and exit margins at the viewport edge', () => {
  const matrix = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const box = (x) => [-0.01,0.01].flatMap(dx => [-0.01,0.01]
    .flatMap(y => [-0.01,0.01].map(z => ({ x:x+dx, y, z }))));
  assert.equal(projectScreenBounds(box(1.08), matrix, 100, 100, { margin:1.05 }).visible, false);
  assert.equal(projectScreenBounds(box(1.08), matrix, 100, 100, { margin:1.18 }).visible, true);
  const centered = projectScreenBounds(box(0), matrix, 100, 100);
  assert.ok(centered.diagonalPixels > 0);
  assert.ok(centered.widthPixels > 0);
  assert.ok(centered.heightPixels > 0);
  assert.deepEqual(centered.ndcBounds, { minX:-0.01, maxX:0.01, minY:-0.01, maxY:0.01 });
});

test('streamer retains the previous complete frame until its successor is resident', async () => {
  const records = [tile('r',null,['a','b'],10), tile('a','r',[],20,100), tile('b','r',[],20,90)];
  const pending = [];
  const frames = [];
  let now = 0;
  const streamer = new LodStreamer({ select:selectActiveTiles, transitionHoldMs:220, now:() => now,
    setTimer:() => ({ unref() {} }), clearTimer:() => {},
    read:(id,source) => new Promise(resolve => pending.push({ id, source, resolve })),
    publish:ds => frames.push(ds.map(d => d.id)) });
  const plan = activeTiles => ({ records, activeTiles, fullIds:new Set(), expandedIds:new Set(['r']),
    accumulated:true, budget:50, priority:t => t.priority });
  const resolveNext = async () => {
    pending.shift().resolve({ points:{ test:true } });
    await new Promise(resolve => setImmediate(resolve));
  };

  const first = streamer.update(plan([records[0], records[1]]));
  await resolveNext(); await resolveNext(); await first;
  assert.deepEqual(frames.at(-1), ['r','a']);

  const second = streamer.update(plan([records[0], records[2]]));
  assert.deepEqual(frames.at(-1), ['r','a']);
  assert.ok(frames.at(-1).reduce((sum,id) => sum + records.find(tile => tile.id === id).sampledPointCount, 0) <= 50);
  await resolveNext(); await second;
  assert.deepEqual(frames.at(-1), ['r','b']);
});

test('intermediate leaf levels are nested, unique and spatially distributed', () => {
  const points = { pointCount: 100, classifications: new Uint8Array(100),
    lngLatAlt: Float64Array.from({ length: 300 }, (_, i) => Math.floor(i/3)) };
  const small = thinPoints(points, 10), larger = thinPoints(points, 20);
  assert.deepEqual([...small.lngLatAlt], [...larger.lngLatAlt.slice(0,30)]);
  const ids = [...larger.lngLatAlt].filter((_,i) => i%3 === 0);
  assert.equal(new Set(ids).size, 20);
  assert.ok(Math.max(...ids) > 80 && Math.min(...ids) < 20);
});

test('a costly close leaf gets intermediate detail under a tight point limit', () => {
  const records = [tile('r',null,['a'],1000), {...tile('a','r',[],2000,100), fullPointCount:100000}];
  const result = selectActiveTiles(records, { ...selectionOptions, pointBudget: 12000,
    shouldUseFull: t => !!t.fullPointCount, getFullPointCost: t => t.fullPointCount });
  const detail = result.nextFullPointCounts.get('a');
  assert.ok(detail > 2000 && detail < 100000);
  assert.ok(detail + 1000 <= 12000);
});

test('lowering the budget releases detail immediately while retaining root coverage', async () => {
  const s = setup(true);
  const completion = s.streamer.update(s.plan);
  await s.resolveNext(); await s.resolveNext(); await s.resolveNext(); await completion;
  await s.streamer.update({ ...s.plan, budget: 10, activeTiles: [s.records[0]], expandedIds: new Set() });
  assert.deepEqual(s.frames.at(-1), ['r']);
  assert.deepEqual([...s.streamer.cache.keys()], ['r:sample']);
});

test('a dataset reset rejects an old read even when the new dataset reuses its ID', async () => {
  const s = setup(true);
  const old = s.streamer.update(s.plan);
  s.streamer.reset();
  s.streamer.update({ ...s.plan, activeTiles: [s.records[0]], expandedIds: new Set() });
  await s.resolveNext();
  assert.equal(s.streamer.cache.size, 0);
  assert.equal(s.pending[0].id, 'r');
  await s.resolveNext(); await old;
  assert.deepEqual(s.frames.at(-1), ['r']);
});

test('memory reservation prevents starting an unaffordable read', async () => {
  const s = setup();
  s.streamer.memoryBudgetBytes = 1;
  await s.streamer.update(s.plan);
  assert.equal(s.pending.length, 0);
  assert.equal(s.streamer.cache.size, 0);
});
