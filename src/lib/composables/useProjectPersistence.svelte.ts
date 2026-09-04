import {
  calibrationToState,
  measurementsToState,
  restoreProject,
  type CalibrationState,
  type MeasurementState,
} from '../persistence';
import type { Calibration, CalibrationType, Unit } from '../calibration';
import type { Measurement } from '../measurements';
import type { Point } from '../geometry';

export interface PersistenceSnapshot {
  imagePath: string | null;
  calibration: Calibration | null;
  measurements: Measurement[];
  referenceStart: Point | null;
  referenceEnd: Point | null;
  planePoints: Point[];
  realWidth: number;
  realHeight: number | null;
}

export interface RestoredWorkspace {
  calibrationType: CalibrationType;
  referenceStart: Point | null;
  referenceEnd: Point | null;
  planePoints: Point[];
  realWidth: number | null;
  realHeight: number | null;
  unit: Unit | null;
  calibration: Calibration | null;
  measurements: Measurement[];
  imagePath: string | null;
}

export function useProjectPersistence() {
  let saveStatus = $state<string | null>(null);
  let statusTimer: ReturnType<typeof setTimeout> | null = null;

  function flashStatus(message: string | null, timeoutMs = 2500) {
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
    saveStatus = message;
    if (message) {
      statusTimer = setTimeout(() => {
        saveStatus = null;
        statusTimer = null;
      }, timeoutMs);
    }
  }

  async function handleSaveProject(getSnapshot: () => PersistenceSnapshot) {
    const snap = getSnapshot();

    if (!snap.calibration && snap.measurements.length === 0) {
      flashStatus('Nichts zu speichern', 2000);
      return;
    }

    try {
      const { saveProjectWithDialog } = await import('../project');
      const state = {
        imagePath: snap.imagePath,
        calibration: calibrationToState(snap.calibration, {
          referenceStart: snap.referenceStart,
          referenceEnd: snap.referenceEnd,
          planePoints: snap.planePoints,
          realWidth: snap.realWidth,
          realHeight: snap.realHeight,
        }),
        measurements: measurementsToState(snap.measurements),
      };

      const savedPath = await saveProjectWithDialog(state);
      if (savedPath) {
        flashStatus(`Gespeichert: ${savedPath.split('/').pop()}`);
      }
    } catch (err) {
      console.error(err);
      flashStatus(`Speichern fehlgeschlagen: ${err}`);
    }
  }

  async function handleLoadProject(apply: (restored: RestoredWorkspace) => void) {
    try {
      const { loadProjectWithDialog } = await import('../project');
      const result = await loadProjectWithDialog();
      if (!result) return;

      apply(restoreIntoWorkspace(result.state));
      flashStatus(`Geladen: ${result.path.split('/').pop() ?? 'project'}`);
    } catch (err) {
      console.error(err);
      flashStatus(`Laden fehlgeschlagen: ${err}`);
    }
  }

  async function handleExportMeasurements(
    measurements: Measurement[],
    calibration: Calibration | null
  ) {
    if (measurements.length === 0) {
      flashStatus('Keine Messungen zum Export', 2000);
      return;
    }

    try {
      const { exportMeasurementsToCSV } = await import('../project');
      const savedPath = await exportMeasurementsToCSV(measurements, calibration);
      if (savedPath) {
        flashStatus(`Exportiert: ${savedPath.split('/').pop() ?? 'export.csv'}`);
      }
    } catch (err) {
      console.error(err);
      flashStatus(`Export fehlgeschlagen: ${err}`);
    }
  }

  return {
    get saveStatus() {
      return saveStatus;
    },
    flashStatus,
    handleSaveProject,
    handleLoadProject,
    handleExportMeasurements,
  };
}

export function restoreIntoWorkspace(data: {
  calibration?: CalibrationState | null;
  measurements?: MeasurementState[];
  imagePath?: string | null;
}): RestoredWorkspace {
  const restored = restoreProject({
    imagePath: data.imagePath ?? null,
    calibration: data.calibration ?? null,
    measurements: data.measurements ?? [],
  });

  return {
    calibrationType: restored.calibrationType,
    referenceStart: restored.referenceStart,
    referenceEnd: restored.referenceEnd,
    planePoints: restored.planePoints,
    realWidth: restored.realWidth,
    realHeight: restored.realHeight,
    unit: restored.unit,
    calibration: restored.calibration,
    measurements:
      restored.calibration && restored.measurements.length > 0 ? restored.measurements : [],
    imagePath: data.imagePath ?? restored.imagePath ?? null,
  };
}
