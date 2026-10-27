import { DT, TILE } from '../core/tuning';
import type { Rect } from '../core/math';
import { moveBody, onGround } from '../physics/collide';
import type { World } from '../world/world';
import { Entity } from './entity';
import type { Attack } from './player';

export type StrikeResult = 'hit' | 'blocked' | 'none';
export type EnemyKind = 'skitter' | 'duskmoth' | 'ironshell' | 'spitter' | 'broodling' | 'egg' | 'warden' | 'vesper' | 'ashveil';

export abstract class Enemy extends Entity {
  abstract readonly kind: EnemyKind;
  hp = 1;
  maxHp = 1;
  facing: 1 | -1 = -1;
  flash = 0;
  /** Seconds alive, and seconds in the current state. */
  t = 0;
  st = 0;
  /** Currency dropped on death. */
  shards = 2;
  grounded = false;

  abstract update(w: World): void;

  hurtbox(): Rect {
    return this.box();
  }

  /** Box that hurts the player on touch, or null when harmless. */
  contactBox(): Rect | null {
    return { x: this.x + 4, y: this.y + 4, w: this.w - 8, h: this.h - 6 };
  }

  strike(w: World, atk: Attack): StrikeResult {
    const dirX = atk.dir === 'side' ? atk.facing : 0;
    const dirY = atk.dir === 'up' ? -1 : atk.dir === 'down' ? 1 : 0;
    this.damage(w, w.player.damage, dirX, dirY);
    return 'hit';
  }

  damage(w: World, n: number, dirX: number, dirY: number): void {
    this.hp -= n;
    this.flash = 0.12;
    this.knock(dirX, dirY);
    if (this.hp <= 0) {
      this.dead = true;
      w.onEnemyKilled(this);
    }
  }

  protected knock(_dirX: number, _dirY: number): void {}

  protected tick(): void {
    this.savePrev();
    this.t += DT;
    this.st += DT;
    this.flash = Math.max(0, this.flash - DT);
  }

  /** Gravity + tile collision for walkers. */
  protected walk(w: World, gravity = 2000, maxFall = 720): { hitX: boolean; hitY: boolean } {
    this.vy = Math.min(maxFall, this.vy + gravity * DT);
    const res = moveBody(this, this.vx * DT, this.vy * DT, w.map);
    if (res.hitX) this.vx = 0;
    if (res.hitY) this.vy = 0;
    this.grounded = onGround(this, w.map);
    return res;
  }

  /** Is there floor in front of the leading foot? */
  protected groundAhead(w: World, dir: number = this.facing): boolean {
    const fx = dir > 0 ? this.x + this.w + 2 : this.x - 3;
    return w.map.overlapsSolid(fx, this.y + this.h + 1, 1, TILE / 2);
  }
}
