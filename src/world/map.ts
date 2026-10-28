import { Tile } from '../physics/tilemap';
import { opposite, parseRoom, type Door, type RoomDef, type Side } from './room';

export type MapIconKind = 'lantern' | 'merchant' | 'boss';
export type BossId = 'warden' | 'vesper' | 'ashveil';

export interface MapIcon {
  kind: MapIconKind;
  /** Tile position inside the room. */
  tx: number;
  ty: number;
  boss?: BossId;
}

/** One room on the map, in tile units. */
export interface MapRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  doors: Door[];
  icons: MapIcon[];
  /** The room's open space as horizontal runs [tx, ty, length], for drawing its shape. */
  open: [number, number, number][];
}

export interface MapLayout {
  rooms: Record<string, MapRoom>;
}

/** Empty tiles kept between neighbouring rooms, so the doorways between them show. */
export const MAP_GAP = 4;

const ICONS: Record<string, { kind: MapIconKind; boss?: BossId }> = {
  L: { kind: 'lantern' },
  M: { kind: 'merchant' },
  B: { kind: 'boss', boss: 'warden' },
  V: { kind: 'boss', boss: 'vesper' },
  A: { kind: 'boss', boss: 'ashveil' },
};

const STEP: Record<Side, [number, number]> = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };

/** Rooms touch or come closer than MAP_GAP - 1 tiles. */
function crowds(a: MapRoom, b: MapRoom): boolean {
  const m = MAP_GAP - 1;
  return a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
}

/**
 * Lay every room out on one plane, by how their doors connect: a room behind a
 * right-hand door sits to the right, with its matching door lined up, and so on.
 * The rooms aren't drawn to one consistent world, so where a placement would
 * overlap a room already placed, it slides further out along the door's
 * direction, which keeps the doors lined up and only stretches the corridor.
 */
export function layoutMap(rooms: Record<string, RoomDef>, start: string): MapLayout {
  const placed: Record<string, MapRoom> = {};
  const all: MapRoom[] = [];

  const make = (def: RoomDef, x: number, y: number): MapRoom => {
    const r = parseRoom(def);
    const icons: MapIcon[] = [];
    for (const s of r.spawns) {
      const ic = ICONS[s.kind];
      if (ic) icons.push({ ...ic, tx: s.tx, ty: s.ty });
    }
    const open: [number, number, number][] = [];
    const m = r.map;
    for (let ty = 0; ty < m.h; ty++) {
      for (let tx = 0; tx < m.w; tx++) {
        const t = m.get(tx, ty);
        if (t === Tile.Solid || t === Tile.Slick) continue;
        const last = open[open.length - 1];
        if (last && last[1] === ty && last[0] + last[2] === tx) last[2]++;
        else open.push([tx, ty, 1]);
      }
    }
    return { id: def.id, name: def.name, x, y, w: m.w, h: m.h, doors: r.doors, icons, open };
  };
  const add = (room: MapRoom): void => {
    placed[room.id] = room;
    all.push(room);
  };

  const ids = [start, ...Object.keys(rooms).filter((id) => id !== start)].filter((id) => rooms[id]);
  for (const root of ids) {
    if (placed[root]) continue;
    // A part of the map no door reaches from the start goes off to the right.
    const right = all.reduce((m, r) => Math.max(m, r.x + r.w + MAP_GAP), 0);
    add(make(rooms[root], right, 0));
    const queue = [root];
    while (queue.length) {
      const a = placed[queue.shift()!];
      for (const d of a.doors) {
        const def = rooms[d.target];
        if (!def || placed[def.id]) continue;
        const b = make(def, 0, 0);
        const back = b.doors.find((x) => x.id === d.id && x.side === opposite(d.side));
        // Line the matching doors up (or the room edges, if the far door is missing).
        const shift = d.from - (back?.from ?? 0);
        if (d.side === 'left' || d.side === 'right') {
          b.x = d.side === 'right' ? a.x + a.w + MAP_GAP : a.x - b.w - MAP_GAP;
          b.y = a.y + shift;
        } else {
          b.x = a.x + shift;
          b.y = d.side === 'bottom' ? a.y + a.h + MAP_GAP : a.y - b.h - MAP_GAP;
        }
        const [sx, sy] = STEP[d.side];
        while (all.some((o) => crowds(o, b))) {
          b.x += sx;
          b.y += sy;
        }
        add(b);
        queue.push(b.id);
      }
    }
  }
  return { rooms: placed };
}

/** Bounding box of the given rooms, in tiles. */
export function mapBounds(rooms: MapRoom[]): { x: number; y: number; w: number; h: number } {
  if (!rooms.length) return { x: 0, y: 0, w: 1, h: 1 };
  const x0 = Math.min(...rooms.map((r) => r.x));
  const y0 = Math.min(...rooms.map((r) => r.y));
  const x1 = Math.max(...rooms.map((r) => r.x + r.w));
  const y1 = Math.max(...rooms.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Map coordinates (tiles) of the middle of a door, just outside the room's edge. */
export function doorPoint(r: MapRoom, d: Door): { x: number; y: number } {
  const mid = (d.from + d.to + 1) / 2;
  switch (d.side) {
    case 'left':
      return { x: r.x, y: r.y + mid };
    case 'right':
      return { x: r.x + r.w, y: r.y + mid };
    case 'top':
      return { x: r.x + mid, y: r.y };
    case 'bottom':
      return { x: r.x + mid, y: r.y + r.h };
  }
}
