# PointScape

PointScape is a web application for visualizing LiDAR point clouds in LAS format on top of an interactive map centered on Las Palmas de Gran Canaria. The project combines web mapping, 3D terrain, camera controls, and a custom WebGL point-cloud viewer that can load, classify, index, and explore points directly in the browser.

The goal is to provide a technical and academic demonstrator for real-time point-cloud indexing and visualization. The application is intentionally lightweight and does not require a processing backend: LAS files are selected locally and the heavier work runs in the client.

## Authorship

Developed by **Jose Miguel Santana Nunez** in 2026.

The project is associated with the **University of Las Palmas de Gran Canaria (ULPGC)** and the **School of Computer Engineering (EII)**.

Repository: <https://github.com/amazingsmash/point-scape>

## Main Features

- Interactive map powered by MapLibre GL JS.
- Satellite imagery and street-map base layers.
- Terrain support, hillshading, and vertical exaggeration.
- Local loading of one or more `.las` files.
- WebGL visualization of points over the map.
- Coloring by LAS classification.
- Controls for point size, vertical offset, and depth advantage.
- Selectable indexing mode: QuadTree or M3NO.
- Adaptive level-of-detail loading.
- Optional display of loaded node bounds and tile labels.
- Point-cloud statistics after loading.
- `Fly To Point Cloud` camera action.
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
4. Drag `.las` files into the drop zone or click it to select files.
5. Review the generated statistics and use `Fly To Point Cloud` to center the camera on the loaded data.

LAS files are processed locally in the browser. They are not uploaded to any server.

## Project Structure

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
