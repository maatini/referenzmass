import { describe, it, expect } from 'vitest';
import { distance, type Point } from './geometry';

describe('geometry - distance', () => {
  it('returns 100 for vertical line from (0,0) to (0,100)', () => {
    const a: Point = { x: 0, y: 0 };
    const b: Point = { x: 0, y: 100 };

    expect(distance(a, b)).toBe(100);
  });

  it('returns 0 for identical points', () => {
    const p: Point = { x: 42, y: -7 };
    expect(distance(p, p)).toBe(0);
  });

  it('calculates correct diagonal distance', () => {
    const a: Point = { x: 0, y: 0 };
    const b: Point = { x: 3, y: 4 };
    expect(distance(a, b)).toBe(5);
  });
});
