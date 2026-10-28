export type UpgradeId = 'mask' | 'blade' | 'focus' | 'vessel';
export const UPGRADE_IDS: UpgradeId[] = ['mask', 'blade', 'focus', 'vessel'];

export interface SaveData {
  v: 1;
  /** Lantern the player last rested at, or null for the room start. */
  bench: { room: string; x: number; y: number } | null;
  dash: boolean;
  bossDefeated: boolean;
  shards: number;
  echo: { room: string; x: number; y: number; amount: number } | null;
  wings: boolean;
  duelDefeated: boolean;
  matronDefeated: boolean;
  /** The secret shard hoard has been emptied. */
  cache: boolean;
  /** Levels bought from the merchant. */
  upgrades: Record<UpgradeId, number>;
  /** Rooms the player has set foot in, in the order first entered (drawn on the map). */
  visited: string[];
}

/** The subset of the Web Storage API we use, so tests can pass a fake. */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = 'gloamwell.save.v1';

export function newSave(): SaveData {
  return {
    v: 1,
    bench: null,
    dash: false,
    bossDefeated: false,
    shards: 0,
    echo: null,
    wings: false,
    duelDefeated: false,
    matronDefeated: false,
    cache: false,
    upgrades: { mask: 0, blade: 0, focus: 0, vessel: 0 },
    visited: [],
  };
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function validate(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return null;
  const s = newSave();
  s.dash = r.dash === true;
  s.bossDefeated = r.bossDefeated === true;
  s.wings = r.wings === true;
  s.duelDefeated = r.duelDefeated === true;
  s.matronDefeated = r.matronDefeated === true;
  s.cache = r.cache === true;
  const u = (r.upgrades ?? {}) as Record<string, unknown>;
  for (const id of UPGRADE_IDS) s.upgrades[id] = isNum(u[id]) ? Math.max(0, Math.min(3, Math.floor(u[id]))) : 0;
  // Saves from before the map have no list; they start with an empty one.
  if (Array.isArray(r.visited)) s.visited = [...new Set(r.visited.filter((id): id is string => typeof id === 'string'))];
  s.shards = isNum(r.shards) ? Math.max(0, Math.floor(r.shards)) : 0;
  const b = r.bench as Record<string, unknown> | null;
  if (b && typeof b.room === 'string' && isNum(b.x) && isNum(b.y)) s.bench = { room: b.room, x: b.x, y: b.y };
  const e = r.echo as Record<string, unknown> | null;
  if (e && typeof e.room === 'string' && isNum(e.x) && isNum(e.y) && isNum(e.amount)) {
    s.echo = { room: e.room, x: e.x, y: e.y, amount: e.amount };
  }
  return s;
}

export function loadSave(kv: KV | null): SaveData | null {
  if (!kv) return null;
  try {
    const text = kv.getItem(SAVE_KEY);
    return text ? validate(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

export function writeSave(kv: KV | null, data: SaveData): boolean {
  if (!kv) return false;
  try {
    kv.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(kv: KV | null): void {
  try {
    kv?.removeItem(SAVE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** localStorage if this browser allows it, otherwise null (the game still runs, it just won't persist). */
export function browserStorage(): KV | null {
  try {
    const s = window.localStorage;
    const probe = '__gloamwell_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** In-memory storage for tests. */
export function memoryStorage(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
