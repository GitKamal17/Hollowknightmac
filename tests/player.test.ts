import { describe, expect, it } from 'vitest';
import { makeInput } from '../src/core/input';
import { PLAYER, TILE } from '../src/core/tuning';
import { Skitter } from '../src/entities/skitter';
import { box, settle, step, stepWith, worldFrom } from './helpers';

/** Floor at row 8 on the left, a drop-off at column 10. */
function ledgeWorld() {
  return worldFrom(
    box(30, 14, (r) => {
      for (let x = 1; x < 10; x++) r[8][x] = '#';
      r[7][3] = 'P';
    }),
  );
}

describe('coyote time', () => {
  function runOffLedgeThenJump(lateFrames: number): boolean {
    const w = ledgeWorld();
    settle(w);
    const p = w.player;
    // Run right until we leave the ledge.
    for (let i = 0; i < 200 && p.grounded; i++) w.update(makeInput(['right']));
    expect(p.grounded).toBe(false);
    step(w, lateFrames, ['right']);
    const vyBefore = p.vy;
    w.update(makeInput(['right'], ['jump']));
    return p.vy < 0 && vyBefore >= 0;
  }

  it('allows a jump a few frames after leaving a ledge', () => {
    expect(runOffLedgeThenJump(3)).toBe(true);
  });

  it('refuses the jump once the coyote window has passed', () => {
    expect(runOffLedgeThenJump(Math.ceil(PLAYER.coyote * 60) + 3)).toBe(false);
  });
});

describe('jump buffer', () => {
  function pressBeforeLanding(framesEarly: number): boolean {
    const w = worldFrom(box(12, 20, (r) => (r[4][5] = 'P')));
    const p = w.player;
    // Falling from high up: find the frame we land on.
    let landFrame = -1;
    {
      const probe = worldFrom(box(12, 20, (r) => (r[4][5] = 'P')));
      for (let i = 0; i < 300; i++) {
        probe.update(makeInput());
        if (probe.player.grounded) {
          landFrame = i;
          break;
        }
      }
    }
    expect(landFrame).toBeGreaterThan(10);
    let jumped = false;
    stepWith(w, landFrame + 8, (i) => makeInput(['jump'], i === landFrame - framesEarly ? ['jump'] : []));
    // A buffered jump means we left the ground again right after landing.
    jumped = p.y < 18 * TILE - p.h - 4;
    return jumped;
  }

  it('remembers a jump pressed just before landing', () => {
    expect(pressBeforeLanding(4)).toBe(true);
  });

  it('forgets a jump pressed too early', () => {
    expect(pressBeforeLanding(Math.ceil(PLAYER.jumpBuffer * 60) + 4)).toBe(false);
  });
});

describe('variable jump height', () => {
  function peak(holdFrames: number): number {
    const w = worldFrom(box(12, 20, (r) => (r[17][5] = 'P')));
    settle(w);
    const start = w.player.y;
    let best = start;
    for (let i = 0; i < 90; i++) {
      w.update(makeInput(i < holdFrames ? ['jump'] : [], i === 0 ? ['jump'] : []));
      best = Math.min(best, w.player.y);
    }
    return start - best;
  }

  it('a tap is a short hop, a hold is a full jump', () => {
    const tap = peak(1);
    const hold = peak(40);
    expect(hold).toBeGreaterThan(4 * TILE);
    expect(tap).toBeLessThan(hold * 0.5);
  });
});

describe('pogo', () => {
  it('a downward strike on thorns bounces the player up', () => {
    const w = worldFrom(
      box(14, 20, (r) => {
        for (let x = 1; x < 13; x++) r[17][x] = '^';
        r[5][6] = 'P';
      }),
    );
    const p = w.player;
    // Fall toward the thorns, striking down once close.
    let bounced = false;
    for (let i = 0; i < 200 && !bounced; i++) {
      const near = p.y + p.h > 17 * TILE - 50;
      w.update(makeInput(['down'], near && p.vy > 0 ? ['attack'] : []));
      if (p.vy < -PLAYER.pogoVel * 0.9) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(p.hp).toBe(PLAYER.maxHp);
  });

  it('a downward strike on an enemy damages it and bounces', () => {
    const w = worldFrom(box(14, 20, (r) => (r[5][6] = 'P')));
    const p = w.player;
    const s = new Skitter(p.cx, 18 * TILE);
    s.facing = 1;
    w.enemies.push(s);
    let bounced = false;
    for (let i = 0; i < 200 && !bounced; i++) {
      s.x = p.cx - s.w / 2; // keep it underneath
      const near = p.y + p.h > s.y - 40;
      w.update(makeInput(['down'], near && p.vy > 0 ? ['attack'] : []));
      if (p.vy < -PLAYER.pogoVel * 0.9) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(s.hp).toBe(s.maxHp - 1);
    expect(p.soul).toBe(PLAYER.soulPerHit);
  });
});

describe('damage and invulnerability', () => {
  it('takes one hit, then ignores contact until invulnerability ends', () => {
    const w = worldFrom(box(30, 10, (r) => (r[7][4] = 'P')));
    settle(w);
    const p = w.player;
    const s = new Skitter(p.cx + 60, 8 * TILE);
    s.facing = -1;
    w.enemies.push(s);
    for (let i = 0; i < 120 && p.hp === PLAYER.maxHp; i++) w.update(makeInput());
    expect(p.hp).toBe(PLAYER.maxHp - 1);
    expect(p.invuln).toBeGreaterThan(1);

    // Keep the enemy glued to the player: no further damage while invulnerable.
    for (let i = 0; i < Math.floor(PLAYER.invuln * 60) - 10; i++) {
      s.x = p.cx - s.w / 2;
      s.y = p.y + p.h - s.h;
      w.update(makeInput());
    }
    expect(p.hp).toBe(PLAYER.maxHp - 1);

    for (let i = 0; i < 40; i++) {
      s.x = p.cx - s.w / 2;
      s.y = p.y + p.h - s.h;
      w.update(makeInput());
    }
    expect(p.hp).toBe(PLAYER.maxHp - 2);
  });

  it('thorns always hurt and send the player back to safe ground', () => {
    const w = worldFrom(
      box(20, 10, (r) => {
        for (let x = 8; x < 12; x++) r[7][x] = '^';
        r[7][3] = 'P';
      }),
    );
    settle(w);
    const p = w.player;
    const safeX = p.x;
    for (let i = 0; i < 200 && p.hp === PLAYER.maxHp; i++) w.update(makeInput(['right']));
    expect(p.hp).toBe(PLAYER.maxHp - 1);
    step(w, 90);
    expect(p.state).toBe('normal');
    expect(p.x).toBeLessThan(8 * TILE - p.w);
    expect(Math.abs(p.x - safeX)).toBeLessThan(5 * TILE);
  });
});

describe('heal', () => {
  it('holding heal long enough converts essence into one mask', () => {
    const w = worldFrom(box(20, 10, (r) => (r[7][4] = 'P')));
    settle(w);
    const p = w.player;
    p.hp = 3;
    p.soul = PLAYER.healCost;
    step(w, Math.ceil(PLAYER.healTime * 60) + 3, ['heal']);
    expect(p.hp).toBe(4);
    expect(p.soul).toBe(0);
  });

  it('releasing early heals nothing and costs nothing', () => {
    const w = worldFrom(box(20, 10, (r) => (r[7][4] = 'P')));
    settle(w);
    const p = w.player;
    p.hp = 3;
    p.soul = PLAYER.healCost;
    step(w, 20, ['heal']);
    step(w, 30);
    expect(p.hp).toBe(3);
    expect(p.soul).toBe(PLAYER.healCost);
  });
});

describe('walls', () => {
  it('clinging slows the fall and a wall jump kicks away and up', () => {
    const w = worldFrom(box(16, 30, (r) => (r[4][13] = 'P')));
    const p = w.player;
    step(w, 40, ['right']);
    expect(p.wallSliding).toBe(true);
    expect(p.vy).toBeLessThanOrEqual(PLAYER.wallSlide);
    w.update(makeInput(['right'], ['jump']));
    expect(p.vy).toBeLessThan(-600);
    expect(p.vx).toBeLessThan(0);
  });
});
