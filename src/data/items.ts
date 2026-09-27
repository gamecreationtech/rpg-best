import type { StatMap } from './stats';

export type EquipSlot =
  | 'weapon' | 'shield' | 'helmet' | 'chest' | 'gloves' | 'boots'
  | 'ring' | 'belt' | 'amulet' | 'totem' | 'relic' | 'charm';

/** Equipment slots on the character sheet. Rings have two. */
export const EQUIP_SLOTS: { id: EquipSlot; label: string; count: number }[] = [
  { id: 'weapon', label: 'Weapon', count: 1 },
  { id: 'shield', label: 'Shield', count: 1 },
  { id: 'helmet', label: 'Helmet', count: 1 },
  { id: 'chest', label: 'Chest', count: 1 },
  { id: 'gloves', label: 'Gloves', count: 1 },
  { id: 'boots', label: 'Boots', count: 1 },
  { id: 'belt', label: 'Belt', count: 1 },
  { id: 'amulet', label: 'Amulet', count: 1 },
  { id: 'ring', label: 'Ring', count: 2 },
  { id: 'totem', label: 'Totem', count: 1 },
  { id: 'relic', label: 'Relic', count: 1 },
  { id: 'charm', label: 'Charm', count: 1 },
];

export type WeaponType = 'sword' | 'dagger' | 'axe' | 'mace' | 'spear' | 'bow' | 'crossbow' | 'wand' | 'staff' | 'blowgun' | 'bardiche' | 'spellbook' | 'warpike';

export type Rarity = 'common' | 'magic' | 'rare' | 'mythic' | 'set' | 'divine';

export interface RarityDef {
  id: Rarity;
  name: string;
  color: number;
  mult: number;
  gold: number;
  /** Drop weight out of 100. Set items only come from transmutation. */
  dropWeight: number;
  /** Random affixes rolled on generation. */
  affixes: number;
}

export const RARITIES: Record<Rarity, RarityDef> = {
  common: { id: 'common', name: 'Common', color: 0xcccccc, mult: 1.0, gold: 8, dropWeight: 55, affixes: 0 },
  magic: { id: 'magic', name: 'Magic', color: 0x4488ff, mult: 1.6, gold: 40, dropWeight: 25, affixes: 1 },
  rare: { id: 'rare', name: 'Rare', color: 0xffdd00, mult: 2.4, gold: 120, dropWeight: 14, affixes: 2 },
  mythic: { id: 'mythic', name: 'Mythic', color: 0xcc44ff, mult: 3.8, gold: 350, dropWeight: 5, affixes: 3 },
  set: { id: 'set', name: 'Set', color: 0x00ee66, mult: 3.2, gold: 500, dropWeight: 0, affixes: 3 },
  divine: { id: 'divine', name: 'Divine', color: 0xff8800, mult: 5.5, gold: 900, dropWeight: 1, affixes: 4 },
};

export const RARITY_ORDER: Rarity[] = ['common', 'magic', 'rare', 'mythic', 'set', 'divine'];

export interface WeaponProps {
  type: WeaponType;
  dmgMin: number;
  dmgMax: number;
  atkSpd: number;
  ranged: boolean;
  magic: boolean;
  twoHanded: boolean;
  /** Attack reach in px for melee, projectile range for ranged. */
  range: number;
}

export interface BaseItem {
  id: string;
  name: string;
  slot: EquipSlot;
  size: [number, number];
  stats: StatMap;
  weapon?: WeaponProps;
  /** Fixed rarity for special items. */
  rarity?: Rarity;
  /** Starter and special items are not generated as drops. */
  noDrop?: boolean;
  /** Value override (starter gear is worthless). */
  value?: number;
}

export const WEAPON_BASES: BaseItem[] = [
  { id: 'sword', name: 'Sword', slot: 'weapon', size: [1, 3], stats: { str: 3 }, weapon: { type: 'sword', dmgMin: 5, dmgMax: 11, atkSpd: 1.4, ranged: false, magic: false, twoHanded: false, range: 80 } },
  { id: 'dagger', name: 'Dagger', slot: 'weapon', size: [1, 2], stats: { dex: 5 }, weapon: { type: 'dagger', dmgMin: 2, dmgMax: 6, atkSpd: 2.2, ranged: false, magic: false, twoHanded: false, range: 30 } },
  { id: 'axe', name: 'Axe', slot: 'weapon', size: [1, 3], stats: { str: 7 }, weapon: { type: 'axe', dmgMin: 12, dmgMax: 20, atkSpd: 0.9, ranged: false, magic: false, twoHanded: false, range: 84 } },
  { id: 'mace', name: 'Mace', slot: 'weapon', size: [1, 3], stats: { str: 4, vit: 2 }, weapon: { type: 'mace', dmgMin: 8, dmgMax: 14, atkSpd: 0.8, ranged: false, magic: false, twoHanded: false, range: 80 } },
  { id: 'spear', name: 'Spear', slot: 'weapon', size: [1, 4], stats: { str: 3 }, weapon: { type: 'spear', dmgMin: 7, dmgMax: 13, atkSpd: 1.3, ranged: false, magic: false, twoHanded: true, range: 110 } },
  { id: 'bow', name: 'Bow', slot: 'weapon', size: [2, 3], stats: { dex: 8 }, weapon: { type: 'bow', dmgMin: 10, dmgMax: 18, atkSpd: 1.3, ranged: true, magic: false, twoHanded: true, range: 360 } },
  { id: 'crossbow', name: 'Crossbow', slot: 'weapon', size: [2, 3], stats: { dex: 5 }, weapon: { type: 'crossbow', dmgMin: 16, dmgMax: 28, atkSpd: 0.8, ranged: true, magic: false, twoHanded: true, range: 380 } },
  { id: 'wand', name: 'Wand', slot: 'weapon', size: [1, 2], stats: { int: 12 }, weapon: { type: 'wand', dmgMin: 6, dmgMax: 12, atkSpd: 1.6, ranged: true, magic: true, twoHanded: false, range: 320 } },
  { id: 'staff', name: 'Staff', slot: 'weapon', size: [1, 4], stats: { int: 18 }, weapon: { type: 'staff', dmgMin: 14, dmgMax: 22, atkSpd: 0.9, ranged: true, magic: true, twoHanded: true, range: 340 } },
  { id: 'blowgun', name: 'Blowgun', slot: 'weapon', size: [1, 4], stats: { dex: 12 }, weapon: { type: 'blowgun', dmgMin: 3, dmgMax: 7, atkSpd: 1.9, ranged: true, magic: false, twoHanded: true, range: 300 } },
  { id: 'bardiche', name: 'Bardiche', slot: 'weapon', size: [2, 4], stats: { str: 9 }, weapon: { type: 'bardiche', dmgMin: 18, dmgMax: 30, atkSpd: 0.7, ranged: false, magic: false, twoHanded: true, range: 50 } },
  { id: 'spellbook', name: 'Spellbook', slot: 'weapon', size: [2, 2], stats: { int: 10, mana: 20 }, weapon: { type: 'spellbook', dmgMin: 8, dmgMax: 14, atkSpd: 1.2, ranged: true, magic: true, twoHanded: false, range: 300 } },
  { id: 'warpike', name: 'Warpike', slot: 'weapon', size: [1, 4], stats: { str: 5, dex: 3 }, weapon: { type: 'warpike', dmgMin: 12, dmgMax: 20, atkSpd: 1.0, ranged: false, magic: false, twoHanded: true, range: 130 } },
];

export const ARMOR_BASES: BaseItem[] = [
  { id: 'helmet', name: 'Helmet', slot: 'helmet', size: [2, 2], stats: { armor: 4, vit: 3 } },
  { id: 'chest_armor', name: 'Chest Armor', slot: 'chest', size: [2, 3], stats: { armor: 10, vit: 6 } },
  { id: 'leather_armor', name: 'Leather Armor', slot: 'chest', size: [2, 3], stats: { armor: 6, dex: 2 } },
  { id: 'gauntlets', name: 'Gauntlets', slot: 'gloves', size: [2, 2], stats: { armor: 2, dex: 3 } },
  { id: 'boots', name: 'Boots', slot: 'boots', size: [2, 2], stats: { armor: 3, dex: 2 } },
];

export const ACCESSORY_BASES: BaseItem[] = [
  { id: 'ring', name: 'Ring', slot: 'ring', size: [1, 1], stats: { int: 2, mana: 15 } },
  { id: 'power_ring', name: 'Power Ring', slot: 'ring', size: [1, 1], stats: { str: 3, damage: 5 } },
  { id: 'belt', name: 'Belt', slot: 'belt', size: [1, 2], stats: { armor: 3, vit: 4 } },
  { id: 'war_belt', name: 'War Belt', slot: 'belt', size: [1, 2], stats: { armor: 6, str: 2, vit: 2 } },
  { id: 'amulet', name: 'Amulet', slot: 'amulet', size: [1, 1], stats: { int: 3, mana: 20 } },
  { id: 'jade_amulet', name: 'Jade Amulet', slot: 'amulet', size: [1, 1], stats: { vit: 4, armor: 2 } },
  { id: 'wooden_shield_base', name: 'Wooden Shield', slot: 'shield', size: [2, 2], stats: { armor: 6, vit: 2, block: 8 } },
  { id: 'iron_shield', name: 'Iron Shield', slot: 'shield', size: [2, 2], stats: { armor: 12, str: 2, block: 15 } },
];

/** Divine-only specials. They can drop at the divine weight and are never scaled down. */
export const SPECIAL_BASES: BaseItem[] = [
  { id: 'totem_of_swiftness', name: 'Totem of Swiftness', slot: 'totem', size: [1, 2], stats: { moveSpeed: 200 }, rarity: 'divine' },
  { id: 'rangers_relic', name: "Ranger's Relic", slot: 'relic', size: [1, 2], stats: { range: 100, projSpeed: 100 }, rarity: 'divine' },
  { id: 'fire_elemental_sword', name: 'Fire Elemental Sword', slot: 'weapon', size: [1, 3], stats: { critChance: 15, critDamage: 200, burnChance: 100 }, rarity: 'divine', weapon: { type: 'sword', dmgMin: 18, dmgMax: 30, atkSpd: 1.4, ranged: false, magic: false, twoHanded: false, range: 80 } },
  { id: 'vital_charm', name: 'Vital Charm', slot: 'charm', size: [1, 1], stats: { life: 500, mana: 500 }, rarity: 'divine' },
];

/** Starter gear: item level 1, common, worth nothing. */
export const STARTER_ITEMS: BaseItem[] = [
  { id: 'wooden_sword', name: 'Wooden Sword', slot: 'weapon', size: [1, 3], stats: {}, noDrop: true, value: 0, weapon: { type: 'sword', dmgMin: 1, dmgMax: 3, atkSpd: 1.1, ranged: false, magic: false, twoHanded: false, range: 80 } },
  { id: 'wooden_shield', name: 'Wooden Shield', slot: 'shield', size: [2, 2], stats: { armor: 5, block: 25 }, noDrop: true, value: 0 },
  { id: 'wooden_staff', name: 'Wooden Staff', slot: 'weapon', size: [1, 4], stats: {}, noDrop: true, value: 0, weapon: { type: 'staff', dmgMin: 1, dmgMax: 2, atkSpd: 0.9, ranged: true, magic: true, twoHanded: true, range: 340 } },
  { id: 'wooden_bow', name: 'Wooden Bow', slot: 'weapon', size: [2, 3], stats: {}, noDrop: true, value: 0, weapon: { type: 'bow', dmgMin: 2, dmgMax: 4, atkSpd: 1.3, ranged: true, magic: false, twoHanded: true, range: 360 } },
  { id: 'starter_dagger', name: 'Starter Dagger', slot: 'weapon', size: [1, 2], stats: { critChance: 10 }, noDrop: true, value: 0, weapon: { type: 'dagger', dmgMin: 1, dmgMax: 2, atkSpd: 2.0, ranged: false, magic: false, twoHanded: false, range: 30 } },
  { id: 'starter_spear', name: 'Starter Spear', slot: 'weapon', size: [1, 4], stats: { str: 3 }, noDrop: true, value: 0, weapon: { type: 'spear', dmgMin: 7, dmgMax: 13, atkSpd: 1.3, ranged: false, magic: false, twoHanded: true, range: 110 } },
];

export const ALL_BASES: BaseItem[] = [...WEAPON_BASES, ...ARMOR_BASES, ...ACCESSORY_BASES, ...SPECIAL_BASES, ...STARTER_ITEMS];

export function baseItem(id: string): BaseItem {
  const b = ALL_BASES.find((x) => x.id === id);
  if (!b) throw new Error(`Unknown base item ${id}`);
  return b;
}

/** Affixes added by rarity and by the Arcana Oracle's Enchant. */
export interface Affix {
  stat: keyof StatMap;
  delta: number;
  suffix: string;
}

export const AFFIX_POOL: Affix[] = [
  { stat: 'damage', delta: 12, suffix: 'of Fury' },
  { stat: 'armor', delta: 10, suffix: 'of Warding' },
  { stat: 'str', delta: 6, suffix: 'of Strength' },
  { stat: 'dex', delta: 6, suffix: 'of Swiftness' },
  { stat: 'int', delta: 6, suffix: 'of Wisdom' },
  { stat: 'vit', delta: 6, suffix: 'of Endurance' },
  { stat: 'critChance', delta: 0.1, suffix: 'of Precision' },
  { stat: 'atkSpd', delta: 0.15, suffix: 'of Haste' },
];

export const ITEM_RULES = {
  /** mult = rarity.mult * (1 + (ilvl - 1) * levelScale) */
  levelScale: 0.12,
  /** value = rarityGold * width * height * (1 + (ilvl - 1) * valueScale) */
  valueScale: 0.05,
  sellRatio: 0.4,
  inventoryCols: 18,
  inventoryRows: 14,
  stashCols: 12,
  stashRows: 12,
  stashPages: 3,
  /** Vendor stock item level relative to the player: 65% same, 20% +1, 10% +2, 5% +3. */
  vendorLevelWeights: [65, 20, 10, 5],
  vendorMaxRarity: 'magic' as Rarity,
  vendorStockSize: 18,
};
