import type { WeaponType } from './items';

export type ClassId = 'knight' | 'sorcerer' | 'rogue';

export interface BaseStats {
  str: number;
  dex: number;
  int: number;
  vit: number;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  color: number;
  description: string;
  base: BaseStats;
  perLevel: BaseStats;
  baseHp: number;
  baseMana: number;
  hpPerVit: number;
  manaPerInt: number;
  /** Starter item ids from `STARTER_ITEMS`, worn from the start. */
  startingGear: string[];
  /** Starter item ids that begin in the bag instead. */
  startingBag?: string[];
  pledges: string[];
  /** Weapon families this class fights with; others still work but look odd. */
  preferredWeapons: WeaponType[];
}

export const CLASSES: Record<ClassId, ClassDef> = {
  knight: {
    id: 'knight',
    name: 'Knight',
    color: 0x5588cc,
    description: 'A stalwart warrior clad in heavy plate. Absorbs punishment while crushing enemies with sword and shield.',
    base: { str: 10, dex: 5, int: 5, vit: 10 },
    perLevel: { str: 2, dex: 0, int: 0, vit: 3 },
    baseHp: 100,
    baseMana: 100,
    hpPerVit: 10,
    manaPerInt: 10,
    startingGear: ['wooden_sword', 'wooden_shield'],
    pledges: ['paladin', 'titan', 'nightlord'],
    preferredWeapons: ['sword', 'axe', 'mace', 'spear'],
  },
  sorcerer: {
    id: 'sorcerer',
    name: 'Sorcerer',
    color: 0xaa55ee,
    description: 'A master of arcane arts who bends elemental forces to devastating effect at range.',
    base: { str: 5, dex: 5, int: 10, vit: 10 },
    perLevel: { str: 0, dex: 0, int: 4, vit: 1 },
    baseHp: 100,
    baseMana: 100,
    hpPerVit: 10,
    manaPerInt: 10,
    startingGear: ['wooden_staff'],
    pledges: ['necromancer', 'stormsinger', 'wintercaller'],
    preferredWeapons: ['staff', 'wand'],
  },
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    color: 0x44cc66,
    description: 'A swift shadow that strikes from range with deadly precision, weaving between foes.',
    base: { str: 10, dex: 10, int: 5, vit: 5 },
    perLevel: { str: 0, dex: 4, int: 0, vit: 1 },
    baseHp: 100,
    baseMana: 100,
    hpPerVit: 10,
    manaPerInt: 10,
    startingGear: ['wooden_bow'],
    startingBag: ['starter_dagger'],
    pledges: ['quiverbound', 'impaler', 'silverblade'],
    preferredWeapons: ['bow', 'crossbow', 'dagger', 'blowgun', 'spear'],
  },
};

export const CLASS_LIST: ClassDef[] = [CLASSES.knight, CLASSES.sorcerer, CLASSES.rogue];

/** Per level: +5 stat points, +1 skill point, +1 passive point. Level 20 grants an ultimate point. */
export const LEVELING = {
  xpStart: 60,
  xpGrowth: 1.45,
  statPointsPerLevel: 5,
  skillPointsPerLevel: 1,
  passivePointsPerLevel: 1,
  ultimatePointLevel: 20,
  /** The level at which a hero swears a pledge; play is held until they do. */
  pledgeLevel: 20,
  /** Player level at which each skill slot (after the basic attack) unlocks. */
  slotUnlockLevels: [1, 5, 10, 15, 20],
  maxLevel: 70,
};
