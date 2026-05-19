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

export interface CalibrationState {
  scale: number;
  unit: Unit;
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

/**
 * Converts internal Calibration to the serializable format.
 */
export function calibrationToState(calibration: Calibration | null): CalibrationState | null {
  if (!calibration) return null;
  return {
    scale: calibration.scale,
    unit: calibration.unit,
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
    label: m.label,
    notes: m.notes,
  }));
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
