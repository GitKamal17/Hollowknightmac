import { hashString } from '../core/math';
import { Rng } from '../core/rng';
import { WORLD_VIEW_H as VIEW_H, WORLD_VIEW_W as VIEW_W } from '../core/tuning';
import type { Theme } from './themes';

type ShapeKind = 'drip' | 'spire' | 'column' | 'arch' | 'root';

interface Shape {
  kind: ShapeKind;
  x: number;
  w: number;
  h: number;
  /** Jagged offsets, so the silhouettes are not perfectly regular. */
  j: number[];
  sway: number;
}

interface Layer {
  f: number;
  w: number;
  h: number;
  shapes: Shape[];
}

interface Mote {
  x: number;
  y: number;
  r: number;
  speed: number;
  phase: number;
}

const layerSize = (room: number, view: number, f: number): number => Math.max(view, view + (room - view) * f);

/** Procedural parallax: far ruins and spires, nearer roots, light shafts, motes and dark foreground. */
export class Background {
  private key = '';
  private far!: Layer;
  private mid!: Layer;
  private front!: Layer;
  private beams: { x: number; w: number; lean: number }[] = [];
  private motes: Mote[] = [];

  private ensure(roomId: string, pw: number, ph: number): void {
    if (roomId === this.key) return;
    this.key = roomId;
    const rng = new Rng(hashString(roomId));
    this.far = this.makeLayer(rng, 0.25, pw, ph, 150, ['drip', 'spire', 'column', 'arch', 'drip']);
    this.mid = this.makeLayer(rng, 0.55, pw, ph, 120, ['drip', 'spire', 'root', 'root', 'column']);
    this.front = this.makeLayer(rng, 1.3, pw, ph, 520, ['drip']);
    this.beams = [];
    const nb = 2 + rng.int(0, 2);
    for (let i = 0; i < nb; i++) this.beams.push({ x: rng.range(0.05, 0.95), w: rng.range(40, 110), lean: rng.range(-0.35, 0.1) });
    this.motes = [];
    for (let i = 0; i < 55; i++) {
      this.motes.push({ x: rng.next(), y: rng.next(), r: rng.range(0.8, 2.2), speed: rng.range(4, 16), phase: rng.range(0, 6.28) });
    }
  }

  private makeLayer(rng: Rng, f: number, pw: number, ph: number, spacing: number, kinds: ShapeKind[]): Layer {
    const w = layerSize(pw, VIEW_W, f);
    const h = layerSize(ph, VIEW_H, f);
    const shapes: Shape[] = [];
    for (let x = -100; x < w + 100; x += spacing * rng.range(0.6, 1.4)) {
      if (f > 1 && rng.next() < 0.45) continue;
      const kind = rng.pick(kinds);
      const big = f > 1 ? rng.range(0.6, 1.1) : 1;
      shapes.push({
        kind,
        x,
        w: rng.range(30, 110) * big,
        h: kind === 'column' || kind === 'arch' ? h : rng.range(0.15, 0.45) * Math.min(h, 900) * (f > 1 ? 0.4 : 1),
        j: [rng.next(), rng.next(), rng.next(), rng.next()],
        sway: rng.range(0, 6.28),
      });
    }
    return { f, w, h, shapes };
  }

  drawBack(ctx: CanvasRenderingContext2D, th: Theme, roomId: string, pw: number, ph: number, camX: number, camY: number, t: number): void {
    this.ensure(roomId, pw, ph);
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, th.skyTop);
    sky.addColorStop(1, th.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    this.drawLayer(ctx, this.far, th.far, camX, camY, t, 0.55);
    this.drawBeams(ctx, th, camX, t);
    this.fog(ctx, th.far, 0.35);
    this.drawLayer(ctx, this.mid, th.mid, camX, camY, t, 0.9);
    this.fog(ctx, th.mid, 0.25);
    this.drawMotes(ctx, th, camX, camY, t);
  }

  drawFront(ctx: CanvasRenderingContext2D, camX: number, camY: number, t: number): void {
    this.drawLayer(ctx, this.front, '#020306', camX, camY, t, 0.85);
  }

  private fog(ctx: CanvasRenderingContext2D, color: string, alpha: number): void {
    const g = ctx.createLinearGradient(0, VIEW_H * 0.35, 0, VIEW_H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, color);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 1;
  }

  private drawLayer(ctx: CanvasRenderingContext2D, L: Layer, color: string, camX: number, camY: number, t: number, alpha: number): void {
    const ox = -camX * L.f;
    const oy = -camY * L.f;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    for (const s of L.shapes) {
      if (s.x + s.w * 2 + ox < -50 || s.x - s.w + ox > VIEW_W + 50) continue;
      drawShape(ctx, s, L.h, t);
    }
    ctx.restore();
  }

  private drawBeams(ctx: CanvasRenderingContext2D, th: Theme, camX: number, t: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.beams) {
      const x = b.x * VIEW_W * 1.4 - camX * 0.4 * 0.3 - VIEW_W * 0.2;
      const pulse = 0.05 + Math.sin(t * 0.4 + b.x * 10) * 0.015;
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      g.addColorStop(0, `rgba(${th.beam},${pulse})`);
      g.addColorStop(1, `rgba(${th.beam},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, -10);
      ctx.lineTo(x + b.w, -10);
      ctx.lineTo(x + b.w * 2 + b.lean * VIEW_H, VIEW_H);
      ctx.lineTo(x + b.lean * VIEW_H - b.w * 0.5, VIEW_H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawMotes(ctx: CanvasRenderingContext2D, th: Theme, camX: number, camY: number, t: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = th.accent;
    const W = VIEW_W + 60;
    const H = VIEW_H + 60;
    for (const m of this.motes) {
      const x = (((m.x * W - camX * 0.8 + Math.sin(t * 0.3 + m.phase) * 20) % W) + W) % W - 30;
      const y = (((m.y * H - camY * 0.8 - t * m.speed) % H) + H) % H - 30;
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 1.5 + m.phase);
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, layerH: number, t: number): void {
  const { x, w, h, j } = s;
  ctx.beginPath();
  switch (s.kind) {
    case 'drip': // hangs from the top
      ctx.moveTo(x - w / 2, -20);
      ctx.lineTo(x - w * (0.2 + j[0] * 0.15), h * (0.45 + j[1] * 0.2));
      ctx.lineTo(x + (j[2] - 0.5) * w * 0.2, h);
      ctx.lineTo(x + w * (0.2 + j[3] * 0.15), h * (0.5 + j[0] * 0.15));
      ctx.lineTo(x + w / 2, -20);
      ctx.fill();
      break;
    case 'spire': // rises from the bottom
      ctx.moveTo(x - w / 2, layerH + 20);
      ctx.lineTo(x - w * (0.2 + j[1] * 0.1), layerH - h * (0.5 + j[2] * 0.2));
      ctx.lineTo(x + (j[0] - 0.5) * w * 0.25, layerH - h);
      ctx.lineTo(x + w * (0.25 + j[3] * 0.1), layerH - h * (0.45 + j[1] * 0.2));
      ctx.lineTo(x + w / 2, layerH + 20);
      ctx.fill();
      break;
    case 'column': {
      const cw = w * 0.45;
      ctx.moveTo(x - cw * 0.6, -20);
      ctx.lineTo(x - cw * 0.45, layerH * 0.5);
      ctx.lineTo(x - cw * 0.7, layerH + 20);
      ctx.lineTo(x + cw * 0.7, layerH + 20);
      ctx.lineTo(x + cw * 0.45, layerH * 0.5);
      ctx.lineTo(x + cw * 0.6, -20);
      ctx.fill();
      break;
    }
    case 'arch': {
      // A ruined arch: two pillars and a broken vault.
      const span = w * 1.8;
      const top = layerH * (0.35 + j[0] * 0.2);
      const pw = 14 + j[1] * 10;
      ctx.fillRect(x, top, pw, layerH - top + 20);
      ctx.fillRect(x + span, top + j[2] * 40, pw, layerH - top + 20);
      ctx.lineWidth = pw * 0.8;
      ctx.beginPath();
      ctx.arc(x + span / 2 + pw / 2, top, span / 2, Math.PI, Math.PI * (1.55 + j[3] * 0.45));
      ctx.stroke();
      break;
    }
    case 'root': {
      const sway = Math.sin(t * 0.6 + s.sway) * 6;
      ctx.lineWidth = 2 + j[0] * 4;
      ctx.moveTo(x, -10);
      ctx.bezierCurveTo(x + (j[1] - 0.5) * 60, h * 0.4, x + (j[2] - 0.5) * 60 + sway, h * 0.75, x + sway * 1.5, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + sway * 1.5, h, 2 + j[3] * 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}
