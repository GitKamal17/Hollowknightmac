import { describe, expect, it } from 'vitest';
import { makeInput, type Action } from '../src/core/input';
import { PLAYER, TILE } from '../src/core/tuning';
import { Ironshell } from '../src/entities/ironshell';
import { Skitter } from '../src/entities/skitter';
import { Vesper, type VesperState } from '../src/entities/vesper';
import { Warden } from '../src/entities/warden';
import { loadSave, memoryStorage, newSave, type SaveData } from '../src/world/save';
import { buy, SHOP } from '../src/world/shop';
import { World } from '../src/world/world';

function world(patch: Partial<SaveData> = {}, seed = 1): World {
  const save = { ...newSave(), dash: true, ...patch };
  return new World({ save, seed });
}

/**
 * Climb onto a platform: walk under/beside it, jump, double-jump near the
 * apex, steer toward its middle. Returns true once standing on it.
 */
function climbTo(w: World, x0: number, x1: number, topRow: number, frames = 240, log?: string[]): boolean {
  const p = w.player;
  const left = x0 * TILE;
  const right = (x1 + 1) * TILE;
  const centre = (left + right) / 2;
  const top = topRow * TILE;
  let usedDouble = false;
  for (let i = 0; i < frames; i++) {
    w.enemies = [];
    const above = p.y + p.h <= top + 1;
    // Stay beside the platform until clear of it, so we never bonk its underside.
    let goal = centre;
    if (!above) goal = p.cx < centre ? Math.min(centre, left - 14) : Math.max(centre, right + 14);
    const dx = goal - p.cx;
    const held: Action[] = ['jump'];
    if (Math.abs(dx) > 4) held.push(dx > 0 ? 'right' : 'left');
    const pressed: Action[] = [];
    if (p.grounded) {
      usedDouble = false;
      const toCentre = centre - p.cx;
      const dir = Math.sign(toCentre);
      const edgeAhead = !w.map.overlapsSolid(dir > 0 ? p.x + p.w + 4 : p.x - 5, p.y + p.h + 1, 1, 1);
      const besideIt = Math.abs(dx) < 10;
      const onTarget = p.cx > left && p.cx < right && Math.abs(p.y + p.h - top) < 1;
      if (!onTarget && ((!above && (besideIt || edgeAhead || Math.abs(toCentre) < 150)) || (above && edgeAhead))) pressed.push('jump');
    } else if (!usedDouble && p.vy > -60 && !above) {
      pressed.push('jump');
      usedDouble = true;
    }
    const hp = p.hp;
    w.update(makeInput(held, pressed));
    if (p.hp < hp) log?.push(`hurt heading for col ${x0} row ${topRow} at x=${(p.x / TILE).toFixed(1)}`);
    if (p.grounded && Math.abs(p.y + p.h - top) < 1 && p.cx > left && p.cx < right) return true;
  }
  return false;
}

describe('the seal east of the Warden', () => {
  it('blocks the way until the Warden falls', () => {
    const w = world();
    w.warp('arena', '7');
    w.enemies = [];
    w.boss = null;
    const p = w.player;
    p.x = 26 * TILE;
    p.y = 15 * TILE - p.h;
    for (let i = 0; i < 120; i++) w.update(makeInput(['right']));
    expect(w.room.def.id).toBe('arena');
    expect(p.x + p.w).toBeLessThanOrEqual(30 * TILE);
  });
});

describe('Twin Feather gate (Lowmarket)', () => {
  function reachLedge(wings: boolean): boolean {
    const w = world({ bossDefeated: true, wings });
    w.warp('market', '9');
    w.player.x = 18 * TILE;
    return climbTo(w, 22, 27, 10, 300);
  }
  it('the high ledge is out of reach with a single jump', () => {
    expect(reachLedge(false)).toBe(false);
  });
  it('and reachable with the double jump', () => {
    expect(reachLedge(true)).toBe(true);
  });
});

describe('climbing the Long Ascent with wings', () => {
  it('a bot can climb every platform to the duel door', () => {
    const w = world({ bossDefeated: true, wings: true });
    w.enterRoom('heights', 'w', 0, -900);
    for (let i = 0; i < 90; i++) {
      w.enemies = [];
      w.update(makeInput());
    }
    const steps: [number, number, number][] = [
      [22, 27, 35],
      [12, 17, 30],
      [22, 27, 25],
      [12, 17, 20],
      [22, 27, 15],
      [12, 17, 10],
      [21, 31, 6],
    ];
    for (const [a, b, row] of steps) expect(climbTo(w, a, b, row), `platform at row ${row}`).toBe(true);
    for (let i = 0; i < 120 && w.room.def.id === 'heights'; i++) w.update(makeInput(['right']));
    expect(w.room.def.id).toBe('duel');
  });
});

describe('Needle Spires', () => {
  it('can be crossed by jumping pillar to pillar (no wings needed)', () => {
    const w = world({ bossDefeated: true });
    w.warp('spires', '0');
    const route: [number, number, number][] = [
      [12, 14, 15],
      [19, 21, 13],
      [26, 28, 14],
      [33, 35, 12],
      [40, 43, 10],
      [48, 50, 13],
      [55, 57, 11],
      [62, 63, 13],
      [67, 72, 15],
    ];
    const log: string[] = [];
    for (const [a, b, row] of route) expect(climbTo(w, a, b, row, 240, log), `pillar at col ${a}`).toBe(true);
    expect(log).toEqual([]);
  });

  it('the secret above is out of reach without wings', () => {
    const w = world({ bossDefeated: true });
    w.warp('spires', '0');
    w.player.x = 55 * TILE;
    w.player.y = 11 * TILE - w.player.h;
    expect(climbTo(w, 60, 64, 6, 240)).toBe(false);
  });
});

describe('The Hanging Gloom', () => {
  it('its thorn pit can be crossed perch to perch', () => {
    const w = world({ bossDefeated: true, duelDefeated: true, wings: true });
    w.warp('gloom', 'k');
    const log: string[] = [];
    for (const [a, b, row] of [
      [19, 22, 14],
      [27, 30, 12],
      [35, 37, 14],
      [41, 50, 17],
    ] as [number, number, number][]) {
      expect(climbTo(w, a, b, row, 240, log), `perch at col ${a}`).toBe(true);
    }
    expect(log).toEqual([]);
  });
});

describe('merchant', () => {
  it('sells upgrades for shards and they change the player', () => {
    const kv = memoryStorage();
    const save = { ...newSave(), shards: 2000 };
    const w = new World({ save, store: kv });
    const p = w.player;
    expect(p.maxHp).toBe(PLAYER.maxHp);
    for (const item of SHOP) while (buy(w.save, item) === 'bought');
    w.applyStats();
    expect(p.maxHp).toBe(PLAYER.maxHp + 3);
    expect(p.damage).toBe(2);
    expect(p.healTime).toBeLessThan(PLAYER.healTime);
    expect(p.soulPerHit).toBeGreaterThan(PLAYER.soulPerHit);
    const spent = SHOP.reduce((n, it) => n + it.costs.reduce((a, b) => a + b, 0), 0);
    expect(w.save.shards).toBe(2000 - spent);
    expect(buy(w.save, SHOP[0])).toBe('sold-out');
    w.persist();
    expect(loadSave(kv)?.upgrades).toEqual({ mask: 3, blade: 1, focus: 1, vessel: 1 });
  });

  it('refuses when you are short', () => {
    const save = { ...newSave(), shards: 10 };
    expect(buy(save, SHOP[0])).toBe('poor');
    expect(save.shards).toBe(10);
  });

  it('opens with Up at the merchant and buys with jump', () => {
    const save = { ...newSave(), shards: 100, bench: { room: 'lantern', x: 29 * TILE + 16, y: 14 * TILE } };
    const w = new World({ save });
    for (let i = 0; i < 20; i++) w.update(makeInput());
    expect(w.nearMerchant).not.toBeNull();
    w.update(makeInput([], ['up']));
    expect(w.shop).not.toBeNull();
    for (let i = 0; i < 15; i++) w.update(makeInput());
    w.update(makeInput([], ['jump'])); // first item: Mask Shard, 60
    expect(w.save.upgrades.mask).toBe(1);
    expect(w.save.shards).toBe(40);
    expect(w.player.maxHp).toBe(PLAYER.maxHp + 1);
    w.update(makeInput([], ['attack']));
    expect(w.shop).toBeNull();
  });
});

describe('personalities', () => {
  it('the Warden shrugs off a greedy combo', () => {
    const w = world();
    w.warp('arena', '7');
    const b = w.boss as Warden;
    for (let i = 0; i < 200 && b.state !== 'idle'; i++) {
      b.wake();
      w.player.invuln = 10;
      w.update(makeInput());
    }
    expect(b.state).toBe('idle');
    const atk = { dir: 'side' as const, facing: 1 as const, t: 0, active: true, hit: new Set<object>(), pogoed: false, swing: 0 };
    for (let i = 0; i < 4; i++) b.strike(w, atk);
    w.player.invuln = 10;
    w.update(makeInput());
    expect(b.state).toBe('shrug');
  });

  it('the Warden bucks a player camping on its back', () => {
    const w = world();
    w.warp('arena', '7');
    const b = w.boss as Warden;
    for (let i = 0; i < 200 && b.state !== 'idle'; i++) {
      b.wake();
      w.player.invuln = 10;
      w.update(makeInput());
    }
    let bucked = false;
    for (let i = 0; i < 60 && !bucked; i++) {
      const p = w.player;
      p.invuln = 10;
      p.x = b.cx - p.w / 2;
      p.y = b.y - p.h - 10;
      p.vy = 0;
      w.update(makeInput());
      if (b.state === 'buck') bucked = true;
    }
    expect(bucked).toBe(true);
  });

  it('an Ironshell turns faster each time it is struck from behind', () => {
    const w = world();
    const s = new Ironshell(10 * TILE, 18 * TILE);
    s.facing = 1;
    const back = { dir: 'side' as const, facing: 1 as const, t: 0, active: true, hit: new Set<object>(), pogoed: false, swing: 0 };
    const before = (s as unknown as { turnDelay: number }).turnDelay;
    s.strike(w, back);
    s.strike(w, back);
    expect((s as unknown as { turnDelay: number }).turnDelay).toBeLessThan(before);
  });

  it('timid skitters flee when hurt, bold ones turn on you', () => {
    const w = world();
    const moods = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const s = new Skitter(100 + i * 37, 18 * TILE);
      s.damage(w, 1, 1, 0);
      moods.add(`${s.bold}:${s.mood}`);
    }
    expect(moods).toEqual(new Set(['true:charge', 'false:flee']));
  });
});

describe('Vesper, the Duskblade', () => {
  for (const seed of [1, 2, 3]) {
    it(`fight resolves without soft-locks, and she adapts (seed ${seed})`, () => {
      const kv = memoryStorage();
      const save = { ...newSave(), dash: true, wings: true, bossDefeated: true };
      const w = new World({ save, store: kv, seed });
      w.warp('duel', 'z');
      const p = w.player;
      for (let i = 0; i < 180 && !w.bossActive; i++) w.update(makeInput(['right']));
      expect(w.bossActive).toBe(true);
      const seen = new Set<VesperState>();
      let longest = 0;
      let cur: VesperState | null = null;
      let since = 0;
      for (let i = 0; i < 60 * 240 && !w.save.duelDefeated; i++) {
        p.invuln = 10;
        p.hp = p.maxHp;
        const b = w.boss instanceof Vesper ? w.boss : null;
        if (b) {
          seen.add(b.state);
          if (b.state !== cur) {
            cur = b.state;
            since = 0;
          } else since++;
          if (b.state !== 'dormant') longest = Math.max(longest, since);
          expect(b.x).toBeGreaterThanOrEqual(2 * TILE - 0.01);
          expect(b.x + b.w).toBeLessThanOrEqual(32 * TILE + 0.01);
        }
        // A pushy bot: chase and swing at her face. She should learn to parry it.
        const dx = b ? b.cx - p.cx : 0;
        const held: Action[] = Math.abs(dx) > 40 ? [dx > 0 ? 'right' : 'left'] : [];
        w.update(makeInput(held, i % 22 === 0 ? ['attack'] : []));
      }
      expect(w.save.duelDefeated).toBe(true);
      for (const s of ['intro', 'stance', 'lungeWind', 'parry', 'evade', 'enrage', 'dying'] as const) {
        expect(seen.has(s), `never saw ${s}`).toBe(true);
      }
      expect(longest / 60).toBeLessThan(4);
      expect(w.map.gatesClosed).toBe(false);
      expect(loadSave(kv)?.duelDefeated).toBe(true);
    });
  }
});
