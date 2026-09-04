<script lang="ts">
  /**
   * CalibrationCanvas - Svelte 5 runes component
   * Uses vanilla Konva via the use:useKonva action.
   *
   * Redesigned to support sidebar workspace, zoom/pan navigation,
   * draggable line endpoints, and a magnifying loupe tool.
   */
  import { useKonva } from '../actions/useKonva';
  import { untrack } from 'svelte';
  import { createCalibration, createPlaneCalibration, type Calibration, type Unit, type CalibrationType } from '../calibration';
  import { computeHomography, projectPoint } from '../homography';
  import { screenLengthToImage, type Point } from '../geometry';
  import {
    createMeasurement,
    moveMeasurementAnchor,
    recalculateAllMeasurements,
    type Measurement,
  } from '../measurements';
  import { shouldDeleteMeasurementOnKey } from '../keyboard';
  import type {
    CalibrationState,
    MeasurementState,
  } from '../persistence';
  import { shouldClearLiveCalibration } from '../persistence';
  import { getCurrentProjectPath } from '../project';
  import Konva from 'konva';
  import { useCanvasState } from '../composables/useCanvasState.svelte';
  import { useImageManager } from '../composables/useImageManager.svelte';
  import {
    restoreIntoWorkspace,
    useProjectPersistence,
  } from '../composables/useProjectPersistence.svelte';

  import WorkspaceSidebar from './WorkspaceSidebar.svelte';
  import MagnifierLoupe from './MagnifierLoupe.svelte';

  // Props (Svelte 5 runes style)
  interface Props {
    width?: number;
    height?: number;
    /** Background image as data URL (or null for empty) */
    imageDataUrl?: string | null;
    /** Real-world reference length (user input) */
    realWorldLength?: number;
    /** Unit for the reference length */
    unit?: Unit;
    /** Fired when a valid calibration has been computed */
    onCalibrationChange?: (calibration: Calibration | null) => void;
  }

  let {
    width = 800,
    height = 600,
    imageDataUrl = null,
    realWorldLength = $bindable(10),
    unit = $bindable('cm' as Unit),
    onCalibrationChange,
  }: Props = $props();

  // Internal state using Svelte 5 runes
  let referenceStart = $state<Point | null>(null);
  let referenceEnd = $state<Point | null>(null);
  let calibration = $state<Calibration | null>(null);
  let error = $state<string | null>(null);

  // === 3D Perspective Plane Homography ===
  let calibrationType = $state<CalibrationType>('line');
  let realWorldHeight = $state<number>(10);
  let planePoints = $state<Point[]>([]);

  // === Module 4: Measurements ===
  let measurements = $state<Measurement[]>([]);
  let measurementMode = $state(false);
  let mainLayerRef: Konva.Layer | null = null;
  let selectedMeasurementId = $state<string | null>(null);
  let containerEl = $state<HTMLDivElement | null>(null);

  const view = useCanvasState();
  const persist = useProjectPersistence();
  const images = useImageManager({
    getMainLayer: () => mainLayerRef,
    getCanvasSize: () => ({ width: view.canvasWidth, height: view.canvasHeight }),
    fitToImage: (size) => view.fitImageToCanvas(size, () => redrawMeasurements()),
    flashStatus: (message, timeoutMs) => persist.flashStatus(message, timeoutMs),
  });

  $effect(() => {
    const el = containerEl;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]!.contentRect;
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w > 0 && h > 0 && (w !== view.canvasWidth || h !== view.canvasHeight)) {
        view.resizeStage(w, h);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  });

  // Derived: whether we have a complete reference line/plane
  const hasReferenceLine = $derived(
    calibrationType === 'line'
      ? (referenceStart !== null && referenceEnd !== null)
      : (planePoints.length === 4)
  );

  // Module 7: Current project filename for display
  const currentProjectName = $derived(getCurrentProjectPath()?.split('/').pop() ?? null);

  // Derived: can we compute calibration?
  const canCalibrate = $derived(
    calibrationType === 'line'
      ? (hasReferenceLine && typeof realWorldLength === 'number' && realWorldLength > 0)
      : (planePoints.length === 4 && typeof realWorldLength === 'number' && realWorldLength > 0 && typeof realWorldHeight === 'number' && realWorldHeight > 0)
  );

  // Whenever inputs that affect calibration change, try to recompute
  $effect(() => {
    if (canCalibrate) {
      try {
        if (calibrationType === 'line') {
          if (referenceStart && referenceEnd) {
            const newCalib = createCalibration(
              referenceStart,
              referenceEnd,
              realWorldLength,
              unit
            );
            calibration = newCalib;
            error = null;
            onCalibrationChange?.(newCalib);
          }
        } else {
          if (planePoints.length === 4) {
            const newCalib = createPlaneCalibration(
              planePoints,
              realWorldLength,
              realWorldHeight,
              unit
            );
            calibration = newCalib;
            error = null;
            onCalibrationChange?.(newCalib);
          }
        }
      } catch (e) {
        error = e instanceof Error ? e.message : 'Failed to compute calibration';
        calibration = null;
        onCalibrationChange?.(null);
      }
    } else {
      const geometryEmpty =
        referenceStart === null && referenceEnd === null && planePoints.length === 0;
      if (shouldClearLiveCalibration(canCalibrate, geometryEmpty, calibration !== null)) {
        calibration = null;
        onCalibrationChange?.(null);
      }
    }
  });

  function handleReferenceLineComplete(start: Point, end: Point) {
    referenceStart = start;
    referenceEnd = end;
  }

  function handlePlanePointAdded(pos: Point) {
    if (planePoints.length < 4) {
      planePoints = [...planePoints, pos];
      redrawMeasurements();
    }
  }

  function clearReferenceLine() {
    referenceStart = null;
    referenceEnd = null;
    planePoints = [];
    calibration = null;
    error = null;
    measurements = [];
    measurementMode = false;
    selectedMeasurementId = null;
    onCalibrationChange?.(null);
    redrawMeasurements();
  }

  function handleMeasurementLineComplete(start: Point, end: Point) {
    if (!calibration) return;

    const measurement = createMeasurement(start, end, calibration);
    measurements = [...measurements, measurement];
    selectedMeasurementId = null; // clear selection when drawing new one
    redrawMeasurements();
  }

  function toggleMeasurementMode() {
    if (!calibration) return;
    measurementMode = !measurementMode;
  }

  function clearMeasurements() {
    measurements = [];
    selectedMeasurementId = null;
    redrawMeasurements();
  }

  function deleteMeasurementById(id: string) {
    measurements = measurements.filter(m => m.id !== id);
    if (selectedMeasurementId === id) {
      selectedMeasurementId = null;
    }
    redrawMeasurements();
  }

  function resetZoomPan() {
    view.resetZoomPan(() => redrawMeasurements());
  }

  function fitImageToCanvas() {
    const img = images.currentKonvaImage?.image() as HTMLImageElement | null;
    view.fitImageToCanvas(
      {
        width: img?.naturalWidth || images.imageWidth,
        height: img?.naturalHeight || images.imageHeight,
      },
      () => redrawMeasurements()
    );
  }

  function handleSaveProject() {
    persist.handleSaveProject(() => ({
      imagePath: images.currentImagePath,
      calibration,
      measurements,
      referenceStart,
      referenceEnd,
      planePoints,
      realWidth: realWorldLength,
      realHeight: calibrationType === 'plane' ? realWorldHeight : null,
    }));
  }

  function handleLoadProject() {
    persist.handleLoadProject((restored) => {
      applyRestoredWorkspace(restored);
    });
  }

  function handleExportMeasurements() {
    persist.handleExportMeasurements(measurements, calibration);
  }

  // Public API for parent / tests
  export function getReferenceLine() {
    return referenceStart && referenceEnd
      ? { start: referenceStart, end: referenceEnd }
      : null;
  }

  export function getCurrentCalibration() {
    return calibration;
  }

  export function getMeasurements() {
    return measurements;
  }

  export function getSelectedMeasurementId() {
    return selectedMeasurementId;
  }

  export function loadImage(pathOrDataUrl: string) {
    images.loadImage(pathOrDataUrl);
  }

  if (typeof window !== 'undefined') {
    (window as any).__e2e = (window as any).__e2e || {};
    (window as any).__e2e.loadImage = loadImage;
  }

  function applyRestoredWorkspace(restored: ReturnType<typeof restoreIntoWorkspace>) {
    measurementMode = false;
    selectedMeasurementId = null;
    calibrationType = restored.calibrationType;
    referenceStart = restored.referenceStart;
    referenceEnd = restored.referenceEnd;
    planePoints = restored.planePoints;
    if (restored.realWidth != null && restored.realWidth > 0) {
      realWorldLength = restored.realWidth;
    }
    if (restored.realHeight != null && restored.realHeight > 0) {
      realWorldHeight = restored.realHeight;
    }
    if (restored.unit) {
      unit = restored.unit;
    }
    calibration = restored.calibration;
    measurements = restored.measurements;
    redrawMeasurements();

    if (restored.imagePath) {
      try {
        images.loadImage(restored.imagePath);
      } catch (e) {
        console.warn('Failed to load project image:', e);
        images.rememberPath(restored.imagePath);
      }
    }
  }

  export function loadProjectState(data: {
    calibration?: CalibrationState | null;
    measurements?: MeasurementState[];
    imagePath?: string | null;
  }) {
    applyRestoredWorkspace(restoreIntoWorkspace(data));
  }

  // Draw or update all measurement lines + labels on the Konva layer
  function redrawMeasurements() {
    const layer = mainLayerRef;
    if (!layer) return;

    const viewPx = (screen: number) => screenLengthToImage(screen, view.stageScale || 1);
    const handleRadius = viewPx(7);
    const labelFont = viewPx(13);
    const labelLift = viewPx(12);

    // Remove previous visual nodes
    const childrenToRemove = layer.getChildren((node: any) =>
      node.name && (
        node.name().startsWith('measurement-') ||
        node.name().startsWith('reference-')
      )
    );
    childrenToRemove.forEach((c: any) => c.destroy());

    // 1. Draw persistent Reference Line or Plane
    if (calibrationType === 'line') {
      if (referenceStart && referenceEnd) {
        const refLine = new Konva.Line({
          name: 'reference-line',
          points: [referenceStart.x, referenceStart.y, referenceEnd.x, referenceEnd.y],
          stroke: '#ff5722', // vibrant orange
          strokeWidth: 3,
          strokeScaleEnabled: false,
          dash: [6, 4],
          lineCap: 'round',
        });
        layer.add(refLine);

        const midX = (referenceStart.x + referenceEnd.x) / 2;
        const midY = (referenceStart.y + referenceEnd.y) / 2 - labelLift;
        const refLabel = new Konva.Text({
          name: 'reference-label',
          text: `Referenz: ${realWorldLength} ${unit}`,
          x: midX,
          y: midY,
          fontSize: labelFont,
          fontStyle: 'bold',
          fill: '#ff5722',
          align: 'center',
        });
        layer.add(refLabel);

        // Create draggable endpoint anchors
        const refAnchorStart = new Konva.Circle({
          name: 'reference-anchor-start',
          x: referenceStart.x,
          y: referenceStart.y,
          radius: handleRadius,
          fill: '#ffffff',
          stroke: '#ff5722',
          strokeWidth: 2,
          strokeScaleEnabled: false,
          draggable: true,
        });

        const refAnchorEnd = new Konva.Circle({
          name: 'reference-anchor-end',
          x: referenceEnd.x,
          y: referenceEnd.y,
          radius: handleRadius,
          fill: '#ffffff',
          stroke: '#ff5722',
          strokeWidth: 2,
          strokeScaleEnabled: false,
          draggable: true,
        });

        // Bind drag events
        refAnchorStart.on('dragstart', () => {
          view.isDraggingAnchor = true;
          view.updateLoupeFromAnchor(refAnchorStart);
        });
        refAnchorStart.on('dragmove', () => {
          const pos = refAnchorStart.position();
          refLine.points([pos.x, pos.y, refAnchorEnd.x(), refAnchorEnd.y()]);
          const mx = (pos.x + refAnchorEnd.x()) / 2;
          const my = (pos.y + refAnchorEnd.y()) / 2 - labelLift;
          refLabel.position({ x: mx, y: my });
          view.updateLoupeFromAnchor(refAnchorStart);
          layer.batchDraw();
        });
        refAnchorStart.on('dragend', () => {
          const pos = refAnchorStart.position();
          referenceStart = { x: pos.x, y: pos.y };
          view.isDraggingAnchor = false;
          view.loupeVisible = false;
        });

        refAnchorEnd.on('dragstart', () => {
          view.isDraggingAnchor = true;
          view.updateLoupeFromAnchor(refAnchorEnd);
        });
        refAnchorEnd.on('dragmove', () => {
          const pos = refAnchorEnd.position();
          refLine.points([refAnchorStart.x(), refAnchorStart.y(), pos.x, pos.y]);
          const mx = (refAnchorStart.x() + pos.x) / 2;
          const my = (refAnchorStart.y() + pos.y) / 2 - labelLift;
          refLabel.position({ x: mx, y: my });
          view.updateLoupeFromAnchor(refAnchorEnd);
          layer.batchDraw();
        });
        refAnchorEnd.on('dragend', () => {
          const pos = refAnchorEnd.position();
          referenceEnd = { x: pos.x, y: pos.y };
          view.isDraggingAnchor = false;
          view.loupeVisible = false;
        });

        layer.add(refAnchorStart);
        layer.add(refAnchorEnd);
      }
    } else {
      // plane mode
      if (planePoints.length > 0) {
        // Draw connecting lines between points
        const flatPoints = planePoints.flatMap(p => [p.x, p.y]);
        const refPolygon = new Konva.Line({
          name: 'reference-plane-polygon',
          points: flatPoints,
          stroke: '#ff5722',
          strokeWidth: 2.5,
          strokeScaleEnabled: false,
          dash: [5, 3],
          closed: planePoints.length === 4,
          lineCap: 'round',
        });
        layer.add(refPolygon);

        // Draw grid overlay if calibrated
        if (planePoints.length === 4 && calibration && calibration.type === 'plane') {
          const dstPoints = [
            { x: 0, y: 0 },
            { x: realWorldLength, y: 0 },
            { x: realWorldLength, y: realWorldHeight },
            { x: 0, y: realWorldHeight },
          ];
          try {
            const pixelH = computeHomography(dstPoints, planePoints);
            const divisions = 5;
            for (let i = 1; i < divisions; i++) {
              const t = i / divisions;
              // Horizontal grid lines
              const realY = realWorldHeight * t;
              const pStart = projectPoint({ x: 0, y: realY }, pixelH);
              const pEnd = projectPoint({ x: realWorldLength, y: realY }, pixelH);
              const gridLineH = new Konva.Line({
                name: 'reference-grid',
                points: [pStart.x, pStart.y, pEnd.x, pEnd.y],
                stroke: 'rgba(255, 87, 34, 0.25)',
                strokeWidth: 1.5,
                strokeScaleEnabled: false,
              });
              layer.add(gridLineH);

              // Vertical grid lines
              const realX = realWorldLength * t;
              const pVStart = projectPoint({ x: realX, y: 0 }, pixelH);
              const pVEnd = projectPoint({ x: realX, y: realWorldHeight }, pixelH);
              const gridLineV = new Konva.Line({
                name: 'reference-grid',
                points: [pVStart.x, pVStart.y, pVEnd.x, pVEnd.y],
                stroke: 'rgba(255, 87, 34, 0.25)',
                strokeWidth: 1.5,
                strokeScaleEnabled: false,
              });
              layer.add(gridLineV);
            }
          } catch (e) {
            console.error('Failed to draw perspective grid:', e);
          }
        }

        // Draw anchors for placed points
        planePoints.forEach((pt, index) => {
          const anchor = new Konva.Circle({
            name: `reference-anchor-plane-${index}`,
            x: pt.x,
            y: pt.y,
            radius: handleRadius,
            fill: '#ffffff',
            stroke: '#ff5722',
            strokeWidth: 2,
            strokeScaleEnabled: false,
            draggable: planePoints.length === 4,
          });

          if (planePoints.length === 4) {
            anchor.on('dragstart', () => {
              view.isDraggingAnchor = true;
              view.updateLoupeFromAnchor(anchor);
            });
            anchor.on('dragmove', () => {
              const pos = anchor.position();
              // Update polygon points interactively
              const updatedPoints = [...planePoints];
              updatedPoints[index] = { x: pos.x, y: pos.y };
              refPolygon.points(updatedPoints.flatMap(p => [p.x, p.y]));
              view.updateLoupeFromAnchor(anchor);
              layer.batchDraw();
            });
            anchor.on('dragend', () => {
              const pos = anchor.position();
              planePoints[index] = { x: pos.x, y: pos.y };
              view.isDraggingAnchor = false;
              view.loupeVisible = false;
              // Recalibrate and redraw
              redrawMeasurements();
            });
          }

          layer.add(anchor);
        });
      }
    }

    if (!calibration) {
      layer.draw();
      return;
    }

    // 2. Draw Measurement Lines
    measurements.forEach((m, index) => {
      const isSelected = m.id === selectedMeasurementId;

      const line = new Konva.Line({
        name: `measurement-${m.id}`,
        points: [m.start.x, m.start.y, m.end.x, m.end.y],
        stroke: isSelected ? '#f59e0b' : '#3b82f6',
        strokeWidth: isSelected ? 3 : 2,
        strokeScaleEnabled: false,
        lineCap: 'round',
      });

      const midX = (m.start.x + m.end.x) / 2;
      const midY = (m.start.y + m.end.y) / 2 - labelLift;

      const label = new Konva.Text({
        name: `measurement-${m.id}-label`,
        text: `${m.realLength.toFixed(2)} ${m.unit}`,
        x: midX,
        y: midY,
        fontSize: labelFont,
        fill: isSelected ? '#f59e0b' : '#3b82f6',
        fontStyle: isSelected ? 'bold' : 'normal',
        align: 'center',
      });

      const selectThis = () => {
        selectedMeasurementId = m.id;
        redrawMeasurements();
      };

      line.on('click', selectThis);
      label.on('click', selectThis);

      layer.add(line);
      layer.add(label);

      // If selected, add draggable endpoints
      if (isSelected) {
        const anchorStart = new Konva.Circle({
          name: `measurement-anchor-start-${m.id}`,
          x: m.start.x,
          y: m.start.y,
          radius: handleRadius,
          fill: '#ffffff',
          stroke: '#f59e0b',
          strokeWidth: 2,
          strokeScaleEnabled: false,
          draggable: true,
        });

        const anchorEnd = new Konva.Circle({
          name: `measurement-anchor-end-${m.id}`,
          x: m.end.x,
          y: m.end.y,
          radius: handleRadius,
          fill: '#ffffff',
          stroke: '#f59e0b',
          strokeWidth: 2,
          strokeScaleEnabled: false,
          draggable: true,
        });

        anchorStart.on('dragstart', () => {
          view.isDraggingAnchor = true;
          view.updateLoupeFromAnchor(anchorStart);
        });
        anchorStart.on('dragmove', () => {
          const pos = anchorStart.position();
          const start = { x: pos.x, y: pos.y };
          const end = { x: anchorEnd.x(), y: anchorEnd.y() };
          line.points([start.x, start.y, end.x, end.y]);
          const mx = (start.x + end.x) / 2;
          const my = (start.y + end.y) / 2 - labelLift;
          label.position({ x: mx, y: my });
          const preview = moveMeasurementAnchor(m, calibration!, 'start', start);
          label.text(`${preview.realLength.toFixed(2)} ${preview.unit}`);
          view.updateLoupeFromAnchor(anchorStart);
          layer.batchDraw();
        });
        anchorStart.on('dragend', () => {
          const pos = anchorStart.position();
          measurements = measurements.map(item =>
            item.id === m.id
              ? moveMeasurementAnchor(item, calibration!, 'start', { x: pos.x, y: pos.y })
              : item
          );
          view.isDraggingAnchor = false;
          view.loupeVisible = false;
        });

        anchorEnd.on('dragstart', () => {
          view.isDraggingAnchor = true;
          view.updateLoupeFromAnchor(anchorEnd);
        });
        anchorEnd.on('dragmove', () => {
          const pos = anchorEnd.position();
          const start = { x: anchorStart.x(), y: anchorStart.y() };
          const end = { x: pos.x, y: pos.y };
          line.points([start.x, start.y, end.x, end.y]);
          const mx = (start.x + end.x) / 2;
          const my = (start.y + end.y) / 2 - labelLift;
          label.position({ x: mx, y: my });
          const preview = moveMeasurementAnchor(m, calibration!, 'end', end);
          label.text(`${preview.realLength.toFixed(2)} ${preview.unit}`);
          view.updateLoupeFromAnchor(anchorEnd);
          layer.batchDraw();
        });
        anchorEnd.on('dragend', () => {
          const pos = anchorEnd.position();
          measurements = measurements.map(item =>
            item.id === m.id
              ? moveMeasurementAnchor(item, calibration!, 'end', { x: pos.x, y: pos.y })
              : item
          );
          view.isDraggingAnchor = false;
          view.loupeVisible = false;
        });

        layer.add(anchorStart);
        layer.add(anchorEnd);
      }
    });

    layer.draw();
  }

  // When calibration changes, recalculate all existing measurements (reactivity!)
  $effect(() => {
    const currentCalibration = calibration;
    if (currentCalibration) {
      untrack(() => {
        if (measurements.length > 0) {
          measurements = recalculateAllMeasurements(measurements, currentCalibration);
          redrawMeasurements();
        }
      });
    }
  });

  // Module 10: Keyboard deletion of selected measurement
  function handleKeyDown(e: KeyboardEvent) {
    if (!shouldDeleteMeasurementOnKey(e, selectedMeasurementId)) return;
    e.preventDefault();
    deleteMeasurementById(selectedMeasurementId!);
  }

  // Attach global key listener for deletion
  $effect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });

  function onKonvaReady(stage: import('konva/lib/Stage').Stage) {
    view.attachStage(stage);

    if (containerEl) {
      const rect = containerEl.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w > 0 && h > 0) {
        view.resizeStage(w, h);
      }
    }

    const mainLayer = (stage as any).mainLayer ?? stage.getLayers()[0];
    mainLayerRef = mainLayer;

    if (imageDataUrl) {
      images.loadImageIntoLayer(imageDataUrl);
    }
  }
</script>

<div class="workspace-layout">
  <WorkspaceSidebar
    bind:realWorldLength
    bind:unit
    calibration={calibration}
    bind:measurements
    bind:selectedMeasurementId
    bind:calibrationType
    bind:realWorldHeight
    {planePoints}
    currentProjectName={currentProjectName}
    currentImagePath={images.currentImagePath}
    saveStatus={persist.saveStatus}
    hasReferenceLine={hasReferenceLine}
    onSaveProject={handleSaveProject}
    onLoadProject={handleLoadProject}
    onExportMeasurements={handleExportMeasurements}
    onLoadImage={images.handleLoadImage}
    onLoadTestImage={images.loadTestImage}
    onClearReferenceLine={clearReferenceLine}
    onSelectMeasurement={(id) => { selectedMeasurementId = id; redrawMeasurements(); }}
    onDeleteMeasurement={deleteMeasurementById}
  />

  <main class="canvas-container-outer">
    <div class="canvas-header-toolbar">
      <div class="toolbar-title">Arbeitsbereich</div>
      <div class="toolbar-actions">
        {#if calibration}
          <div class="measurement-tools">
            <button
              class="btn-tool"
              class:active={measurementMode}
              onclick={toggleMeasurementMode}
            >
              {measurementMode ? 'Messungen abschließen' : 'Messung hinzufügen'}
            </button>
          </div>
        {/if}
        {#if images.currentKonvaImage}
          <button class="btn-tool btn-tool-reset" onclick={fitImageToCanvas}>
            Bild einpassen
          </button>
        {/if}
        <button class="btn-tool btn-tool-reset" onclick={resetZoomPan}>
          Reset Ansicht
        </button>
      </div>
    </div>

    <div class="canvas-stage-wrapper" bind:this={containerEl}>
      <div
        use:useKonva={{
          width: view.canvasWidth,
          height: view.canvasHeight,
          onReady: onKonvaReady,
          onReferenceLineComplete: handleReferenceLineComplete,
          measurementMode,
          onMeasurementLineComplete: handleMeasurementLineComplete,
          onStageTransform: view.handleStageTransform,
          onDrawingPointerMove: view.handleDrawingPointerMove,
          calibrationType,
          onPlanePointAdded: handlePlanePointAdded,
        }}
        class="konva-container"
        data-testid="konva-container"
        style="width: {view.canvasWidth}px; height: {view.canvasHeight}px; cursor: {measurementMode ? 'crosshair' : 'default'};"
      ></div>

      <MagnifierLoupe
        imageSrc={images.loadedImageSrc}
        pointerX={view.loupePointerX}
        pointerY={view.loupePointerY}
        imageX={images.imageX}
        imageY={images.imageY}
        imageWidth={images.imageWidth}
        imageHeight={images.imageHeight}
        stageScale={view.stageScale}
        stageX={view.stageX}
        stageY={view.stageY}
        visible={view.loupeVisible}
      />
    </div>

    <div class="canvas-footer-hint">
      {#if images.currentKonvaImage}
        <span class="footer-zoom-info">🔍 {Math.round(view.stageScale * 100)}%</span>
        <span class="footer-sep">|</span>
        <span class="footer-zoom-info">{(images.currentKonvaImage.image() as HTMLImageElement)?.naturalWidth ?? '?'}×{(images.currentKonvaImage.image() as HTMLImageElement)?.naturalHeight ?? '?'} px</span>
        <span class="footer-sep">|</span>
      {/if}
      <kbd>Leertaste</kbd> gedrückt halten + Ziehen zum Verschieben &bull; Mausrad zum Zoomen
    </div>
  </main>
</div>

<style>
  .workspace-layout {
    display: flex;
    flex-direction: row;
    height: 100vh;
    width: 100vw;
    background-color: var(--bg-app);
  }

  .canvas-container-outer {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    position: relative;
    box-sizing: border-box;
  }

  .canvas-header-toolbar {
    height: 56px;
    padding: 0 20px;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-panel);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    z-index: 5;
    box-sizing: border-box;
  }

  .toolbar-title {
    font-family: var(--font-heading);
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .toolbar-actions {
    display: flex;
    gap: 10px;
  }

  .btn-tool {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-element);
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn-tool:hover {
    background: var(--bg-element-hover);
    border-color: var(--text-secondary);
  }
  .btn-tool.active {
    background: var(--brand);
    color: white;
    border-color: var(--brand);
  }

  .btn-tool-reset {
    background: transparent;
  }

  .canvas-stage-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
    overflow: hidden;
    position: relative;
  }

  .konva-container {
    background: #0d0f12;
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
    border-radius: 4px;
  }

  .canvas-footer-hint {
    height: 32px;
    background: var(--bg-panel);
    border-top: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: var(--text-muted);
    box-sizing: border-box;
  }

  .canvas-footer-hint kbd {
    background: var(--bg-element);
    border: 1px solid var(--border-subtle);
    padding: 1px 4px;
    border-radius: 3px;
    color: var(--text-secondary);
    margin: 0 2px;
  }

  .canvas-footer-hint .footer-sep {
    margin: 0 6px;
    color: var(--border-subtle);
  }

  .canvas-footer-hint .footer-zoom-info {
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
</style>
