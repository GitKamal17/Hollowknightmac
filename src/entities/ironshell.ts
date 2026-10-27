import { approach } from '../core/math';
import { DT } from '../core/tuning';
import type { World } from '../world/world';
import { Enemy, type StrikeResult } from './enemy';
import type { Attack } from './player';

type ShellState = 'patrol' | 'guard' | 'wind' | 'lunge' | 'recover' | 'stun';

/**
 * Shield bearer. Its shield faces forward and blocks strikes from the front.
 * Hit it from behind (it is slow to turn) or from above with a downward strike.
 */
export class Ironshell extends Enemy {
  readonly kind = 'ironshell';
  state: ShellState = 'patrol';
  turnTimer = 0;
  private lungeCd = 0;
  private lostTimer = 0;
  /** Brief shield wobble after a block, for the renderer. */
  blockFlash = 0;

  constructor(cx: number, bottom: number) {
    super();
    this.w = 36;
    this.h = 42;
    this.hp = this.maxHp = 5;
    this.shards = 7;
    this.placeAt(cx, bottom);
  }

  private set(s: ShellState): void {
    this.state = s;
    this.st = 0;
  }

  update(w: World): void {
    this.tick();
    this.lungeCd = Math.max(0, this.lungeCd - DT);
    this.blockFlash = Math.max(0, this.blockFlash - DT);
    const p = w.player;
    const dx = p.cx - this.cx;
    const aware = p.alive && Math.abs(dx) < 320 && Math.abs(p.cy - this.cy) < 110;

    switch (this.state) {
      case 'patrol':
        this.vx = this.facing * 40;
        if (aware) this.set('guard');
        break;
      case 'guard': {
        const toward = dx >= 0 ? 1 : -1;
        if (toward !== this.facing) {
          this.turnTimer += DT;
          if (this.turnTimer >= 0.45) {
            this.facing = toward;
            this.turnTimer = 0;
          }
        } else this.turnTimer = 0;
        const close = Math.abs(dx) < 110;
        this.vx = !close && toward === this.facing ? this.facing * 65 : approach(this.vx, 0, 600 * DT);
        if (!aware) {
          this.lostTimer += DT;
          if (this.lostTimer > 2) this.set('patrol');
        } else this.lostTimer = 0;
        if (Math.abs(dx) < 150 && toward === this.facing && this.lungeCd <= 0) this.set('wind');
        break;
      }
      case 'wind':
        this.vx = 0;
        if (this.st >= 0.4) {
          this.vx = this.facing * 340;
          this.set('lunge');
          w.sfx('lunge');
        }
        break;
      case 'lunge':
        if (this.st >= 0.3) {
          this.lungeCd = 1.5;
          this.set('recover');
        }
        break;
      case 'recover':
      case 'stun':
        this.vx = approach(this.vx, 0, 900 * DT);
        if (this.st >= (this.state === 'stun' ? 0.25 : 0.5)) this.set('guard');
        break;
    }

    const lunging = this.state === 'lunge';
    if (this.grounded && !this.groundAhead(w, Math.sign(this.vx) || this.facing) && Math.abs(this.vx) > 0) {
      // Never walk off ledges.
      if (this.state === 'patrol') this.facing = -this.facing as 1 | -1;
      this.vx = 0;
      if (lunging) this.set('recover');
    }
    const res = this.walk(w);
    if (res.hitX && this.state === 'patrol') this.facing = -this.facing as 1 | -1;
  }

  override strike(w: World, atk: Attack): StrikeResult {
    if (atk.dir === 'side' && atk.facing === -this.facing) {
      this.blockFlash = 0.15;
      this.vx = atk.facing * 120;
      return 'blocked';
    }
    return super.strike(w, atk);
  }

  protected override knock(dirX: number, dirY: number): void {
    this.vx = dirX * 200;
    if (dirY !== 0) this.vy = dirY < 0 ? -150 : 0;
    this.set('stun');
  }
}
