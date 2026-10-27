import { approach } from '../core/math';
import { DT } from '../core/tuning';
import type { World } from '../world/world';
import { Enemy } from './enemy';

/** Armoured crawler. Patrols, turning at walls and ledges. */
export class Skitter extends Enemy {
  readonly kind = 'skitter';
  private knockT = 0;

  constructor(cx: number, bottom: number) {
    super();
    this.w = 34;
    this.h = 22;
    this.hp = this.maxHp = 2;
    this.shards = 3;
    this.placeAt(cx, bottom);
  }

  update(w: World): void {
    this.tick();
    if (this.knockT > 0) {
      this.knockT -= DT;
      this.vx = approach(this.vx, 0, 900 * DT);
    } else {
      this.vx = this.facing * 55;
    }
    const res = this.walk(w);
    if (this.knockT <= 0 && (res.hitX || (this.grounded && !this.groundAhead(w)))) this.facing = -this.facing as 1 | -1;
  }

  protected override knock(dirX: number, dirY: number): void {
    this.knockT = 0.18;
    this.vx = dirX * 260;
    if (dirY < 0) this.vy = -200;
  }
}
