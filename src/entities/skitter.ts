import { approach, hash2 } from '../core/math';
import { DT } from '../core/tuning';
import type { World } from '../world/world';
import { Enemy } from './enemy';

type SkitterMood = 'patrol' | 'charge' | 'flee';

/**
 * Armoured crawler. Each one has a temperament, fixed by where it lives:
 * bold ones rush you when you're level with them and turn on you when hurt;
 * timid ones scurry away when hurt.
 */
export class Skitter extends Enemy {
  readonly kind = 'skitter';
  readonly bold: boolean;
  mood: SkitterMood = 'patrol';
  private knockT = 0;

  constructor(cx: number, bottom: number) {
    super();
    this.w = 34;
    this.h = 22;
    this.hp = this.maxHp = 2;
    this.shards = 3;
    this.placeAt(cx, bottom);
    this.bold = hash2(Math.floor(cx), Math.floor(bottom), 3) > 0.5;
  }

  private setMood(m: SkitterMood): void {
    this.mood = m;
    this.st = 0;
  }

  update(w: World): void {
    this.tick();
    const p = w.player;
    const dx = p.cx - this.cx;
    const level = Math.abs(p.y + p.h - (this.y + this.h)) < 24;
    const toward: 1 | -1 = dx >= 0 ? 1 : -1;

    if (this.mood === 'patrol' && this.bold && level && p.alive && Math.abs(dx) < 170 && toward === this.facing) {
      this.setMood('charge');
      w.sfx('skitter');
    }
    if (this.mood === 'charge' && (this.st > 1.3 || !level || Math.abs(dx) > 260)) this.setMood('patrol');
    if (this.mood === 'flee') {
      this.facing = -toward as 1 | -1;
      if (this.st > 1.0) this.setMood('patrol');
    }

    if (this.knockT > 0) {
      this.knockT -= DT;
      this.vx = approach(this.vx, 0, 900 * DT);
    } else {
      const speed = this.mood === 'charge' ? 125 : this.mood === 'flee' ? 150 : 55;
      this.vx = this.facing * speed;
    }
    const res = this.walk(w);
    if (this.knockT <= 0 && (res.hitX || (this.grounded && !this.groundAhead(w)))) {
      this.facing = -this.facing as 1 | -1;
      if (this.mood === 'charge') this.setMood('patrol');
    }
  }

  override damage(w: World, n: number, dirX: number, dirY: number): void {
    super.damage(w, n, dirX, dirY);
    if (this.dead) return;
    if (this.bold) {
      this.facing = w.player.cx >= this.cx ? 1 : -1;
      this.setMood('charge');
    } else this.setMood('flee');
  }

  protected override knock(dirX: number, dirY: number): void {
    this.knockT = 0.18;
    this.vx = dirX * 260;
    if (dirY < 0) this.vy = -200;
  }
}
