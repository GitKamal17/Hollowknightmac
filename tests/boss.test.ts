import { describe, expect, it } from 'vitest';
import { makeInput, type Action } from '../src/core/input';
import { TILE } from '../src/core/tuning';
import { WARDEN_HP, type WardenState } from '../src/entities/warden';
import { loadSave, memoryStorage, newSave } from '../src/world/save';
import { World } from '../src/world/world';

describe('Warden of the Well', () => {
  for (const seed of [1, 2, 3]) {
    it(`fight resolves without soft-locks (seed ${seed})`, () => {
      const kv = memoryStorage();
      const save = newSave();
      save.dash = true;
      const w = new World({ save, store: kv, seed });
      w.warp('arena', '7');
      const p = w.player;

      for (let i = 0; i < 180 && !w.bossActive; i++) w.update(makeInput(['right']));
      expect(w.bossActive).toBe(true);
      expect(w.map.gatesClosed).toBe(true);

      const seen = new Set<WardenState>();
      let phase2At = -1;
      let longest = 0;
      let current: WardenState | null = null;
      let since = 0;
      for (let i = 0; i < 60 * 180 && !w.save.bossDefeated; i++) {
        // God mode: this tests the boss, not the bot's dodging.
        p.invuln = 10;
        p.hp = p.maxHp;
        const b = w.boss;
        if (b) {
          seen.add(b.state);
          if (b.phase === 2 && phase2At < 0) phase2At = b.hp;
          if (b.state !== current) {
            current = b.state;
            since = 0;
          } else since++;
          if (b.state !== 'dormant') longest = Math.max(longest, since);
          expect(b.x).toBeGreaterThanOrEqual(2 * TILE - 0.01);
          expect(b.x + b.w).toBeLessThanOrEqual(30 * TILE + 0.01);
        }
        const dx = b ? b.cx - p.cx : 0;
        const held: Action[] = Math.abs(dx) > 60 ? [dx > 0 ? 'right' : 'left'] : [];
        w.update(makeInput(held, i % 22 === 0 ? ['attack'] : []));
      }

      expect(w.save.bossDefeated).toBe(true);
      expect(phase2At).toBeLessThanOrEqual(WARDEN_HP / 2);
      expect(phase2At).toBeGreaterThan(0);
      for (const s of ['intro', 'leapWind', 'chargeWind', 'burstWind', 'rainWind', 'enrage', 'dying'] as const) {
        expect(seen.has(s), `never saw ${s}`).toBe(true);
      }
      expect(longest / 60).toBeLessThan(4); // no state lasts long enough to look stuck
      expect(w.map.gatesClosed).toBe(false);
      expect(loadSave(kv)?.bossDefeated).toBe(true);
    });
  }

  it('stays defeated after re-entering the arena', () => {
    const save = newSave();
    save.bossDefeated = true;
    const w = new World({ save });
    w.warp('arena', '7');
    expect(w.boss).toBeNull();
    for (let i = 0; i < 120; i++) w.update(makeInput(['right']));
    expect(w.map.gatesClosed).toBe(false);
  });
});
