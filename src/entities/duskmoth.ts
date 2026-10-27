import { clamp } from '../core/math';
import { DT } from '../core/tuning';
import { moveBody } from '../physics/collide';
import type { World } from '../world/world';
import { Enemy } from './enemy';

type MothState = 'hover' | 'wind' | 'charge' | 'recover' | 'stun';

/** Flying pest. Hovers near home, winds up when the player is close, then charges. */
export class Duskmoth extends Enemy {
  readonly kind = 'duskmoth';
  state: MothState = 'hover';
  private homeX: number;
  private homeY: number;
  private cooldown = 0.5;

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

    switch (this.state) {
      case 'hover': {
        const tx = this.homeX + Math.sin(this.t * 1.3) * 34;
        const ty = this.homeY + Math.sin(this.t * 2.1) * 14;
        this.vx = clamp((tx - this.x) * 2.5, -140, 140);
        this.vy = clamp((ty - this.y) * 2.5, -140, 140);
        if (dist < 300 && this.cooldown <= 0 && p.alive) this.set('wind');
        break;
      }
      case 'wind':
        this.vx *= 0.85;
        this.vy *= 0.85;
        if (this.st >= 0.45) {
          const d = Math.max(1, dist);
          this.vx = (dx / d) * 380;
          this.vy = (dy / d) * 380;
          this.facing = dx >= 0 ? 1 : -1;
          this.set('charge');
          w.sfx('mothCharge');
        }
        break;
      case 'charge':
        if (this.st >= 0.6) this.set('recover');
        break;
      case 'recover':
      case 'stun':
        this.vx *= 0.9;
        this.vy *= 0.9;
        if (this.st >= (this.state === 'stun' ? 0.3 : 0.7)) {
          this.cooldown = 0.9;
          this.homeX = this.x;
          this.homeY = this.y;
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
