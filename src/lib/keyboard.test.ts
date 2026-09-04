import { describe, it, expect } from 'vitest';
import { shouldDeleteMeasurementOnKey } from './keyboard';

function keyEvent(
  key: string,
  target: { tagName?: string; isContentEditable?: boolean } | null
): KeyboardEvent {
  return { key, target } as unknown as KeyboardEvent;
}

describe('shouldDeleteMeasurementOnKey', () => {
  it('deletes on Delete/Backspace when a measurement is selected and focus is not in a field', () => {
    expect(shouldDeleteMeasurementOnKey(keyEvent('Delete', { tagName: 'BODY' }), 'm1')).toBe(true);
    expect(shouldDeleteMeasurementOnKey(keyEvent('Backspace', { tagName: 'DIV' }), 'm1')).toBe(true);
  });

  it('does not delete while typing in input, textarea, select, or contenteditable', () => {
    expect(shouldDeleteMeasurementOnKey(keyEvent('Backspace', { tagName: 'INPUT' }), 'm1')).toBe(false);
    expect(shouldDeleteMeasurementOnKey(keyEvent('Delete', { tagName: 'TEXTAREA' }), 'm1')).toBe(false);
    expect(shouldDeleteMeasurementOnKey(keyEvent('Backspace', { tagName: 'SELECT' }), 'm1')).toBe(false);
    expect(
      shouldDeleteMeasurementOnKey(
        keyEvent('Backspace', { tagName: 'DIV', isContentEditable: true }),
        'm1'
      )
    ).toBe(false);
  });

  it('does not delete when nothing is selected or the key is unrelated', () => {
    expect(shouldDeleteMeasurementOnKey(keyEvent('Delete', { tagName: 'BODY' }), null)).toBe(false);
    expect(shouldDeleteMeasurementOnKey(keyEvent('Enter', { tagName: 'BODY' }), 'm1')).toBe(false);
  });
});
