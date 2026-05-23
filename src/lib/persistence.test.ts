import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calibrationToState,
  stateToCalibration,
  measurementsToState,
  type ProjectState,
} from './persistence';
import type { Calibration } from './calibration';
import type { Measurement } from './measurements';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

describe('persistence layer (Module 6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('converts Calibration to serializable state', () => {
    const calib: Calibration = { type: 'line', scale: 0.0234, unit: 'cm' };
    const state = calibrationToState(calib);
    expect(state).toEqual({ calibType: 'line', scale: 0.0234, unit: 'cm', homography: null });
  });

  it('converts plane Calibration with homography to serializable state', () => {
    const homography = [0.98, -0.02, 10.0, 0.01, 0.97, 5.0, -0.0001, 0.0002, 1.0];
    const calib: Calibration = { type: 'plane', scale: 0.015, unit: 'm', homography };
    const state = calibrationToState(calib);
    expect(state).toEqual({ calibType: 'plane', scale: 0.015, unit: 'm', homography });
  });

  it('converts CalibrationState back to Calibration (roundtrip)', () => {
    const homography = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const state = { calibType: 'plane' as const, scale: 0.05, unit: 'm' as const, homography };
    const calib = stateToCalibration(state);
    expect(calib).toEqual({ type: 'plane', scale: 0.05, unit: 'm', homography });
  });

  it('stateToCalibration returns null for null input', () => {
    expect(stateToCalibration(null)).toBeNull();
  });

  it('converts Measurement[] to serializable state', () => {
    const measurements: Measurement[] = [
      {
        id: 'm1',
        start: { x: 100, y: 200 },
        end: { x: 400, y: 200 },
        realLength: 7.02,
        unit: 'cm',
      },
    ];

    const state = measurementsToState(measurements);
    expect(state).toEqual([
      {
        id: 'm1',
        startX: 100,
        startY: 200,
        endX: 400,
        endY: 200,
        realLength: 7.02,
        unit: 'cm',
      },
    ]);
  });

  it('saveProject calls the correct Tauri command with proper payload', async () => {
    const mockState: ProjectState = {
      imagePath: null,
      calibration: { calibType: 'line', scale: 0.05, unit: 'cm', homography: null },
      measurements: [],
    };

    await import('./persistence').then(({ saveProject }) =>
      saveProject('/tmp/test.json', mockState)
    );

    expect(invoke).toHaveBeenCalledWith('save_project', {
      path: '/tmp/test.json',
      state: mockState,
    });
  });

  it('loadProject calls the correct Tauri command', async () => {
    const mockResponse: ProjectState = {
      imagePath: '/some/image.jpg',
      calibration: { calibType: 'line', scale: 0.1, unit: 'mm', homography: null },
      measurements: [],
    };

    vi.mocked(invoke).mockResolvedValue(mockResponse);

    const { loadProject } = await import('./persistence');
    const result = await loadProject('/tmp/test.json');

    expect(invoke).toHaveBeenCalledWith('load_project', { path: '/tmp/test.json' });
    expect(result).toEqual(mockResponse);
  });
});
