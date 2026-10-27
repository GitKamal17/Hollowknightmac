import { approach, clamp, type Rect } from '../core/math';
import { DT } from '../core/tuning';
import type { World } from '../world/world';
import { Enemy, type StrikeResult } from './enemy';
import type { Attack } from './player';
import { Projectile } from './projectile';

export type VesperState =
  | 'dormant'
  | 'intro'
  | 'stance'
  | 'lungeWind'
  | 'lunge'
  | 'feint'
  | 'comboWind'
  | 'combo'
  | 'antiAir'
  | 'parry'
  | 'riposte'
  | 'leapWind'
  | 'leap'
  | 'dive'
  | 'evade'
  | 'waveWind'
  | 'taunt'
  | 'recover'
  | 'enrage'
  | 'dying';

export const VESPER_HP = 56;
const GRAVITY = 2000;

/**
 * Vesper, the Duskblade: a proud duelist who studies you.
 *
 * - She holds a guard and keeps her distance, backstepping when you close in.
 * - She reads habits: keep swinging at her guard and her parry chance climbs.
 *   A parry staggers you and she ripostes. Pogo too often and she answers
 *   with a rising cut.
 * - She hates being crowded: three quick hits and she backflips out and
 *   counters from range.
 * - She feints lunges, and when you hang back she taunts you, an opening
 *   for the brave.
 * - She punishes healing in front of her.
 * - In phase two her lunges double back, her combos run longer, and she
 *   throws dusk crescents.
 */
export class Vesper extends Enemy {
  readonly kind = 'vesper';
  readonly title = 'Vesper, the Duskblade';
  readonly sub = 'she has waited long for a worthy blade';
  state: VesperState = 'dormant';
  phase: 1 | 2 = 1;
  /** What she has learned about you. Decays, so changing habits works. */
  readonly habits = { front: 0, pogo: 0 };
  private farTime = 0;
  private jit = 1;
  private comboLeft = 0;
  private recoverTime = 0.4;
  private streak: number[] = [];
  private seenAttack: Attack | null = null;
  private doubled = false;

  constructor(cx: number, bottom: number) {
    super();
    this.w = 24;
    this.h = 46;
    this.hp = this.maxHp = VESPER_HP;
    this.shards = 80;
    this.facing = -1;
    this.placeAt(cx, bottom);
  }

  get fast(): boolean {
    return this.phase === 2;
  }

  private set(s: VesperState): void {
    this.state = s;
    this.st = 0;
  }

  private tell(base: number): number {
    return base * (this.fast ? 0.75 : 1) * this.jit;
  }

  wake(): void {
    if (this.state === 'dormant') this.set('intro');
  }

  private get inert(): boolean {
    return this.state === 'dormant' || this.state === 'intro' || this.state === 'dying';
  }

  override contactBox(): Rect | null {
    if (this.inert || this.state === 'taunt') return null;
    return { x: this.x + 3, y: this.y + 6, w: this.w - 6, h: this.h - 8 };
  }

  override strike(w: World, atk: Attack): StrikeResult {
    if (this.inert) return 'none';
    const p = w.player;
    const front = atk.dir === 'side' && atk.facing === -this.facing;
    if ((this.state === 'stance' || this.state === 'recover') && front) {
      const cap = this.fast ? 0.75 : 0.6;
      const chance = clamp(0.15 + this.habits.front * 0.12, 0.15, cap);
      if (w.rng.next() < chance) {
        this.set('parry');
        this.vx = 0;
        p.parried(this.cx);
        w.sfx('parry');
        return 'blocked';
      }
    }

    this.hp -= p.damage;
    this.flash = 0.1;
    this.streak = this.streak.filter((t) => this.t - t < 1.1);
    this.streak.push(this.t);
    if (this.hp <= 0) {
      this.hp = 0;
      this.set('dying');
      this.vx = 0;
      w.sfx('bossDeath');
      w.camera.addTrauma(0.6);
      return 'hit';
    }
    if (this.phase === 1 && this.hp <= this.maxHp / 2) {
      this.phase = 2;
      this.set('enrage');
      this.vx = 0;
      return 'hit';
    }
    const busy = ['lunge', 'combo', 'dive', 'leap', 'riposte', 'evade'].includes(this.state);
    if (this.state === 'taunt' || (!busy && this.streak.length >= 3 && this.grounded)) {
      this.streak = [];
      this.evade(w);
    }
    return 'hit';
  }

  update(w: World): void {
    this.tick();
    const p = w.player;
    const dx = p.cx - this.cx;
    const dist = Math.abs(dx);
    const toward: 1 | -1 = dx >= 0 ? 1 : -1;

    // Study the player.
    this.habits.front = Math.max(0, this.habits.front - DT * 0.12);
    this.habits.pogo = Math.max(0, this.habits.pogo - DT * 0.12);
    const atk = p.attack;
    if (atk && atk !== this.seenAttack && !this.inert) {
      this.seenAttack = atk;
      if (atk.dir === 'down') this.habits.pogo++;
      if (atk.dir === 'side' && atk.facing === -this.facing && dist < 140) this.habits.front++;
    }
    this.farTime = dist > 260 ? this.farTime + DT : 0;

    switch (this.state) {
      case 'dormant':
        this.vx = 0;
        break;
      case 'intro':
        this.vx = 0;
        this.facing = toward;
        if (this.st > 0.6 && this.st - DT <= 0.6) w.sfx('vesperIntro');
        if (this.st >= 1.8) this.set('stance');
        break;
      case 'stance': {
        this.facing = toward;
        if (dist < 100) this.vx = -this.facing * 220;
        else if (dist > 210) this.vx = this.facing * 170;
        else this.vx = approach(this.vx, 0, 1200 * DT);
        if (p.state === 'heal') {
          this.jit = 0.7;
          this.set('lungeWind');
          w.sfx('bossTell');
        } else if (this.st >= (this.fast ? 0.45 : 0.75) * this.jit) this.decide(w, dist);
        break;
      }
      case 'lungeWind':
        this.vx = 0;
        this.facing = toward;
        if (this.st >= this.tell(0.38)) {
          this.vx = this.facing * 780;
          this.set('lunge');
          w.sfx('lunge');
        }
        break;
      case 'lunge':
        if (this.t % 0.03 < DT) w.particles.add({ x: this.cx, y: this.cy, life: 0.25, size: 5, color: 'rgba(170,140,230,0.5)' });
        if (this.st >= 0.24) {
          if (this.fast && !this.doubled && w.rng.next() < 0.55) {
            // Double back for a second lunge.
            this.doubled = true;
            this.facing = toward;
            this.set('lungeWind');
            this.st = this.tell(0.38) - 0.14;
          } else {
            this.doubled = false;
            this.recover(0.35);
          }
        }
        break;
      case 'feint':
        if (this.st < 0.22) this.vx = 0;
        else if (this.st < 0.42) this.vx = -this.facing * 320;
        else if (w.rng.next() < 0.5) {
          this.set('lungeWind');
          this.st = this.tell(0.38) - 0.12;
        } else this.set('stance');
        break;
      case 'comboWind':
        this.vx = 0;
        this.facing = toward;
        if (this.st >= this.tell(0.22)) {
          this.comboLeft = (this.fast ? 3 : 2) + (w.rng.next() < 0.5 ? 1 : 0);
          this.set('combo');
          this.st = 0.24;
        }
        break;
      case 'combo':
        this.vx = approach(this.vx, 0, 1400 * DT);
        if (this.st >= 0.24) {
          if (this.comboLeft-- <= 0) {
            this.recover(0.45);
            break;
          }
          this.st = 0;
          this.facing = toward;
          this.vx = this.facing * 230;
          this.slash(w, this.facing > 0 ? this.x + this.w - 4 : this.x - 52, this.y + 2, 56, 40);
        }
        break;
      case 'antiAir':
        this.vx = 0;
        this.facing = toward;
        if (this.st >= this.tell(0.2) && this.st - DT < this.tell(0.2)) {
          this.vy = -520;
          this.slash(w, this.cx - 34, this.y - 70, 68, 84);
        }
        if (this.st > 0.3 && this.grounded) this.recover(0.4);
        break;
      case 'parry':
        this.vx = 0;
        if (this.st >= 0.16) {
          this.facing = toward;
          this.vx = this.facing * 420;
          this.slash(w, this.facing > 0 ? this.x + this.w - 4 : this.x - 60, this.y - 4, 64, 50);
          this.set('riposte');
        }
        break;
      case 'riposte':
        this.vx = approach(this.vx, 0, 1600 * DT);
        if (this.st >= 0.2) this.recover(0.35);
        break;
      case 'leapWind':
        this.vx = 0;
        this.facing = toward;
        if (this.st >= this.tell(0.26)) {
          this.vy = -800;
          this.vx = clamp((p.cx + toward * 50 - this.cx) / 0.75, -540, 540);
          this.set('leap');
          w.sfx('bossJump');
        }
        break;
      case 'leap':
        if ((this.vy > -150 && Math.abs(p.cx - this.cx) < 70) || this.st > 0.75) {
          this.vx = 0;
          this.vy = 980;
          this.set('dive');
        }
        break;
      case 'dive':
        if (this.grounded) {
          w.camera.addTrauma(0.3);
          w.sfx('bossLand');
          w.particles.dust(this.cx, this.y + this.h, 12, 1.2);
          this.slash(w, this.cx - 60, this.y + this.h - 22, 120, 22);
          this.recover(0.55);
        }
        break;
      case 'evade':
        if (this.grounded && this.st > 0.15) {
          this.facing = toward;
          if (this.fast || w.rng.next() < 0.5) this.set('waveWind');
          else this.set('lungeWind');
        }
        break;
      case 'waveWind':
        this.vx = 0;
        this.facing = toward;
        if (this.st >= this.tell(0.3) && this.st - DT < this.tell(0.3)) this.crescent(w, this.y + 8);
        if (this.fast && this.st >= this.tell(0.3) + 0.18 && this.st - DT < this.tell(0.3) + 0.18) this.crescent(w, this.y + this.h - 34);
        if (this.st >= this.tell(0.3) + 0.35) this.recover(0.4);
        break;
      case 'taunt':
        this.vx = 0;
        this.facing = toward;
        if (this.st >= 1.1) {
          this.jit = 0.8;
          this.set('lungeWind');
        }
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 1200 * DT);
        if (this.st >= this.recoverTime) this.set('stance');
        break;
      case 'enrage':
        this.vx = 0;
        if (this.st > 0.2 && this.st - DT <= 0.2) {
          w.sfx('roar');
          w.camera.addTrauma(0.5);
          w.particles.ring(this.cx, this.cy, '#c9a6ff');
        }
        if (this.st >= 1.2) this.set('stance');
        break;
      case 'dying':
        this.vx = 0;
        if (this.t % 0.08 < DT) w.particles.burst(this.cx, this.cy, 4, '#c9a6ff', 200, 3);
        if (this.st >= 2.4) {
          this.dead = true;
          w.onBossDefeated(this);
        }
        break;
    }

    if (this.state === 'dormant') return;
    const res = this.walk(w, GRAVITY, this.state === 'dive' ? 1100 : 900);
    if (res.hitX && this.state === 'lunge') this.recover(0.4);
  }

  private decide(w: World, dist: number): void {
    const p = w.player;
    const r = w.rng.next();
    this.jit = w.rng.range(0.7, 1.3);
    let next: VesperState;
    if (this.farTime > 2.5 && !this.fast && r < 0.6) next = 'taunt';
    else if (this.habits.pogo >= 2 && p.y + p.h < this.y + 10 && Math.abs(p.cx - this.cx) < 90) next = 'antiAir';
    else if (dist > 230) next = this.fast && r < 0.45 ? 'waveWind' : r < 0.8 ? 'lungeWind' : 'leapWind';
    else if (r < 0.4) next = 'comboWind';
    else if (r < 0.62) next = 'leapWind';
    else if (r < 0.8) next = 'feint';
    else next = 'lungeWind';
    this.set(next);
    if (next !== 'taunt') w.sfx('bossTell');
  }

  private evade(w: World): void {
    const away = w.player.cx >= this.cx ? -1 : 1;
    this.vx = away * 380;
    this.vy = -520;
    this.set('evade');
    w.sfx('bossJump');
  }

  private recover(t: number): void {
    this.recoverTime = t * this.jit;
    this.set('recover');
  }

  private slash(w: World, x: number, y: number, sw: number, sh: number): void {
    const s = new Projectile('slash', x, y, sw, sh, 0, 0);
    s.life = 0.13;
    w.projectiles.push(s);
    w.sfx('enemySlash');
  }

  private crescent(w: World, y: number): void {
    const c = new Projectile('crescent', this.cx - 14 + this.facing * 16, y, 28, 30, this.facing * 470, 0);
    c.life = 3;
    w.projectiles.push(c);
    w.sfx('crescent');
  }
}
