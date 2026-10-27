import { Camera } from '../core/camera';
import type { InputState } from '../core/input';
import { approach, overlap, type Rect } from '../core/math';
import { Rng } from '../core/rng';
import { DT, HITSTOP, PLAYER, TILE } from '../core/tuning';
import type { Enemy } from '../entities/enemy';
import { Duskmoth } from '../entities/duskmoth';
import { Ironshell } from '../entities/ironshell';
import { Echo, Hoard, Lantern, Merchant, Relic, Shard, Tablet, type Pickup } from '../entities/pickups';
import { Player, type PlayerEvent, type PlayerHost } from '../entities/player';
import type { Projectile } from '../entities/projectile';
import { Skitter } from '../entities/skitter';
import { Spitter } from '../entities/spitter';
import { Vesper } from '../entities/vesper';
import { Warden } from '../entities/warden';
import type { Hazard, TileMap } from '../physics/tilemap';
import { Particles } from './particles';
import { findDoor, parseRoom, type Room, type RoomDef, type Side } from './room';
import { ROOMS, START_ROOM } from './rooms';
import { newSave, writeSave, type KV, type SaveData } from './save';
import { buy, SHOP, statsFor } from './shop';

export type SfxFn = (name: string) => void;

export interface WorldOptions {
  rooms?: Record<string, RoomDef>;
  save?: SaveData;
  store?: KV | null;
  sfx?: SfxFn;
  seed?: number;
  /** Room to start in when the save has no lantern. */
  startRoom?: string;
}

interface Transition {
  phase: 'out' | 'in';
  t: number;
  out: number;
  in: number;
  action: () => void;
}

export interface Modal {
  title: string;
  body: string;
  t: number;
}

export interface Banner {
  kind: 'area' | 'boss';
  title: string;
  sub: string;
  t: number;
  dur: number;
}

const expand = (r: Rect, n: number): Rect => ({ x: r.x - n, y: r.y - n, w: r.w + n * 2, h: r.h + n * 2 });

/** The whole simulation. Has no DOM dependencies, so it runs headless in tests. */
export class World implements PlayerHost {
  readonly rooms: Record<string, RoomDef>;
  private parsed = new Map<string, Room>();
  room!: Room;
  readonly player = new Player();
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  readonly particles = new Particles();
  readonly camera = new Camera();
  readonly rng: Rng;
  save: SaveData;
  private store: KV | null;
  private sfxOut: SfxFn;

  hitstop = 0;
  time = 0;
  fade = 0;
  flash = 0;
  transition: Transition | null = null;
  modal: Modal | null = null;
  banner: Banner | null = null;
  private pendingModal: { delay: number; title: string; body: string } | null = null;
  boss: Warden | Vesper | null = null;
  bossActive = false;
  gateAnim = 0;
  nearLantern: Lantern | null = null;
  nearMerchant: Merchant | null = null;
  /** Open merchant panel. */
  shop: { sel: number; t: number; msg: string; msgT: number } | null = null;
  nearTablet: Tablet | null = null;
  private visited = new Set<string>();
  private deathSpot: { room: string; x: number; y: number } | null = null;
  private shardSfxCd = 0;
  private readonly soulTarget: { x: number; y: number };

  constructor(opts: WorldOptions = {}) {
    this.rooms = opts.rooms ?? ROOMS;
    this.save = opts.save ?? newSave();
    this.store = opts.store ?? null;
    this.sfxOut = opts.sfx ?? (() => {});
    this.rng = new Rng(opts.seed ?? 12345);
    const p = this.player;
    this.soulTarget = {
      get x() {
        return p.cx;
      },
      get y() {
        return p.cy;
      },
    };
    this.spawnAtBench(opts.startRoom);
  }

  get map(): TileMap {
    return this.room.map;
  }

  sfx(name: string): void {
    this.sfxOut(name);
  }

  persist(): void {
    writeSave(this.store, this.save);
  }

  // ---- rooms ----------------------------------------------------------------

  loadRoom(id: string): void {
    const def = this.rooms[id];
    if (!def) throw new Error(`unknown room '${id}'`);
    let room = this.parsed.get(id);
    if (!room) {
      room = parseRoom(def);
      this.parsed.set(id, room);
    }
    this.room = room;
    room.map.gatesClosed = false;
    room.map.sealOpen = this.save.bossDefeated;
    this.gateAnim = 0;
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.particles.clear();
    this.boss = null;
    this.bossActive = false;

    for (const s of room.spawns) {
      switch (s.kind) {
        case 'c':
          this.enemies.push(new Skitter(s.x, s.y));
          break;
        case 'f':
          this.enemies.push(new Duskmoth(s.x, s.y - TILE / 2));
          break;
        case 's':
          this.enemies.push(new Ironshell(s.x, s.y));
          break;
        case 'p':
          this.enemies.push(new Spitter(s.x, s.y));
          break;
        case 'V':
          if (!this.save.duelDefeated) {
            this.boss = new Vesper(s.x, s.y);
            this.enemies.push(this.boss);
          }
          break;
        case 'W':
          if (!this.save.wings) this.pickups.push(new Relic(s.x, s.y, 'wings'));
          break;
        case 'M':
          this.pickups.push(new Merchant(s.x, s.y));
          break;
        case 'Q':
          if (!this.save.cache) this.pickups.push(new Hoard(s.x, s.y));
          break;
        case 'B':
          if (!this.save.bossDefeated) {
            this.boss = new Warden(s.x, s.y);
            this.enemies.push(this.boss);
          }
          break;
        case 'L':
          this.pickups.push(new Lantern(s.x, s.y));
          break;
        case 'D':
          if (!this.save.dash) this.pickups.push(new Relic(s.x, s.y));
          break;
        case 'T':
          this.pickups.push(new Tablet(s.x, s.y, s.text ?? ''));
          break;
      }
    }
    const echo = this.save.echo;
    if (echo && echo.room === id) this.pickups.push(new Echo(echo.x, echo.y, echo.amount));

    if (!this.visited.has(id)) {
      this.visited.add(id);
      this.banner = { kind: 'area', title: def.name, sub: '', t: 0, dur: 2.6 };
    }
  }

  private spawnAtBench(startRoom?: string): void {
    const b = this.save.bench;
    const p = this.player;
    this.applyStats();
    if (b && this.rooms[b.room]) {
      this.loadRoom(b.room);
      p.respawn(b.x, b.y);
    } else {
      const id = startRoom ?? (this.rooms[START_ROOM] ? START_ROOM : Object.keys(this.rooms)[0]);
      this.loadRoom(id);
      const s = this.room.spawns.find((sp) => sp.kind === 'P');
      p.respawn(s ? s.x : this.map.pw / 2, s ? s.y : this.map.ph / 2);
    }
    p.dashUnlocked = this.save.dash;
    this.camera.snap(p, this.map);
  }

  /** Abilities and purchased upgrades -> player stats. */
  applyStats(): void {
    const p = this.player;
    const st = statsFor(this.save);
    p.maxHp = st.maxHp;
    p.hp = Math.min(p.hp, p.maxHp);
    p.damage = st.damage;
    p.healTime = st.healTime;
    p.soulPerHit = st.soulPerHit;
    p.dashUnlocked = this.save.dash;
    p.wingsUnlocked = this.save.wings;
  }

  /** Arrive in `roomId` through the door with `doorId`. */
  enterRoom(roomId: string, doorId: string, vx = 0, vy = 0): void {
    this.loadRoom(roomId);
    const p = this.player;
    const m = this.map;
    const d = this.room.doors.find((x) => x.id === doorId);
    p.attack = null;
    p.state = 'normal';
    if (!d) {
      const s = this.room.spawns.find((sp) => sp.kind === 'P');
      p.placeAt(s ? s.x : m.pw / 2, s ? s.y : m.ph / 2);
    } else {
      const centre = ((d.from + d.to + 1) / 2) * TILE;
      const run = Math.max(Math.abs(vx), PLAYER.run);
      switch (d.side) {
        case 'left':
          p.x = 4;
          p.y = (d.to + 1) * TILE - p.h;
          p.vx = run;
          p.vy = 0;
          p.facing = 1;
          p.inputLock = 0.12;
          break;
        case 'right':
          p.x = m.pw - p.w - 4;
          p.y = (d.to + 1) * TILE - p.h;
          p.vx = -run;
          p.vy = 0;
          p.facing = -1;
          p.inputLock = 0.12;
          break;
        case 'bottom':
          // Came up through a hole: pop up and drift onto the ledge beside it.
          p.x = centre - p.w / 2;
          p.y = m.ph - p.h - 2;
          p.vy = -PLAYER.doorPopVel;
          p.vx = d.land * 240;
          p.facing = d.land;
          p.inputLock = 0.35;
          break;
        case 'top':
          p.x = centre - p.w / 2;
          p.y = 2;
          p.vx = 0;
          p.vy = Math.max(vy, 60);
          break;
      }
      p.savePrev();
    }
    p.jumping = false;
    p.lastSafe = { x: p.x, y: p.y };
    this.camera.snap(p, m);
    this.persist();
  }

  /** Debug / test helper: jump straight to a room. */
  warp(roomId: string, doorId?: string): void {
    const room = this.parsed.get(roomId) ?? parseRoom(this.rooms[roomId]);
    this.enterRoom(roomId, doorId ?? room.doors[0]?.id ?? '', 0, 0);
    this.transition = null;
    this.fade = 0;
  }

  // ---- main step --------------------------------------------------------------

  update(inp: InputState): void {
    const p = this.player;
    p.noteInput(inp);

    if (this.shop) {
      this.updateShop(inp);
      this.particles.update(DT);
      return;
    }
    if (this.modal) {
      this.modal.t += DT;
      if (this.modal.t > 0.6 && (inp.pressed.confirm || inp.pressed.jump || inp.pressed.attack)) {
        this.modal = null;
        if (p.state === 'frozen') p.state = 'normal';
        p.clearBuffers();
        this.sfx('confirm');
      }
      this.particles.update(DT);
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }

    this.time += DT;
    this.flash = Math.max(0, this.flash - DT * 2.5);
    this.shardSfxCd = Math.max(0, this.shardSfxCd - DT);
    if (this.banner) {
      this.banner.t += DT;
      if (this.banner.t >= this.banner.dur) this.banner = null;
    }
    if (this.pendingModal) {
      this.pendingModal.delay -= DT;
      if (this.pendingModal.delay <= 0) {
        this.modal = { title: this.pendingModal.title, body: this.pendingModal.body, t: 0 };
        this.pendingModal = null;
      }
    }
    if (this.transition && this.stepTransition()) {
      this.particles.update(DT);
      return;
    }

    this.applyStats();
    p.update(this, inp);
    for (const e of this.enemies) if (!e.dead) e.update(this);
    for (const pr of this.projectiles) if (!pr.dead) pr.update(this);
    for (const pk of this.pickups) pk.update(this);

    this.resolveStrikes();
    this.resolveDamage();
    this.resolvePickups();
    this.resolveInteractables(inp);
    this.checkBossTrigger();
    this.checkDoors();
    this.checkDeath();

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((x) => !x.dead);
    this.pickups = this.pickups.filter((x) => !x.dead);
    this.gateAnim = approach(this.gateAnim, this.map.gatesClosed ? 1 : 0, DT * 4);
    this.camera.update(p, this.map, DT);
    this.particles.update(DT);
  }

  /** Returns true while the world should stay frozen (fading out). */
  private stepTransition(): boolean {
    const tr = this.transition;
    if (!tr) return false;
    tr.t += DT;
    if (tr.phase === 'out') {
      this.fade = Math.min(1, tr.t / tr.out);
      if (tr.t >= tr.out) {
        tr.action();
        tr.phase = 'in';
        tr.t = 0;
        this.fade = 1;
      }
      return true;
    }
    this.fade = Math.max(0, 1 - tr.t / tr.in);
    if (tr.t >= tr.in) {
      this.transition = null;
      this.fade = 0;
    }
    return false;
  }

  startTransition(action: () => void, out = 0.2, inn = 0.25): void {
    if (this.transition) return;
    this.transition = { phase: 'out', t: 0, out, in: inn, action };
  }

  // ---- combat -----------------------------------------------------------------

  private resolveStrikes(): void {
    const p = this.player;
    const atk = p.attack;
    const box = p.attackBox();
    if (!atk || !box) return;

    for (const e of this.enemies) {
      if (e.dead || atk.hit.has(e)) continue;
      const hb = e.hurtbox();
      if (!overlap(box, hb)) continue;
      atk.hit.add(e);
      const r = e.strike(this, atk);
      if (r === 'none') continue;
      const hx = (Math.max(box.x, hb.x) + Math.min(box.x + box.w, hb.x + hb.w)) / 2;
      const hy = (Math.max(box.y, hb.y) + Math.min(box.y + box.h, hb.y + hb.h)) / 2;
      if (r === 'hit') {
        p.gainSoul();
        const isBoss = e.kind === 'warden' || e.kind === 'vesper';
        this.hitstop = Math.max(this.hitstop, isBoss ? HITSTOP.boss : HITSTOP.enemy);
        this.camera.addTrauma(isBoss ? 0.14 : 0.22);
        this.particles.sparks(hx, hy, 10, '#ffffff', atk.dir === 'side' ? atk.facing : 0);
        this.particles.soul(hx, hy, this.soulTarget, 3);
        this.sfx(isBoss ? 'hitBoss' : 'hit');
        if (atk.dir === 'down') {
          if (!atk.pogoed) p.pogo();
        } else if (atk.dir === 'side') p.recoilFrom(atk.facing);
      } else {
        this.hitstop = Math.max(this.hitstop, HITSTOP.block);
        this.particles.sparks(hx, hy, 9, '#ffd27a', -atk.facing);
        this.sfx('block');
        this.camera.addTrauma(0.1);
        p.recoilFrom(atk.facing, PLAYER.blockRecoilVel);
      }
    }

    if (atk.dir === 'down' && !atk.pogoed && this.map.spikeIn(box.x, box.y, box.w, box.h)) {
      p.pogo();
      this.hitstop = Math.max(this.hitstop, 2);
      this.sfx('pogo');
      this.particles.sparks(p.cx, box.y + box.h - 18, 7, '#cfd8ff');
    }
  }

  private resolveDamage(): void {
    const p = this.player;
    if (!p.alive || p.state === 'hazard') return;
    const hb = p.hurtbox();
    const hz = this.map.hazardIn(hb.x, hb.y, hb.w, hb.h);
    if (hz) {
      this.hazardHit(hz);
      return;
    }
    if (p.invuln > 0) return;
    for (const e of this.enemies) {
      const cb = e.contactBox();
      if (!e.dead && cb && overlap(hb, cb)) {
        this.damagePlayer(e.cx);
        return;
      }
    }
    for (const pr of this.projectiles) {
      if (pr.harmful && overlap(hb, pr)) {
        this.damagePlayer(pr.cx);
        if (pr.kind === 'orb') pr.pop(this);
        return;
      }
    }
  }

  damagePlayer(fromX: number, ignoreInvuln = false): boolean {
    const p = this.player;
    if (!p.takeHit(fromX, ignoreInvuln)) return false;
    this.hitstop = Math.max(this.hitstop, HITSTOP.hurt);
    this.camera.addTrauma(0.5);
    this.flash = 0.7;
    this.sfx('hurt');
    this.particles.burst(p.cx, p.cy, 12, '#e8eef6', 320, 3);
    if (p.state === 'dead') {
      this.deathSpot = { room: this.room.def.id, x: p.lastSafe.x, y: p.lastSafe.y };
      this.sfx('death');
      this.camera.addTrauma(0.5);
    }
    return true;
  }

  private hazardHit(kind: Hazard): void {
    const p = this.player;
    this.sfx(kind === 'liquid' ? 'splash' : 'spike');
    this.particles.burst(p.cx, p.y + p.h, 10, kind === 'liquid' ? '#3e6f7a' : '#d9dcef', 260, 3);
    if (!this.damagePlayer(p.cx, true) || p.state === 'dead') return;
    p.state = 'hazard';
    p.vx = p.vy = 0;
    this.startTransition(
      () => {
        p.x = p.lastSafe.x;
        p.y = p.lastSafe.y;
        p.vx = p.vy = 0;
        p.savePrev();
        p.state = 'normal';
        p.clearBuffers();
        this.camera.snap(p, this.map);
      },
      0.35,
      0.3,
    );
  }

  private checkDeath(): void {
    const p = this.player;
    if (p.state === 'dead' && p.stateTimer <= 0 && !this.transition) {
      this.startTransition(() => this.respawnAfterDeath(), 0.8, 0.7);
    }
  }

  private respawnAfterDeath(): void {
    const spot = this.deathSpot;
    if (spot && this.save.shards > 0) this.save.echo = { ...spot, amount: this.save.shards };
    this.save.shards = 0;
    this.deathSpot = null;
    this.persist();
    this.spawnAtBench();
  }

  onEnemyKilled(e: Enemy): void {
    this.spawnShards(e.cx, e.cy, e.shards);
    this.particles.burst(e.cx, e.cy, 18, '#ff9a4a', 280, 3);
    this.particles.debris(e.cx, e.cy, 5);
    this.camera.addTrauma(0.2);
    this.sfx('enemyDie');
  }

  onBossDefeated(b: Warden | Vesper): void {
    this.bossActive = false;
    this.map.gatesClosed = false;
    this.boss = null;
    this.spawnShards(b.cx, b.cy, b.shards);
    this.particles.burst(b.cx, b.cy, 70, b instanceof Warden ? '#ffb27a' : '#c9a6ff', 460, 4);
    this.camera.addTrauma(0.9);
    this.flash = 1;
    this.sfx('bossBreak');
    if (b instanceof Warden) {
      this.save.bossDefeated = true;
      this.map.sealOpen = true;
      this.pendingModal = {
        delay: 2.4,
        title: 'The Warden Falls',
        body: 'The well grows quiet, and the seal to the east crumbles.\nBeyond it lies the Lowmarket, where shards buy strength.',
      };
    } else {
      this.save.duelDefeated = true;
      this.pendingModal = {
        delay: 2.6,
        title: 'Vesper Yields',
        body: '"At last, a worthy blade." She lowers hers.\nYou have reached the end of Gloamwell. Thank you for playing.\nYour progress is saved; explore as you like.',
      };
    }
    this.persist();
  }

  private spawnShards(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.pickups.push(new Shard(x, y, (Math.random() - 0.5) * 360, -200 - Math.random() * 380));
    }
  }

  // ---- pickups and interactables ---------------------------------------------

  private resolvePickups(): void {
    const p = this.player;
    if (!p.alive || p.state === 'hazard') return;
    const hb = expand(p.box(), 4);
    for (const pk of this.pickups) {
      if (pk.dead || !overlap(hb, pk)) continue;
      if (pk instanceof Shard && pk.collectible) {
        pk.dead = true;
        this.save.shards++;
        this.particles.burst(pk.cx, pk.cy, 3, '#8fd3ff', 120, 2);
        if (this.shardSfxCd <= 0) {
          this.sfx('shard');
          this.shardSfxCd = 0.05;
        }
      } else if (pk instanceof Hoard) {
        pk.dead = true;
        this.save.cache = true;
        this.spawnShards(pk.cx, pk.y, pk.amount);
        this.particles.burst(pk.cx, pk.cy, 40, '#8fd3ff', 360, 3);
        this.camera.addTrauma(0.3);
        this.sfx('hoard');
        this.persist();
      } else if (pk instanceof Relic) {
        pk.dead = true;
        if (pk.ability === 'wings') this.save.wings = true;
        else this.save.dash = true;
        this.applyStats();
        p.state = 'frozen';
        p.vx = p.vy = 0;
        this.persist();
        this.flash = 1;
        this.camera.addTrauma(0.3);
        this.particles.burst(pk.cx, pk.cy, 50, '#bfe9ff', 380, 4);
        this.sfx('relic');
        this.modal =
          pk.ability === 'wings'
            ? {
                title: 'Twin Feather',
                body: 'You can now jump again in mid-air.\nPress jump while airborne.\nThe extra jump returns when you land, cling to a wall, or bounce.',
                t: 0,
              }
            : {
                title: 'Gale Sigil',
                body: 'You can now DASH.\nC, L or Shift on a keyboard. RB or RT on a gamepad.\nThe dash refreshes when you land, cling to a wall, or bounce.',
                t: 0,
              };
      } else if (pk instanceof Echo) {
        pk.dead = true;
        this.save.shards += pk.amount;
        this.save.echo = null;
        this.persist();
        this.particles.burst(pk.cx, pk.cy, 30, '#b59cff', 300, 3);
        this.particles.soul(pk.cx, pk.cy, this.soulTarget, 6);
        this.sfx('echo');
      }
    }
  }

  private resolveInteractables(inp: InputState): void {
    const p = this.player;
    const box = p.box();
    this.nearLantern = null;
    this.nearTablet = null;
    this.nearMerchant = null;
    for (const pk of this.pickups) {
      if (pk instanceof Lantern && overlap(expand(pk, 12), box)) this.nearLantern = pk;
      if (pk instanceof Merchant && overlap(expand(pk, 16), box)) this.nearMerchant = pk;
      if (pk instanceof Tablet && overlap(expand(pk, 28), box)) this.nearTablet = pk;
    }
    const l = this.nearLantern;
    if (l && p.state === 'normal' && p.grounded && inp.pressed.up && !inp.pressed.attack) this.rest(l);
    else if (this.nearMerchant && p.state === 'normal' && p.grounded && inp.pressed.up && !inp.pressed.attack) {
      p.vx = 0;
      p.attack = null;
      this.shop = { sel: 0, t: 0, msg: '', msgT: 0 };
      this.sfx('shopOpen');
    }
  }

  private updateShop(inp: InputState): void {
    const shop = this.shop!;
    shop.t += DT;
    shop.msgT = Math.max(0, shop.msgT - DT);
    const n = SHOP.length;
    if (inp.pressed.up) shop.sel = (shop.sel + n - 1) % n;
    if (inp.pressed.down) shop.sel = (shop.sel + 1) % n;
    if (inp.pressed.up || inp.pressed.down) this.sfx('menu');
    if (inp.pressed.attack || inp.pressed.pause || inp.pressed.heal) {
      this.shop = null;
      this.player.clearBuffers();
      this.sfx('pause');
      return;
    }
    if (shop.t > 0.15 && (inp.pressed.jump || inp.pressed.confirm)) {
      const item = SHOP[shop.sel];
      const r = buy(this.save, item);
      if (r === 'bought') {
        this.applyStats();
        if (item.id === 'mask') this.player.hp = this.player.maxHp;
        this.persist();
        shop.msg = `${item.name} acquired.`;
        this.sfx('buy');
        this.particles.burst(this.player.cx, this.player.cy, 20, '#ffd38a', 220, 3);
      } else {
        shop.msg = r === 'poor' ? 'Not enough shards.' : 'Sold out.';
        this.sfx('denied');
      }
      shop.msgT = 1.6;
    }
  }

  private rest(l: Lantern): void {
    const p = this.player;
    p.state = 'rest';
    p.vx = 0;
    p.hp = p.maxHp;
    p.x = l.cx - p.w / 2;
    p.attack = null;
    this.save.bench = { room: this.room.def.id, x: l.cx, y: l.y + l.h };
    this.persist();
    this.sfx('rest');
    this.particles.burst(l.cx, l.y + 18, 24, '#ffcf7a', 200, 3);
  }

  private checkBossTrigger(): void {
    const b = this.boss;
    const trig = this.room.def.bossTriggerX;
    if (!b || this.bossActive || trig === undefined || b.state !== 'dormant') return;
    if (this.player.alive && this.player.cx > trig * TILE) {
      this.bossActive = true;
      this.map.gatesClosed = true;
      b.wake();
      this.sfx('gate');
      this.banner = { kind: 'boss', title: b.title, sub: b.sub, t: 0, dur: 3.4 };
    }
  }

  private checkDoors(): void {
    if (this.transition) return;
    const p = this.player;
    if (!p.alive || p.state === 'hazard') return;
    const m = this.map;
    let side: Side | null = null;
    if (p.cx < 0) side = 'left';
    else if (p.cx > m.pw) side = 'right';
    else if (p.cy < 0) side = 'top';
    else if (p.y > m.ph) side = 'bottom';
    if (!side) return;
    const along = side === 'left' || side === 'right' ? p.cy : p.cx;
    const door = findDoor(this.room, side, along);
    if (!door) {
      if (side === 'bottom') this.hazardHit('liquid');
      return;
    }
    const { vx, vy } = p;
    this.startTransition(() => this.enterRoom(door.target, door.id, vx, vy), 0.18, 0.25);
  }

  onPlayerEvent(kind: PlayerEvent, strength = 0): void {
    const p = this.player;
    const feet = p.y + p.h;
    switch (kind) {
      case 'jump':
        this.particles.dust(p.cx, feet, 5, 0.7);
        break;
      case 'doublejump':
        this.particles.burst(p.cx, feet, 10, '#e8f0ff', 160, 2.5);
        this.particles.ring(p.cx, feet, '#cfe0ff');
        break;
      case 'walljump':
        this.particles.dust(strength > 0 ? p.x + p.w : p.x, p.cy, 6, 0.8);
        break;
      case 'land':
        this.particles.dust(p.cx, feet, Math.min(12, Math.round(strength / 80)), Math.min(1.6, strength / 600));
        break;
      case 'dash':
        this.particles.dust(p.cx - p.facing * 10, p.cy + 6, 8, 1.2);
        break;
      case 'healed':
        this.particles.burst(p.cx, p.cy - 8, 22, '#ffffff', 220, 3);
        this.particles.ring(p.cx, p.cy, '#ffffff');
        break;
    }
  }
}
