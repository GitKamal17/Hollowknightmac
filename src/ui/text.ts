type Ctx = CanvasRenderingContext2D;

export const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
export const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

/** Draw text with manual letter spacing (canvas letterSpacing is not everywhere yet). */
export function spaced(ctx: Ctx, text: string, x: number, y: number, spacing: number): void {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let cx = x - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, cx, y);
    cx += widths[i] + spacing;
  });
  ctx.textAlign = align;
}

export function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

export function ornament(ctx: Ctx, x: number, y: number, width: number, color: string, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - width / 2, y);
  ctx.lineTo(x - 8, y);
  ctx.moveTo(x + 8, y);
  ctx.lineTo(x + width / 2, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x + 4, y);
  ctx.lineTo(x, y + 4);
  ctx.lineTo(x - 4, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
