import { clamp, type Rect } from '../core/math';
import { DT, TILE } from '../core/tuning';
import type { World } from '../world/world';
import { BroodEgg, Broodling, type BroodParent } from './brood';
import { Enemy, type StrikeResult } from './enemy';
import type { Attack } from './player';
import { Projectile } from './projectile';

export type AshveilState =
  | 'dormant'
  | 'intro'
  | 'hover'
  | 'flinch'
  | 'layWind'
  | 'diveWind'
  | 'dive'
  | 'rise'
  | 'sprayWind'
  | 'spray'
  | 'vineWind'
  | 'spiralWind'
  | 'tumble'
  | 'enrage'
  | 'fall'
  | 'crawl'
  | 'screechWind'
  | 'dying';

type Move = 'lay' | 'dive' | 'spray' | 'vine' | 'spiral';

export const ASHVEIL_HP = 64;
const MAX_BROOD = 4;
const GRAVITY = 1500;

/**
 * Mother Ashveil, keeper of the brood. A flyer: you fight her with the double
 * jump and the dash.
 *
 * - She lays eggs that hatch into broodlings. Ignore them and you're swarmed;
 *   kill them (or smash eggs) and she grieves: two losses and she dives at you
 *   in a vengeful, faster swoop.
 * - She keeps her distance and flinches away when you get close in the air,
 *   but not every time. Land five quick hits while she's airborne and she
 *   tumbles out of the sky, open to punishment.
 * - Phase two: thorn vines erupt from the floor (pushing you up into her
 *   airspace) and she fires spiralling rings.
 * - Phase three: wings torn, she crashes down and crawls after you, shrieking.
 */
export class Ashveil extends Enemy implements BroodParent {
  readonly kind = 'ashveil';
  readonly title = 'Mother Ashveil';
  readonly sub = 'keeper of the brood';
  state: AshveilState = 'dormant';
  phase: 1 | 2 | 3 = 1;
  grief = 0;
  /** True while the current dive was provoked by grief. */
  vengeful = false;
  private bag: Move[] = [];
  private lastMove: Move | null = null;
  private jit = 1;
  private flinchCd = 0;
  private hits: number[] = [];
  private volleys = 0;
  private aim = { x: 0, y: 0 };
  private floorTop = 0;
  private screechCd = 0;

  constructor(cx: number, bottom: number) {
    super();
    this.w = 64;
    this.h = 46;
    this.hp = this.maxHp = ASHVEIL_HP;
    this.shards = 120;
    this.placeAt(cx, bottom);
    this.y = 2 * TILE + 2; // hanging from the ceiling
    this.savePrev();
  }

  private set(s: AshveilState): void {
    this.state = s;
    this.st = 0;
  }

  private tell(base: number): number {
    return base * (this.phase >= 2 ? 0.8 : 1) * this.jit;
  }

  wake(): void {
    if (this.state === 'dormant') this.set('intro');
  }

  private get inert(): boolean {
    return this.state === 'dormant' || this.state === 'intro' || this.state === 'dying';
  }

  get grounded3(): boolean {
    return this.state === 'fall' || this.state === 'crawl' || this.state === 'screechWind';
  }

  override contactBox(): Rect | null {
    if (this.inert) return null;
    return { x: this.x + 8, y: this.y + 8, w: this.w - 16, h: this.h - 14 };
  }

  onChildLost(): void {
    if (this.inert || this.phase === 3) return;
    this.grief++;
  }

  override strike(w: World, atk: Attack): StrikeResult {
    if (this.inert) return 'none';
    void atk;
    this.hp -= w.player.damage;
    this.flash = 0.1;
    this.hits = this.hits.filter((t) => this.t - t < 2);
    this.hits.push(this.t);
    if (this.hp <= 0) {
      this.hp = 0;
      this.set('dying');
      w.sfx('bossDeath');
      w.camera.addTrauma(0.6);
      return 'hit';
    }
    if (this.phase === 1 && this.hp <= this.maxHp * 0.55) {
      this.phase = 2;
      this.bag = ['vine'];
      this.set('enrage');
    } else if (this.phase === 2 && this.hp <= this.maxHp * 0.22) {
      this.phase = 3;
      this.vx *= 0.3;
      this.vy = 0;
      this.set('fall');
      w.sfx('shriek');
    } else if (!this.grounded3 && this.state !== 'tumble' && this.state !== 'dive' && this.hits.length >= 5) {
      this.hits = [];
      this.vy = 0;
      this.set('tumble');
      w.sfx('shriek');
      w.camera.addTrauma(0.3);
    }
    return 'hit';
  }

  private brood(w: World): number {
    return w.enemies.filter((e) => (e instanceof Broodling || e instanceof BroodEgg) && e.mother === this && !e.dead).length;
  }

  update(w: World): void {
    this.tick();
    if (!this.floorTop) this.floorTop = findFloor(w);
    this.flinchCd = Math.max(0, this.flinchCd - DT);
    this.screechCd = Math.max(0, this.screechCd - DT);
    const p = w.player;
    const dx = p.cx - this.cx;
    const dist = Math.hypot(dx, p.cy - this.cy);
    if (this.state !== 'dive') this.facing = dx >= 0 ? 1 : -1;
    const left = 2 * TILE + 6;
    const right = w.map.pw - 2 * TILE - 6 - this.w;
    const top = 2 * TILE + 4;
    const cruiseY = clamp(p.y - 210, top, this.floorTop - 260);

    switch (this.state) {
      case 'dormant':
        this.vx = this.vy = 0;
        break;
      case 'intro':
        this.vx = 0;
        this.vy = this.st < 0.9 ? 40 : 0;
        if (this.st > 0.9 && this.st - DT <= 0.9) {
          w.sfx('shriek');
          w.camera.addTrauma(0.7);
          w.particles.ring(this.cx, this.cy, '#f0d8a8');
        }
        if (this.st >= 2) this.set('hover');
        break;
      case 'hover': {
        // Keep her distance: hold a perch on her own side of the player, up high.
        const side = this.cx < p.cx ? -1 : 1;
        let tx = p.cx + side * 270 - this.w / 2;
        if (tx < left || tx > right) tx = p.cx - side * 270 - this.w / 2; // cornered: cross over
        tx = clamp(tx, left, right);
        const ty = cruiseY + Math.sin(this.t * 2.2) * 14;
        this.vx = clamp((tx - this.x) * 2.2, -260, 260);
        this.vy = clamp((ty - this.y) * 2.2, -220, 220);
        if (!p.grounded && p.alive && dist < 130 && this.flinchCd <= 0) {
          this.flinchCd = this.phase >= 2 ? 2.2 : 3;
          this.vx = -Math.sign(dx || 1) * 520;
          this.vy = -160;
          this.set('flinch');
          w.sfx('wingbeat');
          break;
        }
        if (this.grief >= 2) {
          this.grief = 0;
          this.vengeful = true;
          this.jit = 0.6;
          this.set('diveWind');
          w.sfx('shriek');
          break;
        }
        if (this.st >= (this.phase >= 2 ? 0.65 : 1.0) * this.jit) this.choose(w);
        break;
      }
      case 'flinch':
        this.vx *= 0.9;
        this.vy *= 0.9;
        if (this.st >= 0.35) this.set('hover');
        break;
      case 'layWind':
        this.vx *= 0.9;
        this.vy *= 0.9;
        if (this.st >= this.tell(0.5)) {
          const room = MAX_BROOD - this.brood(w);
          const n = Math.min(room, this.phase >= 2 ? 3 : 2);
          for (let i = 0; i < n; i++) {
            const egg = new BroodEgg(this.cx, this.y + this.h, (i - (n - 1) / 2) * 140, this);
            w.enemies.push(egg);
          }
          w.sfx('eggLay');
          this.set('hover');
        }
        break;
      case 'diveWind':
        this.vx *= 0.85;
        this.vy *= 0.85;
        if (this.st >= this.tell(0.55)) {
          this.aim = { x: p.cx + p.vx * 0.15, y: p.cy };
          const ax = this.aim.x - this.cx;
          const ay = this.aim.y - this.cy;
          const d = Math.max(1, Math.hypot(ax, ay));
          const speed = this.vengeful ? 780 : 640;
          this.vx = (ax / d) * speed;
          this.vy = (ay / d) * speed;
          this.facing = ax >= 0 ? 1 : -1;
          this.set('dive');
          w.sfx('dive');
        }
        break;
      case 'dive':
        if (this.y + this.h >= this.floorTop - 2 || this.cy > this.aim.y + 40 || this.st > 1.2) {
          if (this.y + this.h >= this.floorTop - 2) {
            w.particles.dust(this.cx, this.floorTop, 14, 1.3);
            w.camera.addTrauma(0.3);
          }
          this.vengeful = false;
          this.vx *= 0.6;
          this.vy = -480;
          this.set('rise');
        }
        break;
      case 'rise':
        this.vy = Math.max(this.vy, -480);
        this.vx *= 0.97;
        if (this.y <= cruiseY + 10 || this.st > 0.9) this.set('hover');
        break;
      case 'sprayWind':
        this.vx *= 0.9;
        this.vy *= 0.9;
        if (this.st >= this.tell(0.45)) {
          this.volleys = this.phase >= 2 ? 4 : 3;
          this.set('spray');
          this.st = 0.22;
        }
        break;
      case 'spray':
        this.vx *= 0.9;
        this.vy *= 0.9;
        if (this.st >= 0.22) {
          if (this.volleys-- <= 0) {
            this.set('hover');
            break;
          }
          this.st = 0;
          const n = this.phase >= 2 ? 5 : 3;
          const base = Math.atan2(p.cy - this.cy, p.cx - this.cx);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.24;
            w.projectiles.push(new Projectile('feather', this.cx - 6, this.cy - 4, 12, 8, Math.cos(a) * 430, Math.sin(a) * 430));
          }
          w.sfx('feather');
        }
        break;
      case 'vineWind':
        this.vx *= 0.9;
        this.vy *= 0.9;
        if (this.st >= this.tell(0.4)) {
          const seg = 64;
          const xs = [p.cx];
          for (let i = 0; i < 4; i++) xs.push(w.rng.range(3 * TILE, w.map.pw - 3 * TILE));
          for (const x of xs) {
            const sx = clamp(Math.floor(x / seg) * seg, 2 * TILE, w.map.pw - 2 * TILE - seg);
            const v = new Projectile('vine', sx, this.floorTop - 78, seg, 78, 0, 0);
            v.delay = 0.75;
            v.life = 0.75 + 1.1;
            w.projectiles.push(v);
          }
          w.sfx('vine');
          this.set('hover');
        }
        break;
      case 'spiralWind':
        this.vx *= 0.9;
        this.vy *= 0.9;
        if (this.st >= this.tell(0.5)) {
          const n = 10;
          const off = w.rng.next() * Math.PI;
          for (let i = 0; i < n; i++) {
            const a = off + (i * Math.PI * 2) / n;
            w.projectiles.push(new Projectile('orb', this.cx - 8, this.cy - 8, 16, 16, Math.cos(a) * 230, Math.sin(a) * 230));
          }
          w.sfx('burst');
          this.set('hover');
        }
        break;
      case 'tumble':
        this.vy = Math.min(700, this.vy + GRAVITY * DT);
        this.vx *= 0.95;
        if (this.st >= 1.1) {
          this.vy = -420;
          this.set('rise');
        }
        break;
      case 'enrage':
        this.vx *= 0.9;
        this.vy *= 0.9;
        if (this.st > 0.2 && this.st - DT <= 0.2) {
          w.sfx('shriek');
          w.camera.addTrauma(0.6);
          w.particles.ring(this.cx, this.cy, '#ff9a6a');
        }
        if (this.st >= 1.2) this.set('hover');
        break;
      case 'fall':
        this.vy = Math.min(800, this.vy + GRAVITY * DT);
        this.vx *= 0.97;
        if (this.y + this.h >= this.floorTop) {
          w.camera.addTrauma(0.7);
          w.sfx('bossLand');
          w.particles.dust(this.cx, this.floorTop, 20, 1.6);
          this.screechCd = 1.2;
          this.set('crawl');
        }
        break;
      case 'crawl':
        this.vy = 0;
        this.vx = Math.sign(dx || 1) * 150;
        if (this.screechCd <= 0) {
          this.vx = 0;
          this.set('screechWind');
          w.sfx('bossTell');
        }
        break;
      case 'screechWind':
        this.vx = 0;
        if (this.st >= 0.4) {
          const n = 9;
          for (let i = 0; i < n; i++) {
            const a = Math.PI + (i * Math.PI) / (n - 1);
            const f = new Projectile('feather', this.cx - 6, this.cy - 4, 12, 8, Math.cos(a) * 380, Math.sin(a) * 380);
            f.life = 0.6;
            w.projectiles.push(f);
          }
          w.sfx('shriek');
          w.camera.addTrauma(0.35);
          this.screechCd = 1.3 + w.rng.next() * 0.6;
          this.set('crawl');
        }
        break;
      case 'dying':
        this.vx *= 0.95;
        this.vy = Math.min(600, this.vy + GRAVITY * DT);
        if (this.t % 0.08 < DT) w.particles.burst(this.cx, this.cy, 4, '#f0d8a8', 220, 3);
        if (this.st >= 2.6) {
          this.dead = true;
          w.onBossDefeated(this);
        }
        break;
    }

    if (this.state === 'dormant') return;
    this.x = clamp(this.x + this.vx * DT, left, right);
    this.y = Math.min(this.y + this.vy * DT, this.floorTop - this.h);
    if (!this.grounded3 && this.state !== 'dying') this.y = Math.max(this.y, top);
  }

  private choose(w: World): void {
    if (this.bag.length === 0) {
      const moves: Move[] = this.phase >= 2 ? ['lay', 'dive', 'spray', 'vine', 'spiral'] : ['lay', 'dive', 'spray'];
      for (let i = moves.length - 1; i > 0; i--) {
        const j = Math.floor(w.rng.next() * (i + 1));
        [moves[i], moves[j]] = [moves[j], moves[i]];
      }
      if (moves[0] === this.lastMove) moves.push(moves.shift()!);
      this.bag = moves;
    }
    let move = this.bag.shift()!;
    if (move === 'lay' && this.brood(w) >= MAX_BROOD) move = 'dive';
    this.lastMove = move;
    this.jit = w.rng.range(0.75, 1.3);
    if (move === 'lay') this.set('layWind');
    else if (move === 'dive') this.set('diveWind');
    else if (move === 'spray') this.set('sprayWind');
    else if (move === 'vine') this.set('vineWind');
    else this.set('spiralWind');
    w.sfx('bossTell');
  }
}

/** Top of the arena floor: the first open row above the bottom wall. */
function findFloor(w: World): number {
  const tx = 3;
  let ty = w.map.h - 1;
  while (ty > 0 && w.map.isSolid(tx, ty)) ty--;
  return (ty + 1) * TILE;
}
