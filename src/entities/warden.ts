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
  | 'burstWind'
  | 'rainWind'
  | 'recover'
  | 'enrage'
  | 'dying';

type Move = 'leap' | 'charge' | 'burst' | 'rain';

const GRAVITY = 1800;
export const WARDEN_HP = 40;

/**
 * Warden of the Well. Three telegraphed attacks in phase one; at half health it
 * enrages, speeds up, and adds a ceiling-debris slam.
 */
export class Warden extends Enemy {
  readonly kind = 'warden';
  state: WardenState = 'dormant';
  phase: 1 | 2 = 1;
  /** Shuffle bag: every move appears once per cycle, so the whole moveset always shows up. */
  private bag: Move[] = [];
  private lastMove: Move | null = null;
  private recoverTime = 0.5;
  private airborne = false;
  private roared = false;

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

  wake(): void {
    if (this.state === 'dormant') this.set('intro');
  }

  override contactBox(): Rect | null {
    if (this.state === 'dormant' || this.state === 'dying' || this.state === 'intro') return null;
    return { x: this.x + 8, y: this.y + 10, w: this.w - 16, h: this.h - 12 };
  }

  override strike(w: World, atk: Attack): StrikeResult {
    if (this.state === 'dormant' || this.state === 'dying' || this.state === 'intro') return 'none';
    this.hp -= 1;
    this.flash = 0.1;
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
    void atk;
    return 'hit';
  }

  update(w: World): void {
    this.tick();
    const p = w.player;
    const toward: 1 | -1 = p.cx >= this.cx ? 1 : -1;
    const speed = this.fast ? 1.25 : 1;

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
      case 'idle': {
        this.facing = toward;
        const dist = Math.abs(p.cx - this.cx);
        this.vx = dist > 160 ? this.facing * 70 * speed : approach(this.vx, 0, 600 * DT);
        if (this.st >= (this.fast ? 0.4 : 0.7)) this.choose(w);
        break;
      }
      case 'leapWind':
        this.vx = 0;
        this.facing = toward;
        if (this.st >= (this.fast ? 0.34 : 0.45)) {
          const air = (2 * 820) / GRAVITY;
          this.vy = -820;
          this.vx = clamp((p.cx - this.cx) / air, -470, 470);
          this.airborne = true;
          this.set('leap');
          w.sfx('bossJump');
        }
        break;
      case 'leap':
        if (this.airborne && this.grounded && this.st > 0.1) {
          this.airborne = false;
          this.vx = 0;
          w.camera.addTrauma(0.55);
          w.sfx('bossLand');
          w.particles.dust(this.cx, this.y + this.h, 18, 1.6);
          const v = this.fast ? 400 : 330;
          const fy = this.y + this.h - 30;
          w.projectiles.push(new Projectile('wave', this.cx - 13, fy, 26, 30, -v, 0));
          w.projectiles.push(new Projectile('wave', this.cx - 13, fy, 26, 30, v, 0));
          this.recover(this.fast ? 0.4 : 0.6);
        }
        break;
      case 'chargeWind':
        this.vx = 0;
        this.facing = toward;
        if (this.t % 0.12 < DT) w.particles.dust(this.cx - this.facing * 30, this.y + this.h, 2, 0.6);
        if (this.st >= (this.fast ? 0.42 : 0.55)) {
          this.vx = this.facing * (this.fast ? 640 : 520);
          this.set('charge');
          w.sfx('bossCharge');
        }
        break;
      case 'charge':
        this.vx = this.facing * (this.fast ? 640 : 520);
        if (this.t % 0.05 < DT) w.particles.dust(this.cx - this.facing * 40, this.y + this.h, 2, 0.8);
        if (this.st > 2.5) this.recover(0.4);
        break;
      case 'stagger':
        this.vx = approach(this.vx, 0, 500 * DT);
        if (this.st >= (this.fast ? 0.6 : 0.9)) this.set('idle');
        break;
      case 'burstWind':
        this.vx = 0;
        this.facing = toward;
        if (this.st >= (this.fast ? 0.4 : 0.5)) {
          this.burst(w);
          this.recover(this.fast ? 0.45 : 0.65);
        }
        break;
      case 'rainWind':
        this.vx = 0;
        if (this.st >= 0.45) {
          this.rain(w);
          this.recover(0.9);
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

  private recover(t: number): void {
    this.recoverTime = t;
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
      const a = (-155 + (130 * i) / (n - 1)) * (Math.PI / 180) + w.rng.range(-0.05, 0.05);
      const s = w.rng.range(330, 420);
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
    const xs = [w.player.cx];
    const n = 6;
    for (let i = 1; i < n; i++) xs.push(w.rng.range(left, right));
    xs.forEach((x, i) => {
      const d = new Projectile('debris', clamp(x, left, right) - 14, 2 * TILE + 2, 28, 28, 0, 0);
      d.delay = 0.55 + i * 0.12;
      d.g = 2200;
      w.projectiles.push(d);
    });
  }
}
