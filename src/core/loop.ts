import { DT } from './tuning';

const MAX_FRAME = 0.25;
const MAX_STEPS = Math.ceil(MAX_FRAME / DT);

/**
 * Fixed-timestep accumulator. Feed it real elapsed seconds; it runs `step`
 * as many times as needed and returns the interpolation alpha for rendering.
 */
export class FixedStepper {
  private acc = 0;

  advance(elapsed: number, step: () => void): number {
    this.acc += Math.min(Math.max(elapsed, 0), MAX_FRAME);
    let n = 0;
    while (this.acc >= DT - 1e-9 && n < MAX_STEPS) {
      step();
      this.acc -= DT;
      n++;
    }
    if (n === MAX_STEPS) this.acc = 0; // spiral-of-death guard
    return Math.min(1, Math.max(0, this.acc / DT));
  }
}

export function runLoop(update: () => void, render: (alpha: number) => void): void {
  const stepper = new FixedStepper();
  let last = performance.now();
  const frame = (now: number): void => {
    const alpha = stepper.advance((now - last) / 1000, update);
    last = now;
    render(alpha);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
