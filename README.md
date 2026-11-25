# PointScape

PointScape is a web application for visualizing LAS and COPC LiDAR point clouds on an interactive map centered on Las Palmas de Gran Canaria. It combines 3D terrain, camera controls, and a WebGL point-cloud viewer that runs directly in the browser.

The goal is to provide a technical and academic demonstrator for real-time point-cloud indexing and visualization. The application is intentionally lightweight and does not require a processing backend: LAS files are selected locally and the heavier work runs in the client.

## Authorship

Developed by **Jose Miguel Santana Nunez** in 2026.

The project is associated with the **University of Las Palmas de Gran Canaria (ULPGC)** and the **School of Computer Engineering (EII)**.

Repository: <https://github.com/amazingsmash/point-scape>

## Main Features

- Interactive map powered by MapLibre GL JS.
- Satellite imagery and street-map base layers.
- Terrain support, hillshading, and vertical exaggeration.
- Local loading of LAS and COPC, with automatic format detection for COPC files.
- Direct reuse of the COPC octree and on-demand LAZ chunk decoding.
- Progressive COPC hierarchy loading, with prioritized parallel decoding.
- Optional voxel impostors for distant COPC children of the root.
- WebGL visualization of points over the map.
- Coloring by LAS classification.
- Eye-Dome Lighting (EDL) depth shading with live strength, sample radius,
  direction-count, and on/off controls.
- Perspective point sizing with controls for physical radius, minimum screen
  radius, maximum screen radius, vertical offset, and depth advantage.
- Selectable LAS indexing mode: QuadTree or M3NO.
- Adaptive level-of-detail loading.
- Optional display of loaded node bounds and tile labels.
- Point-cloud statistics after loading.
- `Fly To Point Cloud` camera action.
- `Exploded View` animates tree levels vertically, outlines every indexed node,
  and loads points from every node independently of LOD. The point fraction is
  adjustable (10% by default); leaves use their full point payload and internal
  nodes use their stored samples.
- Corporate splash screen on startup.
- GitHub repository shortcut in the interface.

## Requirements

- Node.js.
- A modern browser with WebGL support.
- Internet access for external libraries and map tiles.

There are no npm dependencies to install in this repository. The local server uses built-in Node.js modules, while the viewer libraries are loaded from CDNs.

## Running the Project

From the project root:

```bash
npm start
```

The application will be available at:

```text
http://127.0.0.1:5173/
```

The host and port can also be changed with environment variables:

```bash
HOST=127.0.0.1 PORT=5173 npm start
```

On Windows, the repository also includes `lanzar.cmd` and `lanzar.ps1` as convenient launchers.

## Basic Usage

1. Open the application in the browser.
2. Wait for the splash screen to fade out.
3. Use the side panel to choose the base map, terrain, camera, and LOD parameters.
4. Drag LAS (`.las`) or COPC (`.copc.laz`, `.laz`, `.copc`) files into the drop zone or click it to select files. COPC uses the octree embedded in the file.
5. Review the generated statistics and use `Fly To Point Cloud` to center the camera on the loaded data.
6. Once indexing finishes, set the `Exploded View points` percentage and click
   `Exploded View` to inspect the hierarchy. Click `Normal View` to restore LOD.

Local point cloud files stay in the browser. For COPC, PointScape reads the embedded hierarchy and decompresses individual nodes as the view needs them. COPC on the map requires a horizontal coordinate system declared in WKT and supported by Proj4.

### COPC demo

Click **Load COPC demo · Autzen Stadium** or open [the local COPC demo](http://127.0.0.1:5173/?demo=copc). PointScape opens the public Autzen Stadium cloud through HTTP byte ranges and moves the camera to its location. Zoom in to see the existing octree supply more detailed nodes. The source file contains 10,653,336 points. [COPC example data](https://copc.io/#example-data)

### COPC voxel impostors

In **Point cloud → COPC voxel impostors**, toggle the experiment or adjust the
target projected voxel size. At the default of 5 pixels, each visible level-1
node uses an occupied voxel grid once its estimated cell size reaches that
screen size. The viewer switches back to points below 80% of the entry
distance. The panel reports the estimated distances for the current viewport.
Statistics report the rendered cubes, the source points they represent, and
the difference. The percentage is relative to the points in the replaced nodes.

**Load COPC demo · Paris** (or [the local Paris demo](http://127.0.0.1:5173/?demo=paris))
opens a 16,339,239-point tile from IGN's LiDAR HD program around the Eiffel Tower.
Zoom out to see the impostors and zoom in to see the ground and buildings as
points. [IGN LiDAR HD](https://geoservices.ign.fr/lidarhd)

The [local Millsite demo](http://127.0.0.1:5173/?demo=millsite) opens the
374,609,447-point USGS sample for comparison. All demos read HTTP byte ranges
on demand. [Millsite COPC](https://s3.amazonaws.com/hobu-lidar/millsite.copc.laz)

### COPC loading performance

PointScape can draw the cloud after reading the root hierarchy page. It requests
more pages when the camera needs those branches. Two workers decode selected
nodes in parallel on devices reporting at least four logical processors. The
streamer prioritizes coverage and visible detail, cancels obsolete node
requests, and groups GPU uploads across frames. Exploded View can discover the
complete hierarchy on demand.

One comparison in the same Windows browser timed the first cloud frame from
opening each file and the time from the end of the second zoom-in to the
requested detail being ready. Final views matched across configurations
(1,490,890 rendered points in Paris and 1,367,600 in Millsite). Times depend on
the range server, browser cache, and machine.

| Hierarchy and workers | Paris first frame | Paris detail | Millsite first frame | Millsite detail |
| --- | ---: | ---: | ---: | ---: |
| Complete hierarchy, 1 worker | 2.73 s | 17.50 s | 22.90 s | 30.90 s |
| Progressive, 1 worker | 2.66 s | 17.60 s | 1.98 s | 19.60 s |
| Progressive, 2 workers (default) | 2.13 s | 4.32 s | 2.40 s | 17.10 s |
| Progressive, 4 workers | 1.71 s | 5.13 s | 2.95 s | 13.70 s |

The timings appear under **Point cloud stats → Timing**. To repeat the
comparison, open a demo with `copcWorkers=1`, `copcWorkers=2`, or
`copcWorkers=4`. Add `copcHierarchy=eager` to read the complete hierarchy
before displaying points.

## Project Structure

### Inspect an individual node

Right-click a displayed cloud point (or left-click/tap on iPad), then choose
**Inspeccionar nodo en 3D**. The isolated view has a black background and shows
the complete node box, so empty regions are not cropped away. Drag to orbit,
use the wheel/pinch to zoom, or choose **Planta**, **Frontal**, and **Encajar**.
Arrow keys rotate; plus/minus zoom. An optional **Retícula 4 × 4 × 4** divides
the node into equal cells for visual comparison of point concentrations.

The initial dataset matches the picked point's rendered node representation.
For leaves, **Datos** switches between the node sample and all leaf points.
Internal-node samples do not include descendant payloads; this is stated in the
inspector. It displays original elevations without map terrain exaggeration,
uniform XYZ scale, orthographic projection, and uniform point coloring. The
selected point is highlighted yellow. Close or Escape returns to the map.
This is a visual inspection tool, not an automatic statistical homogeneity test.

The side panel captures the node's current LOD decision and its inputs: frustum
and stabilized visibility, projected rectangle/area/diagonal, physical and
projected-equivalent angles, FOV and focal length, angular/pixel thresholds,
hysteresis, point costs, used/remaining global budget, hierarchy, and camera pose.

Only one stored node is fetched; closing releases its data and WebGL resources.

Choose **Ver texturas del nodo** from the same point menu to generate and compare
the selected node's 1024 × 1024 classification color and depth textures. Both use
the same orthographic view aligned with the map camera at selection. Depth is
linear in metres from the near plane, and empty texels are transparent in both
previews. To select with the keyboard, focus the map, position a point at the
center, press Enter, then use Tab to choose the texture option.

```text
.
|-- index.html               # Interface structure
|-- styles.css               # Visual styles and responsive layout
|-- script.js                # Application composition, map setup, rendering, and compatibility wrappers
|-- pointscape-ui-controller.js     # UI event binding and action routing
|-- pointscape-data-ingestion.js    # LAS worker orchestration and volatile tile storage
|-- pointscape-octree-builder.js    # QuadTree/M3NO construction used by the worker
|-- pointscape-lod-system.js        # Active node selection and LOD state
|-- tile-selection.js        # Pure tile traversal and camera-culling helpers
|-- las-index.worker.js      # Thin worker transport for LAS indexing/processing
|-- ARCHITECTURE.md          # Living architecture notes for ongoing refactors
|-- server.js                # Local static server in Node.js
|-- package.json             # Start script
|-- lanzar.cmd               # Windows launcher
|-- lanzar.ps1               # PowerShell launcher
`-- Real-time indexing...pdf # Related academic document
```

## Technical Architecture

The application is deliberately simple to deploy: `server.js` serves static files, and the browser runs all interactive logic.

The main flow is:

1. `index.html` loads the interface and styles.
2. `script.js` composes the application classes and loads MapLibre GL JS.
3. `PointScapeUiController` binds controls and forwards user actions.
4. When LAS files are loaded, `LasDataIngestionService` sends them to the worker.
5. `PointScapeOctreeBuilder` builds QuadTree or M3NO node records inside the worker.
6. `VolatileTileStore` keeps tile payloads in a temporary IndexedDB database.
7. `PointScapeLodSystem` selects active nodes from camera state, distance, and LOD thresholds.
8. A custom WebGL layer renders the point cloud above the map.

Point sprites use a physical radius in centimetres. The vertex shader converts
that radius to local Mercator units and projects it using each vertex's clip-space
depth, so nearby points grow and distant points shrink. Minimum and maximum
screen-radius clamps keep distant samples legible and prevent close points from
covering the view. The defaults are 8 cm, 0.75 px minimum, and 24 px maximum.

Eye-Dome Lighting renders the cloud into an auxiliary depth target, then compares
each visible point pixel with nearby depth samples. A nearby point closer to the
eye darkens a deeper pixel, making ridges and recesses easier to read without point
normals. The regular map depth pass still decides whether terrain or map content
occludes a point. The **Visual effects** section exposes the effect toggle,
strength, sampling radius in screen pixels, and number of directions. Increasing
the radius or direction count can make contours more apparent at a higher GPU
cost. The technique follows the depth-neighborhood response described in
[Potree's EDL shader](https://github.com/potree/potree/blob/develop/src/materials/shaders/edl.fs).

The application uses a volatile IndexedDB database (`pointscape-volatile-tiles`) to manage tiles during the current session. This information is temporary and is rebuilt when data is loaded again.

## Data and Privacy

PointScape is designed to work with local LAS files. The browser reads the files selected by the user and processes them on the user's machine.

The application does request external resources for:

- MapLibre GL JS.
- Proj4.
- Base-map tiles.
- Terrain or remote source resources.
- Institutional logos loaded from public URLs.

If a fully offline mode is required, those dependencies should be packaged locally and the map sources should be configured accordingly.

## Attribution

- **Project author:** Jose Miguel Santana Nunez.
- **Institution:** University of Las Palmas de Gran Canaria.
- **School:** School of Computer Engineering.
- **Mapping and rendering:** MapLibre GL JS.
- **Coordinate transformations:** Proj4js.
- **Base cartography:** the external sources configured in the application, including OpenStreetMap for the street map and remote tile services for imagery/terrain.
- **LiDAR data:** the LAS files loaded by the user. Authorship, licensing, and usage terms depend on each original data provider.
- **ULPGC logo:** institutional mark of the University of Las Palmas de Gran Canaria.
- **EII/ULPGC logo:** institutional mark of the School of Computer Engineering at ULPGC.
- **GitHub icon:** GitHub mark, used as a link to the project repository.

All institutional and commercial marks belong to their respective owners. This repository does not claim ownership over those marks.

## Known Limitations

### Large LAS files and tablet memory

File loading uses an external-memory index builder. The worker chooses a 64-256 MiB
working tier from the browser's available device signals, reads 4-16 MiB slices,
keeps one node's sample in memory, and writes pending partitions to a temporary
IndexedDB database in bounded batches. It builds breadth-first, flushes the root
immediately for progressive display, and groups later nodes into 4-16 MiB output
batches. Only one batch can be writing while one bounded batch is prepared, so a
slow store cannot create an unbounded queue. Leaves contain at most
50,000-200,000 full-resolution points according to that tier, including dense or
coincident data. All valid source points remain in leaf storage.

LOD uses a default 1,500,000-point drawing budget, changed immediately by **Max
points on screen**. A common projected screen-size metric determines refinement
and where detail is most valuable. Entry/exit visibility margins, minimum
residence, and a short last-frame hold prevent camera-edge and loading flicker.
M3NO loads children independently; leaves have intermediate density levels.
Less relevant detail collapses to ancestor samples to make room for nearby detail.
QuadTree keeps parent coverage until its replacement children are ready.
Reads are prioritized individually and reevaluated against the latest camera.
Samples and full-resolution leaves are fetched separately from IndexedDB.
A separate allocation allowance bounds cached payloads and upload staging; it
does not measure or guarantee total browser RAM. Disk speed and GPU upload time
still limit convergence, and extremely small budgets can omit entire roots.

Indexing needs temporary device storage. Each partition is decoded once; M3NO only
revisits the small set of temporary blocks containing its final cell samples. A
20,000-node guard limits metadata growth and reports an error for larger indexes.
The **Consola JS** button reports phases, saved
progress, and the peak accounted I/O buffer bytes; this counter excludes JavaScript
objects, browser internals, map textures, and GPU allocations. Temporary partitions
are cleared after completion and at the next load after a page crash.

- LAS files are supported; compressed LAZ files are not currently supported.
- Performance depends on point-cloud size, available memory, and the user's GPU.
- Some resources require Internet access.
- CRS definitions may depend on remote sources when reprojection is needed.
- The local server is not intended as a production server and does not implement authentication.

## Development

The project does not use a bundler or frontend framework. To modify it:

- Edit `index.html` for structural changes.
- Edit `styles.css` for visual changes.
- Edit `script.js` for composition, map setup, and rendering logic.
- Edit `pointscape-ui-controller.js` for interface event binding.
- Edit `pointscape-data-ingestion.js` for LAS ingestion or temporary tile storage.
- Edit `pointscape-octree-builder.js` for QuadTree/M3NO indexing logic.
- Edit `pointscape-lod-system.js` for active node selection and LOD policy.
- Edit `las-index.worker.js` only for worker message transport.

After touching JavaScript, a useful quick check is:

```bash
node --check script.js
```

## Possible Future Improvements

- LAZ support.
- Local packaging of libraries and assets for offline use.
- Optional persistence of indexes between sessions.
- Exportable loading statistics.
- More symbology controls for LAS classifications.
- Configurable cartographic sources.
- Automated tests for parsing, indexing, and tile selection.

## License

The project source code is released under the MIT License. See `LICENSE` for the full license text.

Copyright (c) 2026 Jose Miguel Santana Nunez.

Data, logos, maps, and external libraries keep their own licenses and usage terms.
