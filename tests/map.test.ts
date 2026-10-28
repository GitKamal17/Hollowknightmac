import { describe, expect, it } from 'vitest';
import { makeInput } from '../src/core/input';
import { layoutMap, MAP_GAP, type MapRoom } from '../src/world/map';
import type { RoomDef } from '../src/world/room';
import { ROOMS, START_ROOM } from '../src/world/rooms';
import { loadSave, memoryStorage, newSave, SAVE_KEY, writeSave } from '../src/world/save';
import { World } from '../src/world/world';
import { box, settle, step } from './helpers';

const separated = (a: MapRoom, b: MapRoom): boolean =>
  a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y;

describe('map layout', () => {
  const layout = layoutMap(ROOMS, START_ROOM);
  const placed = Object.values(layout.rooms);

  it('places every room once, at its own size', () => {
    expect(Object.keys(layout.rooms).sort()).toEqual(Object.keys(ROOMS).sort());
    for (const r of placed) {
      expect(r.w).toBe(ROOMS[r.id].map[0].length);
      expect(r.h).toBe(ROOMS[r.id].map.length);
    }
    expect(layout.rooms[START_ROOM]).toMatchObject({ x: 0, y: 0 });
  });

  it('no two rooms overlap, and there is a gap between them', () => {
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(separated(placed[i], placed[j]), `${placed[i].id} and ${placed[j].id} overlap`).toBe(true);
      }
    }
  });

  it('every door leads to a room on that side, with the two doors lined up', () => {
    for (const a of placed) {
      for (const d of a.doors) {
        const b = layout.rooms[d.target];
        const back = b.doors.find((x) => x.id === d.id)!;
        const where = `${a.id} door ${d.id} -> ${b.id}`;
        switch (d.side) {
          case 'right':
            expect(b.x, where).toBeGreaterThanOrEqual(a.x + a.w + MAP_GAP);
            break;
          case 'left':
            expect(b.x + b.w, where).toBeLessThanOrEqual(a.x - MAP_GAP);
            break;
          case 'top':
            expect(b.y + b.h, where).toBeLessThanOrEqual(a.y - MAP_GAP);
            break;
          case 'bottom':
            expect(b.y, where).toBeGreaterThanOrEqual(a.y + a.h + MAP_GAP);
            break;
        }
        // The doors start at the same row (or column), so the corridor between them is straight.
        if (d.side === 'left' || d.side === 'right') expect(b.y + back.from, where).toBe(a.y + d.from);
        else expect(b.x + back.from, where).toBe(a.x + d.from);
      }
    }
  });

  it('marks lanterns, merchants and bosses', () => {
    const kinds = (id: string) => layout.rooms[id].icons.map((i) => i.boss ?? i.kind).sort();
    expect(kinds('lantern')).toEqual(['lantern', 'merchant']);
    expect(kinds('market')).toEqual(['lantern', 'merchant']);
    expect(kinds('cradle')).toEqual(['lantern', 'merchant']);
    expect(kinds('arena')).toEqual(['warden']);
    expect(kinds('duel')).toEqual(['vesper']);
    expect(kinds('brood')).toEqual(['ashveil']);
    expect(kinds('gate')).toEqual([]);
  });

  it('slides a room out along its door when the natural spot is taken', () => {
    // a's right door leads to b; c hangs below a and would sit where b wants to go.
    const row = (w: number, fill = '#') => fill.repeat(w);
    const rooms: Record<string, RoomDef> = {
      a: { id: 'a', name: 'A', theme: 'gate', links: { '1': 'b', '2': 'c' }, map: [row(10), '#........1', '#........1', row(10), row(10), '#2########'] },
      c: { id: 'c', name: 'C', theme: 'gate', links: { '2': 'a' }, map: ['#2' + row(38), ...Array(5).fill(row(40))] },
      b: { id: 'b', name: 'B', theme: 'gate', links: { '1': 'a' }, map: [row(10), '1........#', '1........#', ...Array(20).fill(row(10))] },
    };
    const l = layoutMap(rooms, 'a');
    // b (tall, through the right door) is placed first; c's natural spot just below a runs into it.
    expect(l.rooms.b).toMatchObject({ x: 10 + MAP_GAP, y: 0 });
    expect(l.rooms.c.x).toBe(0);
    expect(l.rooms.c.y).toBeGreaterThan(6 + MAP_GAP);
    expect(separated(l.rooms.b, l.rooms.c)).toBe(true);
  });

  it('rooms no door reaches still get a place', () => {
    const lone: RoomDef = { id: 'lone', name: 'Lone', theme: 'gate', links: {}, map: box(30, 17) };
    const l = layoutMap({ ...ROOMS, lone }, START_ROOM);
    for (const r of Object.values(l.rooms)) if (r.id !== 'lone') expect(separated(r, l.rooms.lone)).toBe(true);
  });
});

describe('visited rooms', () => {
  it('entering a room records it, once, and saves it', () => {
    const kv = memoryStorage();
    const w = new World({ store: kv });
    expect(w.save.visited).toEqual(['gate']);
    w.warp('roots', '1');
    w.warp('gate', '1');
    w.warp('roots', '1');
    w.warp('shaft', '2');
    expect(w.save.visited).toEqual(['gate', 'roots', 'shaft']);
    expect(loadSave(kv)!.visited).toEqual(['gate', 'roots', 'shaft']);
  });

  it('a world loaded from the save remembers where it has been', () => {
    const kv = memoryStorage();
    const s = newSave();
    s.bench = { room: 'lantern', x: 656, y: 448 };
    s.visited = ['gate', 'roots', 'shaft', 'lantern'];
    writeSave(kv, s);
    const w = new World({ save: loadSave(kv)!, store: kv });
    expect(w.save.visited).toEqual(['gate', 'roots', 'shaft', 'lantern']);
    w.warp('gap', '6');
    expect(loadSave(kv)!.visited).toEqual(['gate', 'roots', 'shaft', 'lantern', 'gap']);
  });

  it('old saves without the list load with an empty one; junk entries are dropped', () => {
    const kv = memoryStorage();
    const old = newSave() as Partial<ReturnType<typeof newSave>>;
    delete old.visited;
    kv.setItem(SAVE_KEY, JSON.stringify(old));
    expect(loadSave(kv)!.visited).toEqual([]);
    kv.setItem(SAVE_KEY, JSON.stringify({ ...newSave(), visited: ['gate', 7, null, 'gate', 'roots'] }));
    expect(loadSave(kv)!.visited).toEqual(['gate', 'roots']);
  });
});

describe('holding the map', () => {
  it('opens while held, closes on release, and the player stands still', () => {
    const w = new World();
    settle(w);
    const x0 = w.player.x;
    step(w, 20, ['map', 'right']);
    expect(w.mapOpen).toBe(true);
    expect(w.mapFade).toBe(1);
    expect(w.player.x).toBeCloseTo(x0, 0);
    w.update(makeInput(['right']));
    expect(w.mapOpen).toBe(false);
    step(w, 20, ['right']);
    expect(w.player.x).toBeGreaterThan(x0 + 20);
    expect(w.mapFade).toBe(0);
  });

  it('does not open over a message', () => {
    const w = new World();
    w.modal = { title: 'x', body: 'y', t: 0 };
    step(w, 5, ['map']);
    expect(w.mapOpen).toBe(false);
  });
});
