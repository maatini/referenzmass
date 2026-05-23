import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectState } from './persistence';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
  open: vi.fn(),
}));

vi.mock('./persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./persistence')>();
  return {
    ...actual,
    saveProject: vi.fn(),
    loadProject: vi.fn(),
  };
});

import { save, open } from '@tauri-apps/plugin-dialog';
import { saveProject, loadProject } from './persistence';
import { saveProjectWithDialog, loadProjectWithDialog, getCurrentProjectPath } from './project';

describe('project.ts (Module 7 - Dialog layer)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saveProjectWithDialog calls dialog.save and persistence.saveProject', async () => {
    vi.mocked(save).mockResolvedValue('/tmp/test-project.rmproj');
    vi.mocked(saveProject).mockResolvedValue(undefined);

    const mockState: ProjectState = {
      imagePath: null,
      calibration: { calibType: 'line', scale: 0.1, unit: 'cm', homography: null },
      measurements: [],
    };

    const result = await saveProjectWithDialog(mockState);

    expect(save).toHaveBeenCalled();
    expect(saveProject).toHaveBeenCalledWith('/tmp/test-project.rmproj', mockState);
    expect(result).toBe('/tmp/test-project.rmproj');
    expect(getCurrentProjectPath()).toBe('/tmp/test-project.rmproj');
  });

  it('loadProjectWithDialog calls dialog.open and persistence.loadProject', async () => {
    vi.mocked(open).mockResolvedValue('/tmp/existing.rmproj');

    const mockState: ProjectState = {
      imagePath: '/some/image.jpg',
      calibration: { calibType: 'line', scale: 0.05, unit: 'mm', homography: null },
      measurements: [],
    };
    vi.mocked(loadProject).mockResolvedValue(mockState);

    const result = await loadProjectWithDialog();

    expect(open).toHaveBeenCalled();
    expect(loadProject).toHaveBeenCalledWith('/tmp/existing.rmproj');
    expect(result?.path).toBe('/tmp/existing.rmproj');
    expect(result?.state).toEqual(mockState);
  });

  it('returns null when user cancels save dialog', async () => {
    vi.mocked(save).mockResolvedValue(null);

    const result = await saveProjectWithDialog({ imagePath: null, calibration: null, measurements: [] });

    expect(result).toBeNull();
  });
});
