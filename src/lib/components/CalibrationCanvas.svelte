<script lang="ts">
  /**
   * CalibrationCanvas - Svelte 5 runes component
   * Uses vanilla Konva via the use:useKonva action.
   *
   * This component is the visual heart of the calibration slice (Module 3).
   */
  import { useKonva } from '../actions/useKonva';
  import { createCalibration, type Calibration, type Unit } from '../calibration';
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
  import { getCurrentProjectPath } from '../project';
  import { convertFileSrc } from '@tauri-apps/api/core';
  import Konva from 'konva';

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
    realWorldLength = 10,
    unit = 'cm' as Unit,
    onCalibrationChange,
  }: Props = $props();

  // Internal state using Svelte 5 runes
  let referenceStart = $state<Point | null>(null);
  let referenceEnd = $state<Point | null>(null);
  let calibration = $state<Calibration | null>(null);
  let error = $state<string | null>(null);

  // === Module 4: Measurements ===
  let measurements = $state<Measurement[]>([]);
  let measurementMode = $state(false);
  let mainLayerRef: any = null; // reference to Konva layer for drawing measurement visuals

  // Module 8: Image handling
  let currentImagePath = $state<string | null>(null);
  let currentKonvaImage: Konva.Image | null = null;

  // Module 10: Measurement selection
  let selectedMeasurementId = $state<string | null>(null);

  // Module 6: Persistence UI state
  let saveStatus = $state<string | null>(null);

  // Derived: whether we have a complete reference line
  const hasReferenceLine = $derived(referenceStart !== null && referenceEnd !== null);

  // Module 7: Current project filename for display
  const currentProjectName = $derived(getCurrentProjectPath()?.split('/').pop() ?? null);

  // Derived: can we compute calibration?
  const canCalibrate = $derived(
    hasReferenceLine &&
    typeof realWorldLength === 'number' &&
    realWorldLength > 0
  );

  // Whenever inputs that affect calibration change, try to recompute
  $effect(() => {
    if (canCalibrate && referenceStart && referenceEnd) {
      try {
        const newCalib = createCalibration(
          referenceStart,
          referenceEnd,
          realWorldLength,
          unit
        );
        calibration = newCalib;
        error = null;
        onCalibrationChange?.(newCalib);
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
    // The $effect above will handle creating the calibration
  }

  function clearReferenceLine() {
    referenceStart = null;
    referenceEnd = null;
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
      const { saveProjectWithDialog, calibrationToState, measurementsToState } = await import('../project');

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
   * Loads a real image file into the canvas.
   * Uses convertFileSrc for Tauri local file access.
   */
  export function loadImage(path: string) {
    currentImagePath = path;
    const safeSrc = convertFileSrc(path);
    loadImageIntoLayer(safeSrc);
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
    measurementMode = false;
    selectedMeasurementId = null;

    // Load calibration directly
    if (data.calibration) {
      calibration = {
        scale: data.calibration.scale,
        unit: data.calibration.unit,
      };
    } else {
      calibration = null;
    }

    // Convert and load measurements
    if (data.measurements && data.measurements.length > 0 && calibration) {
      measurements = data.measurements.map((m) => ({
        id: m.id,
        start: { x: m.startX, y: m.startY },
        end: { x: m.endX, y: m.endY },
        realLength: m.realLength,
        unit: m.unit,
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

  // Draw or update all measurement lines + labels on the Konva layer
  function redrawMeasurements() {
    if (!mainLayerRef) return;

    // Remove previous measurement visuals (simple approach for Module 4 slice)
    const childrenToRemove = mainLayerRef.getChildren((node: any) =>
      node.name && node.name().startsWith('measurement-')
    );
    childrenToRemove.forEach((c: any) => c.destroy());

    if (!calibration) return;

    measurements.forEach((m, index) => {
      const isSelected = m.id === selectedMeasurementId;

      // Line
      const line = new Konva.Line({
        name: `measurement-${m.id}`,
        points: [m.start.x, m.start.y, m.end.x, m.end.y],
        stroke: isSelected ? '#ff3e00' : '#0066cc',
        strokeWidth: isSelected ? 3 : 2,
        lineCap: 'round',
      });

      // Dynamic label showing real-world length
      const midX = (m.start.x + m.end.x) / 2;
      const midY = (m.start.y + m.end.y) / 2 - 12;

      const label = new Konva.Text({
        name: `measurement-${m.id}-label`,
        text: `${m.realLength.toFixed(2)} ${m.unit}`,
        x: midX,
        y: midY,
        fontSize: 14,
        fill: isSelected ? '#ff3e00' : '#0066cc',
        fontStyle: isSelected ? 'bold' : 'normal',
        align: 'center',
      });

      // Click to select
      const selectThis = () => {
        selectedMeasurementId = m.id;
        redrawMeasurements();
      };

      line.on('click', selectThis);
      label.on('click', selectThis);

      mainLayerRef.add(line);
      mainLayerRef.add(label);
    });

    mainLayerRef.draw();
  }

  // When calibration changes, recalculate all existing measurements (reactivity!)
  $effect(() => {
    if (calibration && measurements.length > 0) {
      measurements = recalculateAllMeasurements(measurements, calibration);
      redrawMeasurements();
    }
  });

  // Module 10: Keyboard deletion of selected measurement
  function handleKeyDown(e: KeyboardEvent) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMeasurementId) {
      e.preventDefault();
      deleteSelectedMeasurement();
    }
  }

  // Attach global key listener for deletion
  $effect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });

  function deleteSelectedMeasurement() {
    if (!selectedMeasurementId) return;

    measurements = measurements.filter(m => m.id !== selectedMeasurementId);
    selectedMeasurementId = null;
    redrawMeasurements();
  }

  // Konva ready handler - load image when stage is ready
  function onKonvaReady(stage: import('konva/lib/Stage').Stage) {
    const mainLayer = (stage as any).mainLayer ?? stage.getLayers()[0];
    mainLayerRef = mainLayer;

    if (imageDataUrl) {
      loadImageIntoLayer(imageDataUrl);
    }
  }

  function loadImageIntoLayer(src: string) {
    if (!mainLayerRef) return;

    // Remove previous image if exists
    if (currentKonvaImage) {
      currentKonvaImage.destroy();
      currentKonvaImage = null;
    }

    const img = new Image();
    img.onload = () => {
      const konvaImage = new Konva.Image({
        image: img,
        x: 0,
        y: 0,
        width: img.width,
        height: img.height,
      });
      mainLayerRef.add(konvaImage);
      currentKonvaImage = konvaImage;
      mainLayerRef.draw();
    };
    img.src = src;
  }
</script>

<div class="calibration-canvas">
  <div
    use:useKonva={{
      width,
      height,
      onReady: onKonvaReady,
      onReferenceLineComplete: handleReferenceLineComplete,
      measurementMode,
      onMeasurementLineComplete: handleMeasurementLineComplete,
    }}
    class="konva-container"
    style="width: {width}px; height: {height}px; border: 1px solid #ccc; cursor: {measurementMode ? 'crosshair' : 'default'};"
  ></div>

  <div class="controls">
    <div class="status">
      {#if hasReferenceLine}
        <span class="ok">✓ Reference line drawn</span>
        <button onclick={clearReferenceLine}>Clear line</button>
      {:else}
        <span class="hint">Click and drag to draw the reference line on the image</span>
      {/if}
    </div>

    {#if calibration}
      <div class="measurement-tools">
        <button onclick={toggleMeasurementMode}>
          {measurementMode ? '✓ Finish adding measurements' : '＋ Add Measurement Line'}
        </button>
        {#if measurements.length > 0}
          <button onclick={clearMeasurements}>Clear all measurements</button>
        {/if}

        {#if selectedMeasurementId}
          <button onclick={deleteSelectedMeasurement} style="color: #c00;">
            Delete Selected
          </button>
        {/if}

        <div class="result">
          Scale: <strong>{calibration.scale.toFixed(4)}</strong> {calibration.unit}/px
        </div>

        {#if measurements.length > 0}
          <div class="measurements-list">
            <strong>Measurements:</strong>
            {#each measurements as m, i (m.id)}
              <button 
                type="button"
                class="measurement-item"
                class:selected={m.id === selectedMeasurementId}
                onclick={() => { selectedMeasurementId = m.id; redrawMeasurements(); }}
              >
                #{i + 1}: <strong>{m.realLength.toFixed(2)} {m.unit}</strong>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Module 8/9: Image, Project & Export controls -->
    <div class="persistence-tools">
      <button onclick={handleLoadImage}>Load Image</button>
      <button onclick={handleSaveProject}>Save Project</button>
      <button onclick={handleLoadProject}>Load Project</button>
      {#if measurements.length > 0}
        <button onclick={handleExportMeasurements}>Export CSV</button>
      {/if}

      {#if currentProjectName}
        <span class="current-project">📄 {currentProjectName}</span>
      {/if}

      {#if currentImagePath}
        <span class="current-image">🖼️ {currentImagePath.split('/').pop()}</span>
      {/if}

      {#if saveStatus}
        <span class="status-message">{saveStatus}</span>
      {/if}
    </div>

    {#if error}
      <div class="error">{error}</div>
    {/if}
  </div>
</div>

<style>
  .calibration-canvas {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .konva-container {
    background: #f8f8f8;
    cursor: crosshair;
  }
  .controls {
    font-size: 14px;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .hint {
    color: #666;
  }
  .ok {
    color: #0a0;
    font-weight: 500;
  }
  .error {
    color: #c00;
    font-weight: 500;
  }
  .result {
    margin-top: 4px;
    padding: 6px 10px;
    background: #f0f8ff;
    border-radius: 4px;
    display: inline-block;
  }
  .measurement-tools {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .measurements-list {
    margin-top: 4px;
    font-size: 13px;
  }
  .measurement-item {
    padding: 2px 6px;
    cursor: pointer;
    border: none;
    background: transparent;
    text-align: left;
    width: 100%;
    font-size: inherit;
  }

  .measurement-item.selected {
    background-color: #fff3e0;
    border-radius: 3px;
  }

  .persistence-tools {
    margin-top: 12px;
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .status-message {
    font-size: 12px;
    color: #555;
    margin-left: 8px;
  }

  .current-project {
    font-size: 12px;
    color: #444;
    background: #f0f0f0;
    padding: 2px 8px;
    border-radius: 4px;
    margin-left: 4px;
  }

  .current-image {
    font-size: 12px;
    color: #444;
    background: #e8f0fe;
    padding: 2px 8px;
    border-radius: 4px;
    margin-left: 4px;
  }
</style>
