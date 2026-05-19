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
  import { calibrationToState, measurementsToState } from '../persistence';
  import { getCurrentProjectPath } from '../project';
  import { convertFileSrc } from '@tauri-apps/api/core';
  import Konva from 'konva';
  import { createTestCalibrationImage } from '../testImage';

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
    const dataUrl = createTestCalibrationImage(width, height);
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
    // We no longer rely on a "/" heuristic because both real FS paths on macOS
    // and potential web assets can start with "/". We always treat non-web-src as FS.

    // Tauri desktop or absolute fs path from dialog/project
    currentImagePath = pathOrDataUrl;
    const safeSrc = convertFileSrc(pathOrDataUrl);
    loadImageIntoLayer(safeSrc);
  }

  // E2E test support: expose loadImage so Playwright can inject real images (e.g. pforte-fuersthof.jpg)
  // without native dialogs or Tauri fs APIs. Only present in the browser context.
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

    // Reset E2E marker when starting a new load
    const kContainer = document.querySelector('[data-testid="konva-container"]');
    if (kContainer) kContainer.removeAttribute('data-has-bg-image');

    const img = new Image();
    img.onload = () => {
      // Fit large photos (e.g. 2160×2880) into the fixed canvas (920×680) while preserving aspect ratio.
      // Never upscale; center the result.
      const maxW = width;
      const maxH = height;
      const s = Math.min(maxW / img.width, maxH / img.height, 1);

      const dispW = img.width * s;
      const dispH = img.height * s;
      const x = (maxW - dispW) / 2;
      const y = (maxH - dispH) / 2;

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
      mainLayerRef.draw();

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
    data-testid="konva-container"
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
              <div
                class="measurement-item"
                class:selected={m.id === selectedMeasurementId}
                onclick={() => { selectedMeasurementId = m.id; redrawMeasurements(); }}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { selectedMeasurementId = m.id; redrawMeasurements(); } }}
                role="button"
                tabindex="0"
              >
                <div class="measurement-header">
                  <span class="measurement-index">#{i + 1}</span>
                  <input
                    type="text"
                    class="measurement-label-input"
                    placeholder="Bezeichnung…"
                    bind:value={m.label}
                    aria-label="Bezeichnung"
                  />
                  <strong class="measurement-length">{m.realLength.toFixed(2)} {m.unit}</strong>
                </div>
                <textarea
                  class="measurement-notes-input"
                  placeholder="Notizen (Material, Bedingungen…)&#10;"
                  bind:value={m.notes}
                  rows={2}
                  aria-label="Notizen"
                ></textarea>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Module 8/9: Image, Project & Export controls -->
    <div class="persistence-tools" data-testid="persistence-tools">
      <button onclick={handleLoadImage}>Load Image</button>
      <button onclick={loadTestImage}>Testbild laden</button>
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
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .measurement-item {
    padding: 6px 8px;
    cursor: pointer;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    background: #fafafa;
    width: 100%;
    font-size: inherit;
    box-sizing: border-box;
  }
  .measurement-item:hover {
    border-color: #bbb;
  }

  .measurement-item.selected {
    background-color: #fff3e0;
    border-color: #ff9800;
  }

  .measurement-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .measurement-index {
    color: #888;
    font-weight: 500;
    min-width: 24px;
  }

  .measurement-label-input {
    flex: 1;
    border: 1px solid transparent;
    border-bottom: 1px dashed #ccc;
    background: transparent;
    font-size: 13px;
    padding: 2px 4px;
    outline: none;
    min-width: 0;
  }
  .measurement-label-input:focus {
    border-color: #0066cc;
    border-bottom-style: solid;
    background: #fff;
  }

  .measurement-length {
    color: #111;
    white-space: nowrap;
  }

  .measurement-notes-input {
    width: 100%;
    margin-top: 6px;
    border: 1px solid transparent;
    border-bottom: 1px dashed #ddd;
    background: transparent;
    font-size: 12px;
    padding: 2px 4px;
    outline: none;
    resize: vertical;
    box-sizing: border-box;
    color: #555;
  }
  .measurement-notes-input:focus {
    border-color: #0066cc;
    border-bottom-style: solid;
    background: #fff;
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
