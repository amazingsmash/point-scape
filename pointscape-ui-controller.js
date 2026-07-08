(function initPointScapeUiController(globalScope) {
  class PointScapeUiController {
    constructor({ elements, actions }) {
      this.elements = elements;
      this.actions = actions;
      this.isBound = false;
    }

    bind() {
      if (this.isBound) {
        return;
      }

      this.isBound = true;
      const elements = this.elements;
      const actions = this.actions;

      actions.renderClassificationLegend();
      actions.syncLodControlsFromConfig();
      actions.renderPointCloudStats();

      elements.menuToggle.addEventListener("click", () => {
        const isOpen = elements.menuToggle.getAttribute("aria-expanded") === "true";
        elements.menuToggle.setAttribute("aria-expanded", String(!isOpen));
        elements.menuContent.hidden = isOpen;
      });

      elements.baseLayerInputs.forEach((input) => {
        input.addEventListener("change", () => {
          if (input.checked) {
            actions.setBaseLayer(input.value);
          }
        });
      });

      elements.terrainToggle.addEventListener("change", () => {
        actions.setElevationEnabled(elements.terrainToggle.checked);
      });

      elements.pitchControl.addEventListener("input", () => {
        const pitch = Number(elements.pitchControl.value);
        elements.pitchValue.textContent = `${pitch}\u00b0`;
        actions.getMap()?.easeTo({
          pitch,
          duration: 120,
        });
      });

      elements.terrainExaggerationControl.addEventListener("input", () => {
        const exaggeration = actions.getTerrainExaggeration();
        elements.terrainExaggerationValue.textContent = `${exaggeration.toFixed(1)}x`;

        if (elements.terrainToggle.checked) {
          actions.applyTerrainExaggeration();
          actions.refreshPointCloudElevation();
          actions.refreshTileBounds();
          actions.updateDetailBoxesLayer();
        }
      });

      elements.pointOffsetControl.addEventListener("input", () => {
        const offset = actions.getPointCloudOffsetMeters();
        elements.pointOffsetValue.textContent = `${offset.toFixed(offset % 1 ? 1 : 0)} m`;
        actions.refreshPointCloudElevation();
        actions.refreshTileBounds();
        actions.updateDetailBoxesLayer();
      });

      elements.pointSizeControl.addEventListener("input", () => {
        const size = actions.getPointSizePixels();
        elements.pointSizeValue.textContent = `${size.toFixed(size % 1 ? 1 : 0)} px`;
        actions.getMap()?.triggerRepaint();
      });

      elements.blockBoundsToggle.addEventListener("change", () => {
        actions.setBlockBoundsVisible(elements.blockBoundsToggle.checked);
        actions.renderPointCloudStats();
      });

      elements.blockDetailsToggle.addEventListener("change", () => {
        actions.setBlockDetailsVisible(elements.blockDetailsToggle.checked);
      });

      elements.lodDetailBoxesToggle?.addEventListener("change", () => {
        actions.updateDetailBoxesLayer();
      });

      elements.randomizeClassificationColorsButton?.addEventListener("click", () => {
        actions.randomizeLasClassColors();
      });

      elements.fullResolutionToggle.addEventListener("change", () => {
        actions.applyPointCloudTileSelection({ updateStatus: true });
      });

      elements.lodScreenDiagonalControl?.addEventListener("input", () => {
        actions.config.fullResolutionAngularDiagonalDegrees = actions.readNumericControl(
          elements.lodScreenDiagonalControl,
          actions.config.fullResolutionAngularDiagonalDegrees,
        );
        actions.updateLodControlLabels();
        actions.applyPointCloudTileSelection({ updateStatus: true });
      });

      elements.lodHysteresisControl?.addEventListener("input", () => {
        actions.config.tileCollapseHysteresisRatio = actions.readNumericControl(
          elements.lodHysteresisControl,
          actions.config.tileCollapseHysteresisRatio,
        );
        actions.updateLodControlLabels();
        actions.applyPointCloudTileSelection({ updateStatus: true });
      });

      elements.tileMinDiagonalControl?.addEventListener("change", () => {
        actions.config.tileMinDiagonalMeters = Math.max(
          1,
          Math.round(
            actions.readNumericControl(
              elements.tileMinDiagonalControl,
              actions.config.tileMinDiagonalMeters,
            ),
          ),
        );
        elements.tileMinDiagonalControl.value = String(
          actions.config.tileMinDiagonalMeters,
        );
        actions.renderPointCloudStats();
      });

      elements.tileMaxDepthControl?.addEventListener("change", () => {
        actions.config.tileMaxDepth = Math.max(
          1,
          Math.round(
            actions.readNumericControl(
              elements.tileMaxDepthControl,
              actions.config.tileMaxDepth,
            ),
          ),
        );
        elements.tileMaxDepthControl.value = String(actions.config.tileMaxDepth);
        actions.renderPointCloudStats();
      });

      elements.depthBiasControl.addEventListener("input", () => {
        elements.depthBiasValue.textContent = actions.getDepthBias().toFixed(4);
        actions.getMap()?.triggerRepaint();
      });

      elements.lasFileInput.addEventListener("change", () => {
        const files = actions.getLasFiles(elements.lasFileInput.files);
        if (files.length) {
          actions.loadLasFiles(files);
        }
      });

      ["dragenter", "dragover"].forEach((eventName) => {
        elements.lasDrop.addEventListener(eventName, (event) => {
          event.preventDefault();
          elements.lasDrop.classList.add("is-dragging");
        });
      });

      ["dragleave", "drop"].forEach((eventName) => {
        elements.lasDrop.addEventListener(eventName, (event) => {
          event.preventDefault();
          elements.lasDrop.classList.remove("is-dragging");
        });
      });

      elements.lasDrop.addEventListener("drop", (event) => {
        const files = actions.getLasFiles(event.dataTransfer.files);
        if (files.length) {
          actions.loadLasFiles(files);
        } else {
          elements.lasStatus.textContent =
            "Drop one or more files with the .las extension.";
        }
      });

      elements.flyToPointCloudButton.addEventListener("click", () => {
        actions.flyToCurrentPointCloud();
      });
    }
  }

  globalScope.PointScapeUiController = PointScapeUiController;
})(typeof window !== "undefined" ? window : globalThis);
