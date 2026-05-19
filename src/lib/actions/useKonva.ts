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

  // Internal drawing state for reference line (Module 3)
  let isDrawing = false;
  let startPoint: { x: number; y: number } | null = null;
  let tempLine: Konva.Line | null = null;

  function getRelativePointerPosition() {
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return {
      x: pos.x,
      y: pos.y,
    };
  }

  function startDrawing() {
    const pos = getRelativePointerPosition();
    if (!pos) return;

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
  }

  function updateDrawing() {
    if (!isDrawing || !tempLine || !startPoint) return;

    const pos = getRelativePointerPosition();
    if (!pos) return;

    tempLine.points([startPoint.x, startPoint.y, pos.x, pos.y]);
    drawingLayer.batchDraw();
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
      if (config.measurementMode && config.onMeasurementLineComplete) {
        config.onMeasurementLineComplete(startPoint, pos);
      } else if (!config.measurementMode && config.onReferenceLineComplete) {
        config.onReferenceLineComplete(startPoint, pos);
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
    },
  };

  // Svelte 5 action contract
  return {
    destroy() {
      stage.destroy();
    },
    // Allow updating config if needed in future
    update(newConfig: Partial<UseKonvaConfig>) {
      if (newConfig.width !== undefined || newConfig.height !== undefined) {
        stage.width(newConfig.width ?? stage.width());
        stage.height(newConfig.height ?? stage.height());
        stage.draw();
      }
    },
  };
}
