import { TILE } from '../core/tuning';

export const Tile = {
  Empty: 0,
  Solid: 1,
  Slick: 2,
  Spike: 3,
  Liquid: 4,
  Gate: 5,
  /** Solid until opened for good (the way east, after the Warden). */
  Seal: 6,
} as const;
export type TileId = (typeof Tile)[keyof typeof Tile];

export type Hazard = 'spike' | 'liquid';

/**
 * Collision grid for one room. Anything outside the grid is solid, except
 * directly beyond a door cell on the border, so bodies can walk out of doors.
 */
export class TileMap {
  gatesClosed = false;
  sealOpen = false;
  readonly pw: number;
  readonly ph: number;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly tiles: Uint8Array,
    readonly doorCells: Uint8Array,
  ) {
    this.pw = w * TILE;
    this.ph = h * TILE;
  }

  get(tx: number, ty: number): TileId {
    const inside = tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
    if (inside) return this.tiles[ty * this.w + tx] as TileId;
    const cx = Math.min(Math.max(tx, 0), this.w - 1);
    const cy = Math.min(Math.max(ty, 0), this.h - 1);
    return this.doorCells[cy * this.w + cx] ? Tile.Empty : Tile.Solid;
  }

  isSolid(tx: number, ty: number): boolean {
    const t = this.get(tx, ty);
    return t === Tile.Solid || t === Tile.Slick || (t === Tile.Gate && this.gatesClosed) || (t === Tile.Seal && !this.sealOpen);
  }

  isClingable(tx: number, ty: number): boolean {
    return this.get(tx, ty) === Tile.Solid;
  }

  private anyTile(x: number, y: number, w: number, h: number, test: (tx: number, ty: number) => boolean): boolean {
    const x0 = Math.floor(x / TILE);
    const y0 = Math.floor(y / TILE);
    const x1 = Math.floor((x + w - 1e-6) / TILE);
    const y1 = Math.floor((y + h - 1e-6) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (test(tx, ty)) return true;
      }
    }
    return false;
  }

  overlapsSolid(x: number, y: number, w: number, h: number): boolean {
    return this.anyTile(x, y, w, h, (tx, ty) => this.isSolid(tx, ty));
  }

  overlapsClingable(x: number, y: number, w: number, h: number): boolean {
    return this.anyTile(x, y, w, h, (tx, ty) => this.isClingable(tx, ty));
  }

  /** Hazard touching the box. Thorns only hurt in the lower part of their tile. */
  hazardIn(x: number, y: number, w: number, h: number): Hazard | null {
    let found: Hazard | null = null;
    this.anyTile(x, y, w, h, (tx, ty) => {
      const t = this.get(tx, ty);
      if (t === Tile.Spike) {
        const sx = tx * TILE + 4;
        const sy = ty * TILE + 12;
        if (x < sx + TILE - 8 && x + w > sx && y < sy + TILE - 12 && y + h > sy) found = 'spike';
      } else if (t === Tile.Liquid) {
        const sy = ty * TILE + 10;
        if (y + h > sy) found = 'liquid';
      }
      return found !== null;
    });
    return found;
  }

  /** Whether a downward strike box touches thorns (bounceable). */
  spikeIn(x: number, y: number, w: number, h: number): boolean {
    return this.anyTile(x, y, w, h, (tx, ty) => this.get(tx, ty) === Tile.Spike);
  }
}
