import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../src/core/loop';
import { DT } from '../src/core/tuning';

describe('fixed-timestep loop', () => {
  it('runs a whole number of steps and carries the remainder', () => {
    const s = new FixedStepper();
    let n = 0;
    const alpha = s.advance(DT * 2.5, () => n++);
    expect(n).toBe(2);
    expect(alpha).toBeCloseTo(0.5, 5);
    s.advance(DT * 0.5, () => n++);
    expect(n).toBe(3);
  });

  it('is independent of how the time is sliced', () => {
    const a = new FixedStepper();
    const b = new FixedStepper();
    let na = 0;
    let nb = 0;
    a.advance(0.2, () => na++);
    for (let i = 0; i < 29; i++) b.advance(0.2 / 29, () => nb++);
    expect(na).toBeGreaterThanOrEqual(11); // 0.2s is 12 steps, give or take float rounding
    expect(na).toBeLessThanOrEqual(12);
    expect(Math.abs(na - nb)).toBeLessThanOrEqual(1);
  });

  it('caps a long stall instead of fast-forwarding', () => {
    const s = new FixedStepper();
    let n = 0;
    s.advance(3, () => n++);
    expect(n).toBeLessThanOrEqual(15);
  });
});
