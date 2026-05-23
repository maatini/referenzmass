/**
 * PixelToRealWorldScale - Pure calibration and measurement domain logic.
 *
 * This module is completely independent of any UI, canvas, or rendering concerns.
 * It can be used directly from Svelte 5 runes, tests, or future Rust backend.
 */

import { distance, type Point } from './geometry';
import { computeHomography, projectDistance } from './homography';

export type Unit = 'mm' | 'cm' | 'm';
export type CalibrationType = 'line' | 'plane';

export interface Calibration {
  readonly type: CalibrationType;
  /** Real-world units per pixel (e.g. 0.1 means 0.1 cm per pixel) */
  readonly scale: number;
  /** The unit of the scale and all measurements produced from it */
  readonly unit: Unit;
  /** Homography matrix mapping pixels to plane coordinates (only for type = 'plane') */
  readonly homography?: number[];
}

const UNIT_FACTORS: Record<Unit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
};

/**
 * Converts a value from one unit to another.
 */
export function convert(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;

  const fromFactor = UNIT_FACTORS[from];
  const toFactor = UNIT_FACTORS[to];

  // Convert to base (mm), then to target
  const valueInMm = value * fromFactor;
  return valueInMm / toFactor;
}

/**
 * Creates a new calibration from a reference line drawn on the image.
 *
 * @param a - First point of the reference line (in pixels)
 * @param b - Second point of the reference line (in pixels)
 * @param realWorldLength - Known real-world length of the reference
 * @param unit - Unit of the realWorldLength
 * @throws Error if the pixel distance is zero or realWorldLength is not positive
 */
export function createCalibration(
  a: Point,
  b: Point,
  realWorldLength: number,
  unit: Unit
): Calibration {
  if (realWorldLength <= 0) {
    throw new Error('Real-world length must be greater than zero');
  }

  const pixelDistance = distance(a, b);

  if (pixelDistance === 0) {
    throw new Error('Reference points must be distinct (zero pixel distance)');
  }

  const scale = realWorldLength / pixelDistance;

  return {
    type: 'line',
    scale,
    unit,
  };
}

/**
 * Creates a plane calibration from 4 source points on the image plane
 * and the real-world width/height of the reference quadrilateral.
 */
export function createPlaneCalibration(
  srcPoints: Point[],
  realWidth: number,
  realHeight: number,
  unit: Unit
): Calibration {
  if (realWidth <= 0 || realHeight <= 0) {
    throw new Error('Plane dimensions must be greater than zero');
  }
  if (srcPoints.length !== 4) {
    throw new Error('Plane calibration requires exactly 4 points');
  }

  // Define destination coordinates in real-world space.
  // Origin (0,0) is at top-left.
  const dstPoints: Point[] = [
    { x: 0, y: 0 },                  // TL
    { x: realWidth, y: 0 },          // TR
    { x: realWidth, y: realHeight }, // BR
    { x: 0, y: realHeight },         // BL
  ];

  const homography = computeHomography(srcPoints, dstPoints);

  // Compute a fallback linear scale (average of width and height scales) for legacy compatibility
  const pixelWidth = distance(srcPoints[0], srcPoints[1]);
  const pixelHeight = distance(srcPoints[0], srcPoints[3]);
  const scaleX = realWidth / (pixelWidth || 1);
  const scaleY = realHeight / (pixelHeight || 1);
  const scale = (scaleX + scaleY) / 2;

  return {
    type: 'plane',
    scale,
    unit,
    homography,
  };
}

/**
 * Calculates the real-world length of a line given its pixel length and an active calibration.
 */
export function measure(
  calibration: Calibration,
  pixelDistance: number,
  start?: Point,
  end?: Point
): number {
  if (calibration.type === 'plane' && calibration.homography && start && end) {
    try {
      return projectDistance(start, end, calibration.homography);
    } catch {
      // Fallback if projection fails
      return calibration.scale * pixelDistance;
    }
  }
  return calibration.scale * pixelDistance;
}

/**
 * Returns the current scale expressed in a different unit.
 * Example: if scale is 0.1 cm/px, toUnit('mm') returns 1 mm/px
 */
export function getScaleInUnit(calibration: Calibration, toUnit: Unit): number {
  return convert(calibration.scale, calibration.unit, toUnit);
}
