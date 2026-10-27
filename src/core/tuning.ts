// Every number that shapes how the game feels lives here.
// Units: world pixels (one tile = 32) and seconds.

export const TILE = 32;
export const DT = 1 / 60;
/** Virtual screen resolution for UI layout. */
export const VIEW_W = 960;
export const VIEW_H = 540;
/** The world is drawn zoomed in, so the camera sees this much of it. */
export const ZOOM = 1.2;
export const WORLD_VIEW_W = VIEW_W / ZOOM;
export const WORLD_VIEW_H = VIEW_H / ZOOM;

export const PLAYER = {
  w: 18,
  h: 34,
  run: 270,
  accel: 3000,
  decel: 3800,
  airAccel: 2400,
  airDecel: 1600,
  gravity: 2100,
  fallGravity: 2400,
  maxFall: 760,
  jumpVel: 780,
  jumpCutVel: 300,
  coyote: 0.1,
  jumpBuffer: 0.1,
  actionBuffer: 0.1,
  wallSlide: 150,
  wallClingMaxRise: 120,
  wallJumpVx: 300,
  wallJumpVy: 720,
  wallJumpLock: 0.12,
  wallCoyote: 0.08,
  dashSpeed: 720,
  dashTime: 0.2,
  dashCooldown: 0.4,
  attackCooldown: 0.36,
  attackActive: 0.1,
  attackVisual: 0.16,
  pogoVel: 660,
  recoilVel: 220,
  recoilTime: 0.08,
  blockRecoilVel: 380,
  maxHp: 5,
  invuln: 1.3,
  hurtTime: 0.22,
  hurtVx: 300,
  hurtVy: 420,
  soulMax: 99,
  soulPerHit: 11,
  healCost: 33,
  healTime: 0.95,
  doorPopVel: 880,
  doubleJumpVel: 680,
  parryStun: 0.35,
} as const;

// Hitstop durations, in simulation frames.
export const HITSTOP = {
  enemy: 3,
  boss: 2,
  block: 2,
  hurt: 6,
} as const;
