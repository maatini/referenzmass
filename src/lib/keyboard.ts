/**
 * Keyboard helpers for workspace shortcuts. DOM-tag duck typing so tests
 * run in the Vitest node environment without jsdom.
 */

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (target == null || typeof target !== 'object') return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = el.tagName?.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable === true;
}

export function shouldDeleteMeasurementOnKey(
  event: Pick<KeyboardEvent, 'key' | 'target'>,
  selectedMeasurementId: string | null
): boolean {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return false;
  if (!selectedMeasurementId) return false;
  if (isTextEntryTarget(event.target)) return false;
  return true;
}
