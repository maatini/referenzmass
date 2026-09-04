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

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Stage/view transform: screen = image * scale + (x, y). */
export interface ViewTransform {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

const IDENTITY_VIEW: ViewTransform = { scale: 1, x: 0, y: 0 };

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

/**
 * Scale and offset that fit `image` into `viewport` while preserving aspect
 * ratio. Never upscales (scale capped at 1). Geometry stays in image pixels;
 * the result is a view-only transform.
 */
export function fitView(viewport: Size, image: Size): ViewTransform {
  if (viewport.width <= 0 || viewport.height <= 0 || image.width <= 0 || image.height <= 0) {
    return IDENTITY_VIEW;
  }

  const scale = Math.min(viewport.width / image.width, viewport.height / image.height, 1);
  return {
    scale,
    x: (viewport.width - image.width * scale) / 2,
    y: (viewport.height - image.height * scale) / 2,
  };
}

export function imageToScreenPoint(image: Point, view: ViewTransform): Point {
  return {
    x: image.x * view.scale + view.x,
    y: image.y * view.scale + view.y,
  };
}

export function screenToImagePoint(screen: Point, view: ViewTransform): Point {
  const scale = view.scale === 0 ? 1 : view.scale;
  return {
    x: (screen.x - view.x) / scale,
    y: (screen.y - view.y) / scale,
  };
}

/** Converts a screen-constant length (px) into image-space units. */
export function screenLengthToImage(screenLength: number, viewScale: number): number {
  if (viewScale === 0) return screenLength;
  return screenLength / viewScale;
}
