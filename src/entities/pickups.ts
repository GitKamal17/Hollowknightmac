import { DT } from '../core/tuning';
import { moveBody } from '../physics/collide';
import type { World } from '../world/world';
import { Entity } from './entity';

export type PickupKind = 'shard' | 'lantern' | 'relic' | 'echo' | 'tablet';

export abstract class Pickup extends Entity {
  abstract readonly kind: PickupKind;
  t = 0;

  update(_w: World): void {
    this.savePrev();
    this.t += DT;
  }
}

/** Currency. Bounces out of fallen enemies and settles on the floor. */
export class Shard extends Pickup {
  readonly kind = 'shard';
  readonly spin = Math.random() * Math.PI * 2;

  constructor(cx: number, cy: number, vx: number, vy: number) {
    super();
    this.w = this.h = 10;
    this.x = cx - 5;
    this.y = cy - 5;
    this.vx = vx;
    this.vy = vy;
    this.savePrev();
  }

  get collectible(): boolean {
    return this.t > 0.3;
  }

  override update(w: World): void {
    super.update(w);
    this.vy = Math.min(700, this.vy + 1600 * DT);
    const falling = this.vy;
    const res = moveBody(this, this.vx * DT, this.vy * DT, w.map);
    if (res.hitX) this.vx = -this.vx * 0.5;
    if (res.hitY) {
      this.vy = falling > 0 && falling > 120 ? -falling * 0.42 : 0;
      this.vx *= 0.7;
      if (falling > 120) w.sfx('shardBounce');
    }
  }
}

export class Lantern extends Pickup {
  readonly kind = 'lantern';
  constructor(cx: number, bottom: number) {
    super();
    this.w = 40;
    this.h = 64;
    this.placeAt(cx, bottom);
  }
}

export class Relic extends Pickup {
  readonly kind = 'relic';
  constructor(cx: number, bottom: number) {
    super();
    this.w = this.h = 28;
    this.placeAt(cx, bottom - 10);
  }
}

/** What remains where the player last fell, holding their shards. */
export class Echo extends Pickup {
  readonly kind = 'echo';
  constructor(
    x: number,
    y: number,
    readonly amount: number,
  ) {
    super();
    this.w = 24;
    this.h = 34;
    this.x = x;
    this.y = y;
    this.savePrev();
  }
}

export class Tablet extends Pickup {
  readonly kind = 'tablet';
  constructor(
    cx: number,
    bottom: number,
    readonly text: string,
  ) {
    super();
    this.w = 30;
    this.h = 40;
    this.placeAt(cx, bottom);
  }
}
