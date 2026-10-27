import { describe, expect, it } from 'vitest';
import { makeInput } from '../src/core/input';
import { TILE } from '../src/core/tuning';
import { World } from '../src/world/world';
import { newSave } from '../src/world/save';

// The Sundered Floor must be impossible to cross without the dash and
// comfortably possible with it. A simple bot tries every takeoff timing.

const EDGE = 18 * TILE; // first pit column
const LANDING = 26 * TILE; // first landing column

function attempt(jumpFrame: number, dashFrame: number | null, dash: boolean): boolean {
  const save = newSave();
  save.dash = dash;
  const w = new World({ save });
  w.warp('gap', '6');
  const p = w.player;
  p.x = 12 * TILE;
  p.y = 14 * TILE - p.h;
  p.vx = 0;
  p.inputLock = 0;
  for (let i = 0; i < 20; i++) w.update(makeInput());
  const hp = p.hp;

  for (let i = 0; i < 240; i++) {
    const pressed: ('jump' | 'dash')[] = [];
    if (i === jumpFrame) pressed.push('jump');
    // Also mash jump afterwards, to try (and fail) to wall-jump off the slick faces.
    if (i > jumpFrame && i % 5 === 0) pressed.push('jump');
    if (dashFrame !== null && i === dashFrame) pressed.push('dash');
    w.update(makeInput(['right', 'jump'], pressed));
    if (p.hp < hp || p.state === 'hazard') return false;
    if (w.room.def.id !== 'gap') return true; // walked through the far door
    if (p.grounded && p.x > LANDING) return true;
  }
  return false;
}

describe('dash gate', () => {
  it('cannot be crossed by jumping alone, at any takeoff timing', () => {
    const successes: number[] = [];
    for (let f = 0; f < 70; f++) if (attempt(f, null, false)) successes.push(f);
    expect(successes).toEqual([]);
  });

  it('cannot be crossed without the dash even when dash is pressed', () => {
    for (let f = 0; f < 70; f += 3) {
      for (let d = 5; d < 40; d += 5) expect(attempt(f, f + d, false)).toBe(false);
    }
  });

  it('can be crossed with the dash, with a generous timing window', () => {
    let wins = 0;
    for (let f = 0; f < 70; f++) {
      for (let d = 5; d < 40; d += 2) if (attempt(f, f + d, true)) wins++;
    }
    expect(wins).toBeGreaterThan(20);
  });

  it('the bot does reach the edge (sanity check of the setup)', () => {
    const w = new World({ save: newSave() });
    w.warp('gap', '6');
    const p = w.player;
    p.x = 12 * TILE;
    p.y = 14 * TILE - p.h;
    let reached = false;
    for (let i = 0; i < 120; i++) {
      w.update(makeInput(['right']));
      if (p.x + p.w > EDGE) reached = true;
    }
    expect(reached).toBe(true);
  });
});
