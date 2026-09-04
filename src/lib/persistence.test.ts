import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calibrationToState,
  stateToCalibration,
  measurementsToState,
  restoreProject,
  shouldClearLiveCalibration,
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
    expect(state).toEqual({
      calibType: 'line',
      scale: 0.0234,
      unit: 'cm',
      homography: null,
      referenceStart: null,
      referenceEnd: null,
      planePoints: [],
      realWidth: null,
      realHeight: null,
    });
  });

  it('converts plane Calibration with homography to serializable state', () => {
    const homography = [0.98, -0.02, 10.0, 0.01, 0.97, 5.0, -0.0001, 0.0002, 1.0];
    const calib: Calibration = { type: 'plane', scale: 0.015, unit: 'm', homography };
    const state = calibrationToState(calib);
    expect(state).toEqual({
      calibType: 'plane',
      scale: 0.015,
      unit: 'm',
      homography,
      referenceStart: null,
      referenceEnd: null,
      planePoints: [],
      realWidth: null,
      realHeight: null,
    });
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
        label: '',
        notes: '',
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
        label: '',
        notes: '',
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

describe('persistence — reference geometry (P0)', () => {
  const lineCalib: Calibration = { type: 'line', scale: 0.02, unit: 'cm' };
  const lineGeometry = {
    referenceStart: { x: 100, y: 200 },
    referenceEnd: { x: 600, y: 200 },
    planePoints: [] as { x: number; y: number }[],
    realWidth: 10,
    realHeight: null as number | null,
  };

  it('calibrationToState stores reference line points and real width', () => {
    const state = calibrationToState(lineCalib, lineGeometry);
    expect(state?.referenceStart).toEqual({ x: 100, y: 200 });
    expect(state?.referenceEnd).toEqual({ x: 600, y: 200 });
    expect(state?.planePoints).toEqual([]);
    expect(state?.realWidth).toBe(10);
    expect(state?.realHeight).toBeNull();
  });

  it('serialized calibration JSON uses camelCase geometry keys, not snake_case', () => {
    const json = JSON.parse(JSON.stringify(calibrationToState(lineCalib, lineGeometry)));
    expect(json).toHaveProperty('referenceStart');
    expect(json).toHaveProperty('realWidth');
    expect(json).not.toHaveProperty('reference_start');
    expect(json).not.toHaveProperty('real_width');
  });

  it('restoreProject keeps line geometry so canCalibrate stays true', () => {
    const saved: ProjectState = {
      imagePath: '/photos/part.jpg',
      calibration: calibrationToState(lineCalib, lineGeometry),
      measurements: measurementsToState([
        {
          id: 'm1',
          start: { x: 120, y: 340 },
          end: { x: 480, y: 340 },
          realLength: 7.2,
          unit: 'cm',
          label: 'Fensterbreite',
          notes: 'Holzrahmen',
        },
      ]),
    };

    const restored = restoreProject(saved);

    expect(restored.referenceStart).toEqual(lineGeometry.referenceStart);
    expect(restored.referenceEnd).toEqual(lineGeometry.referenceEnd);
    expect(restored.realWidth).toBe(10);
    expect(restored.calibration?.type).toBe('line');
    expect(restored.measurements).toHaveLength(1);
    expect(restored.measurements[0].label).toBe('Fensterbreite');
    expect(wouldNullCalibration(restored)).toBe(false);
  });

  it('restoreProject keeps plane points so canCalibrate stays true', () => {
    const planePoints = [
      { x: 10, y: 10 },
      { x: 210, y: 20 },
      { x: 200, y: 220 },
      { x: 20, y: 200 },
    ];
    const homography = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const saved: ProjectState = {
      imagePath: null,
      calibration: calibrationToState(
        { type: 'plane', scale: 0.015, unit: 'm', homography },
        {
          referenceStart: null,
          referenceEnd: null,
          planePoints,
          realWidth: 4,
          realHeight: 3,
        }
      ),
      measurements: [],
    };

    const restored = restoreProject(saved);

    expect(restored.calibrationType).toBe('plane');
    expect(restored.planePoints).toEqual(planePoints);
    expect(restored.realWidth).toBe(4);
    expect(restored.realHeight).toBe(3);
    expect(wouldNullCalibration(restored)).toBe(false);
  });

  it('restoreProject of a fixture file does not look like a wiped canvas', async () => {
    const fixtureMod = await import('../../fixtures/project-line.camelCase.json');
    const fixture = ((fixtureMod as { default?: ProjectState }).default ??
      fixtureMod) as ProjectState;
    const restored = restoreProject(fixture);
    expect(restored.referenceStart).not.toBeNull();
    expect(restored.referenceEnd).not.toBeNull();
    expect(wouldNullCalibration(restored)).toBe(false);
  });

  it('keeps a loaded calibration when geometry is missing (legacy files)', () => {
    expect(shouldClearLiveCalibration(false, true, true)).toBe(false);
  });

  it('clears calibration when the user is mid-draw without a loaded scale', () => {
    expect(shouldClearLiveCalibration(false, false, false)).toBe(true);
    expect(shouldClearLiveCalibration(false, true, false)).toBe(true);
  });

  it('does not clear while canCalibrate is true', () => {
    expect(shouldClearLiveCalibration(true, false, true)).toBe(false);
  });
});

function wouldNullCalibration(restored: {
  calibrationType: 'line' | 'plane';
  referenceStart: { x: number; y: number } | null;
  referenceEnd: { x: number; y: number } | null;
  planePoints: { x: number; y: number }[];
  realWidth: number | null;
  realHeight: number | null;
}): boolean {
  const canCalibrate =
    restored.calibrationType === 'line'
      ? restored.referenceStart !== null &&
        restored.referenceEnd !== null &&
        (restored.realWidth ?? 0) > 0
      : restored.planePoints.length === 4 &&
        (restored.realWidth ?? 0) > 0 &&
        (restored.realHeight ?? 0) > 0;
  return !canCalibrate;
}
