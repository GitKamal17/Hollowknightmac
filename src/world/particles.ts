// Purely cosmetic. Uses Math.random, never affects gameplay.

export const PKind = { Dot: 0, Spark: 1, Glow: 2, Ring: 3, Chunk: 4 } as const;
export type PKind = (typeof PKind)[keyof typeof PKind];

export interface Particle {
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  life: number;
  max: number;
  size: number;
  color: string;
  additive: boolean;
  /** Optional homing target (soul wisps fly to the player). */
  target?: { x: number; y: number };
}

const MAX = 900;
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

export class Particles {
  list: Particle[] = [];

  add(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push({
      kind: PKind.Dot,
      vx: 0,
      vy: 0,
      g: 0,
      drag: 0,
      life: 0.5,
      max: p.life ?? 0.5,
      size: 3,
      color: '#fff',
      additive: false,
      ...p,
    });
  }

  clear(): void {
    this.list = [];
  }

  update(dt: number): void {
    for (const p of this.list) {
      p.life -= dt;
      if (p.target) {
        const dx = p.target.x - p.x;
        const dy = p.target.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.vx += (dx / d) * 2400 * dt;
        p.vy += (dy / d) * 2400 * dt;
        if (d < 14) p.life = 0;
      }
      p.vy += p.g * dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  dust(x: number, y: number, n = 6, power = 1): void {
    for (let i = 0; i < n; i++) {
      this.add({
        x: x + rnd(-8, 8),
        y: y - rnd(0, 4),
        vx: rnd(-120, 120) * power,
        vy: -rnd(20, 90) * power,
        drag: 4,
        life: rnd(0.3, 0.6),
        size: rnd(2, 4.5),
        color: 'rgba(170,180,200,0.55)',
      });
    }
  }

  sparks(x: number, y: number, n: number, color = '#ffffff', dirX = 0): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(200, 520);
      this.add({
        kind: PKind.Spark,
        x,
        y,
        vx: Math.cos(a) * s + dirX * 200,
        vy: Math.sin(a) * s,
        drag: 7,
        life: rnd(0.12, 0.28),
        size: rnd(1.5, 2.5),
        color,
        additive: true,
      });
    }
  }

  embers(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: PKind.Glow,
        x: x + rnd(-6, 6),
        y: y + rnd(-6, 6),
        vx: rnd(-90, 90),
        vy: rnd(-160, -20),
        g: 120,
        drag: 2,
        life: rnd(0.35, 0.8),
        size: rnd(2, 4),
        color: '#ff9a4a',
        additive: true,
      });
    }
  }

  debris(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: PKind.Chunk,
        x: x + rnd(-10, 10),
        y: y - rnd(0, 10),
        vx: rnd(-220, 220),
        vy: -rnd(120, 420),
        g: 1600,
        life: rnd(0.4, 0.8),
        size: rnd(3, 6),
        color: '#3a3f4f',
      });
    }
  }

  ring(x: number, y: number, color: string): void {
    this.add({ kind: PKind.Ring, x, y, life: 0.5, size: 10, color, additive: true });
  }

  soul(x: number, y: number, target: { x: number; y: number }, n = 4): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add({
        kind: PKind.Glow,
        x,
        y,
        vx: Math.cos(a) * 260,
        vy: Math.sin(a) * 260,
        drag: 3,
        life: 0.7,
        size: 3,
        color: '#e8f4ff',
        additive: true,
        target,
      });
    }
  }

  burst(x: number, y: number, n: number, color: string, speed = 260, size = 3): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(speed * 0.3, speed);
      this.add({
        kind: PKind.Glow,
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        drag: 3,
        life: rnd(0.4, 0.9),
        size: rnd(size * 0.6, size * 1.3),
        color,
        additive: true,
      });
    }
  }
}
