# PointScape Architecture

This document is the living map of the application. Update it whenever a module
changes responsibilities, new runtime flows are introduced, or old boundaries are
removed.

## Runtime Shape

PointScape is a static browser application served by `server.js`. The browser
owns the map, UI, point-cloud rendering, LAS ingestion, indexing, temporary tile
storage, and adaptive LOD selection. The optional image-impostor disk cache
runs on the local Node server.

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
  The inspector fetches one LAS or COPC node and freezes that view independently
  of map LOD, and builds local metric coordinates and full-node bounds. It never
  loads descendant subtrees. An optional equal-cell grid assists visual density
  inspection. A diagnostics snapshot comes directly from `PointScapeLodSystem`
  and exposes the same projected metric, thresholds, visibility state, hierarchy,
  camera values, and global budget accounting used by selection. GPU
  buffers/context and the node record are released on close;
  generation checks discard responses after close or a new LAS load.

- `index.html`: DOM shell and script loading order.
- `styles.css`: visual styling and responsive layout.
- `script.js`: application composition, MapLibre setup, WebGL rendering, stats,
  camera helpers, and compatibility wrappers while the refactor continues.
- `pointscape-point-sizing.js`: testable perspective-size projection helpers
  mirrored by the point vertex shader.
- `pointscape-ui-controller.js`: `PointScapeUiController`, responsible for UI
  event binding and DOM-to-application action routing.
- `pointscape-data-ingestion.js`: `LasDataIngestionService` for worker-based LAS
  parsing, `VolatileTileStore` for the session-only IndexedDB tile cache, and
  `CopcTileSource` and `CopcDecodePool` for COPC worker requests.
- `pointscape-copc-reader.js` and `copc.worker.js`: recognize COPC file headers,
  read embedded octree pages through file slices or HTTP byte ranges, and decode
  requested LAZ chunks using the bundled WebAssembly decoder.
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
- `pointscape-lod-streaming.js`: prioritized, bounded streaming, sample
  fallback residency, atomic QuadTree swaps, and conservative screen projection.
- `pointscape-image-impostors.js`: captures cropped perspective color and depth,
  manages resident image impostors, and collects per-node GPU timings.
- `pointscape-impostor-disk.js` and `impostor-disk-cache.js`: browser client and
  localhost server for the bounded temporary map-impostor cache.
- `pointscape-probe-octree.js`: camera-cell subdivision, shared probe poses,
  COPC candidate refinement, and SSIM-based decisions.
- `pointscape-probe-renderer.js`: local metric coordinates, WebGL geometry,
  isolated live rendering, and offscreen cubemap faces.
- `pointscape-probe-mode.js` and `pointscape-probes.css`: isolated orbit camera,
  execution controls, comparison history, overlays, and probe inspection.
- `pointscape-probe-ssim.js`: luminance SSIM worker and per-pixel error map.
- `tests/`: Node test suite for algorithms and the localhost cache.

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

Nodes are constructed breadth-first so root and coarse coverage become available
before deep detail. The worker groups completed tiles into device-tier batches
limited by both bytes (4-16 MiB) and record count. At most one batch is committing
to IndexedDB while one bounded batch is assembled; `tiles-saved` acknowledgements
carry a batch ID and apply backpressure before another write starts. The root is
flushed immediately and progressive preview is enabled by default. The final result
contains metadata only. The legacy ArrayBuffer parser remains available for
compatibility but is not the UI file-loading path.

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
eligible representations in visual-priority order, with one LAS read or a
bounded group of COPC reads, and batches uploads into animation frames.
QuadTree parents remain until all required child samples are ready. A completed
read is adopted only if the latest plan still needs it. Dataset epochs reject
all previous-dataset reads. Camera-driven
selection is queued from the custom-layer render after the current MapLibre
matrix is captured; `moveend` requests one final rendered-frame selection.

IndexedDB version 2 stores samples in `tiles` and leaf payloads separately in
`full-payloads`; inspector `getRecord` recombines them on demand. The streamer
reserves packed-cache bytes, in-flight decompression and payload bytes, plus
display/staging allowance before each read.
Its accounting limit is max(128 MiB, display budget * 96 bytes), independently
from the exact draw-point cap. This is allocation accounting, not total browser
RAM measurement. An indivisible read that cannot fit retains sample coverage.

For Mercator views the camera eye is derived from MapLibre's current transform
center distance, world size, pixels per meter, pitch, bearing and terrain elevation.
This avoids the old high-pitch altitude clamp and sea-level-only eye estimate.
The transform units follow the pinned MapLibre 5.24
[Mercator implementation](https://github.com/maplibre/maplibre-gl-js/blob/v5.24.0/src/geo/projection/mercator_transform.ts).

1. The user selects or drops LAS files through the UI.
2. `PointScapeUiController` calls the application action `loadPointCloudFiles`.
3. `loadPointCloudFiles` detects the input format and delegates LAS parsing to `LasDataIngestionService`.
4. `LasDataIngestionService` sends the file handle to `las-index.worker.js`.
5. The worker creates `PointScapeOctreeBuilder` and builds QuadTree or M3NO tile
   records.
6. Tile payloads are stored in `VolatileTileStore` using IndexedDB.
7. Metadata remains in memory as `currentTileIndex`.
8. `PointScapeLodSystem` selects active metadata nodes whenever the camera or
   LOD controls change.
9. Active tile payloads are hydrated from `VolatileTileStore`.
10. The WebGL layer receives renderable tile buffers and draws the point cloud.

### COPC ingestion

The hierarchy worker opens the file and publishes the native root page,
including nodes that refer to unloaded pages. When the LOD selector admits one
of those nodes, the app requests that page and merges its metadata into the
existing index. Exploded View can explicitly resolve all remaining pages.

Selection accumulates parent and child points because they represent distinct
points in a COPC octree. The streamer, inspector and exploded view share a pool
of decoder workers. A worker reads the selected node's compressed byte range
and emits the packed coordinates and classifications used by the renderer.
Obsolete node fetches receive an abort signal. A running decode can finish
before the worker observes cancellation, and the streamer discards its result.
COPC payloads stay in the rendering cache while needed.

### COPC voxel impostors

For a distant level-1 node, the LOD selector may request a voxel representation
and stop refining that branch. The worker decodes the same COPC chunk and
returns one center and dominant classification per occupied cell. The cube
side is the longest node axis in meters divided by 48. WebGL2 draws the
centers as instanced cubes with the same depth and classification passes as
points.

The entry distance is the voxel side times the focal length in CSS pixels
divided by the configured target size. The viewer accounts for vertical
exaggeration and measures from the camera to the nearest part of the node
box. The exit distance is 80% of entry. The streamer keeps the previous
representation until its replacement is ready and continues to budget the
original node cost.

Each tile buffer stores the metres-to-Mercator scale at its geographic anchor.
During rendering, the vertex shader combines that scale, the configured physical
radius, the current projection matrix, framebuffer size, and each point's clip
`w` to obtain its perspective radius. It clamps the result to the configurable
minimum and maximum screen radii and emits a circular point sprite. The maximum
is also constrained by the GPU's advertised point-size range.

### COPC camera-probe octree

A run resolves the COPC hierarchy and decodes all reference nodes within the
configured point budget. The renderer converts the points to local metric
coordinates, gathers their bounds, and expands the camera-position root by
the configured margin. The default reference limit is 4 million points. The
panel allows up to 12 million.

Each camera cell starts with seven poses: the center and six face centers.
Children also receive captured parent poses that they contain. Integer octree
coordinates identify shared poses across depths. Each pose uses six square
90° perspectives on the cardinal axes. Color and depth attachments live in an
offscreen framebuffer, independent of the orbit camera's visible framebuffer.
A pixel-pack buffer and GPU fence defer readback, and the SSIM worker processes
each face after capture. COPC decoding uses the existing worker pool.

The central pose drives candidate construction. The algorithm starts at the
COPC roots and tries cumulative groups of consecutive levels within a branch.
A group is retained when its worst nonempty face changes beyond the configured
SSIM threshold. Ahead-of-time checks of deeper levels catch detail that
coarser levels may omit.

The common candidate is checked against the full-point reference at each
pose. SSIM averages local luminance windows over the expanded union of
occupied pixels. Faces empty in both images are excluded from the worst score.
Reference faces are cached by pose and face. Candidate results also key on the
node selection and representation. A cell is accepted when the worst face
passes and the maximum side-length condition holds. Subdivision keeps earlier
results inspectable. Pending cells and positions outside the root use the
normal COPC LOD path.

The isolated viewport uses a resolved cell's stored selection when the camera
is inside it. Selecting an evaluated probe after generation preserves its exact
position and uses the inspected cell's selection even at a shared boundary.
Choosing another cubemap face changes the orientation at that position. A
separate validation action measures five diagonal and two additional interior
poses using the remaining face budget. Closing the mode or starting a new run
clears the stored probe results.

### Proposed per-probe refinement

The proposed refinement pass starts from the root payload and reads descendant
blocks on demand. Each camera cell would evaluate 15 positions: its eight
corners, six face centers, and center. Each probe would maintain its own last
accepted selection and cubemap. The same loaded COPC block could be tested
across all probes, with bounded block and face caches to reduce repeated
downloads, decompression, and rendering.

A probe would keep a branch when any populated face shows a significant
change. It could prune after consecutive levels make no significant change.
Disagreement among probes would trigger subdivision. Independent reference
checks would measure the visual detail kept by the final selection.

## Ownership Boundaries

- Ingestion owns file-to-worker communication and temporary storage.
- Octree construction owns LAS parsing, CRS interpretation, node generation, and
  sampling policy.
- LOD owns node activation decisions and expansion state.
- UI owns input events and calls named application actions.
- Rendering owns MapLibre/WebGL layer creation, isolated probe rendering, and buffer lifecycle.
- The probe octree owns cell subdivision and the accepted representation for each cell.

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
npm test
```

Add tests around each extracted class as its dependencies become more explicit.
The COPC test uses PDAL's
[`1.2-with-color.copc.laz` fixture](https://github.com/PDAL/PDAL/blob/master/test/data/copc/1.2-with-color.copc.laz).

The synthetic probe fixtures cover a one-cell scene and a narrow aperture.
Probe tests verify 90° face projection, masked SSIM, lookahead through COPC
levels, shared poses and captures, limits, and held-out diagonal measurements.
Image-impostor tests verify reprojection and depth PNG round trips.
