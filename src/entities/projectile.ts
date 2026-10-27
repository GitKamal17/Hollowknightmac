import { DT } from '../core/tuning';
import type { World } from '../world/world';
import { Entity } from './entity';

export type ProjectileKind = 'orb' | 'wave' | 'debris' | 'glob' | 'slash' | 'crescent' | 'feather' | 'vine';

export class Projectile extends Entity {
  g = 0;
  life = 6;
  /** Seconds of harmless telegraph before it becomes active (debris). */
  delay = 0;
  t = 0;

  constructor(
    readonly kind: ProjectileKind,
    x: number,
    y: number,
    w: number,
    h: number,
    vx: number,
    vy: number,
  ) {
    super();
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.vx = vx;
    this.vy = vy;
    this.savePrev();
  }

  get harmful(): boolean {
    return this.delay <= 0 && !this.dead;
  }

  update(w: World): void {
    this.savePrev();
    this.t += DT;
    this.life -= DT;
    if (this.delay > 0) {
      this.delay -= DT;
      return;
    }
    this.vy += this.g * DT;
    this.x += this.vx * DT;
    this.y += this.vy * DT;

    const map = w.map;
    if (this.kind === 'slash' || this.kind === 'vine') {
      // Blade arcs and thorn vines stay put for a moment and ignore walls.
      if (this.life <= 0) this.dead = true;
      return;
    }
    if (this.kind === 'wave' || this.kind === 'crescent' || this.kind === 'feather') {
      if (map.overlapsSolid(this.x, this.y, this.w, this.h - 4) || this.life <= 0) this.pop(w);
      else if (this.kind === 'wave' && this.t % 0.04 < DT) w.particles.embers(this.cx, this.y + this.h, 1);
    } else if (map.overlapsSolid(this.x + 2, this.y + 2, this.w - 4, this.h - 4) || this.life <= 0) {
      this.pop(w);
    }
  }

  pop(w: World): void {
    if (this.dead) return;
    this.dead = true;
    if (this.kind === 'debris') {
      w.particles.debris(this.cx, this.y + this.h, 10);
      w.camera.addTrauma(0.12);
      w.sfx('debris');
    } else {
      if (this.kind === 'glob') w.particles.burst(this.cx, this.cy, 8, '#9be86a', 160, 3);
      else if (this.kind === 'crescent') w.particles.burst(this.cx, this.cy, 10, '#c9a6ff', 200, 3);
      else if (this.kind === 'feather') w.particles.burst(this.cx, this.cy, 5, '#e8d9c0', 140, 2);
      else w.particles.embers(this.cx, this.cy, this.kind === 'orb' ? 8 : 5);
    }
  }
}
