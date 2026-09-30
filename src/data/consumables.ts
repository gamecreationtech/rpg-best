export type ConsumableId = 'hp_potion' | 'bandage' | 'mp_potion' | 'incense';

export interface ConsumableDef {
  id: ConsumableId;
  name: string;
  key: string;
  color: number;
  /** Share of the single dose refilled every second (0.01 is one percent). */
  refillPerSec: number;
  /** Share refilled for every monster killed. */
  refillPerKill: number;
  cooldown: number;
  description: string;
}

/**
 * Each consumable is one dose with a fill meter. It can only be used when the
 * meter is full, and using it empties it. Potions refill with time and with
 * kills; the bandage and incense refill with time alone.
 */
export const CONSUMABLES: ConsumableDef[] = [
  { id: 'hp_potion', name: 'Life Potion', key: '1', color: 0xff3a3a, refillPerSec: 0.01, refillPerKill: 0.1, cooldown: 1000, description: 'Restores 40% of your life at once. Refills 1% a second and 10% per kill.' },
  { id: 'bandage', name: 'Bandage', key: '2', color: 0xe8dcc8, refillPerSec: 0.02, refillPerKill: 0, cooldown: 1500, description: 'Heals 60% of your life over eight seconds and stops bleeding and burning. Refills 2% a second.' },
  { id: 'mp_potion', name: 'Mana Potion', key: '3', color: 0x3a6aff, refillPerSec: 0.01, refillPerKill: 0.1, cooldown: 1000, description: 'Restores 50% of your mana at once. Refills 1% a second and 10% per kill.' },
  { id: 'incense', name: 'Incense', key: '4', color: 0xc08aff, refillPerSec: 0.02, refillPerKill: 0, cooldown: 2000, description: 'Restores 60% of your mana over eight seconds and clears slow, freeze and poison. Refills 2% a second.' },
];

export const CONSUMABLE_RULES = {
  hpPotionPct: 40,
  bandagePct: 60,
  bandageDuration: 8000,
  mpPotionPct: 50,
  incensePct: 60,
  incenseDuration: 8000,
};
