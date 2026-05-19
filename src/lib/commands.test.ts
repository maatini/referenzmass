import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ping } from './commands';

// Mock the Tauri IPC core module exactly as required by Module 1 spec
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

// Import the mocked invoke so we can control its implementation per test
import { invoke } from '@tauri-apps/api/core';

describe('IPC commands wrapper (Module 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ping() resolves correctly when the backend replies "pong"', async () => {
    // Arrange: make the real invoke resolve with the expected value
    vi.mocked(invoke).mockResolvedValue('pong');

    // Act
    const result = await ping();

    // Assert
    expect(result).toBe('pong');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('ping');
  });

  it('ping() propagates errors from the Tauri invoke layer', async () => {
    const testError = new Error('IPC channel closed');
    vi.mocked(invoke).mockRejectedValue(testError);

    await expect(ping()).rejects.toThrow('IPC channel closed');
    expect(invoke).toHaveBeenCalledWith('ping');
  });
});
