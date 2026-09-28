import type { StatKey, StatMap } from './stats';
import type { ItemProc } from './procs';

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

export type WeaponType = 'sword' | 'dagger' | 'axe' | 'mace' | 'spear' | 'bow' | 'crossbow' | 'wand' | 'staff' | 'blowgun' | 'bardiche' | 'spellbook' | 'warpike' | 'warfork' | 'javelin';

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
  /** Multiplier for attribute bonuses (strength, life, crit and the like); `mult` is for weapon damage and armour. */
  bonus: number;
}

export const RARITIES: Record<Rarity, RarityDef> = {
  common: { id: 'common', name: 'Common', color: 0xcccccc, mult: 1.0, gold: 8, dropWeight: 40, affixes: 0, bonus: 1.0 },
  magic: { id: 'magic', name: 'Magic', color: 0x4488ff, mult: 1.6, gold: 40, dropWeight: 40, affixes: 1, bonus: 1.25 },
  rare: { id: 'rare', name: 'Rare', color: 0xffdd00, mult: 2.4, gold: 120, dropWeight: 16, affixes: 2, bonus: 1.5 },
  mythic: { id: 'mythic', name: 'Mythic', color: 0xcc44ff, mult: 3.8, gold: 350, dropWeight: 3.5, affixes: 3, bonus: 2.0 },
  set: { id: 'set', name: 'Set', color: 0x00ee66, mult: 3.2, gold: 500, dropWeight: 0, affixes: 3, bonus: 1.8 },
  divine: { id: 'divine', name: 'Divine', color: 0xff8800, mult: 5.5, gold: 900, dropWeight: 0.5, affixes: 4, bonus: 2.5 },
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

/** Offhand items share the shield slot and, like shields, need a free hand: no two-handed weapons. A quiver is the exception, it needs a bow. */
export type OffhandKind = 'lantern' | 'skull' | 'quiver';

export interface BaseItem {
  id: string;
  name: string;
  slot: EquipSlot;
  size: [number, number];
  stats: StatMap;
  weapon?: WeaponProps;
  /** Set on the offhand items that live in the shield slot without being shields. */
  offhand?: OffhandKind;
  /** Set pieces: the set they belong to (see `data/sets.ts`). */
  setId?: string;
  /** Fixed level requirement for hand-written items; drops otherwise derive it from item level. */
  reqLevel?: number;
  /** Stats rolled once when the item is made, inclusive ranges (a hand-written item with variety). */
  rolls?: Partial<Record<StatKey, [number, number]>>;
  /** Chance to fire a proc on every weapon hit. */
  proc?: ItemProc;
  /** Fixed rarity for special items. */
  rarity?: Rarity;
  /** Starter and special items are not generated as drops. */
  noDrop?: boolean;
  /** Value override (starter gear is worthless). */
  value?: number;
}

export const WEAPON_BASES: BaseItem[] = [
  { id: 'sword', name: 'Sword', slot: 'weapon', size: [1, 3], stats: { str: 1 }, weapon: { type: 'sword', dmgMin: 5, dmgMax: 11, atkSpd: 1.4, ranged: false, magic: false, twoHanded: false, range: 30 } },
  { id: 'dagger', name: 'Dagger', slot: 'weapon', size: [1, 2], stats: { dex: 2 }, weapon: { type: 'dagger', dmgMin: 2, dmgMax: 6, atkSpd: 2.2, ranged: false, magic: false, twoHanded: false, range: 25 } },
  { id: 'axe', name: 'Axe', slot: 'weapon', size: [1, 3], stats: { str: 2 }, weapon: { type: 'axe', dmgMin: 12, dmgMax: 20, atkSpd: 0.9, ranged: false, magic: false, twoHanded: false, range: 30 } },
  { id: 'mace', name: 'Mace', slot: 'weapon', size: [1, 3], stats: { str: 1, vit: 1 }, weapon: { type: 'mace', dmgMin: 8, dmgMax: 14, atkSpd: 0.8, ranged: false, magic: false, twoHanded: false, range: 30 } },
  { id: 'spear', name: 'Spear', slot: 'weapon', size: [1, 4], stats: { str: 1 }, weapon: { type: 'spear', dmgMin: 7, dmgMax: 13, atkSpd: 1.3, ranged: false, magic: false, twoHanded: true, range: 45 } },
  { id: 'bow', name: 'Bow', slot: 'weapon', size: [2, 3], stats: { dex: 2 }, weapon: { type: 'bow', dmgMin: 10, dmgMax: 18, atkSpd: 1.3, ranged: true, magic: false, twoHanded: false, range: 200 } },
  { id: 'crossbow', name: 'Crossbow', slot: 'weapon', size: [2, 3], stats: { dex: 1 }, weapon: { type: 'crossbow', dmgMin: 16, dmgMax: 28, atkSpd: 0.8, ranged: true, magic: false, twoHanded: true, range: 200 } },
  { id: 'wand', name: 'Wand', slot: 'weapon', size: [1, 2], stats: { int: 2 }, weapon: { type: 'wand', dmgMin: 6, dmgMax: 12, atkSpd: 1.6, ranged: true, magic: true, twoHanded: false, range: 200 } },
  { id: 'staff', name: 'Staff', slot: 'weapon', size: [1, 4], stats: { int: 3 }, weapon: { type: 'staff', dmgMin: 14, dmgMax: 22, atkSpd: 0.9, ranged: true, magic: true, twoHanded: true, range: 200 } },
  { id: 'blowgun', name: 'Blowgun', slot: 'weapon', size: [1, 4], stats: { dex: 3 }, weapon: { type: 'blowgun', dmgMin: 3, dmgMax: 7, atkSpd: 1.9, ranged: true, magic: false, twoHanded: true, range: 300 } },
  { id: 'bardiche', name: 'Bardiche', slot: 'weapon', size: [2, 4], stats: { str: 2 }, weapon: { type: 'bardiche', dmgMin: 18, dmgMax: 30, atkSpd: 0.7, ranged: false, magic: false, twoHanded: true, range: 45 } },
  { id: 'spellbook', name: 'Spellbook', slot: 'weapon', size: [2, 2], stats: { int: 2, mana: 10 }, weapon: { type: 'spellbook', dmgMin: 8, dmgMax: 14, atkSpd: 1.2, ranged: true, magic: true, twoHanded: false, range: 200 } },
  { id: 'warpike', name: 'Warpike', slot: 'weapon', size: [1, 4], stats: { str: 1, dex: 1 }, weapon: { type: 'warpike', dmgMin: 12, dmgMax: 20, atkSpd: 1.0, ranged: false, magic: false, twoHanded: true, range: 45 } },
  { id: 'warfork', name: 'Warfork', slot: 'weapon', size: [1, 3], stats: { str: 1, dex: 1 }, weapon: { type: 'warfork', dmgMin: 8, dmgMax: 14, atkSpd: 1.2, ranged: false, magic: false, twoHanded: false, range: 30 } },
  { id: 'javelin', name: 'Javelin', slot: 'weapon', size: [1, 3], stats: { dex: 2 }, weapon: { type: 'javelin', dmgMin: 9, dmgMax: 15, atkSpd: 1.1, ranged: true, magic: false, twoHanded: false, range: 100 } },
];

export const ARMOR_BASES: BaseItem[] = [
  { id: 'helmet', name: 'Helmet', slot: 'helmet', size: [2, 2], stats: { armor: 4, vit: 1 } },
  { id: 'chest_armor', name: 'Chest Armor', slot: 'chest', size: [2, 3], stats: { armor: 10, vit: 1 } },
  { id: 'leather_armor', name: 'Leather Armor', slot: 'chest', size: [2, 3], stats: { armor: 6, dex: 1 } },
  { id: 'gauntlets', name: 'Gauntlets', slot: 'gloves', size: [2, 2], stats: { armor: 2, dex: 1 } },
  { id: 'boots', name: 'Boots', slot: 'boots', size: [2, 2], stats: { armor: 3, dex: 1, moveSpeed: 5 } },
];

export const ACCESSORY_BASES: BaseItem[] = [
  { id: 'ring', name: 'Ring', slot: 'ring', size: [1, 1], stats: { int: 1, mana: 10 } },
  { id: 'power_ring', name: 'Power Ring', slot: 'ring', size: [1, 1], stats: { str: 1, damage: 2 } },
  { id: 'belt', name: 'Belt', slot: 'belt', size: [1, 2], stats: { armor: 3, vit: 1 } },
  { id: 'war_belt', name: 'War Belt', slot: 'belt', size: [1, 2], stats: { armor: 6, str: 1, vit: 1 } },
  { id: 'amulet', name: 'Amulet', slot: 'amulet', size: [1, 1], stats: { int: 1, mana: 10 } },
  { id: 'jade_amulet', name: 'Jade Amulet', slot: 'amulet', size: [1, 1], stats: { vit: 1, armor: 2 } },
  // Shields: the round one is light, the heater blocks best, the tower keeps you alive, the energy shield feeds spells
  { id: 'wooden_shield_base', name: 'Round Shield', slot: 'shield', size: [2, 2], stats: { armor: 6, vit: 1, block: 8 } },
  { id: 'iron_shield', name: 'Heater Shield', slot: 'shield', size: [2, 2], stats: { armor: 12, str: 1, block: 15 } },
  { id: 'tower_shield', name: 'Tower Shield', slot: 'shield', size: [2, 3], stats: { armor: 16, block: 12, life: 15, hpRegen: 1 } },
  { id: 'energy_shield', name: 'Energy Shield', slot: 'shield', size: [2, 2], stats: { armor: 4, block: 6, mana: 15, manaRegen: 1 } },
  // Offhands: they take the shield's spot. A lantern or skull needs a one-handed weapon, a quiver a bow, a crossbow takes nothing.
  { id: 'lantern', name: 'Lantern', slot: 'shield', size: [1, 2], stats: { atkSpd: 0.1, moveSpeed: 5 }, offhand: 'lantern' },
  { id: 'skull', name: 'Skull', slot: 'shield', size: [2, 2], stats: { critChance: 3, critDamage: 15 }, offhand: 'skull' },
  { id: 'quiver', name: 'Quiver', slot: 'shield', size: [1, 3], stats: { critChance: 2, critDamage: 10, atkSpd: 0.1 }, offhand: 'quiver' },
];

/** Divine-only specials. They can drop at the divine weight and are never scaled down. */
export const SPECIAL_BASES: BaseItem[] = [
  { id: 'totem_of_swiftness', name: 'Totem of Swiftness', slot: 'totem', size: [1, 2], stats: { moveSpeed: 200 }, rarity: 'divine' },
  { id: 'rangers_relic', name: "Ranger's Relic", slot: 'relic', size: [1, 2], stats: { range: 100, projSpeed: 100 }, rarity: 'divine' },
  { id: 'fire_elemental_sword', name: 'Fire Elemental Sword', slot: 'weapon', size: [1, 3], stats: { critChance: 15, critDamage: 200, burnChance: 100 }, rarity: 'divine', weapon: { type: 'sword', dmgMin: 18, dmgMax: 30, atkSpd: 1.4, ranged: false, magic: false, twoHanded: false, range: 30 } },
  { id: 'vital_charm', name: 'Vital Charm', slot: 'charm', size: [1, 1], stats: { life: 500, mana: 500 }, rarity: 'divine' },
  { id: 'weak_amulet', name: 'Weak Amulet', slot: 'amulet', size: [1, 1], stats: {}, rolls: { critChance: [10, 20], critDamage: [30, 50] }, proc: { id: 'cry_of_the_weak', chance: 25 }, rarity: 'divine', reqLevel: 100 },
];

/**
 * Set pieces: fixed numbers like the divines, tuned for the levels their set
 * drops at. Pilgrim's Vestments (levels 5-15): a clear step over the first two
 * zones' white and blue gear, behind rares by Ashen Marsh.
 */
export const SET_BASES: BaseItem[] = [
  { id: 'pilgrim_cap', name: "Pilgrim's Cap", slot: 'helmet', size: [2, 2], stats: { armor: 10, vit: 3, life: 10 }, rarity: 'set', setId: 'pilgrim', reqLevel: 4, value: 120 },
  { id: 'pilgrim_coat', name: "Pilgrim's Coat", slot: 'chest', size: [2, 3], stats: { armor: 24, vit: 3, str: 2, hpRegen: 1 }, rarity: 'set', setId: 'pilgrim', reqLevel: 4, value: 200 },
  { id: 'pilgrim_gloves', name: "Pilgrim's Gloves", slot: 'gloves', size: [2, 2], stats: { armor: 6, int: 3, atkSpd: 0.1 }, rarity: 'set', setId: 'pilgrim', reqLevel: 4, value: 100 },
  { id: 'pilgrim_boots', name: "Pilgrim's Boots", slot: 'boots', size: [2, 2], stats: { armor: 8, dex: 3, moveSpeed: 10 }, rarity: 'set', setId: 'pilgrim', reqLevel: 4, value: 120 },
  // Prisoner's Nightmare (levels 12-20): handcuffs and a ball and chain. Slow and heavy, hits like a wall.
  { id: 'prisoner_cuffs', name: "Prisoner's Handcuffs", slot: 'gloves', size: [2, 2], stats: { armor: 8, str: 4, damage: 5 }, rarity: 'set', setId: 'prisoner', reqLevel: 12, value: 250 },
  { id: 'prisoner_ball', name: "Prisoner's Ball and Chain", slot: 'boots', size: [2, 2], stats: { armor: 14, vit: 4, life: 20 }, rarity: 'set', setId: 'prisoner', reqLevel: 12, value: 250 },
];

/** Starter gear: item level 1, common, worth nothing, named plainly after what it is. */
export const STARTER_ITEMS: BaseItem[] = [
  { id: 'wooden_sword', name: 'Sword', slot: 'weapon', size: [1, 3], stats: {}, noDrop: true, value: 0, weapon: { type: 'sword', dmgMin: 2, dmgMax: 5, atkSpd: 1.1, ranged: false, magic: false, twoHanded: false, range: 30 } },
  { id: 'wooden_shield', name: 'Shield', slot: 'shield', size: [2, 2], stats: { armor: 5, block: 25 }, noDrop: true, value: 0 },
  { id: 'wooden_staff', name: 'Staff', slot: 'weapon', size: [1, 4], stats: {}, noDrop: true, value: 0, weapon: { type: 'staff', dmgMin: 2, dmgMax: 4, atkSpd: 0.9, ranged: true, magic: true, twoHanded: true, range: 200 } },
  { id: 'wooden_bow', name: 'Bow', slot: 'weapon', size: [2, 3], stats: {}, noDrop: true, value: 0, weapon: { type: 'bow', dmgMin: 3, dmgMax: 6, atkSpd: 1.3, ranged: true, magic: false, twoHanded: false, range: 200 } },
  { id: 'starter_dagger', name: 'Dagger', slot: 'weapon', size: [1, 2], stats: { critChance: 10 }, noDrop: true, value: 0, weapon: { type: 'dagger', dmgMin: 1, dmgMax: 3, atkSpd: 2.0, ranged: false, magic: false, twoHanded: false, range: 25 } },
  { id: 'starter_spear', name: 'Spear', slot: 'weapon', size: [1, 4], stats: { str: 3 }, noDrop: true, value: 0, weapon: { type: 'spear', dmgMin: 7, dmgMax: 13, atkSpd: 1.3, ranged: false, magic: false, twoHanded: true, range: 45 } },
];

export const ALL_BASES: BaseItem[] = [...WEAPON_BASES, ...ARMOR_BASES, ...ACCESSORY_BASES, ...SPECIAL_BASES, ...SET_BASES, ...STARTER_ITEMS];

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
  { stat: 'damage', delta: 3, suffix: 'of Fury' },
  { stat: 'armor', delta: 6, suffix: 'of Warding' },
  { stat: 'str', delta: 1, suffix: 'of Strength' },
  { stat: 'dex', delta: 1, suffix: 'of Swiftness' },
  { stat: 'int', delta: 1, suffix: 'of Wisdom' },
  { stat: 'vit', delta: 1, suffix: 'of Endurance' },
  { stat: 'critChance', delta: 0.1, suffix: 'of Precision' },
  { stat: 'atkSpd', delta: 0.15, suffix: 'of Haste' },
];

export const ITEM_RULES = {
  /** Weapon damage, armour and block: mult = rarity.mult * (1 + (ilvl - 1) * levelScale) */
  levelScale: 0.12,
  /** Attribute bonuses: bonus = rarity.bonus * (1 + (ilvl - 1) * bonusLevelScale). A level 2 magic axe gives a point or two, a level 100 mythic one a dozen. */
  bonusLevelScale: 0.06,
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
