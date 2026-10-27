# Gloamwell

An original 2D action-platformer vertical slice, built to recreate the *game feel* of Hollow Knight: tight movement, nail-style combat with pogo bounces, a lantern save point, a death echo, one ability gate and a two-phase boss. All names, art, sound and lore are original. Nothing is taken from Team Cherry's game.

It runs in any modern browser, so it plays on a Mac in Safari or Chrome. Everything (characters, terrain, effects, sound) is generated in code. There are no image or audio files.

| | |
|---|---|
| ![Gloam Gate](docs/gate.png) | ![Thornfield](docs/thorns.png) |
| ![Lantern Rest](docs/lantern.png) | ![Warden of the Well, phase two](docs/boss.png) |

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

```sh
npm run build      # strict typecheck + production bundle in dist/
npm run preview    # serve the production build
npm test           # 60 unit and simulation tests
npm run e2e        # headless playthrough with screenshots (see Testing)
```

Requires Node 18+.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Move | Arrows / WASD | Left stick / D-pad |
| Jump (hold for height) | Z / Space / J | A |
| Strike | X / K | X |
| Aim strike | hold Up or Down | hold Up or Down |
| Dash (once found) | C / L / Shift | RB / RT |
| Heal (hold) | V / I | B |
| Rest at a lantern | Up | Up |
| Pause | Esc / P | Start |
| Mute | M | |

Heal is on **V / I**, not A: A is "left" in WASD, so it can't also be heal.

## What's in the slice

Eight connected rooms, roughly 5 to 10 minutes of play:

**Gloam Gate → Rootway → The Long Throat** (a vertical shaft climbed with wall jumps) **→ Thornfield** (a pogo gauntlet) **→ Shrine of Gales** (the dash) **→ back up to Lantern Rest → The Sundered Floor** (the dash gate) **→ The Well Floor** (boss).

- **Movement:** acceleration and deceleration, instant ground turnaround, variable jump height, coyote time (100 ms), jump buffering (100 ms), capped fall speed, wall cling, slide and wall jump, and an unlockable dash that refreshes on landing, clinging or bouncing.
- **Combat:** side, up and down strikes. A down strike in the air pogos off enemies and thorns. Every hit has hitstop, screen shake, sparks and knockback on both sides. Hits fill an essence meter. Hold heal to spend 33 essence on one mask (a slow channel that breaks if you're hit or let go).
- **Damage:** 5 masks, 1.3 s of invulnerability with flicker, knockback. Thorns and black water always hurt and return you to the last safe ground.
- **Enemies:** *Skitter* patrols and turns at ledges. *Duskmoth* hovers, winds up, then charges. *Ironshell* has a shield that blocks strikes from the front; hit it from behind (it is slow to turn) or from above.
- **Boss, Warden of the Well:** leap slam with shockwaves, a charge that staggers it against walls, and an orb burst. At half health it enrages, speeds up, and adds falling debris telegraphed by shadows. Gates seal the arena for the fight.
- **Death:** your shards stay behind as an *echo* where you last stood safely. You wake at the last lantern. Reach the echo to take them back.
- **Saving:** lantern, dash, boss defeat, shards and echo are saved to `localStorage`. If storage is blocked (private browsing), the game still runs; it just doesn't persist.

## Architecture

```
src/
  core/       fixed-timestep loop, input (keyboard + gamepad, press latching),
              camera, seeded RNG, WebAudio synth, tuning constants
  physics/    tile map and swept AABB collision with sub-stepping
  entities/   player state machine, enemies, boss, projectiles, pickups
  world/      room data (ASCII), room parser, World (rules and combat), save, particles
  render/     chunk-cached terrain, parallax background, procedural sprites
  ui/         HUD, title / pause / controls screens
  game.ts     scene flow (title, play, pause)
  main.ts     browser bootstrap
```

- **The simulation has no DOM dependency.** `World` runs headless, which is what lets the tests drive real gameplay with scripted input.
- **Fixed 60 Hz simulation, decoupled from rendering.** Rendering interpolates positions, so it stays smooth on 120 Hz ProMotion displays.
- **Input presses are latched between steps,** so a tap shorter than one frame is never lost. Presses during hitstop are buffered, not dropped.
- **Collision moves X then Y in sub-steps of at most 8 px,** so nothing tunnels, at any speed.
- **Every feel-related number lives in `src/core/tuning.ts`.**
- **Rooms are ASCII grids in `src/world/rooms.ts`.** Border digits are doors, and a door connects to the door with the same digit in the linked room.

## Testing

`npm test` runs the Vitest suite:

- **Collision:** landing flush, walls, ceilings, and no tunnelling through a one-tile wall at any speed (including a real dash).
- **Movement windows:** coyote time accepts a late jump and rejects one that is too late. The jump buffer remembers an early press and forgets one that is too early. Tap vs hold jump height.
- **Combat:** pogo off thorns and off an enemy, damage plus invulnerability, hazard respawn, heal success and heal cancellation, wall cling and wall jump.
- **Save:** round-trip, corrupt or missing data, storage that throws, booting a world from a save.
- **Death:** shards become an echo, you wake at the lantern, touching the echo returns them.
- **Level design proofs, by bot:**
  - Every door in every room is walked through, and the player arrives standing, unhurt, inside the right room.
  - A bot tries every takeoff timing at the dash gate. Without the dash none succeed; with it, many do.
  - A bot pogo-chains across Thornfield without the dash.
  - A bot wall-jumps up the shaft's chimney.
  - The full boss fight runs to completion on three seeds, with every attack seen, phase two at half health, no state lasting long enough to look stuck, the gates reopening, and the victory saved.

`npm run e2e` starts the dev server, opens Chromium with Playwright, and plays: starts a new game, walks and fights through the first room into the second **using real key presses**, rests at the lantern, takes the dash relic, jumps and dashes across the chasm, and fights the boss into phase two. It saves screenshots to `screenshots/` and fails on any console error or failed check. It needs Playwright, which is deliberately not a dependency (it downloads a browser):

```sh
npm i -D playwright && npx playwright install chromium
npm run e2e
```

URL flags: `?debug` shows FPS and exposes `window.__gloam` (warp between rooms, unlock dash), which the e2e script uses. `?hitboxes` draws collision boxes.

## Known limitations

Being straight about what this is and isn't:

- **It's a slice, not a game.** Eight rooms, three enemy types, one boss, one ability. No map, charms, NPCs, shops or music score.
- **The art is programmer art.** It's moody and readable, but procedural vector shapes are nowhere near hand-drawn quality. This is the biggest gap between this and the game it's inspired by.
- **The feel numbers were tuned by reasoning and bots, not by people.** Bots can prove the windows exist and that each room is beatable. They can't tell you whether the jump feels floaty. This needs human playtesting, and `src/core/tuning.ts` is where to adjust.
- **The boss fight is only proven completable with a god-mode bot.** It hasn't been balanced against a real player. It may be too easy or too hard.
- **Gamepad support follows the W3C Standard Gamepad layout but was never tested on a physical controller.**
- **Verified only in headless Chromium.** Safari should work (it needs Safari 16+ for `roundRect`) but wasn't run.
- **It's a web page, not a Mac `.app`.** To ship it as a native app, wrap `dist/` with Tauri or Electron.
- **Rooms respawn their enemies every time you enter,** so shards can be farmed.
- **No key rebinding, volume slider or fullscreen toggle** (use the browser's fullscreen). On 16:10 screens the view is letterboxed.
- **The synthesized sound effects are functional rather than characterful.**
