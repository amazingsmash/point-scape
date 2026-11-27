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
      actions.syncPointSizingControlsFromConfig();
      actions.syncEdlControlsFromConfig();
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

      const updatePointSizing = () => {
        actions.config.pointRadiusCentimeters = actions.readNumericControl(
          elements.pointRadiusControl,
          actions.config.pointRadiusCentimeters,
        );
        actions.config.pointMinimumRadiusPixels = actions.readNumericControl(
          elements.pointMinRadiusControl,
          actions.config.pointMinimumRadiusPixels,
        );
        actions.config.pointMaximumRadiusPixels = Math.max(
          actions.config.pointMinimumRadiusPixels,
          actions.readNumericControl(
            elements.pointMaxRadiusControl,
            actions.config.pointMaximumRadiusPixels,
          ),
        );
        actions.syncPointSizingControlsFromConfig();
        actions.getMap()?.triggerRepaint();
      };
      elements.pointRadiusControl.addEventListener("input", updatePointSizing);
      elements.pointMinRadiusControl.addEventListener("input", updatePointSizing);
      elements.pointMaxRadiusControl.addEventListener("input", updatePointSizing);

      const updateEdl = () => {
        actions.config.edlEnabled = elements.edlToggle.checked;
        actions.config.edlStrength = actions.readNumericControl(
          elements.edlStrengthControl, actions.config.edlStrength,
        );
        actions.config.edlRadiusPixels = actions.readNumericControl(
          elements.edlRadiusControl, actions.config.edlRadiusPixels,
        );
        actions.config.edlNeighborCount = Number(elements.edlNeighborsControl.value);
        actions.syncEdlControlsFromConfig();
        actions.getMap()?.triggerRepaint();
      };
      elements.edlToggle.addEventListener("change", updateEdl);
      elements.edlStrengthControl.addEventListener("input", updateEdl);
      elements.edlRadiusControl.addEventListener("input", updateEdl);
      elements.edlNeighborsControl.addEventListener("input", updateEdl);

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

      const updateImpostors = () => {
        actions.config.impostorMode = elements.impostorMode.value;
        actions.config.voxelMaxPixels = Number(elements.voxelPixelControl.value);
        actions.config.imageImpostorSize = Number(elements.imageImpostorSize.value);
        elements.voxelPixelValue.textContent = `${actions.config.voxelMaxPixels} px`;
        elements.voxelImpostorControls.hidden = actions.config.impostorMode !== "voxel";
        elements.imageImpostorControls.hidden = actions.config.impostorMode !== "image";
        actions.applyPointCloudTileSelection({ updateStatus: true });
        actions.getMap()?.triggerRepaint();
      };
      elements.impostorMode.addEventListener("change", updateImpostors);
      elements.impostorDebugToggle.addEventListener("change", () => {
        actions.config.impostorDebug = elements.impostorDebugToggle.checked;
        actions.getMap()?.triggerRepaint();
      });
      elements.voxelPixelControl.addEventListener("input", updateImpostors);
      elements.imageImpostorSize.addEventListener("change", updateImpostors);
      const imageNumberControls = [
        [elements.imageImpostorAreaRatio, "imageImpostorAreaRatio"],
        [elements.imageImpostorReuse, "imageImpostorReuse"],
      ];
      for (const [control, key] of imageNumberControls) {
        control.addEventListener("change", () => {
          if (control.value !== "") actions.config[key] = actions.readNumericControl(control, actions.config[key]);
          control.value = actions.config[key];
          actions.getMap()?.triggerRepaint();
        });
      }

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

      const updatePointBudget = () => {
        actions.config.residentPointBudget = Math.max(
          25000,
          Math.round(
            actions.readNumericControl(
              elements.lodPointBudgetControl,
              actions.config.residentPointBudget,
            ) / 25000,
          ) * 25000,
        );
        elements.lodPointBudgetControl.value = String(
          actions.config.residentPointBudget,
        );
        actions.updateLodControlLabels();
        actions.renderPointCloudStats();
        actions.applyPointCloudTileSelection({ updateStatus: true });
      };
      elements.lodPointBudgetControl?.addEventListener("input", updatePointBudget);

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
        const files = actions.getPointCloudFiles(elements.lasFileInput.files);
        if (files.length) {
          actions.loadPointCloudFiles(files);
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
        const files = actions.getPointCloudFiles(event.dataTransfer.files);
        if (files.length) {
          actions.loadPointCloudFiles(files);
        } else {
          elements.lasStatus.textContent =
            "Drop one or more LAS (.las) or COPC (.laz) files.";
        }
      });

      elements.copcDemoButton.addEventListener("click", () => actions.loadCopcDemo("copc"));
      elements.parisDemoButton.addEventListener("click", () => actions.loadCopcDemo("paris"));

      elements.flyToPointCloudButton.addEventListener("click", () => {
        actions.flyToCurrentPointCloud();
      });

      elements.explodedViewButton.addEventListener("click", () => {
        actions.toggleExplodedView();
      });
      elements.explodedDecimationControl.addEventListener("input", () => {
        elements.explodedDecimationValue.textContent =
          `${elements.explodedDecimationControl.value}%`;
      });
      elements.explodedDecimationControl.addEventListener("change", () => {
        actions.config.explodedPointFraction =
          Number(elements.explodedDecimationControl.value) / 100;
        actions.restartExplodedViewLoading();
      });
    }
  }

  globalScope.PointScapeUiController = PointScapeUiController;
})(typeof window !== "undefined" ? window : globalThis);
