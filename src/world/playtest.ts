import type { KV } from './save';

/** What happened in one room, or during one boss's fights. */
export interface Tally {
  /** Seconds spent, including time in menus opened there (shop, relic text). */
  time: number;
  deaths: number;
  /** What landed each killing blow, keyed like `damageBy`. */
  killedBy: Record<string, number>;
  /** Masks lost. */
  damage: number;
  /** Masks lost, by what dealt them: `contact:skitter`, `projectile:orb`, `hazard:spike`. */
  damageBy: Record<string, number>;
  /** Heals completed. Each restores one mask. */
  heals: number;
  shardsEarned: number;
  shardsSpent: number;
}

export interface BossTally extends Tally {
  /** Fights started (the gates closed). */
  attempts: number;
  wins: number;
}

export interface PlaytestLog {
  v: 1;
  /** ISO timestamps. */
  created: string;
  updated: string;
  rooms: Record<string, Tally>;
  /** Keyed by boss kind. Shards earned here are the boss's own drop. */
  bosses: Record<string, BossTally>;
}

export const PLAYTEST_KEY = 'gloamwell.playtest.v1';
/** How often time alone (no other event) is written back. */
const FLUSH_EVERY = 5;

export function newTally(): Tally {
  return { time: 0, deaths: 0, killedBy: {}, damage: 0, damageBy: {}, heals: 0, shardsEarned: 0, shardsSpent: 0 };
}

export function newBossTally(): BossTally {
  return { ...newTally(), attempts: 0, wins: 0 };
}

export function newPlaytestLog(now = new Date()): PlaytestLog {
  const t = now.toISOString();
  return { v: 1, created: t, updated: t, rooms: {}, bosses: {} };
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const isObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o);

function counts(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isObj(raw)) for (const [k, v] of Object.entries(raw)) if (isNum(v)) out[k] = Math.floor(v);
  return out;
}

function tallyFrom<T extends Tally>(raw: unknown, base: T): T {
  if (!isObj(raw)) return base;
  for (const k of Object.keys(base) as (keyof T)[]) {
    const v = raw[k as string];
    if (typeof base[k] === 'number') (base[k] as number) = isNum(v) ? v : 0;
    else (base[k] as Record<string, number>) = counts(v);
  }
  return base;
}

function validate(raw: unknown): PlaytestLog | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const log = newPlaytestLog();
  if (typeof raw.created === 'string') log.created = raw.created;
  if (typeof raw.updated === 'string') log.updated = raw.updated;
  if (isObj(raw.rooms)) for (const [id, t] of Object.entries(raw.rooms)) log.rooms[id] = tallyFrom(t, newTally());
  if (isObj(raw.bosses)) for (const [id, t] of Object.entries(raw.bosses)) log.bosses[id] = tallyFrom(t, newBossTally());
  return log;
}

export function loadPlaytest(kv: KV | null): PlaytestLog | null {
  if (!kv) return null;
  try {
    const text = kv.getItem(PLAYTEST_KEY);
    return text ? validate(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

/** Seconds are rounded to centiseconds so the file stays readable. */
export function playtestJSON(log: PlaytestLog, indent?: number): string {
  return JSON.stringify(log, (k, v) => (k === 'time' && typeof v === 'number' ? Math.round(v * 100) / 100 : v), indent);
}

export function writePlaytest(kv: KV | null, log: PlaytestLog): boolean {
  if (!kv) return false;
  try {
    kv.setItem(PLAYTEST_KEY, playtestJSON(log));
    return true;
  } catch {
    return false;
  }
}

const bump = (m: Record<string, number>, key: string): void => {
  m[key] = (m[key] ?? 0) + 1;
};

/**
 * Opt-in playtest recorder (`?telemetry`). The world reports what happens;
 * this only counts, so it can't change how the game plays. Every event names
 * the room and, during a boss fight, the boss, and counts toward both.
 */
export class Playtest {
  readonly log: PlaytestLog;
  private dirty = false;
  private sinceFlush = 0;

  constructor(private store: KV | null) {
    this.log = loadPlaytest(store) ?? newPlaytestLog();
  }

  room(id: string): Tally {
    return (this.log.rooms[id] ??= newTally());
  }

  boss(kind: string): BossTally {
    return (this.log.bosses[kind] ??= newBossTally());
  }

  private each(room: string, boss: string | null, f: (t: Tally) => void): void {
    f(this.room(room));
    if (boss) f(this.boss(boss));
    this.dirty = true;
  }

  time(room: string, boss: string | null, dt: number): void {
    this.each(room, boss, (t) => (t.time += dt));
    this.sinceFlush += dt;
    if (this.sinceFlush >= FLUSH_EVERY) this.flush();
  }

  hurt(room: string, boss: string | null, source: string, fatal: boolean): void {
    this.each(room, boss, (t) => {
      t.damage++;
      bump(t.damageBy, source);
      if (fatal) {
        t.deaths++;
        bump(t.killedBy, source);
      }
    });
  }

  healed(room: string, boss: string | null): void {
    this.each(room, boss, (t) => t.heals++);
  }

  earned(room: string, boss: string | null, n: number): void {
    this.each(room, boss, (t) => (t.shardsEarned += n));
  }

  spent(room: string, n: number): void {
    this.each(room, null, (t) => (t.shardsSpent += n));
  }

  fightStarted(boss: string): void {
    this.boss(boss).attempts++;
    this.dirty = true;
  }

  fightWon(boss: string): void {
    this.boss(boss).wins++;
    this.dirty = true;
  }

  /** Write to storage if anything changed since the last write. */
  flush(): void {
    this.sinceFlush = 0;
    if (!this.dirty) return;
    this.log.updated = new Date().toISOString();
    if (writePlaytest(this.store, this.log)) this.dirty = false;
  }

  /** The log as a pretty-printed JSON file. */
  export(): string {
    this.flush();
    return playtestJSON(this.log, 2);
  }
}
