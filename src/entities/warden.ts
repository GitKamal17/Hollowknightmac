import { approach, clamp, type Rect } from '../core/math';
import { DT, TILE } from '../core/tuning';
import type { World } from '../world/world';
import { Enemy, type StrikeResult } from './enemy';
import type { Attack } from './player';
import { Projectile } from './projectile';

export type WardenState =
  | 'dormant'
  | 'intro'
  | 'idle'
  | 'leapWind'
  | 'leap'
  | 'chargeWind'
  | 'charge'
  | 'stagger'
  | 'roar'
  | 'burstWind'
  | 'rainWind'
  | 'shrug'
  | 'buck'
  | 'recover'
  | 'enrage'
  | 'dying';

type Move = 'leap' | 'charge' | 'burst' | 'rain';

const GRAVITY = 1800;
export const WARDEN_HP = 40;

/**
 * Warden of the Well: a slow-witted brute that holds a grudge.
 *
 * - Its tells vary in length from attack to attack, so you can't play it on rhythm.
 * - Hit it four times in quick succession and it shrugs you off with a slam.
 * - Sit on its back pogoing and it bucks, flinging embers straight up.
 * - It hates being ignored: heal at a distance and it charges.
 * - After smashing into a wall it sometimes roars in frustration, a free opening.
 * - Enraged (phase two) it chains a landing straight into a charge, and some
 *   charge tells turn into leaps instead.
 */
export class Warden extends Enemy {
  readonly kind = 'warden';
  readonly title = 'Warden of the Well';
  readonly sub = 'the sleeper beneath';
  state: WardenState = 'dormant';
  phase: 1 | 2 = 1;
  /** Shuffle bag: every move appears once per cycle, so the whole moveset always shows up. */
  private bag: Move[] = [];
  private lastMove: Move | null = null;
  private recoverTime = 0.5;
  private airborne = false;
  private roared = false;
  /** Per-attack tell multiplier, so timing never settles into a rhythm. */
  private jit = 1;
  private hits: number[] = [];
  private aboveTime = 0;

  constructor(cx: number, bottom: number) {
    super();
    this.w = 84;
    this.h = 76;
    this.hp = this.maxHp = WARDEN_HP;
    this.shards = 40;
    this.placeAt(cx, bottom);
  }

  private set(s: WardenState): void {
    this.state = s;
    this.st = 0;
  }

  get fast(): boolean {
    return this.phase === 2;
  }

  private tell(base: number): number {
    return base * (this.fast ? 0.78 : 1) * this.jit;
  }

  wake(): void {
    if (this.state === 'dormant') this.set('intro');
  }

  private get inert(): boolean {
    return this.state === 'dormant' || this.state === 'dying' || this.state === 'intro';
  }

  override contactBox(): Rect | null {
    if (this.inert) return null;
    return { x: this.x + 8, y: this.y + 10, w: this.w - 16, h: this.h - 12 };
  }

  override strike(w: World, atk: Attack): StrikeResult {
    if (this.inert) return 'none';
    void atk;
    this.hp -= w.player.damage;
    this.flash = 0.1;
    this.hits.push(this.t);
    if (this.hp <= 0) {
      this.hp = 0;
      this.set('dying');
      this.vx = 0;
      w.sfx('bossDeath');
      w.camera.addTrauma(0.6);
    } else if (this.phase === 1 && this.hp <= this.maxHp / 2) {
      this.phase = 2;
      this.bag = ['rain']; // open phase two by showing off the new move
      this.set('enrage');
      this.roared = false;
      this.vx = 0;
    }
    return 'hit';
  }

  update(w: World): void {
    this.tick();
    const p = w.player;
    const toward: 1 | -1 = p.cx >= this.cx ? 1 : -1;
    const speed = this.fast ? 1.25 : 1;
    const dist = Math.abs(p.cx - this.cx);

    // Grudges.
    this.hits = this.hits.filter((t) => this.t - t < 1.6);
    const above = Math.abs(p.cx - this.cx) < this.w / 2 + 12 && p.y + p.h < this.y + 14 && p.alive;
    this.aboveTime = above ? this.aboveTime + DT : Math.max(0, this.aboveTime - DT * 2);
    const canInterrupt =
      this.grounded && ['idle', 'recover', 'leapWind', 'chargeWind', 'burstWind'].includes(this.state);
    if (canInterrupt && this.hits.length >= 4) {
      this.hits = [];
      this.set('shrug');
      w.sfx('bossTell');
    } else if (canInterrupt && this.aboveTime > 0.45) {
      this.aboveTime = 0;
      this.set('buck');
      w.sfx('bossTell');
    }

    switch (this.state) {
      case 'dormant':
        this.vx = 0;
        break;
      case 'intro':
        if (this.st > 0.5 && !this.roared) {
          this.roared = true;
          w.sfx('roar');
          w.camera.addTrauma(0.7);
          w.particles.ring(this.cx, this.cy, '#ffb27a');
        }
        if (this.st >= 1.9) this.set('idle');
        break;
      case 'idle':
        this.facing = toward;
        this.vx = dist > 160 ? this.facing * 70 * speed : approach(this.vx, 0, 600 * DT);
        if (p.state === 'heal' && dist > 200) {
          // Don't you dare.
          this.jit = 0.8;
          this.set('chargeWind');
          w.sfx('bossTell');
        } else if (this.st >= (this.fast ? 0.4 : 0.7) * this.jit) this.choose(w);
        break;
      case 'leapWind':
        this.vx = 0;
        this.facing = toward;
        if (this.st >= this.tell(0.45)) this.leap(w);
        break;
      case 'leap':
        if (this.airborne && this.grounded && this.st > 0.1) {
          this.airborne = false;
          this.vx = 0;
          this.slam(w, this.fast ? 400 : 330, 3);
          if (this.fast && w.rng.next() < 0.45) {
            // Enraged: no breather, straight into a charge with a short tell.
            this.jit = 1;
            this.set('chargeWind');
            this.st = 0.2;
          } else this.recover(this.fast ? 0.4 : 0.6);
        }
        break;
      case 'chargeWind':
        this.vx = 0;
        this.facing = toward;
        if (this.t % 0.12 < DT) w.particles.dust(this.cx - this.facing * 30, this.y + this.h, 2, 0.6);
        if (this.st >= this.tell(0.55)) {
          if (this.fast && w.rng.next() < 0.25) {
            this.leap(w); // feint: the charge tell was a lie
          } else {
            this.vx = this.facing * (this.fast ? 640 : 520);
            this.set('charge');
            w.sfx('bossCharge');
          }
        }
        break;
      case 'charge':
        this.vx = this.facing * (this.fast ? 640 : 520);
        if (this.t % 0.05 < DT) w.particles.dust(this.cx - this.facing * 40, this.y + this.h, 2, 0.8);
        if (this.st > 2.5) this.recover(0.4);
        break;
      case 'stagger':
        this.vx = approach(this.vx, 0, 500 * DT);
        if (this.st >= (this.fast ? 0.6 : 0.9)) {
          if (!this.fast && w.rng.next() < 0.5) {
            this.roared = false;
            this.set('roar');
          } else this.set('idle');
        }
        break;
      case 'roar':
        this.vx = 0;
        if (this.st > 0.1 && !this.roared) {
          this.roared = true;
          w.sfx('roar');
          w.camera.addTrauma(0.3);
        }
        if (this.st >= 0.9) this.set('idle');
        break;
      case 'burstWind':
        this.vx = 0;
        this.facing = toward;
        if (this.st >= this.tell(0.5)) {
          this.burst(w);
          this.recover(this.fast ? 0.45 : 0.65);
        }
        break;
      case 'rainWind':
        this.vx = 0;
        if (this.st >= this.tell(0.5)) {
          this.rain(w);
          this.recover(0.9);
        }
        break;
      case 'shrug':
        this.vx = 0;
        if (this.st >= 0.18) {
          this.slam(w, 360, 1.1);
          this.recover(0.5);
        }
        break;
      case 'buck':
        this.vx = 0;
        if (this.st >= 0.16) {
          for (const deg of [-110, -90, -70]) {
            const a = (deg * Math.PI) / 180;
            const o = new Projectile('orb', this.cx - 8, this.y - 8, 16, 16, Math.cos(a) * 640, Math.sin(a) * 640);
            o.g = 1400;
            w.projectiles.push(o);
          }
          w.sfx('burst');
          w.camera.addTrauma(0.25);
          this.recover(0.45);
        }
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 900 * DT);
        if (this.st >= this.recoverTime) this.set('idle');
        break;
      case 'enrage':
        this.vx = 0;
        if (this.st > 0.3 && !this.roared) {
          this.roared = true;
          w.sfx('roar');
          w.camera.addTrauma(0.8);
          w.particles.ring(this.cx, this.cy, '#ff7a3a');
        }
        if (this.st >= 1.3) this.set('idle');
        break;
      case 'dying':
        this.vx = 0;
        if (this.t % 0.1 < DT) w.particles.embers(this.cx + (Math.random() - 0.5) * this.w, this.cy + (Math.random() - 0.5) * this.h, 6);
        if (this.st >= 2.2) {
          this.dead = true;
          w.onBossDefeated(this);
        }
        break;
    }

    if (this.state === 'dormant') return;
    const res = this.walk(w, GRAVITY, 1000);
    if (res.hitX && this.state === 'charge') {
      w.camera.addTrauma(0.6);
      w.sfx('bossLand');
      w.particles.debris(this.facing > 0 ? this.x + this.w : this.x, this.cy, 12);
      this.vx = -this.facing * 160;
      this.vy = -260;
      this.set('stagger');
    }
  }

  private leap(w: World): void {
    const air = (2 * 820) / GRAVITY;
    this.vy = -820;
    this.vx = clamp((w.player.cx - this.cx) / air, -470, 470);
    this.airborne = true;
    this.set('leap');
    w.sfx('bossJump');
  }

  private slam(w: World, waveSpeed: number, waveLife: number): void {
    w.camera.addTrauma(0.55);
    w.sfx('bossLand');
    w.particles.dust(this.cx, this.y + this.h, 18, 1.6);
    const fy = this.y + this.h - 30;
    for (const dir of [-1, 1]) {
      const wave = new Projectile('wave', this.cx - 13, fy, 26, 30, dir * waveSpeed, 0);
      wave.life = waveLife;
      w.projectiles.push(wave);
    }
  }

  private recover(t: number): void {
    this.recoverTime = t * this.jit;
    this.set('recover');
  }

  private choose(w: World): void {
    if (this.bag.length === 0) {
      const moves: Move[] = this.fast ? ['leap', 'charge', 'burst', 'rain'] : ['leap', 'charge', 'burst'];
      for (let i = moves.length - 1; i > 0; i--) {
        const j = Math.floor(w.rng.next() * (i + 1));
        [moves[i], moves[j]] = [moves[j], moves[i]];
      }
      // Never the same move twice in a row across a refill.
      if (moves[0] === this.lastMove) moves.push(moves.shift()!);
      this.bag = moves;
    }
    const move = this.bag.shift()!;
    this.lastMove = move;
    this.jit = w.rng.range(0.75, 1.3);
    if (move === 'leap') this.set('leapWind');
    else if (move === 'charge') this.set('chargeWind');
    else if (move === 'burst') this.set('burstWind');
    else this.set('rainWind');
    w.sfx('bossTell');
  }

  private burst(w: World): void {
    const n = this.fast ? 7 : 5;
    const mx = this.cx + this.facing * 30;
    const my = this.y + 18;
    for (let i = 0; i < n; i++) {
      const a = (-155 + (130 * i) / (n - 1)) * (Math.PI / 180) + w.rng.range(-0.08, 0.08);
      const s = w.rng.range(320, 440);
      const o = new Projectile('orb', mx - 8, my - 8, 16, 16, Math.cos(a) * s, Math.sin(a) * s);
      o.g = 900;
      w.projectiles.push(o);
    }
    w.sfx('burst');
  }

  private rain(w: World): void {
    w.camera.addTrauma(0.7);
    w.sfx('bossLand');
    const left = 3 * TILE;
    const right = w.map.pw - 3 * TILE;
    const xs = [w.player.cx, w.player.cx + w.player.vx * 0.6];
    for (let i = 2; i < 7; i++) xs.push(w.rng.range(left, right));
    xs.forEach((x, i) => {
      const d = new Projectile('debris', clamp(x, left, right) - 14, 2 * TILE + 2, 28, 28, 0, 0);
      d.delay = 0.55 + i * 0.12;
      d.g = 2200;
      w.projectiles.push(d);
    });
  }
}
