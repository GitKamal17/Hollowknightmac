import { describe, expect, it } from 'vitest';
import { makeInput, type Action } from '../src/core/input';
import { TILE } from '../src/core/tuning';
import { opposite, parseRoom } from '../src/world/room';
import { ROOMS, START_ROOM } from '../src/world/rooms';
import { newSave } from '../src/world/save';
import { World } from '../src/world/world';

const GROUNDED = new Set(['P', 'c', 's', 'B', 'L', 'T']);

describe('room data', () => {
  for (const def of Object.values(ROOMS)) {
    it(`${def.id}: parses, fills the screen, and spawns sit on floors`, () => {
      const room = parseRoom(def);
      expect(room.map.w).toBeGreaterThanOrEqual(30);
      expect(room.map.h).toBeGreaterThanOrEqual(17);
      for (const s of room.spawns) {
        expect(room.map.isSolid(s.tx, s.ty), `${s.kind} at ${s.tx},${s.ty} is inside rock`).toBe(false);
        if (GROUNDED.has(s.kind)) expect(room.map.isSolid(s.tx, s.ty + 1), `${s.kind} at ${s.tx},${s.ty} floats`).toBe(true);
      }
      expect(room.spawns.filter((s) => s.kind === 'T').length).toBe(def.texts?.length ?? 0);
    });
  }

  it('the start room has a player start', () => {
    expect(parseRoom(ROOMS[START_ROOM]).spawns.some((s) => s.kind === 'P')).toBe(true);
  });

  it('every door leads to a room with a matching door on the opposite side', () => {
    for (const def of Object.values(ROOMS)) {
      for (const d of parseRoom(def).doors) {
        const other = ROOMS[d.target];
        expect(other, `${def.id} door ${d.id} -> ${d.target}`).toBeDefined();
        const back = parseRoom(other).doors.find((x) => x.id === d.id);
        expect(back, `${d.target} lacks door ${d.id}`).toBeDefined();
        expect(back!.side).toBe(opposite(d.side));
        expect(back!.target).toBe(def.id);
      }
    }
  });
});

describe('walking through doors', () => {
  const cases: { room: string; door: string }[] = [];
  for (const def of Object.values(ROOMS)) for (const d of parseRoom(def).doors) cases.push({ room: def.id, door: d.id });

  for (const c of cases) {
    it(`${c.room} door ${c.door} leads somewhere safe`, () => {
      const save = newSave();
      save.dash = true;
      const w = new World({ save });
      w.warp(c.room, c.door);
      const door = w.room.doors.find((d) => d.id === c.door)!;
      const p = w.player;
      const target = door.target;
      // Stand just inside the door and head out.
      let held: Action[] = [];
      if (door.side === 'left' || door.side === 'right') {
        held = [door.side];
        p.y = (door.to + 1) * TILE - p.h;
        p.x = door.side === 'left' ? 2 * TILE : w.map.pw - 2 * TILE - p.w;
      } else {
        p.x = ((door.from + door.to + 1) / 2) * TILE - p.w / 2;
        p.y = door.side === 'top' ? 1 * TILE : w.map.ph - 2 * TILE;
        p.vy = door.side === 'top' ? -900 : 300;
      }
      p.vx = 0;
      p.inputLock = 0;
      p.savePrev();
      for (let i = 0; i < 90 && w.room.def.id === c.room; i++) w.update(makeInput(held));
      expect(w.room.def.id).toBe(target);
      // Let the arrival play out with no input: the player must end up standing, unhurt, in the new room.
      for (let i = 0; i < 180; i++) w.update(makeInput());
      expect(w.room.def.id).toBe(target);
      expect(p.hp).toBe(p.maxHp);
      expect(p.grounded).toBe(true);
      expect(w.map.overlapsSolid(p.x, p.y, p.w, p.h)).toBe(false);
    });
  }
});
