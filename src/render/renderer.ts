import { clamp, lerp } from '../core/math';
import { TILE, VIEW_H, VIEW_W, WORLD_VIEW_H, WORLD_VIEW_W, ZOOM } from '../core/tuning';
import { Ashveil } from '../entities/ashveil';
import { BroodEgg, Broodling } from '../entities/brood';
import { Duskmoth } from '../entities/duskmoth';
import { Ironshell } from '../entities/ironshell';
import { Echo, Hoard, Lantern, Merchant, Relic, Shard, Tablet } from '../entities/pickups';
import { Skitter } from '../entities/skitter';
import { Spitter } from '../entities/spitter';
import { Vesper } from '../entities/vesper';
import { Warden } from '../entities/warden';
import type { Game } from '../game';
import { Tile, type TileMap } from '../physics/tilemap';
import { Hud, worldLabel } from '../ui/hud';
import { drawMap } from '../ui/map';
import { drawPause, drawTitle } from '../ui/screens';
import { PKind, type Particles } from '../world/particles';
import type { World } from '../world/world';
import { Background } from './background';
import {
  drawAshveil,
  drawBroodling,
  drawDuskmoth,
  drawEgg,
  drawEcho,
  drawHoard,
  drawMerchant,
  drawIronshell,
  drawLantern,
  drawPlayer,
  drawProjectile,
  drawRelic,
  drawShard,
  drawSkitter,
  drawSlash,
  drawSpitter,
  drawTablet,
  drawVesper,
  drawWarden,
  glow,
} from './sprites';
import { TerrainCache } from './terrain';
import { themeFor } from './themes';

const ix = (e: { px: number; x: number }, a: number): number => lerp(e.px, e.x, a);
const iy = (e: { py: number; y: number }, a: number): number => lerp(e.py, e.y, a);

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private terrain = new TerrainCache();
  private bg = new Background();
  private hud = new Hud();
  debug = false;
  hitboxes = false;
  private fps = 60;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas not supported');
    this.ctx = ctx;
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.scale = Math.min(w / VIEW_W, h / VIEW_H);
    this.ox = Math.round((w - VIEW_W * this.scale) / 2);
    this.oy = Math.round((h - VIEW_H * this.scale) / 2);
  }

  render(game: Game, alpha: number): void {
    this.resize();
    const now = performance.now();
    if (this.last) this.fps = lerp(this.fps, 1000 / Math.max(1, now - this.last), 0.05);
    this.last = now;

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_W, VIEW_H);
    ctx.clip();

    if (game.scene === 'title' || !game.world) {
      drawTitle(ctx, game.time, game.titleItems, game.menu, game.showControls, game.audio.muted);
    } else {
      this.drawWorld(game.world, alpha);
      if (game.scene === 'pause') drawPause(ctx, game.pauseItems, game.pauseMenu);
    }
    ctx.restore();

    if (this.debug) {
      ctx.font = '12px monospace';
      ctx.fillStyle = '#7f8';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`${this.fps.toFixed(0)} fps  ${game.world?.room.def.id ?? ''}`, VIEW_W - 8, 8);
    }
  }

  private drawWorld(w: World, alpha: number): void {
    const ctx = this.ctx;
    const th = themeFor(w.room.def.theme);
    const m = w.map;
    const t = w.time;
    const cam = w.camera;
    const shake = cam.shake();
    // Snap the camera to device pixels so cached terrain stays crisp.
    const dpp = this.scale * ZOOM; // device pixels per world pixel
    const camX = Math.round((lerp(cam.px, cam.x, alpha) + shake.x) * dpp) / dpp;
    const camY = Math.round((lerp(cam.py, cam.y, alpha) + shake.y) * dpp) / dpp;

    ctx.save();
    ctx.scale(ZOOM, ZOOM);
    this.bg.drawBack(ctx, th, w.room.def.id, m.pw, m.ph, camX, camY, t);

    ctx.save();
    ctx.translate(-camX, -camY);
    this.terrain.draw(ctx, m, w.room.def.id, th, dpp, camX, camY, WORLD_VIEW_W, WORLD_VIEW_H);
    this.drawLiquid(ctx, m, camX, camY, t);
    this.drawGates(ctx, m, w.gateAnim);
    if (!m.sealOpen) this.drawSeals(ctx, m, t);

    for (const pk of w.pickups) {
      const x = ix(pk, alpha);
      const y = iy(pk, alpha);
      if (pk instanceof Shard) drawShard(ctx, pk, x, y, t);
      else if (pk instanceof Lantern) drawLantern(ctx, pk, x, y, t, w.player.state === 'rest');
      else if (pk instanceof Relic) drawRelic(ctx, pk, x, y, t);
      else if (pk instanceof Echo) drawEcho(ctx, pk, x, y, t);
      else if (pk instanceof Tablet) drawTablet(ctx, pk, x, y, w.nearTablet === pk, th.accent);
      else if (pk instanceof Merchant) drawMerchant(ctx, pk, x, y, t, w.nearMerchant === pk);
      else if (pk instanceof Hoard) drawHoard(ctx, pk, x, y, t);
    }

    for (const e of w.enemies) {
      const x = ix(e, alpha);
      const y = iy(e, alpha);
      if (e instanceof Skitter) drawSkitter(ctx, e, x, y);
      else if (e instanceof Duskmoth) drawDuskmoth(ctx, e, x, y);
      else if (e instanceof Ironshell) drawIronshell(ctx, e, x, y);
      else if (e instanceof Warden) drawWarden(ctx, e, x, y, t);
      else if (e instanceof Spitter) drawSpitter(ctx, e, x, y, t);
      else if (e instanceof Vesper) drawVesper(ctx, e, x, y, t);
      else if (e instanceof Ashveil) drawAshveil(ctx, e, x, y, t);
      else if (e instanceof Broodling) drawBroodling(ctx, e, x, y, t);
      else if (e instanceof BroodEgg) drawEgg(ctx, e, x, y, t);
    }

    for (const pr of w.projectiles) drawProjectile(ctx, pr, ix(pr, alpha), iy(pr, alpha), m, t);

    const p = w.player;
    const px = ix(p, alpha);
    const py = iy(p, alpha);
    glow(ctx, px + p.w / 2, py + p.h / 2, 170, '#9fb8ff', 0.09);
    drawPlayer(ctx, p, px, py, t);
    drawSlash(ctx, p, px, py);
    this.drawParticles(ctx, w.particles);

    if (w.nearTablet) worldLabel(ctx, w.nearTablet.text, w.nearTablet.cx, w.nearTablet.y - 14);
    if (w.nearLantern && p.state === 'normal') worldLabel(ctx, '▲  Rest', w.nearLantern.cx, w.nearLantern.y - 16);
    if (w.nearMerchant && p.state === 'normal' && !w.shop) worldLabel(ctx, '▲  Trade', w.nearMerchant.cx, w.nearMerchant.y - 10);
    if (this.hitboxes) this.drawHitboxes(ctx, w);
    ctx.restore();

    this.bg.drawFront(ctx, camX, camY, t);
    ctx.restore();

    const v = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    this.hud.draw(ctx, w, t);
    if (w.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${clamp(w.flash, 0, 1) * 0.28})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (w.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${clamp(w.fade, 0, 1)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    drawMap(ctx, w, t);
    this.hud.shop(ctx, w, t);
    this.hud.modal(ctx, w, t);
  }

  private drawLiquid(ctx: CanvasRenderingContext2D, m: TileMap, camX: number, camY: number, t: number): void {
    const x0 = Math.max(0, Math.floor(camX / TILE));
    const x1 = Math.min(m.w - 1, Math.ceil((camX + WORLD_VIEW_W) / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const y1 = Math.min(m.h - 1, Math.ceil((camY + WORLD_VIEW_H) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (m.get(tx, ty) !== Tile.Liquid) continue;
        const x = tx * TILE;
        const y = ty * TILE;
        const surface = m.get(tx, ty - 1) !== Tile.Liquid;
        ctx.fillStyle = 'rgba(4,10,16,0.96)';
        if (!surface) {
          ctx.fillRect(x, y, TILE, TILE);
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(x, y + TILE);
        for (let i = 0; i <= 8; i++) {
          const wx = x + (i / 8) * TILE;
          ctx.lineTo(wx, y + 9 + Math.sin(t * 2.2 + wx * 0.09) * 2.2);
        }
        ctx.lineTo(x + TILE, y + TILE);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,170,210,0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) {
          const wx = x + (i / 8) * TILE;
          const wy = y + 9 + Math.sin(t * 2.2 + wx * 0.09) * 2.2;
          if (i === 0) ctx.moveTo(wx, wy);
          else ctx.lineTo(wx, wy);
        }
        ctx.stroke();
      }
    }
  }

  private drawGates(ctx: CanvasRenderingContext2D, m: TileMap, k: number): void {
    if (k <= 0.001) return;
    for (let tx = 0; tx < m.w; tx++) {
      let top = -1;
      let bottom = -1;
      for (let ty = 0; ty < m.h; ty++) {
        if (m.get(tx, ty) === Tile.Gate) {
          if (top < 0) top = ty;
          bottom = ty;
        }
      }
      if (top < 0) continue;
      const y0 = top * TILE;
      const len = (bottom - top + 1) * TILE * k;
      ctx.fillStyle = '#20232c';
      ctx.strokeStyle = '#5a6074';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const bx = tx * TILE + 5 + i * 10;
        ctx.fillRect(bx, y0, 4, len);
        ctx.beginPath();
        ctx.moveTo(bx - 2, y0 + len);
        ctx.lineTo(bx + 2, y0 + len + 9);
        ctx.lineTo(bx + 6, y0 + len);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillRect(tx * TILE + 2, y0 + len * 0.3, TILE - 4, 4);
    }
  }

  private drawSeals(ctx: CanvasRenderingContext2D, m: TileMap, t: number): void {
    for (let ty = 0; ty < m.h; ty++) {
      for (let tx = 0; tx < m.w; tx++) {
        if (m.get(tx, ty) !== Tile.Seal) continue;
        const x = tx * TILE;
        const y = ty * TILE;
        ctx.fillStyle = '#1a1420';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = `rgba(255,150,90,${0.45 + Math.sin(t * 2 + ty) * 0.2})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 16, y + 4);
        ctx.lineTo(x + 26, y + 16);
        ctx.lineTo(x + 16, y + 28);
        ctx.lineTo(x + 6, y + 16);
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, parts: Particles): void {
    for (const additive of [false, true]) {
      ctx.save();
      if (additive) ctx.globalCompositeOperation = 'lighter';
      for (const p of parts.list) {
        if (p.additive !== additive) continue;
        const a = clamp(p.life / p.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.color;
        switch (p.kind) {
          case PKind.Spark:
            ctx.lineWidth = p.size;
            ctx.beginPath();
            ctx.moveTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            break;
          case PKind.Ring:
            ctx.lineWidth = 3 * a;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size + (1 - a) * 90, 0, Math.PI * 2);
            ctx.stroke();
            break;
          case PKind.Chunk:
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            break;
          default:
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (p.kind === PKind.Glow ? 0.5 + a * 0.5 : 1), 0, Math.PI * 2);
            ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  private drawHitboxes(ctx: CanvasRenderingContext2D, w: World): void {
    ctx.lineWidth = 1;
    const r = (b: { x: number; y: number; w: number; h: number } | null, c: string) => {
      if (!b) return;
      ctx.strokeStyle = c;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    };
    r(w.player.hurtbox(), '#0f0');
    r(w.player.attackBox(), '#ff0');
    for (const e of w.enemies) {
      r(e.hurtbox(), '#f80');
      r(e.contactBox(), '#f00');
    }
    for (const pr of w.projectiles) r(pr, pr.harmful ? '#f0f' : '#808');
  }
}
