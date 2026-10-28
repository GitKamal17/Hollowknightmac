import { describe, expect, it } from 'vitest';
import { makeInput, type Action } from '../src/core/input';
import { TILE } from '../src/core/tuning';
import type { Attack } from '../src/entities/player';
import { Shard } from '../src/entities/pickups';
import { Game, type AudioLike } from '../src/game';
import { loadPlaytest, Playtest, PLAYTEST_KEY, playtestJSON } from '../src/world/playtest';
import { memoryStorage, newSave } from '../src/world/save';
import { World } from '../src/world/world';

const silent: AudioLike = { play: () => {}, startAmbient: () => {}, toggleMute: () => false, muted: false };
const lantern = { room: 'lantern', x: 29 * TILE + 16, y: 14 * TILE };

function frames(g: Game, n: number, held: Action[] = []): void {
  for (let i = 0; i < n; i++) g.update(makeInput(held));
}
const press = (g: Game, a: Action): void => g.update(makeInput([], [a]));

function dieTo(w: World, source: string): void {
  while (w.player.state !== 'dead') {
    w.player.invuln = 0;
    w.damagePlayer(w.player.cx + 10, source);
    w.update(makeInput());
  }
}

describe('playtest log', () => {
  it('counts time, damage by source, deaths, heals and shards per room and per boss', () => {
    const kv = memoryStorage();
    const pt = new Playtest(kv);
    const w = new World({ save: { ...newSave(), shards: 100, bench: lantern }, store: kv, playtest: pt });
    const p = w.player;

    // Lantern Rest: buy a Mask Shard, take a hit, heal it back.
    for (let i = 0; i < 20; i++) w.update(makeInput());
    w.update(makeInput([], ['up']));
    for (let i = 0; i < 15; i++) w.update(makeInput());
    w.update(makeInput([], ['jump']));
    w.update(makeInput([], ['attack']));
    expect(w.shop).toBeNull();
    w.damagePlayer(p.cx + 10, 'contact:skitter');
    for (let i = 0; i < 60; i++) w.update(makeInput());
    p.soul = 99;
    for (let i = 0; i < 120 && p.hp < p.maxHp; i++) w.update(makeInput(['heal']));
    expect(p.hp).toBe(p.maxHp);
    const rest = pt.log.rooms.lantern;
    expect(rest.shardsSpent).toBe(60);
    expect(rest.damage).toBe(1);
    expect(rest.damageBy).toEqual({ 'contact:skitter': 1 });
    expect(rest.heals).toBe(1);
    expect(rest.time).toBeGreaterThan(2);

    // The Warden, first try: die to her.
    w.warp('arena', '7');
    for (let i = 0; i < 180 && !w.bossActive; i++) w.update(makeInput(['right']));
    expect(w.bossActive).toBe(true);
    for (let i = 0; i < 60; i++) w.update(makeInput());
    dieTo(w, 'projectile:orb');
    for (let i = 0; i < 60 * 5 && w.room.def.id !== 'lantern'; i++) w.update(makeInput());
    expect(w.room.def.id).toBe('lantern');
    const warden = pt.log.bosses.warden;
    expect(warden.attempts).toBe(1);
    expect(warden.deaths).toBe(1);
    expect(warden.killedBy).toEqual({ 'projectile:orb': 1 });
    expect(warden.damage).toBe(p.maxHp);
    expect(pt.log.rooms.arena.deaths).toBe(1);
    const firstFight = warden.time;
    expect(firstFight).toBeGreaterThan(1);

    // Second try: win, and pick up her drop.
    w.warp('arena', '7');
    for (let i = 0; i < 180 && !w.bossActive; i++) w.update(makeInput(['right']));
    for (let i = 0; i < 150; i++) w.update(makeInput());
    const b = w.boss!;
    const drop = b.shards;
    b.hp = 1;
    p.invuln = 10;
    const atk: Attack = { dir: 'up', facing: 1, t: 0, active: true, hit: new Set(), pogoed: false, swing: 0 };
    expect(b.strike(w, atk)).toBe('hit');
    for (let i = 0; i < 60 * 4; i++) {
      p.invuln = 10;
      for (const s of w.pickups) {
        if (!(s instanceof Shard)) continue;
        s.x = p.x;
        s.y = p.y;
      }
      w.update(makeInput());
    }
    expect(w.save.bossDefeated).toBe(true);
    expect(warden.attempts).toBe(2);
    expect(warden.wins).toBe(1);
    expect(warden.shardsEarned).toBe(drop);
    expect(warden.time).toBeGreaterThan(firstFight);
    expect(pt.log.rooms.arena.shardsEarned).toBe(drop);
    // Time after the fight counts for the room, not the boss.
    const after = warden.time;
    for (let i = 0; i < 30; i++) w.update(makeInput());
    expect(warden.time).toBe(after);
  });

  it('survives a save and load', () => {
    const kv = memoryStorage();
    const g1 = new Game(kv, silent, { telemetry: true });
    g1.start(true);
    frames(g1, 120, ['right']);
    g1.world!.damagePlayer(g1.world!.player.cx + 10, 'contact:skitter');
    frames(g1, 30);
    press(g1, 'pause');
    press(g1, 'down');
    press(g1, 'down');
    press(g1, 'confirm'); // Quit to Title
    expect(g1.scene).toBe('title');
    const before = JSON.parse(playtestJSON(g1.playtest!.log));
    expect(before.rooms.gate.time).toBeGreaterThan(2);
    expect(before.rooms.gate.damageBy).toEqual({ 'contact:skitter': 1 });

    // A new page load reads it back, and Continue keeps adding to it.
    expect(loadPlaytest(kv)).toEqual(before);
    const g2 = new Game(kv, silent, { telemetry: true });
    expect(g2.playtest!.log).toEqual(before);
    g2.start(false);
    frames(g2, 60);
    expect(g2.playtest!.log.rooms.gate.time).toBeCloseTo(before.rooms.gate.time + 1, 1);
    expect(g2.playtest!.log.rooms.gate.damage).toBe(1);
  });

  it('exports from the pause menu as JSON', () => {
    const kv = memoryStorage();
    const files: [string, string][] = [];
    const g = new Game(kv, silent, { telemetry: true, download: (name, text) => files.push([name, text]) });
    g.start(true);
    frames(g, 60);
    press(g, 'pause');
    expect(g.pauseItems).toEqual(['Resume', 'Export playtest', 'Quit to Title']);
    press(g, 'down');
    press(g, 'confirm');
    expect(g.scene).toBe('pause');
    expect(files).toHaveLength(1);
    const [name, text] = files[0];
    expect(name).toMatch(/^gloamwell-playtest-\d{8}-\d{4}\.json$/);
    expect(JSON.parse(text).rooms.gate.time).toBeCloseTo(1, 1);
    expect(g.pauseNote).toContain(name);
  });

  it('records nothing without ?telemetry', () => {
    const kv = memoryStorage();
    const g = new Game(kv, silent);
    expect(g.playtest).toBeNull();
    expect(g.pauseItems).toEqual(['Resume', 'Quit to Title']);
    g.start(true);
    frames(g, 60);
    g.world!.damagePlayer(g.world!.player.cx + 10, 'contact:skitter');
    g.world!.persist();
    expect(kv.data.has(PLAYTEST_KEY)).toBe(false);
  });

  it('starts fresh from corrupt data and drops bad values', () => {
    const kv = memoryStorage();
    kv.setItem(PLAYTEST_KEY, '{not json');
    expect(new Playtest(kv).log.rooms).toEqual({});
    kv.setItem(PLAYTEST_KEY, JSON.stringify({ v: 1, rooms: { gate: { time: -4, deaths: 'two', damageBy: { 'contact:skitter': 3, bad: null } } } }));
    const gate = new Playtest(kv).log.rooms.gate;
    expect(gate.time).toBe(0);
    expect(gate.deaths).toBe(0);
    expect(gate.damageBy).toEqual({ 'contact:skitter': 3 });
  });
});
