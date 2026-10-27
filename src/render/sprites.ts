// All art is drawn with canvas paths: no image assets.
import { clamp } from '../core/math';
import { PLAYER, TILE } from '../core/tuning';
import type { Duskmoth } from '../entities/duskmoth';
import type { Ironshell } from '../entities/ironshell';
import type { Echo, Hoard, Lantern, Merchant, Relic, Shard, Tablet } from '../entities/pickups';
import type { Player } from '../entities/player';
import type { Projectile } from '../entities/projectile';
import type { Skitter } from '../entities/skitter';
import type { Spitter } from '../entities/spitter';
import type { Vesper } from '../entities/vesper';
import type { Warden } from '../entities/warden';
import type { TileMap } from '../physics/tilemap';

type Ctx = CanvasRenderingContext2D;

const MASK = '#e9eef4';
const CLOAK = '#191e2c';
const CLOAK_EDGE = '#323c57';
const EYE = '#07080d';

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
  ctx.fill();
}

export function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

// ---- the wanderer --------------------------------------------------------------

/** Body of the wanderer in local space: origin at the feet, facing +x. */
function wandererBody(ctx: Ctx, o: { vxLocal: number; vy: number; bob: number; run: number; running: boolean; sit: boolean; cloak: string; mask: string; eyes: boolean }): void {
  const sway = clamp(-o.vxLocal * 0.016, -7, 7);
  const lift = clamp(-o.vy * 0.008, -5, 6);
  const sit = o.sit ? 7 : 0;

  // Legs
  if (!o.sit) {
    ctx.strokeStyle = o.cloak;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const a = o.running ? Math.sin(o.run * Math.PI * 2) * 5 : 0;
    ctx.beginPath();
    ctx.moveTo(-3, -7);
    ctx.lineTo(-3 + a, -1);
    ctx.moveTo(3, -7);
    ctx.lineTo(3 - a, -1);
    ctx.stroke();
  }

  // Cloak
  ctx.fillStyle = o.cloak;
  ctx.beginPath();
  ctx.moveTo(-6, -24 + sit);
  ctx.quadraticCurveTo(-12 + sway * 0.6, -14 + sit, -12 + sway * 1.3, -4 - lift + sit * 0.4);
  ctx.lineTo(-7 + sway, -7 - lift * 0.5 + sit * 0.4);
  ctx.lineTo(-3 + sway * 0.8, -2 - lift * 0.3 + sit * 0.4);
  ctx.lineTo(2 + sway * 0.6, -6 - lift * 0.3 + sit * 0.4);
  ctx.lineTo(10 + sway * 0.4, -3 - lift * 0.2 + sit * 0.4);
  ctx.quadraticCurveTo(11, -14 + sit, 6, -24 + sit);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = CLOAK_EDGE;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Mask and its single swept horn
  const hy = -31 + o.bob + sit;
  ctx.fillStyle = o.mask;
  ctx.beginPath();
  ctx.moveTo(-4, hy - 7);
  ctx.quadraticCurveTo(-9, hy - 17, -17, hy - 20);
  ctx.quadraticCurveTo(-11, hy - 12, 1, hy - 8);
  ctx.closePath();
  ctx.fill();
  ellipse(ctx, 0.5, hy, 10, 9.5);
  ctx.fillStyle = 'rgba(120,135,160,0.28)';
  ellipse(ctx, -3, hy + 3, 6.5, 5.5);
  if (o.eyes) {
    ctx.fillStyle = EYE;
    ellipse(ctx, 2.2, hy + 1, 2.4, 4.3);
    ellipse(ctx, 7.6, hy + 1, 2.1, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ellipse(ctx, 2.8, hy - 1.4, 0.7, 0.9);
  }
}

export function drawPlayer(ctx: Ctx, p: Player, x: number, y: number, t: number): void {
  if (p.state === 'hazard') return;
  const cx = x + p.w / 2;
  const feet = y + p.h;

  for (const tr of p.trail) {
    ctx.save();
    ctx.globalAlpha = (tr.life / 0.22) * 0.35;
    ctx.translate(tr.x + p.w / 2, tr.y + p.h);
    ctx.scale(tr.facing, 1);
    wandererBody(ctx, { vxLocal: 600, vy: 0, bob: 0, run: 0, running: false, sit: false, cloak: '#3a4766', mask: '#9fb3d9', eyes: false });
    ctx.restore();
  }

  if (p.state === 'dead') {
    // The mask falls and dims.
    const k = clamp(p.stateTimer / 1.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(cx, feet);
    ctx.rotate((1 - k) * 1.4 * p.facing);
    ctx.fillStyle = MASK;
    ellipse(ctx, 0, -10, 10, 9.5);
    ctx.fillStyle = EYE;
    ellipse(ctx, 2, -9, 2.4, 4.3);
    ellipse(ctx, 7.5, -9, 2.1, 4);
    ctx.restore();
    return;
  }

  const flicker = p.invuln > 0 && Math.floor(p.invuln * 16) % 2 === 0;
  ctx.save();
  ctx.globalAlpha = flicker ? 0.3 : 1;
  ctx.translate(cx, feet);

  let sx = 1;
  let sy = 1;
  if (p.state === 'dash') {
    sx = 1.22;
    sy = 0.86;
  } else if (!p.grounded) {
    const s = clamp(-p.vy / 2600, -0.1, 0.12);
    sy = 1 + s;
    sx = 1 - s * 0.6;
  }
  if (p.landSquash > 0) {
    sy = 1 - p.landSquash * 1.4;
    sx = 1 + p.landSquash;
  }
  ctx.scale(p.facing * sx, sy);
  if (p.wallSliding) ctx.translate(-2, 0);

  const healing = p.state === 'heal';
  const idle = p.grounded && Math.abs(p.vx) < 10;
  wandererBody(ctx, {
    vxLocal: p.vx * p.facing,
    vy: p.vy,
    bob: idle ? Math.sin(p.anim * 2.4) * 0.7 : 0,
    run: p.runPhase,
    running: p.grounded && Math.abs(p.vx) > 10,
    sit: p.state === 'rest',
    cloak: CLOAK,
    mask: MASK,
    eyes: true,
  });

  // Blade at rest, held low behind.
  if (!p.attack && p.state !== 'rest') {
    ctx.strokeStyle = '#c9d4e6';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-5, -15);
    ctx.lineTo(-17, -4);
    ctx.stroke();
  }
  ctx.restore();

  if (healing) {
    const k = p.healTimer / p.healTime;
    glow(ctx, cx, y + 6, 26 + k * 30, '#ffffff', 0.25 + k * 0.4);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      const a = t * 3 + (i * Math.PI) / 3;
      const r = 30 * (1 - ((t * 1.5 + i / 6) % 1));
      ctx.globalAlpha = 0.6;
      ellipse(ctx, cx + Math.cos(a) * r, p.y + p.h / 2 + Math.sin(a) * r, 1.6, 1.6);
    }
    ctx.restore();
  }
}

export function drawSlash(ctx: Ctx, p: Player, x: number, y: number): void {
  const a = p.attack;
  if (!a) return;
  const k = clamp(a.t / PLAYER.attackVisual, 0, 1);
  const cx = x + p.w / 2;
  const cy = y + p.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  const rot = a.dir === 'up' ? -Math.PI / 2 : a.dir === 'down' ? Math.PI / 2 : a.facing > 0 ? 0 : Math.PI;
  ctx.rotate(rot);
  if (a.swing % 2 === 1) ctx.scale(1, -1);
  const reach = a.dir === 'side' ? 16 : 18;
  ctx.translate(reach, 0);
  const sweep = Math.min(1, k * 3.2);
  const start = -1.35;
  const end = start + 2.7 * sweep;
  const R = 40;
  const r = 24;
  const alpha = 1 - k * k;

  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(150,190,255,${0.25 * alpha})`;
  ctx.beginPath();
  ctx.arc(0, 0, R + 6, start, end);
  ctx.arc(-6, 0, r - 4, end, start, true);
  ctx.closePath();
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(255,255,255,${0.95 * alpha})`;
  ctx.beginPath();
  ctx.arc(0, 0, R, start, end);
  ctx.arc(-10, 0, r + 6, end, start, true);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---- enemies ---------------------------------------------------------------------

const fl = (flash: number, color: string): string => (flash > 0 ? '#ffffff' : color);

export function drawSkitter(ctx: Ctx, e: Skitter, x: number, y: number): void {
  const cx = x + e.w / 2;
  const feet = y + e.h;
  ctx.save();
  ctx.translate(cx, feet);
  ctx.scale(e.facing, 1);
  ctx.strokeStyle = fl(e.flash, '#5a4a66');
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const ph = Math.sin(e.t * 14 + i * 2.1) * 3;
    const lx = -10 + i * 9;
    ctx.beginPath();
    ctx.moveTo(lx, -6);
    ctx.lineTo(lx + 3 + ph, -2);
    ctx.lineTo(lx + 1 + ph, 0);
    ctx.stroke();
  }
  ctx.fillStyle = fl(e.flash, '#45354f');
  ctx.beginPath();
  ctx.moveTo(-18, -4);
  ctx.bezierCurveTo(-17, -25, 13, -27, 18, -6);
  ctx.lineTo(18, -3);
  ctx.lineTo(-18, -3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = fl(e.flash, '#b39bd0');
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-17, -6);
  ctx.bezierCurveTo(-16, -24, 13, -26, 17, -7);
  ctx.stroke();
  ctx.strokeStyle = fl(e.flash, '#6d5880');
  ctx.lineWidth = 1.5;
  for (const k of [-7, 2, 10]) {
    ctx.beginPath();
    ctx.moveTo(k - 2, -5);
    ctx.quadraticCurveTo(k + 1, -14, k - 3, -21);
    ctx.stroke();
  }
  ctx.fillStyle = fl(e.flash, '#2a2030');
  ellipse(ctx, 15, -8, 6, 5);
  ctx.fillStyle = '#ffa452';
  ellipse(ctx, 17.5, -9, 1.8, 1.8);
  ctx.restore();
  glow(ctx, cx + e.facing * 17, feet - 9, 10, '#ff8a3a', 0.5);
}

export function drawDuskmoth(ctx: Ctx, e: Duskmoth, x: number, y: number): void {
  const cx = x + e.w / 2;
  const cy = y + e.h / 2;
  const wind = e.state === 'wind';
  const shake = wind ? Math.sin(e.t * 90) * 1.5 : 0;
  ctx.save();
  ctx.translate(cx + shake, cy);
  ctx.scale(e.facing, 1);
  const rate = e.state === 'charge' ? 42 : wind ? 30 : 15;
  const flap = Math.abs(Math.sin(e.t * rate));
  ctx.fillStyle = fl(e.flash, 'rgba(130,108,175,0.6)');
  ellipse(ctx, -6, -9, 15, 4 + flap * 6, -0.5);
  ctx.fillStyle = fl(e.flash, 'rgba(195,175,240,0.7)');
  ellipse(ctx, -2, -10, 14, 3 + flap * 7, -0.3);
  ctx.fillStyle = fl(e.flash, '#3d2f50');
  ellipse(ctx, 0, 1, 9, 11);
  ctx.strokeStyle = fl(e.flash, '#a993cc');
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, 1, 9, 11, 0, -2.4, 0.4);
  ctx.stroke();
  ctx.fillStyle = fl(e.flash, '#3a2d4a');
  ellipse(ctx, -1, 6, 6, 3);
  ctx.fillStyle = fl(e.flash, '#2d2240');
  ellipse(ctx, 7, -5, 6.5, 6);
  const eye = wind ? '#fff2b0' : '#ffd36b';
  ctx.fillStyle = eye;
  ellipse(ctx, 9.5, -6, wind ? 2.2 : 1.6, wind ? 2.2 : 1.6);
  ellipse(ctx, 5.5, -6.5, wind ? 1.8 : 1.3, wind ? 1.8 : 1.3);
  ctx.strokeStyle = fl(e.flash, '#1a1422');
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-2, 10);
  ctx.lineTo(-4, 15 + flap * 2);
  ctx.moveTo(3, 10);
  ctx.lineTo(4, 15 + flap * 2);
  ctx.stroke();
  ctx.restore();
  glow(ctx, cx + e.facing * 8, cy - 6, wind ? 22 : 12, '#ffd36b', wind ? 0.6 : 0.35);
}

export function drawIronshell(ctx: Ctx, e: Ironshell, x: number, y: number): void {
  const cx = x + e.w / 2;
  const feet = y + e.h;
  ctx.save();
  ctx.translate(cx, feet);
  ctx.scale(e.facing, 1);
  if (e.state === 'lunge') ctx.rotate(0.12);
  if (e.state === 'wind') ctx.translate(-3, 0);
  const walk = Math.abs(e.vx) > 5 ? Math.sin(e.t * 10) * 3 : 0;
  ctx.strokeStyle = fl(e.flash, '#4a566a');
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, -8);
  ctx.lineTo(-6 + walk, 0);
  ctx.moveTo(5, -8);
  ctx.lineTo(5 - walk, 0);
  ctx.stroke();
  ctx.fillStyle = fl(e.flash, '#364253');
  ctx.beginPath();
  ctx.roundRect(-15, -38, 26, 32, 9);
  ctx.fill();
  ctx.strokeStyle = fl(e.flash, '#8796ad');
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = fl(e.flash, '#55637a');
  ctx.lineWidth = 1.5;
  for (const k of [-28, -19]) {
    ctx.beginPath();
    ctx.moveTo(-13, k);
    ctx.quadraticCurveTo(-2, k + 4, 9, k);
    ctx.stroke();
  }
  ctx.fillStyle = fl(e.flash, '#3e4a5d');
  ellipse(ctx, 2, -41, 9, 8);
  ctx.beginPath();
  ctx.moveTo(-3, -47);
  ctx.quadraticCurveTo(-4, -58, 5, -62);
  ctx.quadraticCurveTo(2, -54, 5, -47);
  ctx.fill();
  ctx.fillStyle = '#ffcf6a';
  ctx.fillRect(4, -43, 6, 2);
  const raise = e.state === 'wind' ? -4 : 0;
  ctx.fillStyle = e.blockFlash > 0 ? '#ffffff' : fl(e.flash, '#8592a8');
  ctx.beginPath();
  ctx.roundRect(11, -44 + raise, 11, 42, 6);
  ctx.fill();
  ctx.strokeStyle = '#d3deec';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.fillStyle = '#3d4859';
  ellipse(ctx, 16.5, -23 + raise, 2.5, 6);
  ctx.restore();
  glow(ctx, cx + e.facing * 7, feet - 42, 9, '#ffcf6a', 0.4);
}

export function drawWarden(ctx: Ctx, e: Warden, x: number, y: number, t: number): void {
  const cx = x + e.w / 2;
  const feet = y + e.h;
  const s = e.state;
  ctx.save();
  let jitter = 0;
  if (s === 'dying' || s === 'enrage' || (s === 'intro' && e.st > 0.5 && e.st < 1.4)) jitter = Math.sin(t * 80) * 2;
  ctx.translate(cx + jitter, feet);
  ctx.scale(e.facing, 1);
  let sy = 1;
  if (s === 'dormant') sy = 0.82;
  if (s === 'intro') sy = 0.82 + Math.min(1, e.st / 0.6) * 0.18;
  if (s === 'leapWind') sy = 0.86;
  if (s === 'leap' && e.vy < 0) sy = 1.08;
  ctx.scale(1, sy);
  if (s === 'burstWind') ctx.rotate(-0.22 * Math.min(1, e.st / 0.3));
  if (s === 'chargeWind' || s === 'charge') ctx.rotate(0.1);
  if (s === 'rainWind') ctx.rotate(-0.15 + Math.min(1, e.st / 0.45) * 0.3);

  const c = (col: string): string => fl(e.flash, col);
  const step = Math.abs(e.vx) > 5 ? Math.sin(e.t * 12) * 5 : 0;

  // Legs
  ctx.strokeStyle = c('#2b2025');
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [lx, ph] of [
    [-28, 0],
    [-6, 1],
    [18, 0],
  ] as const) {
    const d = ph ? -step : step;
    ctx.beginPath();
    ctx.moveTo(lx, -24);
    ctx.lineTo(lx - 8 + d, -12);
    ctx.lineTo(lx - 4 + d, 0);
    ctx.stroke();
  }

  // Shell
  ctx.fillStyle = c('#3a2b31');
  ellipse(ctx, -6, -42, 46, 32);
  ctx.strokeStyle = c('#8e6d78');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-6, -42, 46, 32, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  ctx.fillStyle = c('#4a3840');
  ellipse(ctx, -10, -50, 36, 20);
  ctx.strokeStyle = c('#5e4852');
  ctx.lineWidth = 2;
  for (const k of [-30, -10, 10]) {
    ctx.beginPath();
    ctx.moveTo(k, -72);
    ctx.quadraticCurveTo(k + 6, -44, k - 2, -14);
    ctx.stroke();
  }

  // Glowing cracks, brighter when enraged
  const heat = e.phase === 2 ? 0.75 + Math.sin(t * 8) * 0.25 : s === 'dormant' ? 0.15 : 0.45;
  ctx.strokeStyle = `rgba(255,${e.phase === 2 ? 110 : 140},60,${heat})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-34, -52);
  ctx.lineTo(-24, -44);
  ctx.lineTo(-27, -34);
  ctx.moveTo(-4, -66);
  ctx.lineTo(0, -54);
  ctx.lineTo(-6, -46);
  ctx.lineTo(2, -38);
  if (e.phase === 2) {
    ctx.moveTo(14, -60);
    ctx.lineTo(8, -48);
    ctx.lineTo(16, -40);
    ctx.moveTo(-40, -30);
    ctx.lineTo(-30, -24);
  }
  ctx.stroke();

  // Head, horn, mandibles
  ctx.fillStyle = c('#30242a');
  ellipse(ctx, 34, -30, 17, 15);
  ctx.fillStyle = c('#5a4650');
  ctx.beginPath();
  ctx.moveTo(30, -42);
  ctx.quadraticCurveTo(46, -64, 68, -74);
  ctx.quadraticCurveTo(54, -56, 46, -36);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = c('#a3858f');
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(34, -44);
  ctx.quadraticCurveTo(48, -62, 66, -72);
  ctx.stroke();
  ctx.fillStyle = c('#2a2024');
  ctx.beginPath();
  ctx.moveTo(44, -22);
  ctx.quadraticCurveTo(58, -18, 56, -8);
  ctx.quadraticCurveTo(50, -16, 42, -16);
  ctx.fill();

  const eyeLit = s !== 'dormant';
  ctx.fillStyle = eyeLit ? '#ffb070' : '#4a3020';
  ellipse(ctx, 42, -33, 3.5, 3);
  ellipse(ctx, 35, -35, 2.5, 2.2);
  ctx.restore();

  if (eyeLit) glow(ctx, cx + e.facing * 40, feet - 34, s === 'burstWind' ? 46 : 22, '#ff8a3a', 0.55);
  if (s === 'burstWind') glow(ctx, cx + e.facing * 30, y + 18, 20 + e.st * 60, '#ffb070', 0.6);
  if (s === 'chargeWind' || s === 'leapWind' || s === 'rainWind') glow(ctx, cx, feet - 30, 70, '#ff6a2a', 0.18 + Math.sin(t * 30) * 0.06);
}

// ---- projectiles and pickups ----------------------------------------------------

export function drawProjectile(ctx: Ctx, pr: Projectile, x: number, y: number, map: TileMap, t: number): void {
  const cx = x + pr.w / 2;
  const cy = y + pr.h / 2;
  if (pr.kind === 'glob') {
    glow(ctx, cx, cy, 18, '#8fe060', 0.6);
    ctx.fillStyle = '#b6f07a';
    ellipse(ctx, cx, cy, 6 + Math.sin(t * 30) * 0.8, 6 - Math.sin(t * 30) * 0.8);
    ctx.fillStyle = '#eaffd0';
    ellipse(ctx, cx - 2, cy - 2, 1.8, 1.8);
    return;
  }
  if (pr.kind === 'slash') {
    // Enemy blade arc: dark violet with a bright edge, fading over its short life.
    const a = clamp(pr.life / 0.13, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(90,50,140,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, pr.w / 2, pr.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e3d0ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, pr.w / 2, pr.h / 2, 0, -2.6, 0.5);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (pr.kind === 'crescent') {
    glow(ctx, cx, cy, 34, '#b48cff', 0.7);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(Math.sign(pr.vx) || 1, 1);
    ctx.fillStyle = '#efe4ff';
    ctx.beginPath();
    ctx.arc(-4, 0, 16, -1.4, 1.4);
    ctx.arc(-12, 0, 13, 1.2, -1.2, true);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }
  if (pr.kind === 'orb') {
    glow(ctx, cx, cy, 26, '#ff8a3a', 0.8);
    ctx.fillStyle = '#ffe4c0';
    ellipse(ctx, cx, cy, 6.5, 6.5);
  } else if (pr.kind === 'wave') {
    const flick = Math.sin(t * 40 + cx * 0.1) * 3;
    glow(ctx, cx, y + pr.h - 6, 30, '#ff7a3a', 0.7);
    ctx.fillStyle = 'rgba(255,190,120,0.9)';
    ctx.beginPath();
    ctx.moveTo(x, y + pr.h);
    ctx.quadraticCurveTo(cx - 6, y + 8, cx + flick, y - 4);
    ctx.quadraticCurveTo(cx + 6, y + 10, x + pr.w, y + pr.h);
    ctx.fill();
  } else if (pr.delay > 0) {
    // Telegraph: falling grit and a shadow on the floor below.
    let fy = Math.floor(y / TILE) + 1;
    while (fy < map.h && !map.isSolid(Math.floor(cx / TILE), fy)) fy++;
    const floorY = fy * TILE;
    const k = clamp(1 - pr.delay / 1.2, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.25 + k * 0.4})`;
    ellipse(ctx, cx, floorY, 10 + k * 14, 3 + k * 2);
    ctx.fillStyle = 'rgba(200,190,180,0.6)';
    for (let i = 0; i < 3; i++) {
      const gy = y + (((t * 160 + i * 37) % 80) | 0);
      ctx.fillRect(cx - 8 + i * 7, gy, 2, 2);
    }
  } else {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(pr.t * 5);
    ctx.fillStyle = '#3a3f50';
    ctx.beginPath();
    ctx.moveTo(-13, -6);
    ctx.lineTo(-4, -14);
    ctx.lineTo(10, -10);
    ctx.lineTo(14, 4);
    ctx.lineTo(2, 13);
    ctx.lineTo(-11, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6a7088';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

export function drawShard(ctx: Ctx, s: Shard, x: number, y: number, t: number): void {
  const cx = x + s.w / 2;
  const cy = y + s.h / 2;
  const sx = Math.cos(t * 4 + s.spin);
  glow(ctx, cx, cy, 12, '#6fc8ff', 0.5);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(Math.max(0.2, Math.abs(sx)), 1);
  ctx.fillStyle = sx > 0 ? '#8fd8ff' : '#5aa9de';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(5, 0);
  ctx.lineTo(0, 6);
  ctx.lineTo(-5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e6f7ff';
  ctx.fillRect(-1, -3, 2, 3);
  ctx.restore();
}

export function drawLantern(ctx: Ctx, l: Lantern, x: number, y: number, t: number, lit: boolean): void {
  const cx = x + l.w / 2;
  const bottom = y + l.h;
  const flick = 0.85 + Math.sin(t * 9) * 0.06 + Math.sin(t * 23) * 0.04;
  glow(ctx, cx, y + 14, 150, '#ffb560', (lit ? 0.45 : 0.3) * flick);
  ctx.fillStyle = '#16100c';
  ctx.fillRect(cx - 2.5, y + 22, 5, l.h - 22);
  ctx.fillRect(cx - 10, bottom - 4, 20, 4);
  ctx.beginPath();
  ctx.moveTo(cx - 11, y + 4);
  ctx.lineTo(cx, y - 4);
  ctx.lineTo(cx + 11, y + 4);
  ctx.fill();
  ctx.strokeStyle = '#2a1d14';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx - 9, y + 4, 18, 20, 4);
  ctx.stroke();
  ctx.fillStyle = `rgba(255,200,110,${0.9 * flick})`;
  ellipse(ctx, cx, y + 15, 4.5, 6.5 * flick);
  ctx.fillStyle = '#fff4d8';
  ellipse(ctx, cx, y + 16, 2, 3);
}

export function drawRelic(ctx: Ctx, r: Relic, x: number, y: number, t: number): void {
  const cx = x + r.w / 2;
  const cy = y + r.h / 2 + Math.sin(t * 2) * 5;
  const wings = r.ability === 'wings';
  glow(ctx, cx, cy, 90, wings ? '#ffe2a8' : '#9fe8ff', 0.5 + Math.sin(t * 3) * 0.1);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = wings ? 'rgba(255,230,180,0.25)' : 'rgba(190,240,255,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = t * 0.6 + (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
    ctx.lineTo(Math.cos(a) * 40, Math.sin(a) * 40);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#e6fbff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#e6fbff';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 8, -2);
    ctx.quadraticCurveTo(s * 20, -14, s * 26, -6);
    ctx.quadraticCurveTo(s * 18, -4, s * 9, 4);
    ctx.fill();
  }
  ellipse(ctx, 0, 0, 3.5, 3.5);
  ctx.restore();
}

export function drawEcho(ctx: Ctx, e: Echo, x: number, y: number, t: number): void {
  const bob = Math.sin(t * 2.2) * 4;
  glow(ctx, x + e.w / 2, y + e.h / 2 + bob, 50, '#8a6cff', 0.45);
  ctx.save();
  ctx.globalAlpha = 0.75 + Math.sin(t * 7) * 0.1;
  ctx.translate(x + e.w / 2, y + e.h + bob);
  ctx.scale(Math.sin(t * 0.7) > 0 ? 1 : -1, 1);
  wandererBody(ctx, { vxLocal: 0, vy: -200, bob: 0, run: 0, running: false, sit: false, cloak: '#120d22', mask: '#2a2040', eyes: false });
  ctx.fillStyle = '#c9b6ff';
  ellipse(ctx, 2.2, -30, 2, 3.4);
  ellipse(ctx, 7.6, -30, 1.8, 3.2);
  ctx.restore();
}

export function drawTablet(ctx: Ctx, tb: Tablet, x: number, y: number, near: boolean, accent: string): void {
  const cx = x + tb.w / 2;
  if (near) glow(ctx, cx, y + 14, 50, accent, 0.35);
  ctx.fillStyle = '#141925';
  ctx.beginPath();
  ctx.moveTo(x, y + tb.h);
  ctx.lineTo(x + 2, y + 10);
  ctx.quadraticCurveTo(cx, y - 6, x + tb.w - 2, y + 10);
  ctx.lineTo(x + tb.w, y + tb.h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = near ? accent : '#3b4560';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = near ? accent : '#4c5878';
  ctx.globalAlpha = near ? 0.9 : 0.6;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    ctx.moveTo(x + 8, y + 16 + i * 7);
    ctx.lineTo(x + tb.w - 8 - (i % 2) * 5, y + 16 + i * 7);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawSpitter(ctx: Ctx, e: Spitter, x: number, y: number, t: number): void {
  const cx = x + e.w / 2;
  const feet = y + e.h;
  const hide = e.state === 'hide';
  const swell = e.state === 'aim' ? Math.min(1, e.st / 0.5) : 0;
  ctx.save();
  ctx.translate(cx, feet);
  ctx.scale(e.facing, 1);
  ctx.fillStyle = fl(e.flash, '#2d3a2a');
  ctx.beginPath();
  ctx.ellipse(0, -2, 17, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  if (hide) {
    // Shelled up: a spiky closed bud.
    ctx.fillStyle = fl(e.flash, '#4a5a3c');
    ctx.beginPath();
    ctx.moveTo(-14, -2);
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      const r = i % 2 ? 17 : 12;
      ctx.lineTo(Math.cos(a) * r, -4 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = fl(e.flash, '#a8c48a');
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    const r = 13 + swell * 3 + Math.sin(t * 4) * 0.6;
    ctx.fillStyle = fl(e.flash, '#55703f');
    ellipse(ctx, 0, -12, r, r * 0.85);
    ctx.strokeStyle = fl(e.flash, '#b9db8e');
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, -12, r, r * 0.85, 0, Math.PI * 1.05, Math.PI * 1.9);
    ctx.stroke();
    ctx.fillStyle = '#16200f';
    ellipse(ctx, 8, -14, 5 + swell * 2, 3 + swell * 3);
    ctx.fillStyle = '#c6ff86';
    ellipse(ctx, 3, -20, 1.8, 1.8);
  }
  ctx.restore();
  if (!hide) glow(ctx, cx + e.facing * 8, feet - 14, 14 + swell * 16, '#9be86a', 0.35 + swell * 0.35);
}

/** Vesper: a tall hooded duelist with a needle-thin blade and a long cape. */
export function drawVesper(ctx: Ctx, e: Vesper, x: number, y: number, t: number): void {
  const cx = x + e.w / 2;
  const feet = y + e.h;
  const s = e.state;
  const c = (col: string): string => fl(e.flash, col);
  if (e.phase === 2 && s !== 'dying') glow(ctx, cx, y + 20, 60, '#9a6cff', 0.25 + Math.sin(t * 6) * 0.08);
  ctx.save();
  ctx.translate(cx, feet);
  ctx.scale(e.facing, 1);
  if (s === 'dormant') ctx.translate(0, 2);
  if (s === 'taunt' || s === 'intro') ctx.rotate(Math.sin(Math.min(1, e.st / 0.4) * Math.PI) * 0.25);
  if (s === 'lunge' || s === 'riposte') ctx.rotate(0.28);
  if (s === 'lungeWind' || s === 'feint') ctx.rotate(-0.12);
  if (s === 'evade') ctx.rotate(-e.st * 14);
  if (s === 'dying') {
    ctx.globalAlpha = Math.max(0, 1 - e.st / 2.4);
    ctx.rotate(Math.min(1, e.st) * 0.4);
  }

  // Cape streams behind with speed.
  const stream = clamp(Math.abs(e.vx) / 700, 0, 1);
  ctx.fillStyle = c('#2a1f3d');
  ctx.beginPath();
  ctx.moveTo(-4, -40);
  ctx.quadraticCurveTo(-18 - stream * 18, -24, -16 - stream * 26, -2 + Math.sin(t * 8) * 2);
  ctx.lineTo(4, -4);
  ctx.closePath();
  ctx.fill();

  // Legs
  ctx.strokeStyle = c('#1d1629');
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const stride = s === 'stance' ? Math.sin(t * 7) * 3 : s === 'lungeWind' ? 6 : 0;
  ctx.beginPath();
  ctx.moveTo(-3, -16);
  ctx.lineTo(-6 - stride, 0);
  ctx.moveTo(3, -16);
  ctx.lineTo(7 + stride, 0);
  ctx.stroke();

  // Body
  ctx.fillStyle = c('#3a2b55');
  ctx.beginPath();
  ctx.moveTo(-7, -40);
  ctx.lineTo(8, -40);
  ctx.lineTo(6, -14);
  ctx.lineTo(-6, -14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = c('#8f78c4');
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // Hood and mask
  ctx.fillStyle = c('#2a1f3d');
  ctx.beginPath();
  ctx.moveTo(-9, -40);
  ctx.quadraticCurveTo(-8, -58, 4, -60);
  ctx.quadraticCurveTo(12, -54, 10, -40);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c('#e4dcf2');
  ellipse(ctx, 4, -48, 5.5, 6.5);
  ctx.fillStyle = s === 'dormant' ? '#3a2d50' : '#b48cff';
  ctx.fillRect(3, -50, 6, 1.8);

  // Blade
  let ang = -0.15;
  if (s === 'stance' || s === 'recover') ang = -0.35 + Math.sin(t * 3) * 0.05;
  if (s === 'lungeWind' || s === 'feint') ang = 2.6;
  if (s === 'lunge' || s === 'riposte') ang = 0;
  if (s === 'parry') ang = -1.3;
  if (s === 'combo' || s === 'comboWind') ang = -1.2 + (e.st / 0.24) * 2.2;
  if (s === 'antiAir') ang = -1.5;
  if (s === 'dive') ang = 1.5;
  if (s === 'taunt') ang = 1.2;
  ctx.save();
  ctx.translate(6, -30);
  ctx.rotate(ang);
  ctx.strokeStyle = s === 'parry' ? '#ffffff' : c('#d9ccf2');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(38, 0);
  ctx.stroke();
  ctx.fillStyle = c('#6a54a0');
  ctx.fillRect(-3, -3, 4, 6);
  ctx.restore();
  ctx.restore();

  if (s === 'parry') glow(ctx, cx + e.facing * 14, y + 14, 40, '#ffffff', 0.8);
  if (s === 'lungeWind' || s === 'leapWind' || s === 'comboWind' || s === 'waveWind' || s === 'antiAir') {
    glow(ctx, cx + e.facing * 4, y - 2, 18, '#c9a6ff', 0.5 + Math.sin(t * 40) * 0.2);
  }
}

export function drawMerchant(ctx: Ctx, m: Merchant, x: number, y: number, t: number, near: boolean): void {
  const cx = x + m.w / 2;
  const feet = y + m.h;
  const bob = Math.sin(t * 1.6) * 1.2;
  glow(ctx, cx + 14, feet - 30, 70, '#ffc070', near ? 0.4 : 0.25);
  ctx.save();
  ctx.translate(cx, feet);
  // Enormous pack
  ctx.fillStyle = '#3b2d22';
  ctx.beginPath();
  ctx.roundRect(-20, -40 + bob, 24, 34, 8);
  ctx.fill();
  ctx.strokeStyle = '#7a5e44';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#56412f';
  ellipse(ctx, -12, -44 + bob, 9, 6);
  // Round body and little feet
  ctx.fillStyle = '#2a2430';
  ellipse(ctx, 4, -14 + bob, 12, 12);
  ctx.fillStyle = '#1a161e';
  ctx.fillRect(-2, -3, 4, 3);
  ctx.fillRect(7, -3, 4, 3);
  // Face: a pale mask with sleepy eyes and a long nose
  ctx.fillStyle = '#e8e0d0';
  ellipse(ctx, 10, -24 + bob, 8, 7.5);
  ctx.fillStyle = '#1a1612';
  ctx.fillRect(9, -26 + bob, 4, 1.5);
  ctx.fillRect(14, -26 + bob, 3, 1.5);
  ctx.fillStyle = '#d6cbb5';
  ctx.beginPath();
  ctx.moveTo(15, -22 + bob);
  ctx.lineTo(22, -20 + bob);
  ctx.lineTo(15, -19 + bob);
  ctx.fill();
  // Hanging lamp
  ctx.strokeStyle = '#1a161e';
  ctx.beginPath();
  ctx.moveTo(16, -12 + bob);
  ctx.lineTo(18, -6 + bob);
  ctx.stroke();
  ctx.fillStyle = `rgba(255,200,110,${0.8 + Math.sin(t * 9) * 0.1})`;
  ellipse(ctx, 18, -3 + bob, 3, 3.5);
  ctx.restore();
}

export function drawHoard(ctx: Ctx, h: Hoard, x: number, y: number, t: number): void {
  const cx = x + h.w / 2;
  const base = y + h.h;
  glow(ctx, cx, base - 14, 70, '#6fc8ff', 0.45 + Math.sin(t * 2) * 0.1);
  const crystals: [number, number, number][] = [
    [-14, 18, -0.3],
    [-4, 30, -0.05],
    [7, 24, 0.2],
    [15, 14, 0.45],
    [-20, 10, -0.6],
  ];
  for (const [dx, hgt, lean] of crystals) {
    ctx.save();
    ctx.translate(cx + dx, base);
    ctx.rotate(lean);
    ctx.fillStyle = '#5aa9de';
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(-4, -hgt * 0.7);
    ctx.lineTo(0, -hgt);
    ctx.lineTo(4, -hgt * 0.7);
    ctx.lineTo(5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c8efff';
    ctx.fillRect(-1, -hgt * 0.75, 2, hgt * 0.5);
    ctx.restore();
  }
}
