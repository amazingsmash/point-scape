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
