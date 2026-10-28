import { describe, expect, it } from 'vitest';
import { loadSave, memoryStorage, newSave, SAVE_KEY, writeSave, type KV } from '../src/world/save';
import { World } from '../src/world/world';

describe('save / load', () => {
  it('round-trips every persisted field', () => {
    const kv = memoryStorage();
    const s = newSave();
    s.bench = { room: 'lantern', x: 656, y: 448 };
    s.dash = true;
    s.bossDefeated = true;
    s.shards = 123;
    s.echo = { room: 'thorns', x: 400, y: 300, amount: 17 };
    s.visited = ['gate', 'roots', 'shaft'];
    expect(writeSave(kv, s)).toBe(true);
    expect(loadSave(kv)).toEqual(s);
  });

  it('returns null for missing, corrupt, or wrong-version data', () => {
    const kv = memoryStorage();
    expect(loadSave(kv)).toBeNull();
    kv.setItem(SAVE_KEY, '{not json');
    expect(loadSave(kv)).toBeNull();
    kv.setItem(SAVE_KEY, JSON.stringify({ v: 99 }));
    expect(loadSave(kv)).toBeNull();
    expect(loadSave(null)).toBeNull();
  });

  it('survives storage that throws', () => {
    const broken: KV = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadSave(broken)).toBeNull();
    expect(writeSave(broken, newSave())).toBe(false);
  });

  it('a world started from a save wakes at the saved lantern with its unlocks', () => {
    const kv = memoryStorage();
    const s = newSave();
    s.bench = { room: 'lantern', x: 656, y: 448 };
    s.dash = true;
    s.shards = 9;
    writeSave(kv, s);
    const w = new World({ save: loadSave(kv)!, store: kv });
    expect(w.room.def.id).toBe('lantern');
    expect(w.player.dashUnlocked).toBe(true);
    expect(w.player.cx).toBeCloseTo(656);
    expect(w.save.shards).toBe(9);
  });
});
