import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Measurement } from './measurements';
import type { Calibration } from './calibration';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: vi.fn(),
}));

import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { exportMeasurementsToCSV } from './project';

describe('Export Functionality (Module 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockMeasurements: Measurement[] = [
    {
      id: 'm1',
      start: { x: 100, y: 200 },
      end: { x: 400, y: 200 },
      realLength: 7.02,
      unit: 'cm',
      label: 'Fensterbreite',
      notes: 'Holzrahmen, ca. 2 Jahre alt',
    },
    {
      id: 'm2',
      start: { x: 150, y: 300 },
      end: { x: 150, y: 550 },
      realLength: 4.12,
      unit: 'cm',
      label: '',
      notes: '',
    },
  ];

  const mockCalibration: Calibration = {
    scale: 0.0234,
    unit: 'cm',
  };

  it('generates CSV and calls save + writeTextFile when measurements exist', async () => {
    vi.mocked(save).mockResolvedValue('/tmp/export.csv');

    const result = await exportMeasurementsToCSV(mockMeasurements, mockCalibration);

    expect(save).toHaveBeenCalled();
    expect(writeTextFile).toHaveBeenCalled();

    const writtenContent = vi.mocked(writeTextFile).mock.calls[0][1] as string;

    expect(writtenContent).toContain('# ReferenzMaß Measurement Export');
    expect(writtenContent).toContain('Scale: 0.0234 cm/px');
    expect(writtenContent).toContain('ID,Start X,Start Y,End X,End Y,Length,Unit,Label,Notes');
    expect(writtenContent).toContain('m1,100.0,200.0,400.0,200.0,7.0200,cm,Fensterbreite,"Holzrahmen, ca. 2 Jahre alt"');
    expect(writtenContent).toContain('m2,150.0,300.0,150.0,550.0,4.1200,cm,,');

    expect(result).toBe('/tmp/export.csv');
  });

  it('returns null when there are no measurements', async () => {
    const result = await exportMeasurementsToCSV([], mockCalibration);
    expect(result).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('returns null when user cancels the save dialog', async () => {
    vi.mocked(save).mockResolvedValue(null);

    const result = await exportMeasurementsToCSV(mockMeasurements, mockCalibration);
    expect(result).toBeNull();
    expect(writeTextFile).not.toHaveBeenCalled();
  });
});
