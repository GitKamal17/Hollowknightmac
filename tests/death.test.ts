import { describe, expect, it } from 'vitest';
import { makeInput } from '../src/core/input';
import { TILE } from '../src/core/tuning';
import { Echo } from '../src/entities/pickups';
import { loadSave, memoryStorage, newSave } from '../src/world/save';
import { World } from '../src/world/world';

describe('death and the echo', () => {
  it('drops shards where you fell, wakes you at the lantern, and returns them when you reach the echo', () => {
    const kv = memoryStorage();
    const save = newSave();
    save.bench = { room: 'lantern', x: 20 * TILE + 16, y: 14 * TILE };
    save.shards = 25;
    const w = new World({ save, store: kv });
    w.warp('roots', '1');
    const p = w.player;
    for (let i = 0; i < 60; i++) w.update(makeInput());
    w.enemies = [];
    expect(p.grounded).toBe(true);
    const fellAt = { x: p.lastSafe.x, y: p.lastSafe.y };

    while (p.state !== 'dead') {
      p.invuln = 0;
      w.damagePlayer(p.cx + 10);
      w.update(makeInput());
    }
    for (let i = 0; i < 60 * 5 && w.room.def.id !== 'lantern'; i++) w.update(makeInput());

    expect(w.room.def.id).toBe('lantern');
    expect(p.hp).toBe(p.maxHp);
    expect(w.save.shards).toBe(0);
    expect(w.save.echo).toEqual({ room: 'roots', x: fellAt.x, y: fellAt.y, amount: 25 });
    expect(loadSave(kv)?.echo?.amount).toBe(25);

    // Go back and touch it.
    w.warp('roots', '1');
    const echo = w.pickups.find((x) => x instanceof Echo);
    expect(echo).toBeDefined();
    w.enemies = [];
    p.x = echo!.x;
    p.y = echo!.y;
    w.update(makeInput());
    expect(w.save.shards).toBe(25);
    expect(w.save.echo).toBeNull();
    expect(w.pickups.some((x) => x instanceof Echo)).toBe(false);
  });

  it('falling with nothing to lose leaves no echo', () => {
    const save = newSave();
    const w = new World({ save });
    const p = w.player;
    for (let i = 0; i < 30; i++) w.update(makeInput());
    while (p.state !== 'dead') {
      p.invuln = 0;
      w.damagePlayer(p.cx + 10);
      w.update(makeInput());
    }
    for (let i = 0; i < 60 * 5; i++) w.update(makeInput());
    expect(w.save.echo).toBeNull();
    expect(p.state).toBe('normal');
  });
});
