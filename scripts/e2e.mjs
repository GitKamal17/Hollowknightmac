// Headless playthrough: starts the dev server, plays with real key presses,
// visits every room, fights the boss, saves screenshots, and fails on any
// console error.
//
//   npm run e2e
//
// Needs Playwright with Chromium: `npm i -D playwright && npx playwright install chromium`.

import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const PORT = 5199;
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  screenshot ${name}.png`);
};
const tap = async (key, hold = 60) => {
  await page.keyboard.down(key);
  await wait(hold);
  await page.keyboard.up(key);
};
const room = () => page.evaluate(() => window.__gloam.world?.room.def.id ?? null);
const state = () =>
  page.evaluate(() => {
    const w = window.__gloam.world;
    return w ? { room: w.room.def.id, hp: w.player.hp, x: Math.round(w.player.x), shards: w.save.shards } : null;
  });
const warp = (r, d) => page.evaluate(([r, d]) => window.__gloam.warp(r, d), [r, d]);
const check = (cond, msg) => {
  if (!cond) {
    errors.push(`check failed: ${msg}`);
    console.log(`  FAIL ${msg}`);
  } else console.log(`  ok   ${msg}`);
};

let failed = false;
try {
  await page.goto(`http://localhost:${PORT}/?debug`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(900);
  await shot('01-title');

  console.log('title -> new game');
  await tap('Enter');
  await wait(1200);
  check((await room()) === 'gate', 'new game starts in the Gloam Gate');
  await shot('02-gate-start');

  console.log('playing the first room with real input');
  await page.keyboard.down('ArrowRight');
  const t0 = Date.now();
  let i = 0;
  let midShot = false;
  while (Date.now() - t0 < 32000 && (await room()) === 'gate') {
    if (i % 3 === 0) await tap('z', 180);
    else await tap('x', 40);
    await wait(90);
    if (!midShot && Date.now() - t0 > 2600) {
      await shot('03-gate-combat');
      midShot = true;
    }
    i++;
  }
  await page.keyboard.up('ArrowRight');
  const s1 = await state();
  check(s1.room === 'roots', `walked through the door into the Rootway (now ${s1.room}, hp ${s1.hp}, shards ${s1.shards})`);
  await wait(700);
  await shot('04-roots');

  console.log('Rootway: fight a little');
  await page.keyboard.down('ArrowRight');
  for (let k = 0; k < 10; k++) {
    await tap(k % 2 ? 'x' : 'z', 120);
    await wait(80);
  }
  await page.keyboard.up('ArrowRight');
  await shot('05-roots-fight');

  console.log('The Long Throat');
  await warp('shaft', '2');
  await wait(500);
  await page.keyboard.down('ArrowRight');
  await tap('z', 250);
  await wait(250);
  await page.keyboard.up('ArrowRight');
  await shot('06-shaft');

  console.log('Lantern Rest: rest at the lantern');
  await warp('lantern', '4');
  await wait(900);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__gloam.world.nearLantern !== null, null, { timeout: 6000 });
  await page.keyboard.up('ArrowRight');
  await wait(250);
  await tap('ArrowUp');
  await wait(600);
  const rested = await page.evaluate(() => window.__gloam.world.player.state === 'rest' && window.__gloam.world.save.bench?.room === 'lantern');
  check(rested, 'resting at the lantern sets the respawn point');
  await shot('07-lantern-rest');

  console.log('Thornfield');
  await warp('thorns', '3');
  await wait(400);
  await page.keyboard.down('ArrowRight');
  await wait(700);
  await tap('z', 300);
  await page.keyboard.down('ArrowDown');
  await tap('x', 60);
  await wait(120);
  await shot('08-thorns');
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('ArrowRight');

  console.log('Shrine: take the Gale Sigil');
  await warp('shrine', '5');
  await wait(300);
  await page.keyboard.down('ArrowRight');
  for (let k = 0; k < 40 && !(await page.evaluate(() => window.__gloam.world.modal !== null)); k++) {
    await tap('z', 200);
    await wait(150);
  }
  await page.keyboard.up('ArrowRight');
  await wait(900);
  check(await page.evaluate(() => window.__gloam.world.save.dash), 'picking up the relic unlocks the dash');
  await shot('09-relic');
  await tap('Enter');
  await wait(300);

  console.log('The Sundered Floor: dash across');
  await warp('gap', '6');
  await wait(400);
  await shot('10-gap');
  await page.keyboard.down('ArrowRight');
  // Take off right at the lip, dash near the top of the jump.
  await page.waitForFunction(() => window.__gloam.world.player.x > 17 * 32 - 14, null, { polling: 'raf' });
  await page.keyboard.down('z');
  await page.waitForFunction(() => { const p = window.__gloam.world.player; return !p.grounded && p.vy > -250; }, null, { polling: 'raf' });
  await tap('c', 60);
  await wait(500);
  await page.keyboard.up('z');
  await wait(600);
  await page.keyboard.up('ArrowRight');
  const gapState = await page.evaluate(() => {
    const w = window.__gloam.world;
    return { room: w.room.def.id, x: Math.round(w.player.x), state: w.player.state, modal: w.modal?.title ?? null, dash: w.player.dashUnlocked };
  });
  check(gapState.room !== 'gap' || gapState.x > 26 * 32, `jump + dash crosses the chasm in the real game (${JSON.stringify(gapState)})`);

  console.log('Boss');
  await warp('arena', '7');
  await wait(300);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__gloam.world.bossActive, null, { timeout: 5000 });
  await page.keyboard.up('ArrowRight');
  await wait(1500);
  await shot('11-boss-intro');
  check(await page.evaluate(() => window.__gloam.world.map.gatesClosed), 'gates close when the fight starts');

  // Fight: stay near the boss and strike. Pogo when it is below us.
  const fightStart = Date.now();
  let shots = 0;
  while (Date.now() - fightStart < 9000) {
    const toward = await page.evaluate(() => {
      const w = window.__gloam.world;
      if (!w.boss) return 0;
      const d = w.boss.cx - w.player.cx;
      return Math.abs(d) > 70 ? Math.sign(d) : 0;
    });
    const key = toward > 0 ? 'ArrowRight' : 'ArrowLeft';
    if (toward !== 0) await page.keyboard.down(key);
    await tap('z', 140);
    await tap('x', 40);
    if (toward !== 0) await page.keyboard.up(key);
    await wait(60);
    if ((Date.now() - fightStart > 2500 && shots === 0) || (Date.now() - fightStart > 5500 && shots === 1)) {
      await shot(`12-boss-fight-${++shots}`);
    }
  }
  const boss = await page.evaluate(() => ({ hp: window.__gloam.world.boss?.hp ?? 0, max: window.__gloam.world.boss?.maxHp ?? 0 }));
  check(boss.hp < boss.max, `the boss takes damage from strikes (hp ${boss.hp}/${boss.max})`);

  console.log('Pause menu');
  await tap('Escape');
  await wait(300);
  await shot('13-pause');
  await tap('Escape');

  console.log('Boss, phase two (debug: drop its health)');
  await page.evaluate(() => {
    const w = window.__gloam.world;
    if (w.boss && w.boss.phase === 1) w.boss.hp = w.boss.maxHp / 2 + 1;
    w.player.hp = w.player.maxHp;
  });
  await page.keyboard.down('x');
  await wait(100);
  await page.keyboard.up('x');
  for (let k = 0; k < 20; k++) {
    await tap('z', 120);
    await tap('x', 40);
  }
  await wait(1200);
  await shot('14-boss-phase2');

  // ---- The second area ----------------------------------------------------
  console.log('The way east (debug: mark the Warden defeated)');
  await page.evaluate(() => {
    const w = window.__gloam.world;
    w.save.bossDefeated = true;
    w.save.shards = 200;
    w.player.hp = w.player.maxHp;
  });
  await warp('descent', '8');
  await wait(900);
  await page.keyboard.down('ArrowRight');
  await wait(700);
  await page.keyboard.up('ArrowRight');
  await shot('15-descent');

  console.log('Lowmarket: buy from the Peddler');
  await warp('market', '9');
  await wait(400);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__gloam.world.nearMerchant !== null, null, { timeout: 6000 });
  await page.keyboard.up('ArrowRight');
  await wait(150);
  await tap('ArrowUp');
  await wait(400);
  check(await page.evaluate(() => window.__gloam.world.shop !== null), 'Up at the merchant opens the shop');
  await tap('z');
  await wait(300);
  const bought = await page.evaluate(() => ({ mask: window.__gloam.world.save.upgrades.mask, shards: window.__gloam.world.save.shards, maxHp: window.__gloam.world.player.maxHp }));
  check(bought.mask === 1 && bought.shards === 140 && bought.maxHp === 6, `buying a Mask Shard costs 60 and adds a mask (${JSON.stringify(bought)})`);
  await tap('ArrowDown');
  await wait(200);
  await shot('16-shop');
  await tap('Escape');
  await wait(200);
  check(await page.evaluate(() => window.__gloam.world.shop === null), 'Esc closes the shop');

  console.log('Needle Spires');
  await warp('spires', '0');
  await wait(1200);
  await page.keyboard.down('ArrowRight');
  await wait(300);
  await tap('z', 250);
  await wait(250);
  await page.keyboard.up('ArrowRight');
  await shot('17-spires');

  console.log('Featherfall Nest: take the Twin Feather');
  await warp('nest', 'x');
  await wait(300);
  await page.evaluate(() => { window.__gloam.world.enemies = []; });
  // Walk up to the pedestal, then hop onto it.
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => {
    const w = window.__gloam.world;
    const r = w.pickups.find((p) => p.kind === 'relic');
    return !r || w.player.cx > r.cx - 110;
  }, null, { polling: 'raf', timeout: 8000 });
  await page.keyboard.up('ArrowRight');
  for (let k = 0; k < 6 && !(await page.evaluate(() => window.__gloam.world.modal !== null)); k++) {
    await page.keyboard.down('ArrowRight');
    await tap('z', 220);
    await wait(120);
    await page.keyboard.up('ArrowRight');
    await wait(250);
  }
  await wait(800);
  check(await page.evaluate(() => window.__gloam.world.save.wings), 'the nest relic grants the double jump');
  await shot('18-wings');
  await tap('Enter');
  await wait(300);

  console.log("Hoarder's Hollow");
  await warp('cache', 'y');
  await wait(1200);
  await shot('19-cache');

  console.log('The Long Ascent: double jump');
  await warp('heights', 'w');
  await wait(1300);
  const y0 = await page.evaluate(() => window.__gloam.world.player.y);
  await page.keyboard.down('z');
  await page.waitForFunction(() => { const p = window.__gloam.world.player; return !p.grounded && p.vy > -80; }, null, { polling: 'raf' });
  await page.keyboard.up('z');
  await tap('z', 200);
  await wait(150);
  const rise = await page.evaluate((y0) => y0 - window.__gloam.world.player.y, y0);
  check(rise > 190, `jump + double jump rises well above a single jump (${Math.round(rise)}px)`);
  await shot('20-heights');

  console.log("Vesper's Court");
  await warp('duel', 'z');
  await wait(300);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__gloam.world.bossActive, null, { timeout: 5000 });
  await page.keyboard.up('ArrowRight');
  await wait(1400);
  await shot('21-vesper-intro');
  const duelStart = Date.now();
  let vshots = 0;
  while (Date.now() - duelStart < 8000) {
    await page.evaluate(() => { const p = window.__gloam.world.player; if (p.hp < 3) p.hp = p.maxHp; });
    const toward = await page.evaluate(() => {
      const w = window.__gloam.world;
      if (!w.boss) return 0;
      const d = w.boss.cx - w.player.cx;
      return Math.abs(d) > 50 ? Math.sign(d) : 0;
    });
    const key = toward > 0 ? 'ArrowRight' : 'ArrowLeft';
    if (toward !== 0) await page.keyboard.down(key);
    await tap('x', 40);
    await tap('z', 120);
    if (toward !== 0) await page.keyboard.up(key);
    if ((Date.now() - duelStart > 2500 && vshots === 0) || (Date.now() - duelStart > 5500 && vshots === 1)) {
      await shot(`22-vesper-fight-${++vshots}`);
    }
  }
  const vesper = await page.evaluate(() => ({ hp: window.__gloam.world.boss?.hp ?? 0, max: window.__gloam.world.boss?.maxHp ?? 0 }));
  check(vesper.hp < vesper.max, `Vesper takes damage (hp ${vesper.hp}/${vesper.max})`);

  // ---- The third area ------------------------------------------------------
  console.log('The Hanging Gloom (debug: mark Vesper defeated)');
  await page.evaluate(() => {
    const w = window.__gloam.world;
    w.save.duelDefeated = true;
    w.player.hp = w.player.maxHp;
  });
  await warp('gloom', 'k');
  await wait(1500);
  await shot('23-gloom');
  await warp('cradle', 'n');
  await wait(1300);
  await shot('24-cradle');

  console.log('The map (hold Tab)');
  await page.keyboard.down('Tab');
  await wait(450);
  const map = await page.evaluate(() => {
    const w = window.__gloam.world;
    return { open: w.mapOpen, fade: w.mapFade, visited: w.save.visited };
  });
  check(map.open && map.fade === 1, 'holding Tab opens the map');
  await shot('29-map');
  await page.keyboard.up('Tab');
  await wait(300);
  check(!(await page.evaluate(() => window.__gloam.world.mapOpen)), 'releasing Tab closes the map');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('gloamwell.save.v1')).visited);
  check(
    map.visited.length >= 17 && map.visited.includes('cradle') && !map.visited.includes('brood') && stored.join() === map.visited.join(),
    `every room so far is on the map and saved (${map.visited.length}: ${map.visited.join(', ')})`,
  );

  console.log('Mother Ashveil');
  await warp('brood', 'o');
  await wait(300);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__gloam.world.bossActive, null, { timeout: 5000 });
  await page.keyboard.up('ArrowRight');
  await wait(2200);
  await shot('25-ashveil-intro');
  const fightAshveil = async (ms, name) => {
    const start = Date.now();
    let taken = false;
    while (Date.now() - start < ms) {
      await page.evaluate(() => { const p = window.__gloam.world.player; if (p.hp < 3) p.hp = p.maxHp; });
      const dir = await page.evaluate(() => {
        const w = window.__gloam.world;
        if (!w.boss) return [0, 0];
        return [Math.sign(w.boss.cx - w.player.cx), w.boss.cy < w.player.cy - 40 ? 1 : 0];
      });
      const key = dir[0] > 0 ? 'ArrowRight' : 'ArrowLeft';
      if (dir[0] !== 0) await page.keyboard.down(key);
      if (dir[1]) await page.keyboard.down('ArrowUp');
      await tap('z', 160);
      await tap('z', 60);
      await tap('x', 40);
      if (dir[1]) await page.keyboard.up('ArrowUp');
      if (dir[0] !== 0) await page.keyboard.up(key);
      if (name && !taken && Date.now() - start > ms / 2) {
        await shot(name);
        taken = true;
      }
    }
  };
  // Debug: bring her to just above a threshold and land one strike, so phase changes are deterministic.
  const pushToPhase = (frac) =>
    page.evaluate((frac) => {
      const w = window.__gloam.world;
      const b = w.boss;
      if (!b) return;
      b.hp = Math.floor(b.maxHp * frac) + 1;
      b.strike(w, { dir: 'up', facing: 1, t: 0, active: true, hit: new Set(), pogoed: false, swing: 0 });
      w.player.hp = w.player.maxHp;
    }, frac);

  await fightAshveil(4000, '26-ashveil-fight');
  // She keeps her distance, so wait for her to dive into reach, then strike.
  const hpBefore = await page.evaluate(() => window.__gloam.world.boss.hp);
  const swingStart = Date.now();
  while (Date.now() - swingStart < 20000 && (await page.evaluate(() => window.__gloam.world.boss.hp)) === hpBefore) {
    const st = await page.evaluate(() => {
      const w = window.__gloam.world;
      const b = w.boss;
      w.player.hp = w.player.maxHp;
      return { dx: b.cx - w.player.cx, dy: b.cy - w.player.cy, state: b.state };
    });
    const key = st.dx > 0 ? 'ArrowRight' : 'ArrowLeft';
    if (Math.abs(st.dx) < 110 && Math.abs(st.dy) < 110) {
      await page.keyboard.down(key);
      await wait(16);
      await page.keyboard.up(key);
      if (st.dy < -30) await page.keyboard.down('ArrowUp');
      await tap('x', 40);
      if (st.dy < -30) await page.keyboard.up('ArrowUp');
      await wait(120);
    } else if (Math.abs(st.dx) > 60) {
      await page.keyboard.down(key);
      await wait(80);
      await page.keyboard.up(key);
    } else await wait(30);
  }
  const ash = await page.evaluate(() => ({ hp: window.__gloam.world.boss?.hp ?? 0, max: window.__gloam.world.boss?.maxHp ?? 0 }));
  check(ash.hp < ash.max, `Ashveil can be struck when she dives into reach (hp ${ash.hp}/${ash.max})`);

  console.log('Ashveil phase two (debug: push her past half health)');
  await pushToPhase(0.55);
  check(await page.evaluate(() => window.__gloam.world.boss?.phase === 2), 'Ashveil reaches phase two');
  await page.waitForFunction(() => window.__gloam.world.projectiles.some((p) => p.kind === 'vine' && p.delay <= 0), null, { timeout: 8000 });
  await wait(150);
  await shot('27-ashveil-vines');

  console.log('Ashveil phase three (debug: push her near death)');
  await pushToPhase(0.22);
  await page.waitForFunction(() => ['crawl', 'screechWind'].includes(window.__gloam.world.boss?.state), null, { timeout: 6000 });
  await fightAshveil(1500, '');
  await shot('28-ashveil-crawl');
  check(await page.evaluate(() => window.__gloam.world.boss?.phase === 3), 'Ashveil falls and crawls in phase three');
} catch (e) {
  failed = true;
  console.error(e);
  await shot('error').catch(() => {});
}

await browser.close();
await server.close();

if (errors.length || failed) {
  console.error(`\nE2E FAILED (${errors.length} error(s))`);
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('\nE2E PASSED: no console errors, all checks green.');
