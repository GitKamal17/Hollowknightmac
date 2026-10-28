import { describe, expect, it } from 'vitest';
import { makeInput } from '../src/core/input';
import { InputManager } from '../src/core/input-dom';
import { PLAYER, TILE } from '../src/core/tuning';
import { box, settle, step, worldFrom } from './helpers';

const open = () => worldFrom(box(40, 20, (r) => (r[17][5] = 'P')));

describe('instant control', () => {
  it('reaches full speed on the first frame and stops dead on release', () => {
    const w = open();
    settle(w);
    const p = w.player;
    w.update(makeInput(['right']));
    expect(p.vx).toBe(PLAYER.run);
    step(w, 10, ['right']);
    w.update(makeInput());
    expect(p.vx).toBe(0);
    w.update(makeInput(['left']));
    expect(p.vx).toBe(-PLAYER.run);
  });

  it('in the air, letting go stops drifting at once, and turning is just as quick', () => {
    const w = open();
    settle(w);
    const p = w.player;
    w.update(makeInput(['right', 'jump'], ['jump']));
    step(w, 8, ['right', 'jump']);
    expect(p.grounded).toBe(false);
    w.update(makeInput(['jump']));
    expect(p.vx).toBe(0);
    w.update(makeInput(['left', 'jump']));
    expect(p.vx).toBe(-PLAYER.run);
  });
});

describe('the jump', () => {
  /** Height of a jump with jump held for `hold` frames, and how much higher it went after the release frame. */
  function jumpWith(hold: number): { peak: number; afterRelease: number } {
    const w = open();
    settle(w);
    const p = w.player;
    const start = p.y;
    let best = start;
    let atRelease = start;
    for (let i = 0; i < 90; i++) {
      w.update(makeInput(i < hold ? ['jump'] : [], i === 0 ? ['jump'] : []));
      if (i === hold) atRelease = p.y;
      best = Math.min(best, p.y);
    }
    return { peak: start - best, afterRelease: atRelease - best };
  }

  it('keeps its full height (levels are built around it)', () => {
    const { peak } = jumpWith(60);
    expect(peak).toBeGreaterThan(4.3 * TILE);
    expect(peak).toBeLessThan(4.8 * TILE);
  });

  it('stops rising almost as soon as jump is released', () => {
    for (const hold of [4, 5, 6]) expect(jumpWith(hold).afterRelease).toBeLessThan(10);
  });

  it('even the quickest tap is a real hop, about a tile', () => {
    const { peak } = jumpWith(1);
    expect(peak).toBeGreaterThan(0.9 * TILE);
    expect(peak).toBeLessThan(1.6 * TILE);
  });

  it('rises at a steady speed while held, so the height tracks how long you hold', () => {
    const heights = [3, 4, 5, 6].map((h) => jumpWith(h).peak);
    for (let i = 1; i < heights.length; i++) expect(heights[i] - heights[i - 1]).toBeGreaterThan(8);
  });
});

describe('walls', () => {
  it('once grabbed, a wall holds you without pressing into it; pressing away lets go', () => {
    const w = worldFrom(box(16, 30, (r) => (r[4][13] = 'P')));
    const p = w.player;
    step(w, 30, ['right']);
    expect(p.wallSliding).toBe(true);
    step(w, 20);
    expect(p.wallSliding).toBe(true);
    expect(p.vy).toBeLessThanOrEqual(PLAYER.wallSlide);
    step(w, 3, ['left']);
    expect(p.wallSliding).toBe(false);
    expect(p.vx).toBeLessThan(0);
  });
});

describe('keyboard layout', () => {
  function keyboard() {
    const handlers: Record<string, ((e: unknown) => void)[]> = {};
    const target = {
      addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] ??= []).push(fn),
    } as unknown as Window;
    const input = new InputManager(target);
    const fire = (type: string, code: string) =>
      handlers[type]?.forEach((fn) => fn({ code, repeat: false, preventDefault() {} }));
    return { input, down: (c: string) => fire('keydown', c), up: (c: string) => fire('keyup', c) };
  }

  it('A is left for WASD players', () => {
    const k = keyboard();
    k.down('KeyD');
    k.up('KeyD');
    k.down('KeyA');
    const s = k.input.poll();
    expect(s.held.left).toBe(true);
    expect(s.held.heal).toBe(false);
  });

  it('A heals for arrow-key players, and stays heal until released', () => {
    const k = keyboard();
    k.down('ArrowRight');
    k.down('KeyA');
    let s = k.input.poll();
    expect(s.held.heal).toBe(true);
    expect(s.held.left).toBe(false);
    k.down('KeyD'); // switching to WASD mid-hold doesn't turn the held A into "left"
    s = k.input.poll();
    expect(s.held.heal).toBe(true);
    k.up('KeyA');
    k.up('KeyD');
    k.up('ArrowRight');
    k.down('KeyA');
    expect(k.input.poll().held.left).toBe(true);
  });
});
