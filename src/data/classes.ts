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
  /** Automatic growth per level. Zero for every class since 2026-09-28: levels give five free points instead. */
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
  /** When set, the only weapon types the class can equip. */
  allowedWeapons?: WeaponType[];
  /** False when the class cannot carry a shield (offhands are still fine). A pledge with `shields: true` lifts it. */
  shields?: boolean;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  knight: {
    id: 'knight',
    name: 'Knight',
    color: 0x5588cc,
    description: 'A stalwart warrior clad in heavy plate. Absorbs punishment while crushing enemies with sword and shield.',
    base: { str: 10, dex: 5, int: 5, vit: 10 },
    perLevel: { str: 0, dex: 0, int: 0, vit: 0 },
    baseHp: 100,
    baseMana: 100,
    hpPerVit: 10,
    manaPerInt: 10,
    startingGear: ['wooden_sword', 'wooden_shield'],
    pledges: ['paladin', 'titan', 'nightlord'],
    preferredWeapons: ['sword', 'mace', 'bardiche'],
    allowedWeapons: ['sword', 'mace', 'bardiche'],
  },
  sorcerer: {
    id: 'sorcerer',
    name: 'Sorcerer',
    color: 0xaa55ee,
    description: 'A master of arcane arts who bends elemental forces to devastating effect at range.',
    base: { str: 5, dex: 5, int: 10, vit: 10 },
    perLevel: { str: 0, dex: 0, int: 0, vit: 0 },
    baseHp: 100,
    baseMana: 100,
    hpPerVit: 10,
    manaPerInt: 10,
    startingGear: ['wooden_staff'],
    pledges: ['necromancer', 'stormsinger', 'wintercaller'],
    preferredWeapons: ['staff', 'wand', 'spellbook'],
  },
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    color: 0x44cc66,
    description: 'A swift shadow that strikes from range with deadly precision, weaving between foes.',
    base: { str: 10, dex: 10, int: 5, vit: 5 },
    perLevel: { str: 0, dex: 0, int: 0, vit: 0 },
    baseHp: 100,
    baseMana: 100,
    hpPerVit: 10,
    manaPerInt: 10,
    startingGear: ['wooden_bow'],
    startingBag: ['starter_dagger'],
    shields: false,
    pledges: ['quiverbound', 'impaler', 'silverblade'],
    preferredWeapons: ['bow', 'crossbow', 'dagger', 'blowgun', 'spear', 'warpike'],
  },
};

export const CLASS_LIST: ClassDef[] = [CLASSES.knight, CLASSES.sorcerer, CLASSES.rogue];

/** Per level: +5 stat points, +1 skill point, +1 passive point. Level 20 grants an ultimate point. */
export const LEVELING = {
  /**
   * The experience curve is built from a target time per level and the
   * experience a hero of that level earns per minute in a matching zone
   * (measured in the simulation with level-appropriate magic gear). Level 1
   * takes about a minute and a half with starter gear, the last levels about twenty.
   */
  minutesAtOne: 1.5,
  minutesPerLevel: 0.21,
  /** Experience per minute at level 1 and its growth per level, before the zone-level factor. */
  xpRateAtOne: 50,
  xpRatePerLevel: 6,
  xpRateCap: 400,
  /** Monster experience grows by this per zone level (mirrors MONSTER_RULES.xpPerLevel). */
  xpPerLevel: 0.15,
  statPointsPerLevel: 5,
  skillPointsPerLevel: 1,
  passivePointsPerLevel: 1,
  ultimatePointLevel: 20,
  /** The level at which a hero swears a pledge; play is held until they do. */
  pledgeLevel: 20,
  /** Player level at which each skill slot (after the basic attack) unlocks. */
  slotUnlockLevels: [1, 5, 10, 15, 20],
  maxLevel: 100,
};

/** Experience a hero of this level is expected to earn per minute in a zone of its own level. */
export function xpPerMinuteAt(level: number): number {
  const l = Math.max(1, level) - 1;
  return Math.min(LEVELING.xpRateCap, LEVELING.xpRateAtOne + LEVELING.xpRatePerLevel * l) * (1 + LEVELING.xpPerLevel * l);
}

/** How long a level is meant to take, in minutes of fighting. */
export function minutesForLevel(level: number): number {
  return LEVELING.minutesAtOne + LEVELING.minutesPerLevel * (Math.max(1, level) - 1);
}

/** Experience needed to leave the given level: the target minutes times the expected rate. */
export function xpForLevel(level: number): number {
  return Math.round(minutesForLevel(level) * xpPerMinuteAt(level));
}
