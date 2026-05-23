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
  import type { Point } from '../geometry';
  import {
    createMeasurement,
    recalculateAllMeasurements,
    type Measurement,
  } from '../measurements';
  import type {
    CalibrationState,
    MeasurementState,
  } from '../persistence';
  import { calibrationToState, stateToCalibration, measurementsToState } from '../persistence';
  import { getCurrentProjectPath } from '../project';
  import { convertFileSrc } from '@tauri-apps/api/core';
  import Konva from 'konva';
  import { createTestCalibrationImage } from '../testImage';
  
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
  let mainLayerRef: any = null; // reference to Konva layer for drawing measurement visuals

  // Module 8: Image handling
  let currentImagePath = $state<string | null>(null);
  let currentKonvaImage = $state<Konva.Image | null>(null);

  // Module 10: Measurement selection
  let selectedMeasurementId = $state<string | null>(null);

  // Module 6: Persistence UI state
  let saveStatus = $state<string | null>(null);

  // Zoom/pan state tracking
  let stageScale = $state(1);
  let stageX = $state(0);
  let stageY = $state(0);
  let stageRef: import('konva/lib/Stage').Stage | null = null;

  // Loupe tracking state
  let loadedImageSrc = $state<string | null>(null);
  let loupePointerX = $state(0);
  let loupePointerY = $state(0);
  let loupeVisible = $state(false);
  let isDraggingAnchor = false;

  // Image coordinates tracking
  let imageX = $state(0);
  let imageY = $state(0);
  let imageWidth = $state(0);
  let imageHeight = $state(0);

  // Responsive canvas dimensions (measured from container, fallback to defaults)
  let canvasWidth = $state(800);
  let canvasHeight = $state(600);
  let containerEl = $state<HTMLDivElement | null>(null);

  // Keep Konva stage in sync with container size
  $effect(() => {
    const el = containerEl;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]!.contentRect;
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w > 0 && h > 0 && (w !== canvasWidth || h !== canvasHeight)) {
        canvasWidth = w;
        canvasHeight = h;
        if (stageRef) {
          stageRef.width(w);
          stageRef.height(h);
          stageRef.draw();
        }
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
      calibration = null;
      onCalibrationChange?.(null);
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
    stageScale = 1;
    stageX = 0;
    stageY = 0;
    if (stageRef) {
      stageRef.scale({ x: 1, y: 1 });
      stageRef.position({ x: 0, y: 0 });
      stageRef.batchDraw();
    }
  }

  /**
   * Fits the loaded image to the canvas while preserving aspect ratio.
   * Updates stage scale and position so the entire image is visible and centered.
   */
  function fitImageToCanvas() {
    if (!stageRef || !currentKonvaImage) return;
    const img = currentKonvaImage.image() as HTMLImageElement | null;
    if (!img?.naturalWidth || !img?.naturalHeight) return;
    const s = Math.min(canvasWidth / img.naturalWidth, canvasHeight / img.naturalHeight, 1);
    stageScale = s;
    const x = (canvasWidth - img.naturalWidth * s) / 2;
    const y = (canvasHeight - img.naturalHeight * s) / 2;
    stageX = x;
    stageY = y;
    stageRef.scale({ x: s, y: s });
    stageRef.position({ x, y });
    stageRef.batchDraw();
  }

  // === Module 7: Native dialog-based persistence handlers ===

  async function handleSaveProject() {
    saveStatus = null;

    const calib = getCurrentCalibration();
    const meas = getMeasurements();

    if (!calib && meas.length === 0) {
      saveStatus = 'Nothing to save';
      setTimeout(() => (saveStatus = null), 2000);
      return;
    }

    try {
      const { saveProjectWithDialog } = await import('../project');

      const state = {
        imagePath: currentImagePath,
        calibration: calibrationToState(calib),
        measurements: measurementsToState(meas),
      };

      const savedPath = await saveProjectWithDialog(state);

      if (savedPath) {
        saveStatus = `Saved: ${savedPath.split('/').pop()}`;
      }
    } catch (err) {
      console.error(err);
      saveStatus = `Save failed: ${err}`;
    }

    setTimeout(() => (saveStatus = null), 2500);
  }

  async function handleLoadProject() {
    saveStatus = null;

    try {
      const { loadProjectWithDialog } = await import('../project');
      const result = await loadProjectWithDialog();

      if (result) {
        loadProjectState({
          calibration: result.state.calibration,
          measurements: result.state.measurements,
          imagePath: result.state.imagePath,
        });

        const filename = result.path.split('/').pop() ?? 'project';
        saveStatus = `Loaded: ${filename}`;
      }
    } catch (err) {
      console.error(err);
      saveStatus = `Load failed: ${err}`;
    }

    setTimeout(() => (saveStatus = null), 2500);
  }

  async function handleExportMeasurements() {
    saveStatus = null;

    const meas = getMeasurements();
    const calib = getCurrentCalibration();

    if (meas.length === 0) {
      saveStatus = 'No measurements to export';
      setTimeout(() => (saveStatus = null), 2000);
      return;
    }

    try {
      const { exportMeasurementsToCSV } = await import('../project');
      const savedPath = await exportMeasurementsToCSV(meas, calib);

      if (savedPath) {
        const filename = savedPath.split('/').pop() ?? 'export.csv';
        saveStatus = `Exported: ${filename}`;
      }
    } catch (err) {
      console.error(err);
      saveStatus = `Export failed: ${err}`;
    }

    setTimeout(() => (saveStatus = null), 2500);
  }

  async function handleLoadImage() {
    saveStatus = null;

    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp'] },
        ],
      });

      if (selected && !Array.isArray(selected)) {
        loadImage(selected);
        saveStatus = 'Image loaded';
      }
    } catch (err) {
      console.error(err);
      saveStatus = `Failed to load image: ${err}`;
    }

    setTimeout(() => (saveStatus = null), 2000);
  }

  /**
   * Loads the built-in deterministic test image (useful for demos and E2E tests).
   * Shows a ruler-like pattern with a 10 cm reference bar.
   */
  function loadTestImage() {
    const dataUrl = createTestCalibrationImage(canvasWidth, canvasHeight);
    loadImage(dataUrl);
    currentImagePath = null;
    saveStatus = 'Testbild geladen';
    setTimeout(() => (saveStatus = null), 1500);
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

  /**
   * Loads an image into the canvas.
   * Accepts either a real filesystem path (uses convertFileSrc for Tauri)
   * or a browser-fetchable source: data URL, http(s) URL, or root-relative path (for E2E tests).
   */
  export function loadImage(pathOrDataUrl: string) {
    const looksLikeWebSrc =
      pathOrDataUrl.startsWith('data:') ||
      pathOrDataUrl.startsWith('http://') ||
      pathOrDataUrl.startsWith('https://') ||
      pathOrDataUrl.startsWith('blob:');

    if (looksLikeWebSrc) {
      currentImagePath = null;
      loadImageIntoLayer(pathOrDataUrl);
      return;
    }

    // Everything else (absolute filesystem paths from the native dialog, or project files)
    // must go through convertFileSrc so the WebView can actually load them.
    currentImagePath = pathOrDataUrl;
    const safeSrc = convertFileSrc(pathOrDataUrl);
    loadImageIntoLayer(safeSrc);
  }

  // E2E test support: expose loadImage so Playwright can inject real images (e.g. pforte-fuersthof.jpg)
  if (typeof window !== 'undefined') {
    (window as any).__e2e = (window as any).__e2e || {};
    (window as any).__e2e.loadImage = loadImage;
  }

  /**
   * Loads a project state (calibration + measurements + optional image) into the component.
   */
  export function loadProjectState(data: {
    calibration?: CalibrationState | null;
    measurements?: MeasurementState[];
    imagePath?: string | null;
  }) {
    // Clear current drawing state
    referenceStart = null;
    referenceEnd = null;
    planePoints = [];
    measurementMode = false;
    selectedMeasurementId = null;

    // Load calibration via proper deserialization (supports both line and plane)
    const loadedCalib = stateToCalibration(data.calibration ?? null);
    calibration = loadedCalib;

    // Restore calibration type from persisted data
    if (loadedCalib) {
      calibrationType = loadedCalib.type;
    }

    // Convert and load measurements
    if (data.measurements && data.measurements.length > 0 && loadedCalib) {
      measurements = data.measurements.map((m) => ({
        id: m.id,
        start: { x: m.startX, y: m.startY },
        end: { x: m.endX, y: m.endY },
        realLength: m.realLength,
        unit: m.unit,
        label: m.label ?? '',
        notes: m.notes ?? '',
      }));
    } else {
      measurements = [];
    }

    redrawMeasurements();

    // Module 8: Load image if provided
    if (data.imagePath) {
      try {
        loadImage(data.imagePath);
      } catch (e) {
        console.warn('Failed to load project image:', e);
        currentImagePath = data.imagePath; // Still remember the path
      }
    }
  }

  function handleStageTransform(scale: number, x: number, y: number) {
    stageScale = scale;
    stageX = x;
    stageY = y;
  }

  function handleDrawingPointerMove(pos: { x: number; y: number } | null) {
    if (isDraggingAnchor) return; // Anchor dragging handles its own loupe state
    if (pos) {
      loupePointerX = pos.x;
      loupePointerY = pos.y;
      loupeVisible = true;
    } else {
      loupeVisible = false;
    }
  }

  function updateLoupeFromAnchor(anchor: Konva.Circle) {
    const pos = anchor.position();
    loupePointerX = pos.x * stageScale + stageX;
    loupePointerY = pos.y * stageScale + stageY;
    loupeVisible = true;
  }

  // Draw or update all measurement lines + labels on the Konva layer
  function redrawMeasurements() {
    if (!mainLayerRef) return;

    // Remove previous visual nodes
    const childrenToRemove = mainLayerRef.getChildren((node: any) =>
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
          dash: [6, 4],
          lineCap: 'round',
        });
        mainLayerRef.add(refLine);

        const midX = (referenceStart.x + referenceEnd.x) / 2;
        const midY = (referenceStart.y + referenceEnd.y) / 2 - 12;
        const refLabel = new Konva.Text({
          name: 'reference-label',
          text: `Referenz: ${realWorldLength} ${unit}`,
          x: midX,
          y: midY,
          fontSize: 13,
          fontStyle: 'bold',
          fill: '#ff5722',
          align: 'center',
        });
        mainLayerRef.add(refLabel);

        // Create draggable endpoint anchors
        const refAnchorStart = new Konva.Circle({
          name: 'reference-anchor-start',
          x: referenceStart.x,
          y: referenceStart.y,
          radius: 7,
          fill: '#ffffff',
          stroke: '#ff5722',
          strokeWidth: 2,
          draggable: true,
        });

        const refAnchorEnd = new Konva.Circle({
          name: 'reference-anchor-end',
          x: referenceEnd.x,
          y: referenceEnd.y,
          radius: 7,
          fill: '#ffffff',
          stroke: '#ff5722',
          strokeWidth: 2,
          draggable: true,
        });

        // Bind drag events
        refAnchorStart.on('dragstart', () => {
          isDraggingAnchor = true;
          updateLoupeFromAnchor(refAnchorStart);
        });
        refAnchorStart.on('dragmove', () => {
          const pos = refAnchorStart.position();
          refLine.points([pos.x, pos.y, refAnchorEnd.x(), refAnchorEnd.y()]);
          const mx = (pos.x + refAnchorEnd.x()) / 2;
          const my = (pos.y + refAnchorEnd.y()) / 2 - 12;
          refLabel.position({ x: mx, y: my });
          updateLoupeFromAnchor(refAnchorStart);
          mainLayerRef.batchDraw();
        });
        refAnchorStart.on('dragend', () => {
          const pos = refAnchorStart.position();
          referenceStart = { x: pos.x, y: pos.y };
          isDraggingAnchor = false;
          loupeVisible = false;
        });

        refAnchorEnd.on('dragstart', () => {
          isDraggingAnchor = true;
          updateLoupeFromAnchor(refAnchorEnd);
        });
        refAnchorEnd.on('dragmove', () => {
          const pos = refAnchorEnd.position();
          refLine.points([refAnchorStart.x(), refAnchorStart.y(), pos.x, pos.y]);
          const mx = (refAnchorStart.x() + pos.x) / 2;
          const my = (refAnchorStart.y() + pos.y) / 2 - 12;
          refLabel.position({ x: mx, y: my });
          updateLoupeFromAnchor(refAnchorEnd);
          mainLayerRef.batchDraw();
        });
        refAnchorEnd.on('dragend', () => {
          const pos = refAnchorEnd.position();
          referenceEnd = { x: pos.x, y: pos.y };
          isDraggingAnchor = false;
          loupeVisible = false;
        });

        mainLayerRef.add(refAnchorStart);
        mainLayerRef.add(refAnchorEnd);
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
          dash: [5, 3],
          closed: planePoints.length === 4,
          lineCap: 'round',
        });
        mainLayerRef.add(refPolygon);

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
              });
              mainLayerRef.add(gridLineH);

              // Vertical grid lines
              const realX = realWorldLength * t;
              const pVStart = projectPoint({ x: realX, y: 0 }, pixelH);
              const pVEnd = projectPoint({ x: realX, y: realWorldHeight }, pixelH);
              const gridLineV = new Konva.Line({
                name: 'reference-grid',
                points: [pVStart.x, pVStart.y, pVEnd.x, pVEnd.y],
                stroke: 'rgba(255, 87, 34, 0.25)',
                strokeWidth: 1.5,
              });
              mainLayerRef.add(gridLineV);
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
            radius: 7,
            fill: '#ffffff',
            stroke: '#ff5722',
            strokeWidth: 2,
            draggable: planePoints.length === 4,
          });

          if (planePoints.length === 4) {
            anchor.on('dragstart', () => {
              isDraggingAnchor = true;
              updateLoupeFromAnchor(anchor);
            });
            anchor.on('dragmove', () => {
              const pos = anchor.position();
              // Update polygon points interactively
              const updatedPoints = [...planePoints];
              updatedPoints[index] = { x: pos.x, y: pos.y };
              refPolygon.points(updatedPoints.flatMap(p => [p.x, p.y]));
              updateLoupeFromAnchor(anchor);
              mainLayerRef.batchDraw();
            });
            anchor.on('dragend', () => {
              const pos = anchor.position();
              planePoints[index] = { x: pos.x, y: pos.y };
              isDraggingAnchor = false;
              loupeVisible = false;
              // Recalibrate and redraw
              redrawMeasurements();
            });
          }

          mainLayerRef.add(anchor);
        });
      }
    }

    if (!calibration) {
      mainLayerRef.draw();
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
        lineCap: 'round',
      });

      const midX = (m.start.x + m.end.x) / 2;
      const midY = (m.start.y + m.end.y) / 2 - 12;

      const label = new Konva.Text({
        name: `measurement-${m.id}-label`,
        text: `${m.realLength.toFixed(2)} ${m.unit}`,
        x: midX,
        y: midY,
        fontSize: 13,
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

      mainLayerRef.add(line);
      mainLayerRef.add(label);

      // If selected, add draggable endpoints
      if (isSelected) {
        const anchorStart = new Konva.Circle({
          name: `measurement-anchor-start-${m.id}`,
          x: m.start.x,
          y: m.start.y,
          radius: 7,
          fill: '#ffffff',
          stroke: '#f59e0b',
          strokeWidth: 2,
          draggable: true,
        });

        const anchorEnd = new Konva.Circle({
          name: `measurement-anchor-end-${m.id}`,
          x: m.end.x,
          y: m.end.y,
          radius: 7,
          fill: '#ffffff',
          stroke: '#f59e0b',
          strokeWidth: 2,
          draggable: true,
        });

        anchorStart.on('dragstart', () => {
          isDraggingAnchor = true;
          updateLoupeFromAnchor(anchorStart);
        });
        anchorStart.on('dragmove', () => {
          const pos = anchorStart.position();
          line.points([pos.x, pos.y, anchorEnd.x(), anchorEnd.y()]);
          const mx = (pos.x + anchorEnd.x()) / 2;
          const my = (pos.y + anchorEnd.y()) / 2 - 12;
          label.position({ x: mx, y: my });
          const dist = Math.hypot(anchorEnd.x() - pos.x, anchorEnd.y() - pos.y);
          const len = dist * calibration!.scale;
          label.text(`${len.toFixed(2)} ${calibration!.unit}`);
          updateLoupeFromAnchor(anchorStart);
          mainLayerRef.batchDraw();
        });
        anchorStart.on('dragend', () => {
          const pos = anchorStart.position();
          measurements = measurements.map(item => item.id === m.id ? {
            ...item,
            start: { x: pos.x, y: pos.y },
            realLength: Math.hypot(anchorEnd.x() - pos.x, anchorEnd.y() - pos.y) * calibration!.scale
          } : item);
          isDraggingAnchor = false;
          loupeVisible = false;
        });

        anchorEnd.on('dragstart', () => {
          isDraggingAnchor = true;
          updateLoupeFromAnchor(anchorEnd);
        });
        anchorEnd.on('dragmove', () => {
          const pos = anchorEnd.position();
          line.points([anchorStart.x(), anchorStart.y(), pos.x, pos.y]);
          const mx = (anchorStart.x() + pos.x) / 2;
          const my = (anchorStart.y() + pos.y) / 2 - 12;
          label.position({ x: mx, y: my });
          const dist = Math.hypot(pos.x - anchorStart.x(), pos.y - anchorStart.y());
          const len = dist * calibration!.scale;
          label.text(`${len.toFixed(2)} ${calibration!.unit}`);
          updateLoupeFromAnchor(anchorEnd);
          mainLayerRef.batchDraw();
        });
        anchorEnd.on('dragend', () => {
          const pos = anchorEnd.position();
          measurements = measurements.map(item => item.id === m.id ? {
            ...item,
            end: { x: pos.x, y: pos.y },
            realLength: Math.hypot(pos.x - anchorStart.x(), pos.y - anchorStart.y()) * calibration!.scale
          } : item);
          isDraggingAnchor = false;
          loupeVisible = false;
        });

        mainLayerRef.add(anchorStart);
        mainLayerRef.add(anchorEnd);
      }
    });

    mainLayerRef.draw();
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
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMeasurementId) {
      e.preventDefault();
      deleteMeasurementById(selectedMeasurementId);
    }
  }

  // Attach global key listener for deletion
  $effect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });

  // Konva ready handler - load image when stage is ready
  function onKonvaReady(stage: import('konva/lib/Stage').Stage) {
    stageRef = stage;
    stageScale = stage.scaleX();
    stageX = stage.x();
    stageY = stage.y();

    // Measure container and update stage to fill available space
    if (containerEl) {
      const rect = containerEl.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w > 0 && h > 0) {
        canvasWidth = w;
        canvasHeight = h;
        stage.width(w);
        stage.height(h);
        stage.draw();
      }
    }

    const mainLayer = (stage as any).mainLayer ?? stage.getLayers()[0];
    mainLayerRef = mainLayer;

    if (imageDataUrl) {
      loadImageIntoLayer(imageDataUrl);
    }
  }

  function loadImageIntoLayer(src: string) {
    if (!mainLayerRef) return;
    loadedImageSrc = src;

    // Remove previous image if exists
    if (currentKonvaImage) {
      currentKonvaImage.destroy();
      currentKonvaImage = null;
    }

    // Reset E2E marker when starting a new load
    const kContainer = document.querySelector('[data-testid="konva-container"]');
    if (kContainer) kContainer.removeAttribute('data-has-bg-image');

    const img = new Image();
    img.onload = () => {
      const maxW = canvasWidth;
      const maxH = canvasHeight;
      const s = Math.min(maxW / img.width, maxH / img.height, 1);

      const dispW = img.width * s;
      const dispH = img.height * s;
      const x = (maxW - dispW) / 2;
      const y = (maxH - dispH) / 2;

      imageX = x;
      imageY = y;
      imageWidth = dispW;
      imageHeight = dispH;

      const konvaImage = new Konva.Image({
        image: img,
        x,
        y,
        width: img.width,
        height: img.height,
        scaleX: s,
        scaleY: s,
      });
      mainLayerRef.add(konvaImage);
      currentKonvaImage = konvaImage;
      
      redrawMeasurements(); // Triggers drawing ref line if it existed

      // E2E test marker so specs can assert the background image was rendered
      const kContainer = document.querySelector('[data-testid="konva-container"]');
      if (kContainer) kContainer.setAttribute('data-has-bg-image', 'true');
    };
    img.onerror = () => {
      console.error('Image load failed for src:', src);
      saveStatus = 'Bild konnte nicht geladen werden (evtl. Berechtigungsproblem)';
      setTimeout(() => (saveStatus = null), 3500);
    };
    img.src = src;
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
    currentImagePath={currentImagePath}
    saveStatus={saveStatus}
    hasReferenceLine={hasReferenceLine}
    onSaveProject={handleSaveProject}
    onLoadProject={handleLoadProject}
    onExportMeasurements={handleExportMeasurements}
    onLoadImage={handleLoadImage}
    onLoadTestImage={loadTestImage}
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
              {measurementMode ? 'Finish adding measurements' : 'Add Measurement Line'}
            </button>
          </div>
        {/if}
        {#if currentKonvaImage}
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
          width: canvasWidth,
          height: canvasHeight,
          onReady: onKonvaReady,
          onReferenceLineComplete: handleReferenceLineComplete,
          measurementMode,
          onMeasurementLineComplete: handleMeasurementLineComplete,
          onStageTransform: handleStageTransform,
          onDrawingPointerMove: handleDrawingPointerMove,
          calibrationType,
          onPlanePointAdded: handlePlanePointAdded,
        }}
        class="konva-container"
        data-testid="konva-container"
        style="width: {canvasWidth}px; height: {canvasHeight}px; cursor: {measurementMode ? 'crosshair' : 'default'};"
      ></div>

      <MagnifierLoupe
        imageSrc={loadedImageSrc}
        pointerX={loupePointerX}
        pointerY={loupePointerY}
        imageX={imageX}
        imageY={imageY}
        imageWidth={imageWidth}
        imageHeight={imageHeight}
        stageScale={stageScale}
        stageX={stageX}
        stageY={stageY}
        visible={loupeVisible}
      />
    </div>

    <div class="canvas-footer-hint">
      {#if currentKonvaImage}
        <span class="footer-zoom-info">🔍 {Math.round(stageScale * 100)}%</span>
        <span class="footer-sep">|</span>
        <span class="footer-zoom-info">{(currentKonvaImage.image() as HTMLImageElement)?.naturalWidth ?? '?'}×{(currentKonvaImage.image() as HTMLImageElement)?.naturalHeight ?? '?'} px</span>
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
