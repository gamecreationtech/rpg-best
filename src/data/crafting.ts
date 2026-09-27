import type { EquipSlot } from './items';
import type { StatKey } from './stats';

export type StationType = 'forge' | 'bloodfountain' | 'arcana';

export interface StationDef {
  id: StationType;
  name: string;
  color: number;
  interactRadius: number;
}

export const STATIONS: Record<StationType, StationDef> = {
  forge: { id: 'forge', name: 'Forge of Heaven', color: 0xffe066, interactRadius: 68 },
  bloodfountain: { id: 'bloodfountain', name: 'Blood Fountain', color: 0xcc1111, interactRadius: 68 },
  arcana: { id: 'arcana', name: 'Arcana Oracle', color: 0x9955ee, interactRadius: 68 },
};

export interface ForgeOp {
  id: string;
  name: string;
  cost: number;
  /** Which forge stack this uses; each stack maxes at `FORGE_MAX_USES`. */
  stack: 'dmg' | 'spd' | 'block' | 'armor';
  pct: number;
  slots: EquipSlot[];
  description: string;
}

export const FORGE_MAX_USES = 5;

export const FORGE_OPS: ForgeOp[] = [
  { id: 'smelt_damage', name: 'Smelt Damage', cost: 80, stack: 'dmg', pct: 5, slots: ['weapon'], description: '+5% weapon damage' },
  { id: 'smelt_speed', name: 'Smelt Speed', cost: 80, stack: 'spd', pct: 5, slots: ['weapon'], description: '+5% attack speed' },
  { id: 'smelt_block', name: 'Smelt Block', cost: 60, stack: 'block', pct: 2, slots: ['shield'], description: '+2% block chance' },
  { id: 'smelt_armor', name: 'Smelt Armor', cost: 70, stack: 'armor', pct: 5, slots: ['helmet', 'chest', 'gloves', 'boots', 'shield'], description: '+5% armor' },
];

export interface BloodOp {
  id: string;
  name: string;
  cost: number;
  stat: StatKey;
  delta: number;
  /** Empty means any slot. */
  slots: EquipSlot[];
  description: string;
}

export const BLOOD_OPS: BloodOp[] = [
  { id: 'sanguinate', name: 'Sanguinate', cost: 80, stat: 'lifeOnHit', delta: 10, slots: ['weapon', 'ring', 'amulet'], description: '+10 life on hit' },
  { id: 'bleed', name: 'Bleed', cost: 70, stat: 'damage', delta: 12, slots: ['weapon'], description: '+12 damage' },
  { id: 'vitalize', name: 'Vitalize', cost: 60, stat: 'life', delta: 30, slots: [], description: '+30 life' },
  { id: 'sacrifice', name: 'Sacrifice', cost: 90, stat: 'manaOnHit', delta: 8, slots: ['weapon', 'ring', 'amulet'], description: '+8 mana on hit' },
];

export interface ArcanaOp {
  id: 'enchant' | 'transmute' | 'infuse' | 'reroll';
  name: string;
  cost: number;
  description: string;
}

export const ARCANA_OPS: ArcanaOp[] = [
  { id: 'enchant', name: 'Enchant', cost: 150, description: 'Add a random magic affix' },
  { id: 'transmute', name: 'Transmute', cost: 200, description: 'Raise rarity by one tier' },
  { id: 'infuse', name: 'Infuse', cost: 120, description: '+15 to a random stat' },
  { id: 'reroll', name: 'Reroll', cost: 180, description: 'Randomise every stat by up to 40%' },
];
