import { describe, expect, it } from 'vitest';
import { TILE } from '../src/core/tuning';
import { moveBody } from '../src/physics/collide';
import { parseRoom } from '../src/world/room';
import { box, settle, step, worldFrom } from './helpers';

const mapOf = (rows: string[]) => parseRoom({ id: 't', name: 't', theme: 'gate', links: {}, map: rows }).map;

describe('tile collision', () => {
  it('lands flush on the floor', () => {
    const map = mapOf(box(10, 8));
    const b = { x: 100, y: 40, w: 18, h: 34 };
    const res = moveBody(b, 0, 1000, map);
    expect(res.hitY).toBe(true);
    expect(b.y + b.h).toBe(6 * TILE);
  });

  it('stops flush against a wall when moving left', () => {
    const map = mapOf(box(10, 8));
    const b = { x: 100, y: 100, w: 18, h: 34 };
    moveBody(b, -500, 0, map);
    expect(b.x).toBe(TILE);
  });

  it('bonks on ceilings', () => {
    const map = mapOf(box(10, 8));
    const b = { x: 100, y: 100, w: 18, h: 34 };
    const res = moveBody(b, 0, -400, map);
    expect(res.hitY).toBe(true);
    expect(b.y).toBe(TILE);
  });

  it('never tunnels through a one-tile wall, whatever the speed', () => {
    const map = mapOf(
      box(20, 8, (r) => {
        for (let y = 1; y < 6; y++) r[y][10] = '#';
      }),
    );
    for (const dx of [50, 90, 200, 1000, 5000]) {
      const b = { x: 260, y: 4 * TILE, w: 18, h: 34 };
      const res = moveBody(b, dx, 0, map);
      expect(res.hitX).toBe(true);
      expect(b.x + b.w).toBe(10 * TILE);
    }
  });

  it('a dashing player stops at a thin wall instead of passing through', () => {
    const w = worldFrom(
      box(24, 10, (r) => {
        r[7][3] = 'P';
        for (let y = 1; y < 8; y++) r[y][12] = '#';
      }),
    );
    w.save.dash = true;
    settle(w);
    for (let i = 0; i < 6; i++) step(w, 30, ['right'], ['dash']);
    expect(w.player.x + w.player.w).toBeLessThanOrEqual(12 * TILE);
    expect(w.player.x + w.player.w).toBeCloseTo(12 * TILE, 3);
  });
});
