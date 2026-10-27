import { TILE } from '../core/tuning';
import type { TileMap } from './tilemap';

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MoveResult {
  hitX: boolean;
  hitY: boolean;
}

/** Largest distance moved before re-testing collision. Well under the smallest body and a tile. */
export const SUBSTEP = 8;

/**
 * Move a box through the tile map, X then Y, in small sub-steps so that no
 * speed can tunnel through a tile. On contact the box is snapped flush.
 */
export function moveBody(b: Body, dx: number, dy: number, map: TileMap): MoveResult {
  return { hitX: sweep(b, dx, 'x', map), hitY: sweep(b, dy, 'y', map) };
}

function sweep(b: Body, d: number, axis: 'x' | 'y', map: TileMap): boolean {
  let remaining = d;
  while (remaining !== 0) {
    const step = Math.abs(remaining) > SUBSTEP ? Math.sign(remaining) * SUBSTEP : remaining;
    remaining -= step;
    if (axis === 'x') b.x += step;
    else b.y += step;
    if (!map.overlapsSolid(b.x, b.y, b.w, b.h)) continue;
    if (axis === 'x') {
      b.x = step > 0 ? Math.floor((b.x + b.w - 1e-6) / TILE) * TILE - b.w : (Math.floor(b.x / TILE) + 1) * TILE;
    } else {
      b.y = step > 0 ? Math.floor((b.y + b.h - 1e-6) / TILE) * TILE - b.h : (Math.floor(b.y / TILE) + 1) * TILE;
    }
    return true;
  }
  return false;
}

/** True when standing on something solid. */
export function onGround(b: Body, map: TileMap): boolean {
  return map.overlapsSolid(b.x, b.y + b.h, b.w, 1);
}
