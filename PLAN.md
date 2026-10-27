# GLOAMWELL — build plan

An original 2D action-platformer vertical slice whose *game feel* is inspired by
Hollow Knight. No names, art, audio or lore from that game are used.

## Milestones

1. **Scaffold** — Vite + TypeScript (strict), Vitest, fixed-timestep loop, input
   (keyboard + gamepad) with press latching so sub-frame taps are never lost.
2. **Physics** — tile map, swept axis-separated AABB movement with sub-stepping
   (no tunnelling at dash speed), hazard and clingable-wall queries.
3. **Player movement** — acceleration/deceleration, variable jump, coyote time,
   jump buffer, capped fall, wall slide + wall jump, dash (unlockable).
   Unit tests for collision, coyote, buffering.
4. **Combat** — side/up/down strikes, pogo off enemies and thorns, knockback,
   hitstop, screen shake, essence (soul) gain, hold-to-heal channel,
   damage + invulnerability. Unit tests for pogo and damage.
5. **Enemies** — Skitter (patrols, turns at ledges), Duskmoth (winds up and
   charges), Ironshell (shield in front; hit from behind or above).
6. **World** — 8 hand-authored ASCII rooms, edge doors with fades, camera with
   look-ahead + vertical deadzone, parallax backgrounds.
7. **Lantern / save** — rest to heal and set respawn; persist bench, dash,
   boss, shards and echo to localStorage. Death drops shards as an echo.
   Save round-trip test.
8. **Dash gate** — a chasm that is provably uncrossable without the dash
   (simulated in a test) and crossable with it.
9. **Boss** — Warden of the Well: leap slam + shockwaves, charge into wall,
   orb burst; phase 2 at 50% adds falling debris and speeds everything up.
10. **Polish + verification** — particles, synthesized WebAudio SFX, HUD,
    menus, Playwright run with screenshots, production build.
