import { describe, it, expect } from 'vitest';
import { createPlaneCalibration } from '../calibration';
import type { Point } from '../geometry';

describe('CalibrationCanvas 3D Plane Calibration Logic', () => {
  it('correctly creates plane calibration with 4 points and real-world dimensions', () => {
    const planePoints: Point[] = [
      { x: 100, y: 100 }, // TL
      { x: 200, y: 100 }, // TR
      { x: 200, y: 200 }, // BR
      { x: 100, y: 200 }  // BL
    ];
    const realWidth = 10;
    const realHeight = 10;
    const unit = 'cm';

    const calibration = createPlaneCalibration(planePoints, realWidth, realHeight, unit);

    expect(calibration.type).toBe('plane');
    expect(calibration.unit).toBe('cm');
    expect(calibration.homography).toBeDefined();
    expect(calibration.scale).toBe(0.1);
  });
});
