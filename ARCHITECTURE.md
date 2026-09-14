# PointScape Architecture

This document is the living map of the application. Update it whenever a module
changes responsibilities, new runtime flows are introduced, or old boundaries are
removed.

## Runtime Shape

PointScape is a static browser application served by `server.js`. The browser
owns the map, UI, point-cloud rendering, LAS ingestion, indexing, temporary tile
storage, and adaptive LOD selection.

The application currently uses plain scripts rather than a bundler. Files expose
small namespaces/classes on `window` or `self`, and `script.js` wires those
classes together during startup.

## Main Modules

- `node-inspector.js` / `node-inspector.css`: point picking and isolated node
  inspection. The map layer retains its uploaded interleaved vertex data and
  last render matrix. Picking projects these same vertices, checks clip depth,
  and prefers the frontmost point sprite within a small screen-space tolerance.
  It identifies the rendering node, not an arbitrary containing ancestor.
  Picking resolves cloud-to-cloud depth but does not sample the terrain depth buffer.
  The inspector fetches one IndexedDB record, freezes that view independently
  of map LOD, and builds local metric coordinates and full-node bounds. It never
  loads descendant subtrees. An optional equal-cell grid assists visual density
  inspection. GPU buffers/context and the node record are released on close;
  generation checks discard responses after close or a new LAS load.

- `index.html`: DOM shell and script loading order.
- `styles.css`: visual styling and responsive layout.
- `script.js`: application composition, MapLibre setup, WebGL rendering, stats,
  camera helpers, and compatibility wrappers while the refactor continues.
- `pointscape-ui-controller.js`: `PointScapeUiController`, responsible for UI
  event binding and DOM-to-application action routing.
- `pointscape-data-ingestion.js`: `LasDataIngestionService` for worker-based LAS
  parsing and `VolatileTileStore` for the session-only IndexedDB tile cache.
- `pointscape-octree-builder.js`: `PointScapeOctreeBuilder`, responsible for
  LAS parsing, CRS detection, QuadTree/M3NO tile construction, sampling, and
  transferable result packaging inside the worker.
- `las-index.worker.js`: thin worker transport layer. It receives parse jobs,
  invokes `PointScapeOctreeBuilder`, and posts progress/results back.
- `pointscape-lod-system.js`: `PointScapeLodSystem`, responsible for deciding
  which tile nodes are active from camera state, tile bounds, angular threshold,
  hysteresis, and behind-camera culling.
- `tile-selection.js`: pure traversal helpers used by the LOD system and unit
  tests.
- `pointscape-lod-streaming.js`: prioritized single-read streaming, sample
  fallback residency, atomic QuadTree swaps, and conservative screen projection.
- `tests/`: Node test suite for pure logic.

## Data Flow

### Bounded file ingestion

The UI passes a `File` handle to `LasDataIngestionService`; it does not call
`file.arrayBuffer()`. `PointScapeOctreeBuilder.parseFile` selects a conservative
memory tier from browser device signals, reads 4-16 MiB input slices, extracts
projection VLRs without reading unrelated metadata, and visits one partition at
a time. `las-scratch-store.js` groups bounded reads, writes, and removals for
pending partitions into awaited IndexedDB transactions in a per-tab database.

Each partition is decoded once while its QuadTree reservoir or M3NO cell-center
sample and child partitions are built. Small batched corrections to M3NO flags keep
selected ancestor samples out of descendant samples without another decoding pass.
Leaves retain every valid point and stop at 50,000-200,000 points according to the
memory tier; dense leaves use ordinal subdivision after spatial subdivision reaches
its configured limit. Child staging buffers are released before the next node.
Node metadata is capped at 20,000 entries.

The worker transfers one completed tile and waits for `tiles-saved` from the main
thread after its IndexedDB transaction commits. No unsaved tile queue grows while
storage is slow. The final result contains metadata only. The legacy ArrayBuffer
parser remains available for compatibility but is not the UI file-loading path.

LOD allocates a 1,500,000-point default display budget across all visible roots.
Refinement eligibility and budget priority use the same projected box-diagonal
metric. Its pixel threshold is derived from the angular control and MapLibre's
vertical field of view. Conservative six-plane culling uses separate 5% entry
and 18% exit guard bands, plus 220 ms minimum visible residence. Resident
operations receive 20% priority hysteresis.
M3NO admits children individually while keeping ancestor coverage. QuadTree
replaces complete sibling groups. Leaves compete for quantized intermediate
levels up to full resolution, using a deterministic nested point permutation.

The streamer tracks the latest desired plan separately from resident payloads.
It keeps ancestor samples and the last complete displayed frame for up to 220 ms
while successor payloads arrive, without exceeding the point budget. It reads
one eligible representation at a time in visual-priority order and yields to
animation frames between uploads. QuadTree parents remain until all required
child samples are ready. A completed read is adopted only if the latest plan
still needs it; dataset epochs reject all previous-dataset reads. Camera-driven
selection is queued from the custom-layer render after the current MapLibre
matrix is captured; `moveend` requests one final rendered-frame selection.

IndexedDB version 2 stores samples in `tiles` and leaf payloads separately in
`full-payloads`; inspector `getRecord` recombines them on demand. The streamer
reserves packed-cache bytes plus display/staging allowance before each read.
Its accounting limit is max(128 MiB, display budget * 96 bytes), independently
from the exact draw-point cap. This is allocation accounting, not total browser
RAM measurement. An indivisible read that cannot fit retains sample coverage.

For Mercator views the camera eye is derived from MapLibre's current transform
center distance, world size, pixels per meter, pitch, bearing and terrain elevation.
This avoids the old high-pitch altitude clamp and sea-level-only eye estimate.
The transform units follow the pinned MapLibre 5.24
[Mercator implementation](https://github.com/maplibre/maplibre-gl-js/blob/v5.24.0/src/geo/projection/mercator_transform.ts).

1. The user selects or drops LAS files through the UI.
2. `PointScapeUiController` calls the application action `loadLasFiles`.
3. `loadLasFiles` delegates parsing to `LasDataIngestionService`.
4. `LasDataIngestionService` sends the file buffer to `las-index.worker.js`.
5. The worker creates `PointScapeOctreeBuilder` and builds QuadTree or M3NO tile
   records.
6. Tile payloads are stored in `VolatileTileStore` using IndexedDB.
7. Metadata remains in memory as `currentTileIndex`.
8. `PointScapeLodSystem` selects active metadata nodes whenever the camera or
   LOD controls change.
9. Active tile payloads are hydrated from `VolatileTileStore`.
10. The WebGL layer receives renderable tile buffers and draws the point cloud.

## Ownership Boundaries

- Ingestion owns file-to-worker communication and temporary storage.
- Octree construction owns LAS parsing, CRS interpretation, node generation, and
  sampling policy.
- LOD owns node activation decisions and expansion state.
- UI owns input events and calls named application actions.
- Rendering owns MapLibre/WebGL layer creation, buffer creation, and drawing.

## Refactor Notes

`script.js` is still the composition root and still contains rendering, stats,
camera, CRS helper functions, compatibility wrappers, and an older non-worker LAS
parsing/indexing fallback that is no longer on the active runtime path. Future
refactor passes should keep moving cohesive behavior into classes without
changing the script loading model unless the project adopts a bundler.

Recommended next extractions:

- `PointCloudRenderer` for WebGL layer creation and point buffer lifecycle.
- `MapSceneController` for MapLibre sources, terrain, and camera operations.
- `PointCloudStatsPresenter` for loading/live statistics rendering.
- Shared geometry/CRS utilities used by renderer, LOD, and octree builder.

## Testing

Current tests run with:

```bash
node --test
```

Add tests around each extracted class as its dependencies become more explicit.
