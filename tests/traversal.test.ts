import { describe, expect, it } from 'vitest';
import { makeInput, type Action } from '../src/core/input';
import { TILE } from '../src/core/tuning';
import { newSave } from '../src/world/save';
import { World } from '../src/world/world';

// Bots that prove the skill rooms can be beaten with the abilities available
// at that point in the slice (no dash).

function freshWorld(room: string, door: string): World {
  const w = new World({ save: newSave() });
  w.warp(room, door);
  w.enemies = []; // test the level geometry, not the bot's dodging
  return w;
}

describe('Thornfield', () => {
  it('can be crossed without the dash by bouncing off thorns', () => {
    const w = freshWorld('thorns', '3');
    const p = w.player;
    let reached = false;
    for (let i = 0; i < 60 * 40 && !reached; i++) {
      const held: Action[] = ['right'];
      const pressed: Action[] = [];
      const aheadX = p.x + p.w + 10;
      if (p.grounded && !w.map.overlapsSolid(aheadX, p.y + p.h + 1, 1, 1)) pressed.push('jump');
      if (!p.grounded) {
        held.push('jump', 'down');
        const below = { x: p.cx - 22, y: p.y + p.h, w: 44, h: 46 };
        if (p.vy > -200 && p.attackCd <= 0 && w.map.spikeIn(below.x, below.y, below.w, below.h)) pressed.push('attack');
      }
      w.update(makeInput(held, pressed));
      if (w.room.def.id === 'shrine' || (p.grounded && p.x > 67 * TILE)) reached = true;
    }
    expect(reached).toBe(true);
    expect(p.hp).toBe(p.maxHp);
  });
});

describe('The Long Throat', () => {
  it('can be climbed with wall jumps alone', () => {
    const w = freshWorld('shaft', '2');
    const p = w.player;
    // Stand on the ledge under the chimney (cols 8-11, row 45).
    p.x = 9.5 * TILE;
    p.y = 45 * TILE - p.h;
    p.savePrev();
    let wall: 'left' | 'right' = 'left';
    let best = p.y;
    let jumpedFromGround = false;
    for (let i = 0; i < 60 * 20 && w.room.def.id === 'shaft'; i++) {
      const pressed: Action[] = [];
      if (p.grounded && !jumpedFromGround) {
        pressed.push('jump');
        jumpedFromGround = true;
      }
      if (p.wallSliding) {
        pressed.push('jump');
        wall = p.wallDir < 0 ? 'right' : 'left';
      }
      w.update(makeInput([wall, 'jump'], pressed));
      best = Math.min(best, p.y);
      if (p.grounded && p.y < 20 * TILE) break;
    }
    expect(best).toBeLessThan(20 * TILE);
  });
});
