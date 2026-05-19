/**
 * Pure spatial geometry primitives for ReferenzMaß.
 * Completely UI- and canvas-agnostic.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Vector {
  readonly dx: number;
  readonly dy: number;
}

/**
 * Calculates Euclidean distance between two points.
 */
export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

/**
 * Creates a vector from point A to point B.
 */
export function vector(a: Point, b: Point): Vector {
  return {
    dx: b.x - a.x,
    dy: b.y - a.y,
  };
}

/**
 * Returns the magnitude (length) of a vector.
 */
export function vectorLength(v: Vector): number {
  return Math.hypot(v.dx, v.dy);
}

/**
 * Returns a new point offset from the origin by the given vector.
 */
export function pointFromVector(origin: Point, v: Vector): Point {
  return {
    x: origin.x + v.dx,
    y: origin.y + v.dy,
  };
}
