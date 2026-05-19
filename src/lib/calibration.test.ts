import { describe, it, expect } from 'vitest';
import {
  createCalibration,
  measure,
  convert,
  getScaleInUnit,
  type Unit,
} from './calibration';
import type { Point } from './geometry';

describe('PixelToRealWorldScale calibration (Module 2)', () => {
  const pointA: Point = { x: 0, y: 0 };
  const pointB: Point = { x: 0, y: 100 };

  describe('createCalibration', () => {
    it('produces scale 0.1 cm/px when 100px reference equals 10cm', () => {
      const calib = createCalibration(pointA, pointB, 10, 'cm');

      expect(calib.scale).toBeCloseTo(0.1);
      expect(calib.unit).toBe('cm');
    });

    it('throws when real-world length is zero or negative', () => {
      expect(() => createCalibration(pointA, pointB, 0, 'cm')).toThrow();
      expect(() => createCalibration(pointA, pointB, -5, 'mm')).toThrow();
    });

    it('throws when reference points are identical (zero pixel distance)', () => {
      const samePoint: Point = { x: 120, y: 340 };
      expect(() => createCalibration(samePoint, samePoint, 50, 'cm')).toThrow(
        /distinct/
      );
    });
  });

  describe('measure', () => {
    it('returns 25cm for 250px line when scale is 0.1 cm/px', () => {
      const calib = createCalibration(pointA, pointB, 10, 'cm');

      const result = measure(calib, 250);

      expect(result).toBeCloseTo(25);
    });

    it('returns correct value for the original reference distance', () => {
      const calib = createCalibration(pointA, pointB, 10, 'cm');
      const result = measure(calib, 100);
      expect(result).toBeCloseTo(10);
    });

    it('handles different units correctly at creation time', () => {
      const calibMm = createCalibration(pointA, pointB, 100, 'mm'); // 100mm = 10cm
      expect(measure(calibMm, 100)).toBeCloseTo(100);

      const calibM = createCalibration(pointA, pointB, 0.1, 'm'); // 0.1m = 10cm
      expect(measure(calibM, 100)).toBeCloseTo(0.1);
    });
  });

  describe('unit conversion', () => {
    it('converts between mm, cm, and m correctly', () => {
      expect(convert(1000, 'mm', 'm')).toBeCloseTo(1);
      expect(convert(1, 'm', 'cm')).toBeCloseTo(100);
      expect(convert(25, 'cm', 'mm')).toBeCloseTo(250);
      expect(convert(0.1, 'cm', 'mm')).toBeCloseTo(1);
    });

    it('returns same value when converting to same unit', () => {
      expect(convert(42.7, 'cm', 'cm')).toBe(42.7);
    });
  });

  describe('getScaleInUnit', () => {
    it('correctly expresses scale in different units', () => {
      const calib = createCalibration(pointA, pointB, 10, 'cm');

      expect(getScaleInUnit(calib, 'mm')).toBeCloseTo(1);   // 0.1 cm/px = 1 mm/px
      expect(getScaleInUnit(calib, 'm')).toBeCloseTo(0.001);
    });
  });
});
