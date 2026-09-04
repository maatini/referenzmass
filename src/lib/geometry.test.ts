import { describe, it, expect } from 'vitest';
import {
  distance,
  fitView,
  imageToScreenPoint,
  screenLengthToImage,
  screenToImagePoint,
  type Point,
} from './geometry';

describe('geometry - distance', () => {
  it('returns 100 for vertical line from (0,0) to (0,100)', () => {
    const a: Point = { x: 0, y: 0 };
    const b: Point = { x: 0, y: 100 };

    expect(distance(a, b)).toBe(100);
  });

  it('returns 0 for identical points', () => {
    const p: Point = { x: 42, y: -7 };
    expect(distance(p, p)).toBe(0);
  });

  it('calculates correct diagonal distance', () => {
    const a: Point = { x: 0, y: 0 };
    const b: Point = { x: 3, y: 4 };
    expect(distance(a, b)).toBe(5);
  });
});

describe('geometry - fitView (image space, view-only transform)', () => {
  const image = { width: 4000, height: 3000 };

  it('fits a larger image into the viewport without upscaling', () => {
    const view = fitView({ width: 800, height: 600 }, image);

    expect(view.scale).toBe(0.2);
    expect(view.x).toBe(0);
    expect(view.y).toBe(0);
  });

  it('centers a letterboxed image on the unused axis', () => {
    const view = fitView({ width: 1000, height: 600 }, image);

    expect(view.scale).toBe(0.2);
    expect(view.x).toBe(100);
    expect(view.y).toBe(0);
  });

  it('does not upscale an image smaller than the viewport', () => {
    const view = fitView({ width: 800, height: 600 }, { width: 400, height: 200 });

    expect(view.scale).toBe(1);
    expect(view.x).toBe(200);
    expect(view.y).toBe(200);
  });

  it('returns identity for invalid sizes', () => {
    expect(fitView({ width: 800, height: 600 }, { width: 0, height: 100 })).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
  });
});

describe('geometry - image/screen mapping is invertible and viewport-independent in image space', () => {
  const image = { width: 4000, height: 3000 };
  const a: Point = { x: 200, y: 400 };
  const b: Point = { x: 2200, y: 400 };

  it('round-trips image points through a fitted view', () => {
    const view = fitView({ width: 800, height: 600 }, image);
    const screen = imageToScreenPoint(a, view);
    expect(screenToImagePoint(screen, view)).toEqual(a);
  });

  it('keeps image-space distance when the viewport changes (P0-3)', () => {
    const viewNarrow = fitView({ width: 800, height: 600 }, image);
    const viewWide = fitView({ width: 1600, height: 1200 }, image);

    expect(distance(a, b)).toBe(2000);
    expect(distance(imageToScreenPoint(a, viewNarrow), imageToScreenPoint(b, viewNarrow))).toBe(400);
    expect(distance(imageToScreenPoint(a, viewWide), imageToScreenPoint(b, viewWide))).toBe(800);
  });

  it('converts screen-constant lengths into image space', () => {
    expect(screenLengthToImage(7, 0.2)).toBe(35);
    expect(screenLengthToImage(7, 0)).toBe(7);
  });
});
