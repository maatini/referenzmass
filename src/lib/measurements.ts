/**
 * Measurement domain types and helpers for Module 4.
 * Pure functions — no UI or Konva dependencies.
 */

import type { Point } from './geometry';
import { distance } from './geometry';
import { measure, type Calibration, type Unit } from './calibration';

export interface Measurement {
  id: string;
  start: Point;
  end: Point;
  /** Real-world length in the calibration's unit */
  realLength: number;
  unit: Unit;
  /** User-assigned label (e.g. "Fensterbreite", "Türhöhe") */
  label: string;
  /** Free-form notes (material, conditions, remarks) */
  notes: string;
}

/**
 * Creates a new Measurement from a drawn pixel line and the active calibration.
 */
export function createMeasurement(
  start: Point,
  end: Point,
  calibration: Calibration
): Measurement {
  const pixelDistance = distance(start, end);
  const realLength = measure(calibration, pixelDistance, start, end);

  return {
    id: crypto.randomUUID(),
    start,
    end,
    realLength,
    unit: calibration.unit,
    label: '',
    notes: '',
  };
}

/**
 * Recalculates the real-world length of an existing measurement
 * when the calibration (scale or unit) changes.
 */
export function recalculateMeasurement(
  measurement: Measurement,
  calibration: Calibration
): Measurement {
  const pixelDistance = distance(measurement.start, measurement.end);
  const newRealLength = measure(calibration, pixelDistance, measurement.start, measurement.end);

  return {
    ...measurement,
    realLength: newRealLength,
    unit: calibration.unit,
  };
}

/**
 * Recalculates all measurements when the active calibration changes.
 * Returns a new array (immutable update friendly for Svelte $state).
 */
export function recalculateAllMeasurements(
  measurements: Measurement[],
  calibration: Calibration | null
): Measurement[] {
  if (!calibration) return measurements;

  return measurements.map(m => recalculateMeasurement(m, calibration));
}
