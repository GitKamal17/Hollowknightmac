import { clamp } from '../core/math';
import { DT } from '../core/tuning';
import { moveBody } from '../physics/collide';
import type { World } from '../world/world';
import { Enemy } from './enemy';

type MothState = 'hover' | 'wind' | 'feint' | 'charge' | 'recover' | 'stun';

/**
 * Flying pest with a nervous streak. Once it notices you it circles above,
 * winds up, and sometimes loses its nerve mid-tell and darts aside before
 * trying again, so reacting to the first tell isn't enough. It aims where
 * you're going, not where you are.
 */
export class Duskmoth extends Enemy {
  readonly kind = 'duskmoth';
  state: MothState = 'hover';
  private homeX: number;
  private homeY: number;
  private cooldown = 0.5;
  private feinted = false;
  private willFeint = false;

  constructor(cx: number, cy: number) {
    super();
    this.w = 30;
    this.h = 26;
    this.hp = this.maxHp = 3;
    this.shards = 3;
    this.x = cx - this.w / 2;
    this.y = cy - this.h / 2;
    this.savePrev();
    this.homeX = this.x;
    this.homeY = this.y;
  }

  private set(s: MothState): void {
    this.state = s;
    this.st = 0;
  }

  update(w: World): void {
    this.tick();
    this.cooldown = Math.max(0, this.cooldown - DT);
    const p = w.player;
    const dx = p.cx - this.cx;
    const dy = p.cy - this.cy;
    const dist = Math.hypot(dx, dy);
    if (this.state !== 'charge') this.facing = dx >= 0 ? 1 : -1;
    const aware = p.alive && dist < 380;

    switch (this.state) {
      case 'hover': {
        // Drift to a perch above and to the side of the player, leashed to home.
        let tx = this.homeX + Math.sin(this.t * 1.3) * 34;
        let ty = this.homeY + Math.sin(this.t * 2.1) * 14;
        if (aware) {
          tx = clamp(p.cx - this.w / 2 - Math.sign(dx || 1) * 70, this.homeX - 260, this.homeX + 260);
          ty = clamp(p.y - 100, this.homeY - 160, this.homeY + 160);
        }
        this.vx = clamp((tx - this.x) * 2.5, -150, 150);
        this.vy = clamp((ty - this.y) * 2.5, -150, 150);
        if (aware && dist < 300 && this.cooldown <= 0) {
          this.feinted = false;
          this.willFeint = w.rng.next() < 0.35;
          this.set('wind');
        }
        break;
      }
      case 'wind':
        this.vx *= 0.85;
        this.vy *= 0.85;
        if (this.willFeint && !this.feinted && this.st > 0.22) {
          // Lose nerve: dart sideways, then try again.
          this.feinted = true;
          this.vx = (w.rng.next() < 0.5 ? -1 : 1) * 320;
          this.vy = -120;
          this.set('feint');
          break;
        }
        if (this.st >= 0.45) {
          const ax = p.cx + p.vx * 0.25 - this.cx;
          const ay = p.cy - this.cy;
          const d = Math.max(1, Math.hypot(ax, ay));
          this.vx = (ax / d) * 390;
          this.vy = (ay / d) * 390;
          this.facing = ax >= 0 ? 1 : -1;
          this.set('charge');
          w.sfx('mothCharge');
        }
        break;
      case 'feint':
        this.vx *= 0.9;
        this.vy *= 0.9;
        if (this.st >= 0.28) this.set('wind');
        break;
      case 'charge':
        if (this.st >= 0.6) this.set('recover');
        break;
      case 'recover':
      case 'stun':
        this.vx *= 0.9;
        this.vy *= 0.9;
        if (this.st >= (this.state === 'stun' ? 0.3 : 0.7)) {
          this.cooldown = 0.6 + w.rng.next() * 0.8;
          this.set('hover');
        }
        break;
    }

    const res = moveBody(this, this.vx * DT, this.vy * DT, w.map);
    if ((res.hitX || res.hitY) && this.state === 'charge') this.set('recover');
    if (res.hitX) this.vx = -this.vx * 0.3;
    if (res.hitY) this.vy = -this.vy * 0.3;
  }

  protected override knock(dirX: number, dirY: number): void {
    this.vx = dirX * 320;
    this.vy = dirY * 320 + (dirX !== 0 ? -60 : 0);
    this.set('stun');
  }
}
