import { describe, expect, it } from 'vitest';
import { makeInput, type Action } from '../src/core/input';
import { TILE } from '../src/core/tuning';
import { Ashveil, type AshveilState } from '../src/entities/ashveil';
import { BroodEgg, Broodling } from '../src/entities/brood';
import { loadSave, memoryStorage, newSave, type SaveData } from '../src/world/save';
import { World } from '../src/world/world';

const lateSave = (patch: Partial<SaveData> = {}): SaveData => ({
  ...newSave(),
  dash: true,
  wings: true,
  bossDefeated: true,
  duelDefeated: true,
  ...patch,
});

function wakeHer(w: World): Ashveil {
  w.warp('brood', 'o');
  for (let i = 0; i < 180 && !w.bossActive; i++) w.update(makeInput(['right']));
  expect(w.bossActive).toBe(true);
  return w.boss as Ashveil;
}

/**
 * Aerial bot: get under her, jump + double jump, strike up when she's above,
 * sideways when level, down when she's below. Also swats broodlings in reach.
 */
function botStep(w: World, i: number): void {
  const p = w.player;
  const b = w.boss;
  p.invuln = 10;
  p.hp = p.maxHp;
  const target = b ?? w.enemies[0];
  if (!target) {
    w.update(makeInput());
    return;
  }
  const dx = target.cx - p.cx;
  const dy = target.cy - p.cy;
  const crawling = b instanceof Ashveil && b.grounded3;
  if (crawling && p.grounded && p.y + p.h < 17 * TILE - 4) {
    // Stuck on a ledge above her: step off it first.
    w.update(makeInput([p.cx < 17 * TILE ? 'left' : 'right'], i % 20 === 0 ? ['attack'] : []));
    return;
  }
  const held: Action[] = ['jump'];
  // Always face her, even when overlapping.
  if (Math.abs(dx) > 20 || p.facing !== Math.sign(dx)) held.push(dx > 0 ? 'right' : 'left');
  if (crawling) {
    // On the ground she's best fought by bouncing on her back.
    if (!p.grounded && Math.abs(dx) < 40) held.push('down');
  } else if (dy < -40) held.push('up');
  else if (dy > 40 && !p.grounded) held.push('down');
  const pressed: Action[] = [];
  if (i % 20 === 0) pressed.push('attack');
  if (crawling && p.grounded) pressed.push('jump');
  else if (p.grounded && dy < -50 && Math.abs(dx) < 160) pressed.push('jump');
  else if (!p.grounded && p.vy > -80 && dy < -30) pressed.push('jump');
  w.update(makeInput(held, pressed));
}

describe('Mother Ashveil', () => {
  for (const seed of [1, 2, 3]) {
    it(`can be reached and beaten from the air, through all three phases (seed ${seed})`, () => {
      const kv = memoryStorage();
      const w = new World({ save: lateSave(), store: kv, seed });
      wakeHer(w);
      const seen = new Set<AshveilState>();
      let cur: AshveilState | null = null;
      let since = 0;
      let longest = 0;
      let maxBrood = 0;
      for (let i = 0; i < 60 * 300 && !w.save.matronDefeated; i++) {
        const b = w.boss instanceof Ashveil ? w.boss : null;
        if (b) {
          seen.add(b.state);
          if (b.state !== cur) {
            cur = b.state;
            since = 0;
          } else since++;
          if (b.state !== 'dormant') longest = Math.max(longest, since);
          expect(b.x).toBeGreaterThanOrEqual(2 * TILE);
          expect(b.x + b.w).toBeLessThanOrEqual(32 * TILE);
          expect(b.y + b.h).toBeLessThanOrEqual(17 * TILE + 0.01);
        }
        const brood = w.enemies.filter((e) => e instanceof Broodling || e instanceof BroodEgg).length;
        maxBrood = Math.max(maxBrood, brood);
        botStep(w, i);
      }
      expect(w.save.matronDefeated).toBe(true);
      for (const s of ['intro', 'layWind', 'diveWind', 'sprayWind', 'vineWind', 'spiralWind', 'enrage', 'fall', 'crawl', 'screechWind', 'dying'] as const) {
        expect(seen.has(s), `never saw ${s}`).toBe(true);
      }
      expect(longest / 60).toBeLessThan(4);
      expect(maxBrood).toBeLessThanOrEqual(4);
      expect(w.map.gatesClosed).toBe(false);
      expect(w.enemies.some((e) => e instanceof Broodling && !e.dead)).toBe(false);
      expect(loadSave(kv)?.matronDefeated).toBe(true);
    });
  }

  it('grieves: killing two of her children provokes a vengeful dive', () => {
    const w = new World({ save: lateSave(), seed: 4 });
    const b = wakeHer(w);
    for (let i = 0; i < 200 && b.state !== 'hover'; i++) {
      w.player.invuln = 10;
      w.update(makeInput());
    }
    for (let k = 0; k < 2; k++) {
      const kid = new Broodling(b.cx, b.cy + 60, b);
      w.enemies.push(kid);
      kid.damage(w, 1, 1, 0);
    }
    let vengeful = false;
    for (let i = 0; i < 30 && !vengeful; i++) {
      w.player.invuln = 10;
      w.update(makeInput());
      vengeful = b.vengeful && (b.state === 'diveWind' || b.state === 'dive');
    }
    expect(vengeful).toBe(true);
  });

  it('flinches away when the player gets close in the air', () => {
    const w = new World({ save: lateSave(), seed: 5 });
    const b = wakeHer(w);
    for (let i = 0; i < 200 && b.state !== 'hover'; i++) {
      w.player.invuln = 10;
      w.update(makeInput());
    }
    const p = w.player;
    let flinched = false;
    for (let i = 0; i < 10 && !flinched; i++) {
      p.invuln = 10;
      p.x = b.cx - p.w / 2 - 60;
      p.y = b.cy - p.h / 2;
      p.vy = 0;
      p.grounded = false;
      w.update(makeInput());
      flinched = b.state === 'flinch';
    }
    expect(flinched).toBe(true);
  });

  it('tumbles out of the sky after a flurry of hits', () => {
    const w = new World({ save: lateSave(), seed: 6 });
    const b = wakeHer(w);
    for (let i = 0; i < 200 && b.state !== 'hover'; i++) {
      w.player.invuln = 10;
      w.update(makeInput());
    }
    const atk = { dir: 'up' as const, facing: 1 as const, t: 0, active: true, hit: new Set<object>(), pogoed: false, swing: 0 };
    for (let i = 0; i < 5; i++) b.strike(w, atk);
    expect(b.state).toBe('tumble');
  });

  it("the seal in Vesper's Court opens only when she yields", () => {
    const w = new World({ save: lateSave({ duelDefeated: false }) });
    w.warp('duel', 'z');
    w.enemies = [];
    w.boss = null;
    const p = w.player;
    p.x = 28 * TILE;
    p.y = 15 * TILE - p.h;
    for (let i = 0; i < 120; i++) w.update(makeInput(['right']));
    expect(w.room.def.id).toBe('duel');
  });
});
