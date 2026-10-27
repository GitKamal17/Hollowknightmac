import { approach, clamp, damp } from './math';
import { WORLD_VIEW_H, WORLD_VIEW_W } from './tuning';

interface Target {
  cx: number;
  cy: number;
  vy: number;
  facing: number;
  grounded: boolean;
  wallSliding: boolean;
}

interface Bounds {
  pw: number;
  ph: number;
}

const LOOK_AHEAD = 90;

/** Smooth follow with look-ahead, a vertical deadzone, room clamping and trauma shake. */
export class Camera {
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  readonly w = WORLD_VIEW_W;
  readonly h = WORLD_VIEW_H;
  look = 0;
  focusY = 0;
  trauma = 0;
  t = 0;

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  snap(p: Target, room: Bounds): void {
    this.look = p.facing * LOOK_AHEAD;
    this.focusY = p.cy - 30;
    this.x = p.cx + this.look - this.w / 2;
    this.y = this.focusY - this.h / 2;
    this.clamp(room);
    this.px = this.x;
    this.py = this.y;
  }

  /**
   * `focus`, when given (a boss), pulls the framing toward it so both fighters
   * stay on screen. The player is still clamped into the middle of the view.
   */
  update(p: Target, room: Bounds, dt: number, focus?: { x: number; y: number }): void {
    this.px = this.x;
    this.py = this.y;
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - 1.6 * dt);

    this.look = approach(this.look, p.facing * LOOK_AHEAD, 240 * dt);
    if (p.grounded || p.wallSliding) {
      this.focusY = damp(this.focusY, p.cy - 30, 5, dt);
    } else {
      // Deadzone: only follow vertically once the player leaves the band.
      if (p.cy > this.focusY + 70) this.focusY = p.cy - 70;
      if (p.cy < this.focusY - 110) this.focusY = p.cy + 110;
    }

    let tx = p.cx + this.look - this.w / 2;
    let ty = this.focusY - this.h / 2;
    if (focus) {
      tx = p.cx * 0.6 + focus.x * 0.4 + this.look * 0.5 - this.w / 2;
      ty = p.cy * 0.55 + focus.y * 0.45 - 20 - this.h / 2;
    }
    this.x = damp(this.x, tx, 6, dt);
    this.y = damp(this.y, ty, p.vy > 500 ? 11 : 6, dt);

    // Never let the player leave the middle of the screen, however fast they move.
    this.x = clamp(this.x, p.cx - this.w * 0.75, p.cx - this.w * 0.25);
    this.y = clamp(this.y, p.cy - this.h * 0.78, p.cy - this.h * 0.22);
    this.clamp(room);
  }

  private clamp(room: Bounds): void {
    this.x = room.pw <= this.w ? (room.pw - this.w) / 2 : clamp(this.x, 0, room.pw - this.w);
    this.y = room.ph <= this.h ? (room.ph - this.h) / 2 : clamp(this.y, 0, room.ph - this.h);
  }

  /** Render-only shake offset. */
  shake(): { x: number; y: number } {
    const m = 16 * this.trauma * this.trauma;
    return {
      x: m * (Math.sin(this.t * 71.3) * 0.6 + Math.sin(this.t * 37.1) * 0.4),
      y: m * (Math.sin(this.t * 63.7 + 1.3) * 0.6 + Math.sin(this.t * 29.9) * 0.4),
    };
  }
}
