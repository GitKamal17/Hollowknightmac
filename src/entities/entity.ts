import type { Rect } from '../core/math';

export abstract class Entity implements Rect {
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  vx = 0;
  vy = 0;
  /** Position at the start of the step, for render interpolation. */
  px = 0;
  py = 0;
  dead = false;

  get cx(): number {
    return this.x + this.w / 2;
  }

  get cy(): number {
    return this.y + this.h / 2;
  }

  savePrev(): void {
    this.px = this.x;
    this.py = this.y;
  }

  /** Place by bottom-centre and reset interpolation. */
  placeAt(cx: number, bottom: number): void {
    this.x = cx - this.w / 2;
    this.y = bottom - this.h;
    this.savePrev();
  }

  box(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }
}
