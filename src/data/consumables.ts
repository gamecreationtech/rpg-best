export type ConsumableId = 'hp_potion' | 'bandage' | 'mp_potion' | 'incense';

export interface ConsumableDef {
  id: ConsumableId;
  name: string;
  key: string;
  color: number;
  maxCharges: number;
  /** Charges regained per enemy kill. */
  rechargePerKill: number;
  cooldown: number;
  description: string;
}

export const CONSUMABLES: ConsumableDef[] = [
  { id: 'hp_potion', name: 'Health Potion', key: '1', color: 0xff3a3a, maxCharges: 5, rechargePerKill: 0.34, cooldown: 1000, description: 'Restores 40% of your life.' },
  { id: 'bandage', name: 'Bandage', key: '2', color: 0xe8dcc8, maxCharges: 3, rechargePerKill: 0.2, cooldown: 1500, description: 'Heals 60% of your life over eight seconds.' },
  { id: 'mp_potion', name: 'Mana Potion', key: '3', color: 0x3a6aff, maxCharges: 5, rechargePerKill: 0.34, cooldown: 1000, description: 'Restores 50% of your mana.' },
  { id: 'incense', name: 'Incense', key: '4', color: 0xc08aff, maxCharges: 2, rechargePerKill: 0.1, cooldown: 2000, description: 'Cleanses slow, freeze and poison, and grants 10% damage for 20 seconds.' },
];

export const CONSUMABLE_RULES = {
  hpPotionPct: 40,
  bandagePct: 60,
  bandageDuration: 8000,
  mpPotionPct: 50,
  incenseDmgPct: 10,
  incenseDuration: 20000,
};
