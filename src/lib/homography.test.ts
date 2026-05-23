import { describe, it, expect } from 'vitest';
import { solveLinearSystem, computeHomography, projectPoint, projectDistance } from './homography';
import type { Point } from './geometry';

describe('homography math module', () => {
  describe('solveLinearSystem', () => {
    it('solves identity matrix system', () => {
      const M = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      const b = [4, 5, 6];
      expect(solveLinearSystem(M, b)).toEqual([4, 5, 6]);
    });

    it('solves a typical invertible 3x3 system', () => {
      const M = [
        [2, 1, -1],
        [-3, -1, 2],
        [-2, 1, 2],
      ];
      const b = [8, -11, -3];
      // Solution is [2, 3, -1]
      const sol = solveLinearSystem(M, b);
      expect(sol[0]).toBeCloseTo(2);
      expect(sol[1]).toBeCloseTo(3);
      expect(sol[2]).toBeCloseTo(-1);
    });

    it('throws error on singular matrix', () => {
      const M = [
        [1, 2, 3],
        [2, 4, 6], // Linearly dependent
        [0, 1, 1],
      ];
      const b = [1, 2, 3];
      expect(() => solveLinearSystem(M, b)).toThrow();
    });
  });

  describe('computeHomography & projectPoint', () => {
    it('handles simple rectangular orthographic scaling', () => {
      // Skew-free mapping (0.1 scale factor: 10 pixels = 1 unit)
      const src: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 0, y: 50 },
      ];
      const dst: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
        { x: 0, y: 5 },
      ];

      const h = computeHomography(src, dst);

      // Verify corner projections
      for (let i = 0; i < 4; i++) {
        const p = projectPoint(src[i], h);
        expect(p.x).toBeCloseTo(dst[i].x);
        expect(p.y).toBeCloseTo(dst[i].y);
      }

      // Verify midpoint projection (should be linear since there is no perspective warp here)
      const mid = projectPoint({ x: 50, y: 25 }, h);
      expect(mid.x).toBeCloseTo(5);
      expect(mid.y).toBeCloseTo(2.5);

      // Verify distance projection
      const dist = projectDistance({ x: 10, y: 10 }, { x: 90, y: 10 }, h);
      expect(dist).toBeCloseTo(8.0); // (90-10) px * 0.1 units/px = 8 units
    });

    it('handles perspective trapezoid-to-rectangle mapping', () => {
      // Perspective projection: source trapezoid (skews upwards) maps to real rectangle
      const src: Point[] = [
        { x: 10, y: 10 },  // Top-Left (skewed inwards)
        { x: 90, y: 10 },  // Top-Right (skewed inwards)
        { x: 100, y: 90 }, // Bottom-Right
        { x: 0, y: 90 },   // Bottom-Left
      ];
      const dst: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];

      const h = computeHomography(src, dst);

      // Corners must map exactly
      for (let i = 0; i < 4; i++) {
        const p = projectPoint(src[i], h);
        expect(p.x).toBeCloseTo(dst[i].x);
        expect(p.y).toBeCloseTo(dst[i].y);
      }

      // Midpoints should project correctly considering perspective foreshortening
      const centerSrc = { x: 50, y: 50 }; // Visual center in pixels
      const centerProj = projectPoint(centerSrc, h);
      
      // Due to perspective distortion, the Y coordinate of the projected center should be shifted
      // towards the top (since the top is narrower/further away, representing larger real area)
      expect(centerProj.y).toBeGreaterThan(5.0); // It is skewed, so center is not at exactly 5.0
      expect(centerProj.x).toBeCloseTo(5.0); // Horizontal symmetry remains
    });
  });
});
