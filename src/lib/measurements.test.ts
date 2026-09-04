import { describe, it, expect } from 'vitest';
import { createCalibration, createPlaneCalibration } from './calibration';
import { projectDistance } from './homography';
import { distance } from './geometry';
import {
  createMeasurement,
  moveMeasurementAnchor,
  type Measurement,
} from './measurements';

describe('moveMeasurementAnchor', () => {
  it('keeps id, label and notes when an endpoint moves', () => {
    const calib = createCalibration({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 'cm');
    const original = createMeasurement({ x: 0, y: 10 }, { x: 50, y: 10 }, calib);
    const labelled: Measurement = { ...original, label: 'Fenster', notes: 'Holz' };

    const moved = moveMeasurementAnchor(labelled, calib, 'end', { x: 80, y: 10 });

    expect(moved.id).toBe(labelled.id);
    expect(moved.label).toBe('Fenster');
    expect(moved.notes).toBe('Holz');
    expect(moved.end).toEqual({ x: 80, y: 10 });
    expect(moved.realLength).toBeCloseTo(8);
  });

  it('uses plane homography instead of dist * scale after an endpoint drag', () => {
    const planePoints = [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 100, y: 90 },
      { x: 0, y: 90 },
    ];
    const calib = createPlaneCalibration(planePoints, 10, 10, 'cm');
    const start = { x: 0, y: 90 };
    const original = createMeasurement(start, { x: 40, y: 90 }, calib);
    const newEnd = { x: 100, y: 90 };

    const moved = moveMeasurementAnchor(original, calib, 'end', newEnd);
    const naive = distance(start, newEnd) * calib.scale;
    const projected = projectDistance(start, newEnd, calib.homography!);

    expect(naive).toBeGreaterThan(11);
    expect(moved.realLength).toBeCloseTo(projected);
    expect(moved.realLength).toBeCloseTo(10, 1);
    expect(moved.realLength).not.toBeCloseTo(naive, 1);
  });
});
