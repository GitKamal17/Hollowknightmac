import { PLAYER } from '../core/tuning';
import type { SaveData, UpgradeId } from './save';

export interface ShopItem {
  id: UpgradeId;
  name: string;
  desc: string;
  /** Price of each level, in order. Its length is the max level. */
  costs: number[];
}

// Prices are set against income: a full pass of the first area yields roughly
// 60-80 shards, the Warden drops 40, and the second area pays more.
export const SHOP: ShopItem[] = [
  { id: 'mask', name: 'Mask Shard', desc: 'One more mask of health.', costs: [60, 150, 260] },
  { id: 'vessel', name: 'Deep Vessel', desc: 'Strikes gather more essence, so you heal more often.', costs: [70] },
  { id: 'focus', name: 'Quick Focus', desc: 'Healing channels much faster.', costs: [90] },
  { id: 'blade', name: 'Honed Blade', desc: 'Every strike deals double damage.', costs: [180] },
];

export function nextCost(save: SaveData, item: ShopItem): number | null {
  const level = save.upgrades[item.id];
  return level < item.costs.length ? item.costs[level] : null;
}

export type BuyResult = 'bought' | 'poor' | 'sold-out';

export function buy(save: SaveData, item: ShopItem): BuyResult {
  const cost = nextCost(save, item);
  if (cost === null) return 'sold-out';
  if (save.shards < cost) return 'poor';
  save.shards -= cost;
  save.upgrades[item.id]++;
  return 'bought';
}

/** Player stats that follow from purchases. */
export interface Stats {
  maxHp: number;
  damage: number;
  healTime: number;
  soulPerHit: number;
}

export function statsFor(save: SaveData): Stats {
  const u = save.upgrades;
  return {
    maxHp: PLAYER.maxHp + u.mask,
    damage: 1 + u.blade,
    healTime: u.focus ? 0.55 : PLAYER.healTime,
    soulPerHit: u.vessel ? 16 : PLAYER.soulPerHit,
  };
}
