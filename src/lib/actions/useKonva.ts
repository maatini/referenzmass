/**
 * Svelte 5 action for vanilla Konva.js (no wrapper library).
 * Creates and manages a Konva Stage bound to a DOM element.
 *
 * Usage:
 *   <div use:useKonva={config}>
 */

import Konva from 'konva';
import type { Stage, Layer } from 'konva/lib/Stage';

export interface UseKonvaConfig {
  width: number;
  height: number;

  /** Called once when the Stage is ready. Use this to add custom layers/shapes. */
  onReady?: (stage: Stage) => void;

  /** Called when a reference line has been completed (two distinct points). */
  onReferenceLineComplete?: (start: { x: number; y: number }, end: { x: number; y: number }) => void;

  /** When true, pointer drawing creates measurement lines instead of reference lines (Module 4) */
  measurementMode?: boolean;

  /** Called when a measurement line has been completed (Module 4) */
  onMeasurementLineComplete?: (start: { x: number; y: number }, end: { x: number; y: number }) => void;

  /** Called when the stage scale or position changes (zoom/pan) */
  onStageTransform?: (scale: number, x: number, y: number) => void;

  /** Called with container-relative pointer position while drawing, or null when done */
  onDrawingPointerMove?: (pos: { x: number; y: number } | null) => void;

  /** Calibration mode: 2D line or 3D perspective plane */
  calibrationType?: 'line' | 'plane';

  /** Called when a point is placed for the 3D plane calibration */
  onPlanePointAdded?: (pos: { x: number; y: number }) => void;
}

export interface UseKonvaReturn {
  stage: Stage;
  mainLayer: Layer;
  drawingLayer: Layer;
  destroy: () => void;
}

export function useKonva(node: HTMLElement, config: UseKonvaConfig) {
  const stage = new Konva.Stage({
    container: node,
    width: config.width,
    height: config.height,
  });

  const mainLayer = new Konva.Layer();
  const drawingLayer = new Konva.Layer();

  stage.add(mainLayer);
  stage.add(drawingLayer);

  // Store mutable config fields so update() can keep them in sync
  let currentConfig = config;

  // Internal drawing state for reference line (Module 3)
  let isDrawing = false;
  let startPoint: { x: number; y: number } | null = null;
  let tempLine: Konva.Line | null = null;

  // Track state of spacebar panning
  let spacePressed = false;

  function getRelativePointerPosition() {
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return {
      // Map screen coordinates back to stage space (accounts for zoom/pan)
      x: (pos.x - stage.x()) / stage.scaleX(),
      y: (pos.y - stage.y()) / stage.scaleY(),
    };
  }

  function startDrawing() {
    if (spacePressed || stage.draggable()) return;

    const pos = getRelativePointerPosition();
    if (!pos) return;

    if (currentConfig.calibrationType === 'plane' && !currentConfig.measurementMode) {
      if (currentConfig.onPlanePointAdded) {
        currentConfig.onPlanePointAdded(pos);
      }
      return;
    }

    isDrawing = true;
    startPoint = pos;

    // Create temporary line
    tempLine = new Konva.Line({
      points: [pos.x, pos.y, pos.x, pos.y],
      stroke: '#ff3e00',
      strokeWidth: 3,
      lineCap: 'round',
      dash: [6, 3],
    });
    drawingLayer.add(tempLine);

    const stagePos = stage.getPointerPosition();
    if (stagePos && currentConfig.onDrawingPointerMove) {
      currentConfig.onDrawingPointerMove(stagePos);
    }
  }

  function updateDrawing() {
    if (!isDrawing || !tempLine || !startPoint) return;

    const pos = getRelativePointerPosition();
    if (!pos) return;

    tempLine.points([startPoint.x, startPoint.y, pos.x, pos.y]);
    drawingLayer.batchDraw();

    const stagePos = stage.getPointerPosition();
    if (stagePos && currentConfig.onDrawingPointerMove) {
      currentConfig.onDrawingPointerMove(stagePos);
    }
  }

  function finishDrawing() {
    if (!isDrawing || !tempLine || !startPoint) {
      cleanupDrawing();
      return;
    }

    const pos = getRelativePointerPosition();
    if (!pos) {
      cleanupDrawing();
      return;
    }

    const dx = pos.x - startPoint.x;
    const dy = pos.y - startPoint.y;
    const dist = Math.hypot(dx, dy);

    // Only complete if the line has meaningful length
    if (dist > 5) {
      if (currentConfig.measurementMode && currentConfig.onMeasurementLineComplete) {
        currentConfig.onMeasurementLineComplete(startPoint, pos);
      } else if (!currentConfig.measurementMode && currentConfig.onReferenceLineComplete) {
        currentConfig.onReferenceLineComplete(startPoint, pos);
      }
    }

    cleanupDrawing();
  }

  function cleanupDrawing() {
    if (tempLine) {
      tempLine.destroy();
      tempLine = null;
    }
    drawingLayer.batchDraw();
    isDrawing = false;
    startPoint = null;
    if (currentConfig.onDrawingPointerMove) {
      currentConfig.onDrawingPointerMove(null);
    }
  }

  // Attach pointer handlers for reference line drawing (Module 3 calibration slice)
  stage.on('mousedown touchstart', () => {
    startDrawing();
  });

  stage.on('mousemove touchmove', () => {
    updateDrawing();
  });

  stage.on('mouseup touchend', () => {
    finishDrawing();
  });

  // Also cancel on mouseleave
  stage.on('mouseleave', () => {
    if (isDrawing) cleanupDrawing();
  });

  // Zoom with scroll wheel centered on cursor
  const scaleBy = 1.08;
  stage.on('wheel', (e) => {
    e.evt.preventDefault();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    let newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    // Limit zoom factor
    newScale = Math.max(0.1, Math.min(10, newScale));

    stage.scale({ x: newScale, y: newScale });

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
    stage.batchDraw();

    if (currentConfig.onStageTransform) {
      currentConfig.onStageTransform(newScale, newPos.x, newPos.y);
    }
  });

  // Setup global event listeners for keyboard Pan activation
  function handleKeyDown(e: KeyboardEvent) {
    if (e.code === 'Space' && !spacePressed) {
      // Prevent browser default scrolling
      e.preventDefault();
      spacePressed = true;
      stage.draggable(true);
      node.style.cursor = 'grab';
    }
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') {
      spacePressed = false;
      stage.draggable(false);
      node.style.cursor = currentConfig.measurementMode ? 'crosshair' : 'default';
    }
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  stage.on('dragstart', () => {
    if (spacePressed) node.style.cursor = 'grabbing';
  });

  stage.on('dragmove', () => {
    if (currentConfig.onStageTransform) {
      currentConfig.onStageTransform(stage.scaleX(), stage.x(), stage.y());
    }
  });

  stage.on('dragend', () => {
    if (spacePressed) node.style.cursor = 'grab';
    if (currentConfig.onStageTransform) {
      currentConfig.onStageTransform(stage.scaleX(), stage.x(), stage.y());
    }
  });

  // Notify consumer that stage is ready
  if (config.onReady) {
    // Attach layers so consumers can easily add images/shapes
    (stage as any).mainLayer = mainLayer;
    (stage as any).drawingLayer = drawingLayer;

    // Defer one tick so the container is fully attached
    queueMicrotask(() => config.onReady!(stage));
  }

  // Return API + cleanup
  const api: UseKonvaReturn = {
    stage,
    mainLayer,
    drawingLayer,
    destroy: () => {
      stage.destroy();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    },
  };

  // Svelte 5 action contract
  return {
    destroy() {
      stage.destroy();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    },
    // Allow updating config if needed in future
    update(newConfig: Partial<UseKonvaConfig>) {
      // Sync mutable config fields so callbacks see the latest values
      if (newConfig.measurementMode !== undefined) {
        currentConfig.measurementMode = newConfig.measurementMode;
      }
      if (newConfig.onReferenceLineComplete !== undefined) {
        currentConfig.onReferenceLineComplete = newConfig.onReferenceLineComplete;
      }
      if (newConfig.onMeasurementLineComplete !== undefined) {
        currentConfig.onMeasurementLineComplete = newConfig.onMeasurementLineComplete;
      }
      if (newConfig.onStageTransform !== undefined) {
        currentConfig.onStageTransform = newConfig.onStageTransform;
      }
      if (newConfig.onDrawingPointerMove !== undefined) {
        currentConfig.onDrawingPointerMove = newConfig.onDrawingPointerMove;
      }
      if (newConfig.calibrationType !== undefined) {
        currentConfig.calibrationType = newConfig.calibrationType;
      }
      if (newConfig.onPlanePointAdded !== undefined) {
        currentConfig.onPlanePointAdded = newConfig.onPlanePointAdded;
      }

      if (newConfig.width !== undefined || newConfig.height !== undefined) {
        stage.width(newConfig.width ?? stage.width());
        stage.height(newConfig.height ?? stage.height());
        stage.draw();
      }
    },
  };
}
