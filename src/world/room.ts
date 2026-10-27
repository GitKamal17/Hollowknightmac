import { TILE } from '../core/tuning';
import { Tile, TileMap, type TileId } from '../physics/tilemap';

export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface RoomDef {
  id: string;
  name: string;
  theme: string;
  map: string[];
  /** door id -> room on the other side (that room has a door with the same id) */
  links: Record<string, string>;
  /** For doors entered from below: which way to nudge the player onto a ledge. */
  land?: Record<string, 1 | -1>;
  texts?: string[];
  /** Tile column the player must pass to wake the boss. */
  bossTriggerX?: number;
}

export interface Door {
  id: string;
  side: Side;
  /** Inclusive tile range along the edge. */
  from: number;
  to: number;
  target: string;
  land: 1 | -1;
}

export interface Spawn {
  kind: string;
  tx: number;
  ty: number;
  /** Pixel centre x of the cell. */
  x: number;
  /** Pixel bottom y of the cell. */
  y: number;
  text?: string;
}

export interface Room {
  def: RoomDef;
  map: TileMap;
  doors: Door[];
  spawns: Spawn[];
}

const TILE_CHARS: Record<string, TileId> = {
  '#': Tile.Solid,
  '%': Tile.Slick,
  '^': Tile.Spike,
  '~': Tile.Liquid,
  G: Tile.Gate,
  S: Tile.Seal,
};

const DOOR_CHARS = /^[0-9w-z]$/;

const ENTITY_CHARS = new Set(['P', 'T', 'L', 'c', 'f', 's', 'p', 'B', 'V', 'D', 'W', 'M', 'Q']);

export function parseRoom(def: RoomDef): Room {
  const h = def.map.length;
  const w = def.map[0].length;
  const tiles = new Uint8Array(w * h);
  const doorCells = new Uint8Array(w * h);
  const spawns: Spawn[] = [];
  let textIndex = 0;

  for (let ty = 0; ty < h; ty++) {
    const row = def.map[ty];
    if (row.length !== w) throw new Error(`room ${def.id}: row ${ty} is ${row.length} wide, expected ${w}`);
    for (let tx = 0; tx < w; tx++) {
      const ch = row[tx];
      const i = ty * w + tx;
      if (ch in TILE_CHARS) tiles[i] = TILE_CHARS[ch];
      else if (DOOR_CHARS.test(ch)) doorCells[i] = ch.charCodeAt(0);
      else if (ENTITY_CHARS.has(ch)) {
        const s: Spawn = { kind: ch, tx, ty, x: tx * TILE + TILE / 2, y: (ty + 1) * TILE };
        if (ch === 'T') s.text = def.texts?.[textIndex++] ?? '';
        spawns.push(s);
      } else if (ch !== '.') throw new Error(`room ${def.id}: unknown tile '${ch}' at ${tx},${ty}`);
    }
  }

  return { def, map: new TileMap(w, h, tiles, doorCells), doors: findDoors(def, w, h, doorCells), spawns };
}

function findDoors(def: RoomDef, w: number, h: number, cells: Uint8Array): Door[] {
  const doors: Door[] = [];
  const scan = (side: Side, len: number, at: (i: number) => number): void => {
    let i = 0;
    while (i < len) {
      const c = cells[at(i)];
      if (!c) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < len && cells[at(j + 1)] === c) j++;
      const id = String.fromCharCode(c);
      const target = def.links[id];
      if (!target) throw new Error(`room ${def.id}: door '${id}' has no link`);
      doors.push({ id, side, from: i, to: j, target, land: def.land?.[id] ?? 1 });
      i = j + 1;
    }
  };
  scan('left', h, (i) => i * w);
  scan('right', h, (i) => i * w + w - 1);
  scan('top', w, (i) => i);
  scan('bottom', w, (i) => (h - 1) * w + i);
  return doors;
}

export function findDoor(room: Room, side: Side, alongPx: number): Door | null {
  const along = alongPx / TILE;
  let best: Door | null = null;
  let bestDist = Infinity;
  for (const d of room.doors) {
    if (d.side !== side) continue;
    const dist = along < d.from ? d.from - along : along > d.to + 1 ? along - d.to - 1 : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

export const opposite = (s: Side): Side =>
  s === 'left' ? 'right' : s === 'right' ? 'left' : s === 'top' ? 'bottom' : 'top';
