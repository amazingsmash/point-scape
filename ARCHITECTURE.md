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

LOD traversal reserves sample and leaf payload costs before expanding a node;
the default resident payload budget is 500,000 points. Tile selection/fetch work
is serialized so rapid camera events cannot pile up simultaneous payload reads.
The budget is editable in the UI and also applies across multiple root nodes.
During camera motion, every MapLibre render frame requests a fresh selection;
queued selections and missing-node retries have no timer delay.
These are allocation bounds, not browser-wide memory measurements.

LOD refinement uses a global maximum-priority queue ordered by angular node
size, with stable ID ties. It reserves each visible root, then spends the remaining
payload budget on the largest eligible node regardless of input or child order.
QuadTree replaces parents; M3NO retains their disjoint samples. Leaves independently
check the angular threshold before switching from samples to full payloads, with
separate hysteresis state. The storage budget still includes both leaf payloads
because IndexedDB retrieves a whole record.

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
