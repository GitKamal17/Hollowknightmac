import { hash2 } from '../core/math';
import { TILE } from '../core/tuning';
import { Tile, type TileMap } from '../physics/tilemap';
import type { Theme } from './themes';

const CHUNK = 16; // tiles per chunk side
const CHUNK_PX = CHUNK * TILE;
const MAX_CACHE_SCALE = 2.5;

/**
 * Static terrain is drawn once per room into chunk canvases at the current
 * display scale, then blitted each frame. Chunks keep memory bounded on big rooms.
 */
export class TerrainCache {
  private chunks = new Map<string, HTMLCanvasElement>();
  private key = '';

  draw(ctx: CanvasRenderingContext2D, map: TileMap, roomId: string, theme: Theme, scale: number, camX: number, camY: number, viewW: number, viewH: number): void {
    const s = Math.min(scale, MAX_CACHE_SCALE);
    const key = `${roomId}@${s.toFixed(3)}`;
    if (key !== this.key) {
      this.chunks.clear();
      this.key = key;
    }
    const x0 = Math.max(0, Math.floor(camX / CHUNK_PX));
    const y0 = Math.max(0, Math.floor(camY / CHUNK_PX));
    const x1 = Math.min(Math.ceil(map.w / CHUNK) - 1, Math.floor((camX + viewW) / CHUNK_PX));
    const y1 = Math.min(Math.ceil(map.h / CHUNK) - 1, Math.floor((camY + viewH) / CHUNK_PX));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const id = `${cx},${cy}`;
        let c = this.chunks.get(id);
        if (!c) {
          c = renderChunk(map, theme, cx, cy, s);
          this.chunks.set(id, c);
        }
        ctx.drawImage(c, cx * CHUNK_PX, cy * CHUNK_PX, CHUNK_PX, CHUNK_PX);
      }
    }
  }
}

const isRock = (map: TileMap, tx: number, ty: number): boolean => {
  const t = map.get(tx, ty);
  return t === Tile.Solid || t === Tile.Slick;
};

function renderChunk(map: TileMap, th: Theme, cx: number, cy: number, s: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.ceil(CHUNK_PX * s);
  c.height = Math.ceil(CHUNK_PX * s);
  const ctx = c.getContext('2d')!;
  ctx.setTransform(s, 0, 0, s, -cx * CHUNK_PX * s, -cy * CHUNK_PX * s);
  const tx0 = cx * CHUNK - 1;
  const ty0 = cy * CHUNK - 1;
  const tx1 = tx0 + CHUNK + 1;
  const ty1 = ty0 + CHUNK + 1;

  // Pass 1: rock bodies.
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (tx < -1 || ty < -1 || tx > map.w || ty > map.h) continue;
      if (isRock(map, tx, ty)) drawRock(ctx, map, th, tx, ty);
    }
  }
  // Pass 2: edge detail (drawn over neighbours so tufts and drips overlap cleanly).
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (tx < -1 || ty < -1 || tx > map.w || ty > map.h) continue;
      const t = map.get(tx, ty);
      if (t === Tile.Solid || t === Tile.Slick) drawEdges(ctx, map, th, tx, ty, t === Tile.Slick);
      else if (t === Tile.Spike) drawThorns(ctx, th, tx, ty);
    }
  }
  return c;
}

function drawRock(ctx: CanvasRenderingContext2D, map: TileMap, th: Theme, tx: number, ty: number): void {
  const x = tx * TILE;
  const y = ty * TILE;
  const up = !isRock(map, tx, ty - 1);
  const dn = !isRock(map, tx, ty + 1);
  const lf = !isRock(map, tx - 1, ty);
  const rt = !isRock(map, tx + 1, ty);
  const r = 11;
  const slick = map.get(tx, ty) === Tile.Slick;
  ctx.fillStyle = slick ? mix(th.rock, '#1c2a44', 0.55) : th.rock;
  ctx.beginPath();
  ctx.roundRect(x - 0.4, y - 0.4, TILE + 0.8, TILE + 0.8, [up && lf ? r : 0, up && rt ? r : 0, dn && rt ? r : 0, dn && lf ? r : 0]);
  ctx.fill();

  // Subtle interior mottling.
  if (!(up || dn || lf || rt)) {
    ctx.fillStyle = 'rgba(255,255,255,0.018)';
    for (let i = 0; i < 2; i++) {
      const h = hash2(tx, ty, i + 7);
      if (h > 0.55) {
        ctx.beginPath();
        ctx.arc(x + hash2(tx, ty, i + 11) * TILE, y + hash2(tx, ty, i + 13) * TILE, 3 + h * 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawEdges(ctx: CanvasRenderingContext2D, map: TileMap, th: Theme, tx: number, ty: number, slick: boolean): void {
  const x = tx * TILE;
  const y = ty * TILE;
  const up = !isRock(map, tx, ty - 1);
  const dn = !isRock(map, tx, ty + 1);
  const lf = !isRock(map, tx - 1, ty);
  const rt = !isRock(map, tx + 1, ty);
  const rim = slick ? '#9fc4e6' : th.rockLight;

  if (slick) {
    ctx.strokeStyle = 'rgba(190,220,255,0.10)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + TILE - 2);
    ctx.lineTo(x + TILE - 2, y + 6);
    ctx.moveTo(x + 2, y + 14);
    ctx.lineTo(x + 14, y + 2);
    ctx.stroke();
  }

  ctx.fillStyle = rim;
  if (lf) {
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x, y + (up ? 8 : 0), 2, TILE - (up ? 8 : 0) - (dn ? 8 : 0));
  }
  if (rt) {
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x + TILE - 2, y + (up ? 8 : 0), 2, TILE - (up ? 8 : 0) - (dn ? 8 : 0));
  }
  ctx.globalAlpha = 1;

  if (up) {
    // Lit lip along the top.
    const l = lf ? 7 : 0;
    const r = rt ? 7 : 0;
    ctx.fillStyle = rim;
    ctx.fillRect(x + l, y, TILE - l - r, 3);
    if (!slick) {
      // Soft moss clumps: deliberately rounded so decoration never reads as thorns.
      ctx.fillStyle = th.moss;
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < 3; i++) {
        const h = hash2(tx, ty, i);
        if (h < 0.4) continue;
        const bx = x + 6 + i * 10 + hash2(tx, ty, i + 20) * 4;
        if ((lf && bx < x + 8) || (rt && bx > x + TILE - 8)) continue;
        ctx.beginPath();
        ctx.ellipse(bx, y + 1, 3 + h * 4, 1.5 + h * 2.5, 0, Math.PI, 0);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  if (dn) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y + TILE - 4, TILE, 4);
    // Stalactite drips.
    ctx.fillStyle = slick ? mix(th.rock, '#1c2a44', 0.55) : th.rock;
    for (let i = 0; i < 2; i++) {
      const h = hash2(tx, ty, i + 40);
      if (h < 0.5) continue;
      const bx = x + 6 + i * 14 + hash2(tx, ty, i + 50) * 6;
      const len = 5 + h * 12;
      ctx.beginPath();
      ctx.moveTo(bx - 4, y + TILE - 1);
      ctx.lineTo(bx, y + TILE + len);
      ctx.lineTo(bx + 4, y + TILE - 1);
      ctx.fill();
    }
  }
}

/** Thorns are pale bone with a dark outline: the one shape in the game that always means danger. */
function drawThorns(ctx: CanvasRenderingContext2D, th: Theme, tx: number, ty: number): void {
  const x = tx * TILE;
  const base = (ty + 1) * TILE + 1;
  const bone = mix('#e4dcef', th.moss, 0.15);
  for (let i = 0; i < 3; i++) {
    const h = hash2(tx, ty, i + 90);
    const bx = x + 6 + i * 10;
    const tip = base - 20 - h * 6;
    const lean = (h - 0.5) * 6;
    ctx.beginPath();
    ctx.moveTo(bx - 6, base);
    ctx.quadraticCurveTo(bx - 3, base - 10, bx + lean, tip);
    ctx.quadraticCurveTo(bx + 3, base - 10, bx + 6, base);
    ctx.closePath();
    ctx.fillStyle = bone;
    ctx.fill();
    ctx.strokeStyle = '#07060b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(30,20,40,0.45)';
    ctx.beginPath();
    ctx.moveTo(bx + 0.5, base);
    ctx.quadraticCurveTo(bx + 2, base - 10, bx + lean, tip + 2);
    ctx.quadraticCurveTo(bx + 3.5, base - 9, bx + 5.5, base);
    ctx.closePath();
    ctx.fill();
  }
}

/** Mix two #rrggbb colours. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
