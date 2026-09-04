import { invoke } from '@tauri-apps/api/core';
import type { Point } from './geometry';
import type { Calibration, Unit } from './calibration';
import type { Measurement } from './measurements';

/**
 * Frontend representation of the project state.
 * Mirrors the Rust `ProjectState` struct for seamless serialization.
 */
export interface ProjectState {
  imagePath: string | null;
  calibration: CalibrationState | null;
  measurements: MeasurementState[];
}

export interface CalibrationGeometry {
  referenceStart: Point | null;
  referenceEnd: Point | null;
  planePoints: Point[];
  realWidth: number | null;
  realHeight: number | null;
}

export interface CalibrationState {
  calibType: 'line' | 'plane';
  scale: number;
  unit: Unit;
  homography: number[] | null;
  referenceStart?: Point | null;
  referenceEnd?: Point | null;
  planePoints?: Point[];
  realWidth?: number | null;
  realHeight?: number | null;
}

export interface RestoredProject extends CalibrationGeometry {
  imagePath: string | null;
  calibration: Calibration | null;
  calibrationType: 'line' | 'plane';
  unit: Unit | null;
  measurements: Measurement[];
}

export interface MeasurementState {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  realLength: number;
  unit: Unit;
  label: string;
  notes: string;
}

const EMPTY_GEOMETRY: CalibrationGeometry = {
  referenceStart: null,
  referenceEnd: null,
  planePoints: [],
  realWidth: null,
  realHeight: null,
};

/**
 * Converts internal Calibration to the serializable format.
 */
export function calibrationToState(
  calibration: Calibration | null,
  geometry?: CalibrationGeometry | null
): CalibrationState | null {
  if (!calibration) return null;
  const geo = geometry ?? EMPTY_GEOMETRY;
  return {
    calibType: calibration.type,
    scale: calibration.scale,
    unit: calibration.unit,
    homography: calibration.homography ?? null,
    referenceStart: geo.referenceStart,
    referenceEnd: geo.referenceEnd,
    planePoints: geo.planePoints ?? [],
    realWidth: geo.realWidth,
    realHeight: geo.realHeight,
  };
}

/**
 * Converts serializable CalibrationState back to an internal Calibration.
 */
export function stateToCalibration(state: CalibrationState | null): Calibration | null {
  if (!state) return null;
  return {
    type: state.calibType,
    scale: state.scale,
    unit: state.unit,
    homography: state.homography ?? undefined,
  };
}

/**
 * Converts internal Measurement[] to serializable format.
 */
export function measurementsToState(measurements: Measurement[]): MeasurementState[] {
  return measurements.map((m) => ({
    id: m.id,
    startX: m.start.x,
    startY: m.start.y,
    endX: m.end.x,
    endY: m.end.y,
    realLength: m.realLength,
    unit: m.unit,
    label: m.label ?? '',
    notes: m.notes ?? '',
  }));
}

/**
 * Converts serializable measurements back to domain objects.
 */
export function stateToMeasurements(states: MeasurementState[]): Measurement[] {
  return states.map((m) => ({
    id: m.id,
    start: { x: m.startX, y: m.startY },
    end: { x: m.endX, y: m.endY },
    realLength: m.realLength,
    unit: m.unit,
    label: m.label ?? '',
    notes: m.notes ?? '',
  }));
}

/**
 * `$effect` policy: drop a live calibration when geometry is incomplete,
 * but keep a deserialized calibration that has no reconstructable points
 * (legacy files saved before reference geometry was persisted).
 */
export function shouldClearLiveCalibration(
  canCalibrate: boolean,
  geometryEmpty: boolean,
  hasCalibration: boolean
): boolean {
  if (canCalibrate) return false;
  if (geometryEmpty && hasCalibration) return false;
  return true;
}

/**
 * Reconstructs canvas-ready project state from a persisted file.
 * Reference geometry must come back here — otherwise `canCalibrate` goes false
 * and the canvas `$effect` nulls the loaded calibration.
 */
export function restoreProject(state: ProjectState): RestoredProject {
  const calibState = state.calibration;
  const calibration = stateToCalibration(calibState ?? null);
  return {
    imagePath: state.imagePath,
    calibration,
    calibrationType: calibState?.calibType ?? calibration?.type ?? 'line',
    unit: calibState?.unit ?? calibration?.unit ?? null,
    referenceStart: calibState?.referenceStart ?? null,
    referenceEnd: calibState?.referenceEnd ?? null,
    planePoints: calibState?.planePoints ?? [],
    realWidth: calibState?.realWidth ?? null,
    realHeight: calibState?.realHeight ?? null,
    measurements: stateToMeasurements(state.measurements ?? []),
  };
}

/**
 * Saves the current project state via the Rust backend.
 */
export async function saveProject(path: string, state: ProjectState): Promise<void> {
  await invoke('save_project', { path, state });
}

/**
 * Loads a project state from disk via the Rust backend.
 */
export async function loadProject(path: string): Promise<ProjectState> {
  return await invoke<ProjectState>('load_project', { path });
}
