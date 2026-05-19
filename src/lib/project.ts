import { open, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { saveProject, loadProject, type ProjectState } from './persistence';
import type { Calibration } from './calibration';
import type { Measurement } from './measurements';

/**
 * Project management helpers using native dialogs.
 * This is the integration layer for Module 7.
 */

let currentProjectPath: string | null = null;

export function getCurrentProjectPath(): string | null {
  return currentProjectPath;
}

export function setCurrentProjectPath(path: string | null) {
  currentProjectPath = path;
}

/**
 * Opens a native Save dialog and saves the provided project state.
 */
export async function saveProjectWithDialog(state: ProjectState): Promise<string | null> {
  const filePath = await save({
    filters: [
      {
        name: 'ReferenzMaß Project',
        extensions: ['rmproj', 'json'],
      },
    ],
    defaultPath: currentProjectPath ?? undefined,
  });

  if (!filePath) {
    return null;
  }

  await saveProject(filePath, state);
  currentProjectPath = filePath;
  return filePath;
}

/**
 * Opens a native Open dialog and loads a project.
 */
export async function loadProjectWithDialog(): Promise<{ path: string; state: ProjectState } | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: 'ReferenzMaß Project',
        extensions: ['rmproj', 'json'],
      },
    ],
  });

  if (!selected || Array.isArray(selected)) {
    return null;
  }

  const state = await loadProject(selected);
  currentProjectPath = selected;
  return { path: selected, state };
}

// ============================================================================
// Module 9: Export Functionality
// ============================================================================

/**
 * Escapes a string for safe inclusion in a CSV field.
 */
function escapeCsvField(value: string): string {
  const s = value ?? '';
  if (!s.includes(',') && !s.includes('"') && !s.includes('\n')) {
    return s;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Generates CSV content from the current measurements and calibration.
 */
function generateMeasurementsCSV(
  measurements: Measurement[],
  calibration: Calibration | null
): string {
  const lines: string[] = [];

  lines.push('# ReferenzMaß Measurement Export');
  lines.push(`# Exported: ${new Date().toISOString()}`);

  if (calibration) {
    lines.push(`# Calibration Scale: ${calibration.scale} ${calibration.unit}/px`);
  } else {
    lines.push('# No calibration set');
  }

  lines.push('');
  lines.push('ID,Start X,Start Y,End X,End Y,Length,Unit,Label,Notes');

  for (const m of measurements) {
    lines.push(
      [
        m.id,
        m.start.x.toFixed(1),
        m.start.y.toFixed(1),
        m.end.x.toFixed(1),
        m.end.y.toFixed(1),
        m.realLength.toFixed(4),
        m.unit,
        escapeCsvField(m.label),
        escapeCsvField(m.notes),
      ].join(',')
    );
  }

  return lines.join('\n');
}

/**
 * Exports the current measurements to a CSV file using a native save dialog.
 */
export async function exportMeasurementsToCSV(
  measurements: Measurement[],
  calibration: Calibration | null
): Promise<string | null> {
  if (measurements.length === 0) {
    return null;
  }

  const defaultName = `measurements_${new Date().toISOString().slice(0, 10)}.csv`;

  const filePath = await save({
    defaultPath: defaultName,
    filters: [
      {
        name: 'CSV Files',
        extensions: ['csv'],
      },
    ],
  });

  if (!filePath) {
    return null;
  }

  const csvContent = generateMeasurementsCSV(measurements, calibration);
  await writeTextFile(filePath, csvContent);

  return filePath;
}
