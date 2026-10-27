import { clamp } from '../core/math';
import { DT } from '../core/tuning';
import type { World } from '../world/world';
import { Enemy, type StrikeResult } from './enemy';
import type { Attack } from './player';
import { Projectile } from './projectile';

type SpitterState = 'idle' | 'aim' | 'hide' | 'stun';

const GLOB_GRAVITY = 900;

/**
 * Squat bulb that lobs acid. Skittish: get close and it snaps shut, shrugging
 * off side strikes, then pops open and spits point-blank. Strike it from above
 * while it hides. It leads its shots, so running in a straight line is unwise.
 */
export class Spitter extends Enemy {
  readonly kind = 'spitter';
  state: SpitterState = 'idle';
  private cd = 1;
  private hideCd = 0;

  constructor(cx: number, bottom: number) {
    super();
    this.w = 30;
    this.h = 24;
    this.hp = this.maxHp = 3;
    this.shards = 5;
    this.placeAt(cx, bottom);
  }

  private set(s: SpitterState): void {
    this.state = s;
    this.st = 0;
  }

  update(w: World): void {
    this.tick();
    this.cd = Math.max(0, this.cd - DT);
    this.hideCd = Math.max(0, this.hideCd - DT);
    const p = w.player;
    const dx = p.cx - this.cx;
    const dist = Math.hypot(dx, p.cy - this.cy);
    if (this.state !== 'hide') this.facing = dx >= 0 ? 1 : -1;

    switch (this.state) {
      case 'idle':
        if (p.alive && dist < 80 && this.hideCd <= 0) this.set('hide');
        else if (p.alive && dist < 420 && this.cd <= 0) this.set('aim');
        break;
      case 'aim':
        if (this.st >= 0.5) {
          this.spit(w);
          this.cd = 1.4 + w.rng.next() * 0.9;
          this.set('idle');
        }
        break;
      case 'hide':
        if (this.st >= 1.1) {
          // Pop open and spit immediately.
          this.spit(w);
          this.cd = 1.2;
          this.hideCd = 1.5;
          this.set('idle');
        }
        break;
      case 'stun':
        if (this.st >= 0.3) this.set('idle');
        break;
    }
    this.vx = 0;
    this.walk(w);
  }

  private spit(w: World): void {
    const p = w.player;
    const sx = this.cx + this.facing * 10;
    const sy = this.y + 4;
    const T = clamp(Math.abs(p.cx - sx) / 420, 0.45, 0.9);
    const tx = p.cx + p.vx * T * 0.8;
    const ty = p.cy;
    const vx = clamp((tx - sx) / T, -520, 520);
    const vy = clamp((ty - sy) / T - 0.5 * GLOB_GRAVITY * T, -760, 200);
    const g = new Projectile('glob', sx - 7, sy - 7, 14, 14, vx, vy);
    g.g = GLOB_GRAVITY;
    w.projectiles.push(g);
    w.sfx('spit');
  }

  override strike(w: World, atk: Attack): StrikeResult {
    if (this.state === 'hide' && atk.dir !== 'down') return 'blocked';
    return super.strike(w, atk);
  }

  protected override knock(): void {
    if (this.state !== 'hide') this.set('stun');
  }
}
