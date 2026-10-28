import { VIEW_H, VIEW_W } from '../core/tuning';
import { ornament, SANS, SERIF, spaced } from './text';

type Ctx = CanvasRenderingContext2D;

const CONTROLS: [string, string, string][] = [
  ['Move', 'Arrows / WASD', 'Left stick / D-pad'],
  ['Jump (hold for height)', 'Z / Space / J', 'A'],
  ['Strike', 'X / K', 'X'],
  ['Aim strike', 'hold Up or Down', 'hold Up or Down'],
  ['Dash (once found)', 'C / L / Shift', 'RB / RT'],
  ['Heal (hold, costs essence)', 'V / I (A with arrows)', 'B'],
  ['Rest at a lantern', 'Up', 'Up'],
  ['Map (hold)', 'Tab', 'Select'],
  ['Pause', 'Esc / P', 'Start'],
  ['Mute', 'M', ''],
];

export function drawControls(ctx: Ctx, x: number, y: number, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textBaseline = 'middle';
  ctx.font = `600 13px ${SANS}`;
  ctx.fillStyle = '#7f8ca6';
  ctx.textAlign = 'left';
  ctx.fillText('ACTION', x, y);
  ctx.fillText('KEYBOARD', x + 230, y);
  ctx.fillText('GAMEPAD', x + 390, y);
  ctx.font = `15px ${SANS}`;
  CONTROLS.forEach(([a, k, g], i) => {
    const ry = y + 28 + i * 25;
    ctx.fillStyle = '#dfe7f3';
    ctx.fillText(a, x, ry);
    ctx.fillStyle = '#b8c6dc';
    ctx.fillText(k, x + 230, ry);
    ctx.fillText(g, x + 390, ry);
  });
  ctx.restore();
}

export function drawTitle(ctx: Ctx, t: number, items: string[], selected: number, showControls: boolean, muted: boolean): void {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#141b2e');
  g.addColorStop(1, '#030407');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // The well: concentric rings receding into the dark.
  ctx.save();
  ctx.translate(VIEW_W / 2, VIEW_H * 0.62);
  for (let i = 0; i < 9; i++) {
    const k = (i + ((t * 0.15) % 1)) / 9;
    ctx.strokeStyle = `rgba(150,180,230,${0.12 * (1 - k)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 60 + k * 520, 14 + k * 120, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Drifting motes
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const x = (((i * 137.5) % VIEW_W) + Math.sin(t * 0.3 + i) * 30 + VIEW_W) % VIEW_W;
    const y = VIEW_H - (((t * (8 + (i % 7) * 3) + i * 53) % (VIEW_H + 20)) - 10);
    ctx.globalAlpha = 0.2 + 0.25 * Math.sin(t * 1.4 + i);
    ctx.fillStyle = '#bcd4ff';
    ctx.beginPath();
    ctx.arc(x, y, 1 + (i % 3) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#eef3fa';
  ctx.font = `76px ${SERIF}`;
  spaced(ctx, 'GLOAMWELL', VIEW_W / 2, showControls ? 120 : 190, 14);
  ornament(ctx, VIEW_W / 2, showControls ? 146 : 218, 420, '#cfd8e6');
  ctx.font = `italic 19px ${SERIF}`;
  ctx.fillStyle = '#9fb0cc';
  ctx.fillText('a descent beneath the gate', VIEW_W / 2, showControls ? 176 : 250);

  if (showControls) {
    drawControls(ctx, VIEW_W / 2 - 270, 215);
    ctx.font = `14px ${SANS}`;
    ctx.fillStyle = '#7f8ca6';
    ctx.textAlign = 'center';
    ctx.fillText('Z / Enter / Esc to go back', VIEW_W / 2, VIEW_H - 30);
    return;
  }

  items.forEach((item, i) => {
    const y = 320 + i * 44;
    const on = i === selected;
    ctx.font = `${on ? 26 : 22}px ${SERIF}`;
    ctx.fillStyle = on ? '#ffffff' : '#8d9ab3';
    ctx.textAlign = 'center';
    ctx.fillText(item, VIEW_W / 2, y);
    if (on) {
      const w = ctx.measureText(item).width;
      ctx.fillStyle = '#cfd8e6';
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(VIEW_W / 2 + s * (w / 2 + 22), y - 8);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-3.5, -3.5, 7, 7);
        ctx.restore();
      }
    }
  });
  ctx.font = `14px ${SANS}`;
  ctx.fillStyle = '#6f7c96';
  ctx.textAlign = 'center';
  ctx.fillText(`Arrows to choose  ·  Z or Enter to confirm  ·  M to ${muted ? 'unmute' : 'mute'}`, VIEW_W / 2, VIEW_H - 30);
}

export function drawPause(ctx: Ctx, items: string[], selected: number, note = ''): void {
  ctx.fillStyle = 'rgba(3,4,8,0.78)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#eef3fa';
  ctx.font = `40px ${SERIF}`;
  spaced(ctx, 'PAUSED', VIEW_W / 2, 92, 10);
  ornament(ctx, VIEW_W / 2, 112, 300, '#cfd8e6');
  items.forEach((item, i) => {
    const on = i === selected;
    ctx.font = `${on ? 24 : 21}px ${SERIF}`;
    ctx.fillStyle = on ? '#ffffff' : '#8d9ab3';
    ctx.fillText(on ? `◆  ${item}  ◆` : item, VIEW_W / 2, 160 + i * 38);
  });
  // A third item pushes the controls table down a row.
  const below = 160 + (items.length - 1) * 38;
  if (note) {
    ctx.font = `14px ${SANS}`;
    ctx.fillStyle = '#9fb0cc';
    ctx.fillText(note, VIEW_W / 2, below + 27);
  }
  drawControls(ctx, VIEW_W / 2 - 270, Math.max(262, below + 52), 0.95);
}
