import { clamp } from '../core/math';
import { PLAYER, VIEW_H, VIEW_W } from '../core/tuning';
import { nextCost, SHOP } from '../world/shop';
import type { World } from '../world/world';
import { ornament, SANS, SERIF, spaced, wrap } from './text';

type Ctx = CanvasRenderingContext2D;

export class Hud {
  private shownBossHp = 1;
  private lostAt: number[] = [];
  private lastHp: number = PLAYER.maxHp;

  draw(ctx: Ctx, w: World, t: number): void {
    const p = w.player;
    if (p.hp < this.lastHp) for (let i = p.hp; i < this.lastHp; i++) this.lostAt[i] = t;
    this.lastHp = p.hp;

    this.soulVessel(ctx, p.soul, t);
    for (let i = 0; i < p.maxHp; i++) {
      const lost = this.lostAt[i] !== undefined && t - this.lostAt[i] < 0.4 && i >= p.hp;
      this.mask(ctx, 112 + i * 29, 44, i < p.hp, lost ? 1 - (t - this.lostAt[i]) / 0.4 : 0);
    }
    // Shards
    ctx.save();
    ctx.translate(117, 84);
    ctx.fillStyle = '#8fd8ff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(6, 0);
    ctx.lineTo(0, 7);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.font = `600 19px ${SANS}`;
    ctx.fillStyle = '#d8ecff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(w.save.shards), 131, 85);

    if (w.bossActive && w.boss) this.bossBar(ctx, w.boss.hp / w.boss.maxHp, w.boss.title);
    else this.shownBossHp = 1;
    if (w.banner) this.banner(ctx, w);
    if (p.hp === 1 && p.alive) {
      const a = 0.25 + Math.sin(t * 5) * 0.12;
      const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.9);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(60,0,10,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  private soulVessel(ctx: Ctx, soul: number, t: number): void {
    const x = 60;
    const y = 60;
    const r = 30;
    const full = soul >= PLAYER.healCost;
    ctx.save();
    ctx.fillStyle = 'rgba(4,6,12,0.8)';
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    const level = clamp(soul / PLAYER.soulMax, 0, 1);
    const top = y + r - level * r * 2;
    const g = ctx.createLinearGradient(0, top, 0, y + r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#9fb8d8');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - r, y + r);
    for (let i = 0; i <= 12; i++) {
      const px = x - r + (i / 12) * r * 2;
      ctx.lineTo(px, top + Math.sin(t * 3 + i * 0.8) * (level > 0 && level < 1 ? 2 : 0));
    }
    ctx.lineTo(x + r, y + r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = full ? '#ffffff' : '#aab6c8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    // Little curled horns on the vessel
    ctx.fillStyle = '#cfd8e6';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + s * 14, y - r);
      ctx.quadraticCurveTo(x + s * 26, y - r - 16, x + s * 34, y - r - 8);
      ctx.quadraticCurveTo(x + s * 26, y - r - 6, x + s * 22, y - r + 4);
      ctx.fill();
    }
    if (full) {
      ctx.globalAlpha = 0.3 + Math.sin(t * 4) * 0.15;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x, y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private mask(ctx: Ctx, x: number, y: number, filled: boolean, breaking: number): void {
    ctx.save();
    ctx.translate(x, y);
    if (breaking > 0) ctx.scale(1 + breaking * 0.4, 1 + breaking * 0.4);
    ctx.beginPath();
    ctx.moveTo(-9, -6);
    ctx.quadraticCurveTo(-9, -14, 0, -14);
    ctx.quadraticCurveTo(9, -14, 9, -6);
    ctx.lineTo(7, 6);
    ctx.quadraticCurveTo(0, 14, -7, 6);
    ctx.closePath();
    if (filled || breaking > 0) {
      ctx.fillStyle = breaking > 0 ? `rgba(255,255,255,${breaking})` : '#e9eef4';
      ctx.fill();
      ctx.fillStyle = '#0a0c12';
      ctx.beginPath();
      ctx.ellipse(-3.5, -3, 2, 3.4, 0, 0, Math.PI * 2);
      ctx.ellipse(3.5, -3, 2, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
      ctx.strokeStyle = '#4a5570';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  private bossBar(ctx: Ctx, ratio: number, name: string): void {
    this.shownBossHp = Math.max(ratio, this.shownBossHp - 0.004);
    const w = 460;
    const x = (VIEW_W - w) / 2;
    const y = VIEW_H - 46;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - 3, y - 3, w + 6, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(x, y, w * this.shownBossHp, 8);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#ff8a3a');
    g.addColorStop(1, '#c2351a');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w * ratio, 8);
    ctx.font = `italic 16px ${SERIF}`;
    ctx.fillStyle = '#e8d6c8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(name, VIEW_W / 2, y - 10);
  }

  private banner(ctx: Ctx, w: World): void {
    const b = w.banner!;
    const a = clamp(Math.min(b.t / 0.6, (b.dur - b.t) / 0.8), 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#eef2f8';
    if (b.kind === 'area') {
      ctx.font = `30px ${SERIF}`;
      spaced(ctx, b.title.toUpperCase(), VIEW_W / 2, 140, 6);
      ornament(ctx, VIEW_W / 2, 158, 260, '#cfd8e6', 0.8);
    } else {
      ctx.font = `italic 19px ${SERIF}`;
      ctx.fillText(b.sub, VIEW_W / 2, 118);
      ctx.font = `46px ${SERIF}`;
      spaced(ctx, b.title.toUpperCase(), VIEW_W / 2, 168, 7);
      ornament(ctx, VIEW_W / 2, 190, 420, '#e8c6a8', 0.9);
    }
    ctx.restore();
  }

  shop(ctx: Ctx, w: World, t: number): void {
    const s = w.shop;
    if (!s) return;
    const a = clamp(s.t / 0.2, 0, 1);
    const pw = 560;
    const ph = 92 + SHOP.length * 62;
    const x = (VIEW_W - pw) / 2;
    const y = (VIEW_H - ph) / 2;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(3,4,8,0.55)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = 'rgba(14,11,8,0.94)';
    ctx.beginPath();
    ctx.roundRect(x, y, pw, ph, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,150,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f5e6cc';
    ctx.font = `28px ${SERIF}`;
    spaced(ctx, 'THE PEDDLER', VIEW_W / 2, y + 42, 5);
    ctx.font = `600 17px ${SANS}`;
    ctx.fillStyle = '#d8ecff';
    ctx.textAlign = 'right';
    ctx.fillText(`\u25C6 ${w.save.shards}`, x + pw - 24, y + 40);
    SHOP.forEach((item, i) => {
      const ry = y + 70 + i * 62;
      const on = i === s.sel;
      const cost = nextCost(w.save, item);
      const owned = w.save.upgrades[item.id];
      if (on) {
        ctx.fillStyle = 'rgba(255,210,150,0.10)';
        ctx.fillRect(x + 12, ry - 4, pw - 24, 56);
      }
      ctx.textAlign = 'left';
      ctx.font = `${on ? 600 : 500} 18px ${SANS}`;
      ctx.fillStyle = cost === null ? '#7d7466' : on ? '#ffffff' : '#d9cfbf';
      const lvl = item.costs.length > 1 ? `  ${owned}/${item.costs.length}` : '';
      ctx.fillText(`${on ? '\u25B8 ' : '  '}${item.name}${lvl}`, x + 24, ry + 20);
      ctx.font = `14px ${SANS}`;
      ctx.fillStyle = '#a89c8a';
      ctx.fillText(item.desc, x + 44, ry + 42);
      ctx.textAlign = 'right';
      ctx.font = `600 17px ${SANS}`;
      ctx.fillStyle = cost === null ? '#7d7466' : w.save.shards >= cost ? '#8fd8ff' : '#c06a5a';
      ctx.fillText(cost === null ? 'sold out' : `\u25C6 ${cost}`, x + pw - 24, ry + 20);
    });
    ctx.textAlign = 'center';
    ctx.font = `14px ${SANS}`;
    if (s.msgT > 0) {
      ctx.fillStyle = '#ffd38a';
      ctx.fillText(s.msg, VIEW_W / 2, y + ph - 16);
    } else {
      ctx.fillStyle = '#7d7466';
      ctx.globalAlpha = a * (0.7 + Math.sin(t * 3) * 0.2);
      ctx.fillText('Up / Down to choose  \u00B7  Z to buy  \u00B7  X or Esc to leave', VIEW_W / 2, y + ph - 16);
    }
    ctx.restore();
  }

  modal(ctx: Ctx, w: World, t: number): void {
    const m = w.modal;
    if (!m) return;
    const a = clamp(m.t / 0.3, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(3,4,8,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f2f6fb';
    ctx.font = `38px ${SERIF}`;
    spaced(ctx, m.title.toUpperCase(), VIEW_W / 2, 200, 6);
    ornament(ctx, VIEW_W / 2, 222, 380, '#cfd8e6');
    ctx.font = `18px ${SANS}`;
    ctx.fillStyle = '#c9d3e2';
    const lines = wrap(ctx, m.body, 600);
    lines.forEach((ln, i) => ctx.fillText(ln, VIEW_W / 2, 270 + i * 30));
    if (m.t > 0.6) {
      ctx.globalAlpha = a * (0.55 + Math.sin(t * 4) * 0.3);
      ctx.font = `14px ${SANS}`;
      ctx.fillText('Z / Enter to continue', VIEW_W / 2, 290 + lines.length * 30 + 20);
    }
    ctx.restore();
  }
}

/** Speech-bubble style box above a world position (call inside the camera transform). */
export function worldLabel(ctx: Ctx, text: string, x: number, y: number, maxWidth = 300): void {
  ctx.save();
  ctx.font = `15px ${SANS}`;
  const lines = wrap(ctx, text, maxWidth);
  const lw = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const h = lines.length * 20 + 16;
  const bx = x - lw / 2 - 12;
  const by = y - h;
  ctx.fillStyle = 'rgba(4,6,12,0.82)';
  ctx.beginPath();
  ctx.roundRect(bx, by, lw + 24, h, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,215,235,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#dfe7f3';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, x, by + 9 + i * 20));
  ctx.restore();
}
