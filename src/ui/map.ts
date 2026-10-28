import { clamp } from '../core/math';
import { TILE, VIEW_H, VIEW_W } from '../core/tuning';
import { themeFor } from '../render/themes';
import { doorPoint, mapBounds, MAP_GAP, type BossId, type MapIcon, type MapRoom } from '../world/map';
import type { SaveData } from '../world/save';
import type { World } from '../world/world';
import { ornament, SANS, SERIF, spaced } from './text';

type Ctx = CanvasRenderingContext2D;

/** Screen area the map is fitted into. */
const AREA = { x: 48, y: 104, w: VIEW_W - 96, h: VIEW_H - 196 };
/** Never zoom in further than this many screen pixels per tile, so a lone first room still looks like a map. */
const MAX_SCALE = 5;

const bossDown = (save: SaveData, b: BossId): boolean =>
  b === 'warden' ? save.bossDefeated : b === 'vesper' ? save.duelDefeated : save.matronDefeated;

function icon(ctx: Ctx, ic: MapIcon, x: number, y: number, save: SaveData, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  switch (ic.kind) {
    case 'lantern': {
      const ga = ctx.globalAlpha;
      ctx.globalAlpha = ga * (0.35 + Math.sin(t * 3) * 0.1);
      ctx.fillStyle = '#ffcf7a';
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = ga;
      ctx.fillStyle = '#ffd38a';
      ctx.strokeStyle = '#2a1c0c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, -1);
      ctx.lineTo(3, 5);
      ctx.lineTo(-3, 5);
      ctx.lineTo(-4, -1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'merchant': {
      ctx.fillStyle = '#e8c27a';
      ctx.strokeStyle = '#2a1c0c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 1.5, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-3, -5);
      ctx.lineTo(3, -5);
      ctx.lineTo(1.5, -2.5);
      ctx.lineTo(-1.5, -2.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'boss': {
      const down = bossDown(save, ic.boss!);
      ctx.fillStyle = down ? '#5d6274' : '#ff7a4a';
      ctx.strokeStyle = '#140806';
      ctx.lineWidth = 1;
      // A horned skull.
      ctx.beginPath();
      ctx.moveTo(-5, -1);
      ctx.lineTo(-7, -7);
      ctx.lineTo(-2.5, -4);
      ctx.lineTo(2.5, -4);
      ctx.lineTo(7, -7);
      ctx.lineTo(5, -1);
      ctx.quadraticCurveTo(5, 6, 0, 6);
      ctx.quadraticCurveTo(-5, 6, -5, -1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#140806';
      ctx.fillRect(-3, -1, 2, 2.5);
      ctx.fillRect(1, -1, 2, 2.5);
      if (down) {
        ctx.strokeStyle = '#a8adbd';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-6, -6);
        ctx.lineTo(6, 6);
        ctx.moveTo(6, -6);
        ctx.lineTo(-6, 6);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

function youMarker(ctx: Ctx, x: number, y: number, t: number): void {
  const pulse = (t * 1.4) % 1;
  ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - pulse)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 4 + pulse * 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

/** The held-open map: every visited room, laid out by its doors. */
export function drawMap(ctx: Ctx, w: World, t: number): void {
  const a = clamp(w.mapFade, 0, 1);
  if (a <= 0) return;
  const layout = w.mapLayout;
  const here = w.room.def.id;
  const seen = new Set(w.save.visited);
  seen.add(here);
  const rooms = [...seen].map((id) => layout.rooms[id]).filter((r): r is MapRoom => !!r);
  const cur = layout.rooms[here];

  const b = mapBounds(rooms);
  const pad = MAP_GAP;
  const s = Math.min(AREA.w / (b.w + pad * 2), AREA.h / (b.h + pad * 2), MAX_SCALE);
  const ox = AREA.x + AREA.w / 2 - (b.x + b.w / 2) * s;
  const oy = AREA.y + AREA.h / 2 - (b.y + b.h / 2) * s;
  const X = (tx: number) => ox + tx * s;
  const Y = (ty: number) => oy + ty * s;

  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(4,5,10,0.92)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#eef2f8';
  ctx.font = `28px ${SERIF}`;
  spaced(ctx, (cur?.name ?? '').toUpperCase(), VIEW_W / 2, 58, 5);
  ornament(ctx, VIEW_W / 2, 76, 300, '#cfd8e6', 0.8);

  // Corridors first, so the rooms sit on top of them.
  ctx.lineCap = 'round';
  for (const r of rooms) {
    for (const d of r.doors) {
      const p = doorPoint(r, d);
      const other = layout.rooms[d.target];
      let q: { x: number; y: number };
      if (other && seen.has(other.id)) {
        if (other.id < r.id) continue; // each corridor once
        q = doorPoint(other, other.doors.find((x) => x.id === d.id) ?? d);
        ctx.strokeStyle = 'rgba(190,205,230,0.55)';
        ctx.lineWidth = Math.max(2, s * 1.2);
        ctx.setLineDash([]);
      } else {
        // An exit not yet taken: a short dashed stub.
        const out = MAP_GAP - 1;
        q = {
          x: p.x + (d.side === 'right' ? out : d.side === 'left' ? -out : 0),
          y: p.y + (d.side === 'bottom' ? out : d.side === 'top' ? -out : 0),
        };
        ctx.strokeStyle = 'rgba(190,205,230,0.4)';
        ctx.lineWidth = Math.max(1.5, s * 0.8);
        ctx.setLineDash([3, 3]);
      }
      ctx.beginPath();
      ctx.moveTo(X(p.x), Y(p.y));
      ctx.lineTo(X(q.x), Y(q.y));
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  for (const r of rooms) {
    const on = r.id === here;
    const th = themeFor(w.rooms[r.id]?.theme ?? '');
    ctx.fillStyle = on ? 'rgba(46,58,86,0.95)' : 'rgba(20,25,38,0.95)';
    ctx.fillRect(X(r.x), Y(r.y), r.w * s, r.h * s);
    ctx.fillStyle = on ? '#c9d6ee' : th.rockLight;
    ctx.globalAlpha = a * (on ? 0.85 : 0.75);
    for (const [tx, ty, len] of r.open) ctx.fillRect(X(r.x + tx), Y(r.y + ty), len * s + 0.5, s + 0.5);
    ctx.globalAlpha = a;
    ctx.strokeStyle = on ? `rgba(255,255,255,${0.75 + Math.sin(t * 4) * 0.2})` : 'rgba(150,165,195,0.6)';
    ctx.lineWidth = on ? 2 : 1;
    ctx.strokeRect(X(r.x) + 0.5, Y(r.y) + 0.5, r.w * s - 1, r.h * s - 1);
  }

  for (const r of rooms) for (const ic of r.icons) icon(ctx, ic, X(r.x + ic.tx + 0.5), Y(r.y + ic.ty + 0.5), w.save, t);

  if (cur) {
    const p = w.player;
    youMarker(ctx, X(cur.x + clamp(p.cx / TILE, 0, cur.w)), Y(cur.y + clamp(p.cy / TILE, 0, cur.h)), t);
  }

  // Legend
  const ly = VIEW_H - 54;
  const items: [string, (x: number) => void][] = [
    ['You', (x) => youMarker(ctx, x, ly, 0.6)],
    ['Lantern', (x) => icon(ctx, { kind: 'lantern', tx: 0, ty: 0 }, x, ly, w.save, t)],
    ['Peddler', (x) => icon(ctx, { kind: 'merchant', tx: 0, ty: 0 }, x, ly, w.save, t)],
    ['Boss', (x) => icon(ctx, { kind: 'boss', tx: 0, ty: 0, boss: 'ashveil' }, x, ly, { ...w.save, matronDefeated: false }, t)],
  ];
  ctx.font = `14px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const gap = 34;
  const widths = items.map(([label]) => 18 + ctx.measureText(label).width);
  let x = VIEW_W / 2 - (widths.reduce((m, n) => m + n, 0) + gap * (items.length - 1)) / 2;
  items.forEach(([label, draw], i) => {
    draw(x + 6);
    ctx.fillStyle = '#aab6c8';
    ctx.font = `14px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 18, ly + 1);
    x += widths[i] + gap;
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6f7a8e';
  ctx.font = `13px ${SANS}`;
  ctx.fillText('Release Tab (or Select) to close', VIEW_W / 2, VIEW_H - 24);
  ctx.restore();
}
