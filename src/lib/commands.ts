import { invoke } from '@tauri-apps/api/core';

/**
 * IPC wrapper for the backend ping command (Module 1 baseline).
 * Returns "pong" when the Rust backend is reachable.
 */
export async function ping(): Promise<string> {
  return invoke<string>('ping');
}
