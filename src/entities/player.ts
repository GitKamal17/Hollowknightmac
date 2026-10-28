import { approach, type Rect } from '../core/math';
import { DT, PLAYER as P } from '../core/tuning';
import type { InputState } from '../core/input';
import { moveBody, onGround } from '../physics/collide';
import type { TileMap } from '../physics/tilemap';
import { Entity } from './entity';

export type PlayerState = 'normal' | 'dash' | 'hurt' | 'heal' | 'rest' | 'dead' | 'hazard' | 'frozen';

export type PlayerEvent = 'jump' | 'walljump' | 'doublejump' | 'land' | 'dash' | 'healed';
export type AttackDir = 'side' | 'up' | 'down';

export interface Attack {
  dir: AttackDir;
  facing: 1 | -1;
  t: number;
  active: boolean;
  hit: Set<object>;
  pogoed: boolean;
  swing: number;
}

/** The slice of the world the player needs. Kept narrow so tests can drive the player directly. */
export interface PlayerHost {
  map: TileMap;
  sfx(name: string): void;
  onPlayerEvent(kind: PlayerEvent, strength?: number): void;
}

export class Player extends Entity {
  facing: 1 | -1 = 1;
  state: PlayerState = 'normal';
  stateTimer = 0;

  grounded = false;
  hp: number = P.maxHp;
  maxHp: number = P.maxHp;
  soul = 0;
  invuln = 0;

  coyote = 0;
  jumpBuffer = 0;
  attackBuffer = 0;
  dashBuffer = 0;
  jumping = false;
  /** Speed and time left of the current jump's held, constant-speed rise. */
  private rise = 0;
  private riseT = 0;
  /** Time since the current jump began, and how long it rises regardless of input. */
  private jumpAge = 0;
  private minRise = 0;

  wallDir: -1 | 0 | 1 = 0;
  wallSliding = false;
  wallCoyote = 0;
  lastWallDir: -1 | 1 = 1;
  inputLock = 0;

  dashUnlocked = false;
  airDash = true;
  dashTimer = 0;
  dashCd = 0;

  attackCd = 0;
  attack: Attack | null = null;
  private swings = 0;
  recoil = 0;
  recoilVx = 0;

  healTimer = 0;
  /** Stats that upgrades change (see world/shop.ts). */
  damage = 1;
  healTime: number = P.healTime;
  soulPerHit: number = P.soulPerHit;
  wingsUnlocked = false;
  airJumps = 0;
  lastSafe = { x: 0, y: 0 };

  /** Animation bookkeeping (read by the renderer only). */
  anim = 0;
  runPhase = 0;
  landSquash = 0;
  trail: { x: number; y: number; facing: number; life: number }[] = [];

  constructor() {
    super();
    this.w = P.w;
    this.h = P.h;
  }

  /** Record presses into short buffers. Runs even during hitstop so no input is dropped. */
  noteInput(inp: InputState): void {
    if (inp.pressed.jump) this.jumpBuffer = P.jumpBuffer;
    if (inp.pressed.attack) this.attackBuffer = P.actionBuffer;
    if (inp.pressed.dash) this.dashBuffer = P.actionBuffer;
  }

  clearBuffers(): void {
    this.jumpBuffer = this.attackBuffer = this.dashBuffer = 0;
  }

  hurtbox(): Rect {
    return { x: this.x + 3, y: this.y + 5, w: this.w - 6, h: this.h - 7 };
  }

  attackBox(): Rect | null {
    const a = this.attack;
    if (!a || !a.active) return null;
    if (a.dir === 'up') return { x: this.cx - 22, y: this.y - 56, w: 44, h: 64 };
    if (a.dir === 'down') return { x: this.cx - 22, y: this.y + this.h - 8, w: 44, h: 58 };
    const w = 62;
    return { x: a.facing > 0 ? this.x + this.w - 6 : this.x + 6 - w, y: this.cy - 20, w, h: 40 };
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  update(host: PlayerHost, inp: InputState): void {
    const dt = DT;
    this.savePrev();
    this.anim += dt;
    this.coyote = Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.attackBuffer = Math.max(0, this.attackBuffer - dt);
    this.dashBuffer = Math.max(0, this.dashBuffer - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.inputLock = Math.max(0, this.inputLock - dt);
    this.recoil = Math.max(0, this.recoil - dt);
    this.wallCoyote = Math.max(0, this.wallCoyote - dt);
    this.landSquash = Math.max(0, this.landSquash - dt);
    for (const t of this.trail) t.life -= dt;
    this.trail = this.trail.filter((t) => t.life > 0);

    if (this.attack) {
      this.attack.t += dt;
      this.attack.active = this.attack.t < P.attackActive;
      if (this.attack.t >= P.attackVisual) this.attack = null;
    }

    switch (this.state) {
      case 'dead':
        this.stateTimer -= dt;
        return;
      case 'hazard':
      case 'frozen':
        return;
      case 'rest':
        if (inp.pressed.left || inp.pressed.right || inp.pressed.jump || inp.pressed.attack || inp.pressed.down) {
          this.state = 'normal';
          this.clearBuffers();
        }
        this.vx = 0;
        this.physics(host);
        return;
      case 'dash':
        this.updateDash(host);
        return;
      case 'hurt':
        this.stateTimer -= dt;
        this.applyGravity(false);
        this.physics(host);
        if (this.stateTimer <= 0) this.state = 'normal';
        return;
      case 'heal':
        this.updateHeal(host, inp);
        return;
      case 'normal':
        this.updateNormal(host, inp);
        return;
    }
  }

  private updateNormal(host: PlayerHost, inp: InputState): void {
    const dt = DT;
    const dir = (inp.held.right ? 1 : 0) - (inp.held.left ? 1 : 0);

    if (this.inputLock <= 0) {
      const target = dir * P.run;
      const a = this.grounded ? (dir !== 0 ? P.accel : P.decel) : dir !== 0 ? P.airAccel : P.airDecel;
      // Turning around on the ground is instant, like the games this is inspired by.
      if (this.grounded && dir !== 0 && Math.sign(this.vx) === -dir) this.vx = 0;
      this.vx = approach(this.vx, target, a * dt);
      if (dir !== 0) this.facing = dir as 1 | -1;
    }
    if (this.recoil > 0) this.vx = this.recoilVx;

    // Walls
    this.wallDir = this.touchingWall(host.map);
    // Pressing into a wall grabs it; after that you stay on it until you press away or jump.
    const cling =
      !this.grounded &&
      this.wallDir !== 0 &&
      (dir === this.wallDir || (this.wallSliding && dir !== -this.wallDir)) &&
      this.vy > -P.wallClingMaxRise &&
      this.inputLock <= 0;
    if (cling && !this.wallSliding) {
      this.airDash = true;
      this.airJumps = 1;
      host.sfx('cling');
    }
    this.wallSliding = cling;
    if (cling) {
      this.facing = -this.wallDir as 1 | -1;
      this.lastWallDir = this.wallDir as 1 | -1;
      this.wallCoyote = P.wallCoyote;
    }

    // Jumping
    this.jumpAge += DT;
    if (this.jumpBuffer > 0) {
      if (this.grounded || this.coyote > 0) this.jump(host);
      else if (this.wallSliding || this.wallDir !== 0 || this.wallCoyote > 0) this.wallJump(host);
      else if (this.wingsUnlocked && this.airJumps > 0) this.doubleJump(host);
    }
    const holding = inp.held.jump || this.jumpAge + 1e-6 < this.minRise;
    if (this.jumping && !holding && this.vy < -P.jumpCutVel) {
      this.vy = -P.jumpCutVel;
      this.jumping = false;
    }
    if (this.vy >= 0) this.jumping = false;

    this.applyGravity(this.wallSliding);
    if (this.jumping && this.riseT > 0 && holding) {
      this.vy = -this.rise;
      this.riseT -= DT;
    } else this.riseT = 0;

    // Dash
    if (this.dashBuffer > 0 && this.dashUnlocked && this.dashCd <= 0 && (this.grounded || this.airDash)) {
      this.startDash(host, dir);
      this.updateDash(host);
      return;
    }

    // Strike
    if (this.attackBuffer > 0 && this.attackCd <= 0) this.startAttack(host, inp);

    // Heal (hold)
    if (inp.held.heal && this.grounded && this.soul >= P.healCost && this.hp < this.maxHp) {
      this.state = 'heal';
      this.healTimer = 0;
      host.sfx('focus');
    }

    this.physics(host);
  }

  private applyGravity(sliding: boolean): void {
    const g = this.vy < 0 ? P.gravity : P.fallGravity;
    this.vy += g * DT;
    const cap = sliding ? P.wallSlide : P.maxFall;
    if (this.vy > cap) this.vy = cap;
  }

  private jump(host: PlayerHost): void {
    this.vy = -P.jumpRise;
    this.rise = P.jumpRise;
    this.riseT = P.jumpHold;
    this.jumpAge = 0;
    this.minRise = P.jumpMinRise;
    this.jumping = true;
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.grounded = false;
    host.sfx('jump');
    host.onPlayerEvent('jump');
  }

  private doubleJump(host: PlayerHost): void {
    this.vy = -P.doubleJumpRise;
    this.rise = P.doubleJumpRise;
    this.riseT = P.doubleJumpHold;
    this.jumpAge = 0;
    this.minRise = P.jumpMinRise;
    this.airJumps--;
    this.jumping = true;
    this.jumpBuffer = 0;
    host.sfx('doublejump');
    host.onPlayerEvent('doublejump');
  }

  private wallJump(host: PlayerHost): void {
    const wall = this.wallDir !== 0 ? this.wallDir : this.lastWallDir;
    this.vx = -wall * P.wallJumpVx;
    this.vy = -P.wallJumpVy;
    this.facing = -wall as 1 | -1;
    this.inputLock = P.wallJumpLock;
    this.jumping = true;
    this.riseT = 0;
    this.jumpAge = 0;
    this.minRise = P.wallJumpMinRise;
    this.jumpBuffer = 0;
    this.wallCoyote = 0;
    this.wallSliding = false;
    host.sfx('walljump');
    host.onPlayerEvent('walljump', wall);
  }

  private startDash(host: PlayerHost, dir: number): void {
    if (this.wallSliding) this.facing = -this.wallDir as 1 | -1;
    else if (dir !== 0) this.facing = dir as 1 | -1;
    this.state = 'dash';
    this.dashTimer = P.dashTime;
    this.dashCd = P.dashCooldown;
    this.dashBuffer = 0;
    if (!this.grounded) this.airDash = false;
    this.jumping = false;
    this.wallSliding = false;
    this.vy = 0;
    host.sfx('dash');
    host.onPlayerEvent('dash');
  }

  private updateDash(host: PlayerHost): void {
    this.dashTimer -= DT;
    this.vx = this.facing * P.dashSpeed;
    this.vy = 0;
    const res = moveBody(this, this.vx * DT, 0, host.map);
    this.grounded = onGround(this, host.map);
    if (this.trail.length === 0 || Math.abs(this.trail[this.trail.length - 1].x - this.x) > 10) {
      this.trail.push({ x: this.x, y: this.y, facing: this.facing, life: 0.22 });
    }
    if (res.hitX || this.dashTimer <= 0) {
      this.state = 'normal';
      this.vx = res.hitX ? 0 : this.facing * P.run;
    }
  }

  private startAttack(host: PlayerHost, inp: InputState): void {
    const dir: AttackDir = inp.held.up ? 'up' : inp.held.down && !this.grounded ? 'down' : 'side';
    this.attack = { dir, facing: this.facing, t: 0, active: true, hit: new Set(), pogoed: false, swing: this.swings++ };
    this.attackCd = P.attackCooldown;
    this.attackBuffer = 0;
    host.sfx('slash');
  }

  private updateHeal(host: PlayerHost, inp: InputState): void {
    if (!inp.held.heal || !this.grounded || this.soul < P.healCost || this.hp >= this.maxHp) {
      this.state = 'normal';
      this.healTimer = 0;
    } else {
      this.healTimer += DT;
      if (this.healTimer >= this.healTime) {
        this.healTimer = 0;
        this.soul -= P.healCost;
        this.hp = Math.min(this.maxHp, this.hp + 1);
        host.sfx('healed');
        host.onPlayerEvent('healed');
      }
    }
    this.vx = approach(this.vx, 0, P.decel * DT);
    this.applyGravity(false);
    this.physics(host);
  }

  private physics(host: PlayerHost): void {
    const impact = this.vy;
    const res = moveBody(this, this.vx * DT, this.vy * DT, host.map);
    // While input is locked (wall jump, door arrival) keep the scripted velocity,
    // so popping up out of a hole still drifts onto the ledge once clear of it.
    if (res.hitX && this.inputLock <= 0) this.vx = 0;
    if (res.hitY) {
      if (this.vy < 0) this.jumping = false;
      this.vy = 0;
    }
    const was = this.grounded;
    this.grounded = this.vy >= 0 && onGround(this, host.map);
    if (this.grounded) {
      this.coyote = P.coyote;
      this.airDash = true;
      this.airJumps = 1;
      this.wallSliding = false;
      if (!was) {
        this.landSquash = Math.min(0.12, impact / 5000);
        if (impact > 250) {
          host.sfx('land');
          host.onPlayerEvent('land', impact);
        }
      }
      this.updateSafe(host.map);
    }
    if (this.grounded && Math.abs(this.vx) > 10) this.runPhase += Math.abs(this.vx) * DT * 0.06;
  }

  private updateSafe(map: TileMap): void {
    // Only remember spots with ground under both feet and no hazards nearby.
    const footL = map.overlapsSolid(this.x, this.y + this.h, 1, 1);
    const footR = map.overlapsSolid(this.x + this.w - 1, this.y + this.h, 1, 1);
    if (footL && footR && !map.hazardIn(this.x - 8, this.y, this.w + 16, this.h + 4)) {
      this.lastSafe = { x: this.x, y: this.y };
    }
  }

  private touchingWall(map: TileMap): -1 | 0 | 1 {
    const y = this.y + 6;
    const h = this.h - 12;
    if (map.overlapsClingable(this.x + this.w, y, 1, h)) return 1;
    if (map.overlapsClingable(this.x - 1, y, 1, h)) return -1;
    return 0;
  }

  // ---- reactions driven by the world ------------------------------------

  pogo(): void {
    this.vy = -P.pogoVel;
    this.jumping = false;
    this.airDash = true;
    this.airJumps = 1;
    this.coyote = 0;
    if (this.attack) this.attack.pogoed = true;
  }

  recoilFrom(facing: number, speed: number = P.recoilVel): void {
    this.recoil = P.recoilTime;
    this.recoilVx = -facing * speed;
  }

  /** Knocked back by a parry: no damage, but briefly helpless. */
  parried(fromX: number): void {
    if (this.state !== 'normal' && this.state !== 'heal') return;
    this.attack = null;
    this.state = 'hurt';
    this.stateTimer = P.parryStun;
    this.vx = (Math.sign(this.cx - fromX) || -this.facing) * 340;
    this.vy = -260;
    this.jumping = false;
  }

  gainSoul(n: number = this.soulPerHit): void {
    this.soul = Math.min(P.soulMax, this.soul + n);
  }

  /** Returns false when the hit was ignored (invulnerable or already down). */
  takeHit(fromX: number, ignoreInvuln = false): boolean {
    if (this.state === 'dead' || this.state === 'hazard') return false;
    if (this.invuln > 0 && !ignoreInvuln) return false;
    this.hp = Math.max(0, this.hp - 1);
    this.invuln = P.invuln;
    this.healTimer = 0;
    this.attack = null;
    this.jumping = false;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.stateTimer = 1.5;
      this.vx = this.vy = 0;
      return true;
    }
    const away = Math.sign(this.cx - fromX) || -this.facing;
    this.state = 'hurt';
    this.stateTimer = P.hurtTime;
    this.vx = away * P.hurtVx;
    this.vy = -P.hurtVy;
    return true;
  }

  respawn(cx: number, bottom: number): void {
    this.placeAt(cx, bottom);
    this.vx = this.vy = 0;
    this.state = 'normal';
    this.hp = this.maxHp;
    this.soul = 0;
    this.invuln = 0;
    this.attack = null;
    this.trail = [];
    this.clearBuffers();
    this.lastSafe = { x: this.x, y: this.y };
  }
}
