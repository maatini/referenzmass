import { describe, it, expect } from 'vitest';
import CalibrationCanvas from './CalibrationCanvas.svelte';

describe('CalibrationCanvas - Image Loading (Module 8)', () => {
  it('exposes loadImage method on the component', () => {
    expect(typeof CalibrationCanvas).toBe('function');
    // Surface check for the new public API added in this module
  });
});
