import { DT } from '../core/tuning';
import { moveBody } from '../physics/collide';
import type { World } from '../world/world';
import { Enemy } from './enemy';

/** Whoever laid this brood; told when one of its children is killed. */
export interface BroodParent {
  onChildLost(w: World): void;
}

/**
 * Small, fast, fragile flyer that swarms the player in a wobbling line.
 * Wild ones drop a shard; ones hatched by Ashveil drop nothing.
 */
export class Broodling extends Enemy {
  readonly kind = 'broodling';
  private stun = 0;
  private readonly seed: number;

  constructor(
    cx: number,
    cy: number,
    readonly mother: BroodParent | null = null,
  ) {
    super();
    this.w = 16;
    this.h = 14;
    this.hp = this.maxHp = 1;
    this.shards = mother ? 0 : 1;
    this.x = cx - this.w / 2;
    this.y = cy - this.h / 2;
    this.seed = (cx * 0.37 + cy * 0.11) % 6.28;
    this.savePrev();
  }

  update(w: World): void {
    this.tick();
    const p = w.player;
    this.stun = Math.max(0, this.stun - DT);
    if (this.stun <= 0) {
      const dx = p.cx - this.cx;
      const dy = p.cy - this.cy;
      const d = Math.max(1, Math.hypot(dx, dy));
      const wob = Math.sin(this.t * 6 + this.seed) * 70;
      const tx = (dx / d) * 165 - (dy / d) * wob;
      const ty = (dy / d) * 165 + (dx / d) * wob;
      this.vx += (tx - this.vx) * Math.min(1, 3 * DT);
      this.vy += (ty - this.vy) * Math.min(1, 3 * DT);
      if (!p.alive) this.vy -= 60 * DT;
    } else {
      this.vx *= 0.92;
      this.vy *= 0.92;
    }
    this.facing = this.vx >= 0 ? 1 : -1;
    const res = moveBody(this, this.vx * DT, this.vy * DT, w.map);
    if (res.hitX) this.vx = -this.vx * 0.5;
    if (res.hitY) this.vy = -this.vy * 0.5;
  }

  protected override knock(dirX: number, dirY: number): void {
    this.vx = dirX * 320;
    this.vy = dirY * 320;
    this.stun = 0.25;
  }
}

const HATCH_TIME = 1.4;

/** Laid by Ashveil. Hatches into a broodling unless smashed first (which grieves her). */
export class BroodEgg extends Enemy {
  readonly kind = 'egg';
  hatch = 0;

  constructor(
    cx: number,
    cy: number,
    vx: number,
    readonly mother: BroodParent | null,
  ) {
    super();
    this.w = 18;
    this.h = 20;
    this.hp = this.maxHp = 1;
    this.shards = 0;
    this.x = cx - this.w / 2;
    this.y = cy - this.h / 2;
    this.vx = vx;
    this.savePrev();
  }

  get ripeness(): number {
    return Math.min(1, this.hatch / HATCH_TIME);
  }

  override contactBox(): null {
    return null;
  }

  update(w: World): void {
    this.tick();
    const res = this.walk(w, 1800, 800);
    if (res.hitY || this.grounded) this.vx *= 0.8;
    if (!this.grounded) return;
    this.hatch += DT;
    if (this.hatch >= HATCH_TIME) {
      this.dead = true; // hatched, not killed: no grief, no drop
      w.enemies.push(new Broodling(this.cx, this.cy - 4, this.mother));
      w.particles.burst(this.cx, this.cy, 10, '#e8d9c0', 160, 2.5);
      w.sfx('hatch');
    }
  }
}
