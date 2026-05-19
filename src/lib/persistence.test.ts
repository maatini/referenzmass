import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calibrationToState,
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
    const calib: Calibration = { scale: 0.0234, unit: 'cm' };
    const state = calibrationToState(calib);
    expect(state).toEqual({ scale: 0.0234, unit: 'cm' });
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
      calibration: { scale: 0.05, unit: 'cm' },
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
      calibration: { scale: 0.1, unit: 'mm' },
      measurements: [],
    };

    vi.mocked(invoke).mockResolvedValue(mockResponse);

    const { loadProject } = await import('./persistence');
    const result = await loadProject('/tmp/test.json');

    expect(invoke).toHaveBeenCalledWith('load_project', { path: '/tmp/test.json' });
    expect(result).toEqual(mockResponse);
  });
});
