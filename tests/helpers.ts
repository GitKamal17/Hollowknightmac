import { makeInput, type Action, type InputState } from '../src/core/input';
import type { RoomDef } from '../src/world/room';
import { World, type WorldOptions } from '../src/world/world';

/** Build a world containing a single ad-hoc room. */
export function worldFrom(map: string[], opts: Partial<WorldOptions> & { links?: Record<string, string> } = {}): World {
  const def: RoomDef = { id: 'test', name: 'Test', theme: 'gate', links: opts.links ?? {}, map };
  return new World({ rooms: { test: def }, startRoom: 'test', ...opts });
}

/** A closed box room with a flat floor; P marks the start. */
export function box(w: number, h: number, extra: (rows: string[][]) => void = () => {}): string[] {
  const rows: string[][] = [];
  for (let y = 0; y < h; y++) {
    rows.push([]);
    for (let x = 0; x < w; x++) rows[y].push(x === 0 || y === 0 || x === w - 1 || y >= h - 2 ? '#' : '.');
  }
  extra(rows);
  return rows.map((r) => r.join(''));
}

export function step(w: World, frames: number, held: Action[] = [], pressed: Action[] = []): void {
  for (let i = 0; i < frames; i++) w.update(makeInput(held, i === 0 ? pressed : []));
}

export function stepWith(w: World, frames: number, input: (i: number) => InputState): void {
  for (let i = 0; i < frames; i++) w.update(input(i));
}

/** Run until the player is standing still on the ground. */
export function settle(w: World): void {
  for (let i = 0; i < 240 && !w.player.grounded; i++) w.update(makeInput());
  step(w, 10);
}
