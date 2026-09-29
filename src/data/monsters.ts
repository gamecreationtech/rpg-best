import type { Element } from './stats';

/**
 * Monsters. Numbers are in pixels and milliseconds like the rest of the data;
 * the simulation converts. Each zone in `zones.ts` picks from this list with
 * its own weights, and a monster's level comes from the zone, not the hero.
 */

export type EnemyAi = 'melee' | 'ranged' | 'wanderer';

/** Which sprite sheet draws the monster. */
export type MonsterLook =
  | 'ghoul' | 'skeleton' | 'brute' | 'wraith'
  | 'bat' | 'spider' | 'archer' | 'rat'
  | 'crawler' | 'wisp' | 'troll'
  | 'frostwraith' | 'revenant' | 'golem' | 'necromancer';

export interface EnemyDef {
  id: string;
  name: string;
  look: MonsterLook;
  hp: number;
  damage: number;
  /** What its attacks deal. */
  element: Element;
  /** px per second */
  speed: number;
  xp: number;
  radius: number;
  ai: EnemyAi;
  attackRange: number;
  attackCooldown: number;
  dropChance: number;
  gold: [number, number];
  scale: number;
  /** Spawns in groups of this many. */
  pack: [number, number];
  /** Floats above the ground by this many pixels. */
  hover?: number;
  /** Casts its own light, in this colour. */
  glow?: number;
  /** Ranged monsters keep about this far away. */
  preferredRange?: number;
}

const M = (d: EnemyDef) => d;

export const MONSTERS: Record<string, EnemyDef> = {
  // Proving Grounds
  ghoul: M({ id: 'ghoul', name: 'Ghoul', look: 'ghoul', hp: 17, damage: 3, element: 'physical', speed: 95, xp: 2, radius: 11, ai: 'melee', attackRange: 28, attackCooldown: 900, dropChance: 22, gold: [1, 5], scale: 0.95, pack: [2, 3] }),
  skeleton: M({ id: 'skeleton', name: 'Skeleton', look: 'skeleton', hp: 21, damage: 6, element: 'physical', speed: 58, xp: 2, radius: 13, ai: 'melee', attackRange: 32, attackCooldown: 1400, dropChance: 28, gold: [2, 8], scale: 1, pack: [1, 2] }),
  wraith: M({ id: 'wraith', name: 'Wraith', look: 'wraith', hp: 19, damage: 9, element: 'physical', speed: 48, xp: 2, radius: 13, ai: 'ranged', attackRange: 260, attackCooldown: 2200, dropChance: 38, gold: [4, 12], scale: 1, pack: [1, 1], hover: 4, preferredRange: 195 }),
  brute: M({ id: 'brute', name: 'Brute', look: 'brute', hp: 35, damage: 14, element: 'physical', speed: 42, xp: 4, radius: 20, ai: 'melee', attackRange: 42, attackCooldown: 1800, dropChance: 45, gold: [15, 40], scale: 1.1, pack: [1, 1] }),

  // Cursed Hollow
  blood_bat: M({ id: 'blood_bat', name: 'Blood Bat', look: 'bat', hp: 13, damage: 3, element: 'physical', speed: 140, xp: 1, radius: 9, ai: 'melee', attackRange: 24, attackCooldown: 700, dropChance: 12, gold: [1, 3], scale: 1, pack: [3, 6], hover: 14 }),
  cave_spider: M({ id: 'cave_spider', name: 'Cave Spider', look: 'spider', hp: 19, damage: 5, element: 'poison', speed: 80, xp: 2, radius: 12, ai: 'melee', attackRange: 30, attackCooldown: 1100, dropChance: 26, gold: [2, 7], scale: 1, pack: [2, 3] }),
  bone_archer: M({ id: 'bone_archer', name: 'Bone Archer', look: 'archer', hp: 21, damage: 8, element: 'physical', speed: 52, xp: 2, radius: 13, ai: 'ranged', attackRange: 300, attackCooldown: 1900, dropChance: 34, gold: [3, 10], scale: 1, pack: [1, 2], preferredRange: 220 }),
  hollow_ghoul: M({ id: 'hollow_ghoul', name: 'Hollow Ghoul', look: 'ghoul', hp: 22, damage: 7, element: 'physical', speed: 100, xp: 2, radius: 11, ai: 'melee', attackRange: 28, attackCooldown: 850, dropChance: 24, gold: [2, 6], scale: 1, pack: [2, 4] }),

  // Ashen Marsh
  plague_rat: M({ id: 'plague_rat', name: 'Plague Rat', look: 'rat', hp: 15, damage: 4, element: 'poison', speed: 125, xp: 2, radius: 8, ai: 'melee', attackRange: 22, attackCooldown: 600, dropChance: 10, gold: [1, 3], scale: 1, pack: [4, 7] }),
  bog_crawler: M({ id: 'bog_crawler', name: 'Bog Crawler', look: 'crawler', hp: 33, damage: 12, element: 'poison', speed: 40, xp: 4, radius: 18, ai: 'melee', attackRange: 40, attackCooldown: 1600, dropChance: 40, gold: [8, 22], scale: 1, pack: [1, 1] }),
  marsh_wisp: M({ id: 'marsh_wisp', name: 'Marsh Wisp', look: 'wisp', hp: 18, damage: 11, element: 'lightning', speed: 70, xp: 2, radius: 9, ai: 'ranged', attackRange: 240, attackCooldown: 1700, dropChance: 30, gold: [4, 12], scale: 1, pack: [1, 2], hover: 16, glow: 0x8fffc0, preferredRange: 180 }),
  marsh_troll: M({ id: 'marsh_troll', name: 'Marsh Troll', look: 'troll', hp: 42, damage: 25, element: 'physical', speed: 46, xp: 5, radius: 22, ai: 'melee', attackRange: 46, attackCooldown: 2000, dropChance: 55, gold: [25, 60], scale: 1.2, pack: [1, 1] }),

  // Frozen Crypt
  frost_wraith: M({ id: 'frost_wraith', name: 'Frost Wraith', look: 'frostwraith', hp: 25, damage: 8, element: 'cold', speed: 55, xp: 3, radius: 13, ai: 'ranged', attackRange: 260, attackCooldown: 2000, dropChance: 40, gold: [6, 16], scale: 1, pack: [1, 2], hover: 4, glow: 0x9fe0ff, preferredRange: 190 }),
  revenant: M({ id: 'revenant', name: 'Revenant Knight', look: 'revenant', hp: 35, damage: 11, element: 'physical', speed: 60, xp: 4, radius: 14, ai: 'melee', attackRange: 36, attackCooldown: 1300, dropChance: 45, gold: [10, 30], scale: 1, pack: [1, 1] }),
  necromancer: M({ id: 'necromancer', name: 'Necromancer', look: 'necromancer', hp: 29, damage: 9, element: 'poison', speed: 50, xp: 3, radius: 13, ai: 'ranged', attackRange: 280, attackCooldown: 2400, dropChance: 50, gold: [12, 34], scale: 1, pack: [1, 1], preferredRange: 210 }),
  ice_golem: M({ id: 'ice_golem', name: 'Ice Golem', look: 'golem', hp: 46, damage: 18, element: 'cold', speed: 36, xp: 5, radius: 24, ai: 'melee', attackRange: 50, attackCooldown: 2300, dropChance: 70, gold: [40, 90], scale: 1.25, pack: [1, 1], glow: 0x7fd8ff }),

  // Ember Foundry
  cinder_bat: M({ id: 'cinder_bat', name: 'Cinder Bat', look: 'bat', hp: 19, damage: 4, element: 'fire', speed: 145, xp: 2, radius: 9, ai: 'melee', attackRange: 24, attackCooldown: 700, dropChance: 12, gold: [2, 5], scale: 1, pack: [3, 6], hover: 14, glow: 0xff7030 }),
  ash_ghoul: M({ id: 'ash_ghoul', name: 'Ash Ghoul', look: 'ghoul', hp: 24, damage: 5, element: 'fire', speed: 100, xp: 3, radius: 11, ai: 'melee', attackRange: 28, attackCooldown: 850, dropChance: 24, gold: [3, 8], scale: 1, pack: [2, 4] }),
  magma_imp: M({ id: 'magma_imp', name: 'Magma Imp', look: 'wisp', hp: 22, damage: 8, element: 'fire', speed: 70, xp: 2, radius: 9, ai: 'ranged', attackRange: 240, attackCooldown: 1700, dropChance: 30, gold: [5, 14], scale: 1, pack: [1, 2], hover: 12, glow: 0xff8040, preferredRange: 180 }),
  slag_brute: M({ id: 'slag_brute', name: 'Slag Brute', look: 'brute', hp: 38, damage: 11, element: 'fire', speed: 44, xp: 4, radius: 20, ai: 'melee', attackRange: 42, attackCooldown: 1800, dropChance: 45, gold: [18, 45], scale: 1.1, pack: [1, 1] }),
  forge_golem: M({ id: 'forge_golem', name: 'Forge Golem', look: 'golem', hp: 47, damage: 19, element: 'fire', speed: 36, xp: 5, radius: 24, ai: 'melee', attackRange: 50, attackCooldown: 2300, dropChance: 70, gold: [45, 100], scale: 1.25, pack: [1, 1], glow: 0xff6020 }),

  // Sunken Temple
  drowned: M({ id: 'drowned', name: 'Drowned', look: 'ghoul', hp: 23, damage: 4, element: 'cold', speed: 90, xp: 3, radius: 11, ai: 'melee', attackRange: 28, attackCooldown: 900, dropChance: 24, gold: [3, 8], scale: 1, pack: [2, 4] }),
  deep_spider: M({ id: 'deep_spider', name: 'Deep Spider', look: 'spider', hp: 22, damage: 4, element: 'poison', speed: 85, xp: 2, radius: 12, ai: 'melee', attackRange: 30, attackCooldown: 1100, dropChance: 26, gold: [3, 9], scale: 1, pack: [2, 3] }),
  tide_wraith: M({ id: 'tide_wraith', name: 'Tide Wraith', look: 'wraith', hp: 23, damage: 6, element: 'cold', speed: 50, xp: 3, radius: 13, ai: 'ranged', attackRange: 260, attackCooldown: 2100, dropChance: 38, gold: [5, 14], scale: 1, pack: [1, 1], hover: 4, preferredRange: 195 }),
  temple_guardian: M({ id: 'temple_guardian', name: 'Temple Guardian', look: 'revenant', hp: 36, damage: 12, element: 'physical', speed: 58, xp: 4, radius: 14, ai: 'melee', attackRange: 36, attackCooldown: 1300, dropChance: 45, gold: [12, 34], scale: 1, pack: [1, 1] }),
  sunken_troll: M({ id: 'sunken_troll', name: 'Sunken Troll', look: 'troll', hp: 43, damage: 14, element: 'cold', speed: 46, xp: 5, radius: 22, ai: 'melee', attackRange: 46, attackCooldown: 2000, dropChance: 55, gold: [28, 66], scale: 1.2, pack: [1, 1] }),

  // Blighted Orchard
  orchard_rat: M({ id: 'orchard_rat', name: 'Orchard Rat', look: 'rat', hp: 18, damage: 3, element: 'poison', speed: 125, xp: 2, radius: 8, ai: 'melee', attackRange: 22, attackCooldown: 600, dropChance: 10, gold: [2, 4], scale: 1, pack: [4, 7] }),
  blighted_ghoul: M({ id: 'blighted_ghoul', name: 'Blighted Ghoul', look: 'ghoul', hp: 24, damage: 4, element: 'poison', speed: 100, xp: 3, radius: 11, ai: 'melee', attackRange: 28, attackCooldown: 850, dropChance: 24, gold: [3, 9], scale: 1, pack: [2, 4] }),
  plague_archer: M({ id: 'plague_archer', name: 'Plague Archer', look: 'archer', hp: 23, damage: 5, element: 'poison', speed: 52, xp: 3, radius: 13, ai: 'ranged', attackRange: 300, attackCooldown: 1900, dropChance: 34, gold: [4, 12], scale: 1, pack: [1, 2], preferredRange: 220 }),
  blight_crawler: M({ id: 'blight_crawler', name: 'Blight Crawler', look: 'crawler', hp: 34, damage: 6, element: 'poison', speed: 40, xp: 4, radius: 18, ai: 'melee', attackRange: 40, attackCooldown: 1600, dropChance: 40, gold: [10, 26], scale: 1, pack: [1, 1] }),
  rot_troll: M({ id: 'rot_troll', name: 'Rot Troll', look: 'troll', hp: 43, damage: 13, element: 'poison', speed: 46, xp: 5, radius: 22, ai: 'melee', attackRange: 46, attackCooldown: 2000, dropChance: 55, gold: [30, 70], scale: 1.2, pack: [1, 1] }),

  // Obsidian Halls
  crypt_bat: M({ id: 'crypt_bat', name: 'Crypt Bat', look: 'bat', hp: 19, damage: 3, element: 'physical', speed: 140, xp: 2, radius: 9, ai: 'melee', attackRange: 24, attackCooldown: 700, dropChance: 12, gold: [2, 5], scale: 1, pack: [3, 6], hover: 14 }),
  storm_wisp: M({ id: 'storm_wisp', name: 'Storm Wisp', look: 'wisp', hp: 22, damage: 6, element: 'lightning', speed: 72, xp: 2, radius: 9, ai: 'ranged', attackRange: 240, attackCooldown: 1700, dropChance: 30, gold: [5, 14], scale: 1, pack: [1, 2], hover: 16, glow: 0xc0a0ff, preferredRange: 180 }),
  obsidian_knight: M({ id: 'obsidian_knight', name: 'Obsidian Knight', look: 'revenant', hp: 37, damage: 10, element: 'physical', speed: 60, xp: 4, radius: 14, ai: 'melee', attackRange: 36, attackCooldown: 1300, dropChance: 45, gold: [14, 38], scale: 1, pack: [1, 2] }),
  void_necromancer: M({ id: 'void_necromancer', name: 'Void Necromancer', look: 'necromancer', hp: 30, damage: 8, element: 'poison', speed: 50, xp: 3, radius: 13, ai: 'ranged', attackRange: 280, attackCooldown: 2400, dropChance: 50, gold: [15, 40], scale: 1, pack: [1, 1], preferredRange: 210 }),
  obsidian_golem: M({ id: 'obsidian_golem', name: 'Obsidian Golem', look: 'golem', hp: 48, damage: 15, element: 'physical', speed: 36, xp: 5, radius: 24, ai: 'melee', attackRange: 50, attackCooldown: 2300, dropChance: 70, gold: [50, 110], scale: 1.25, pack: [1, 1], glow: 0x8060ff }),

  // Storm Peaks
  thunder_bat: M({ id: 'thunder_bat', name: 'Thunder Bat', look: 'bat', hp: 21, damage: 3, element: 'lightning', speed: 150, xp: 2, radius: 9, ai: 'melee', attackRange: 24, attackCooldown: 700, dropChance: 12, gold: [2, 6], scale: 1, pack: [3, 6], hover: 14, glow: 0xd0d0ff }),
  frost_skeleton: M({ id: 'frost_skeleton', name: 'Frost Skeleton', look: 'skeleton', hp: 23, damage: 3, element: 'cold', speed: 58, xp: 3, radius: 13, ai: 'melee', attackRange: 32, attackCooldown: 1400, dropChance: 28, gold: [3, 10], scale: 1, pack: [2, 3] }),
  sky_archer: M({ id: 'sky_archer', name: 'Sky Archer', look: 'archer', hp: 24, damage: 4, element: 'lightning', speed: 54, xp: 3, radius: 13, ai: 'ranged', attackRange: 300, attackCooldown: 1900, dropChance: 34, gold: [5, 14], scale: 1, pack: [1, 2], preferredRange: 220 }),
  storm_wraith: M({ id: 'storm_wraith', name: 'Storm Wraith', look: 'frostwraith', hp: 27, damage: 6, element: 'lightning', speed: 56, xp: 3, radius: 13, ai: 'ranged', attackRange: 260, attackCooldown: 2000, dropChance: 40, gold: [8, 20], scale: 1, pack: [1, 2], hover: 4, glow: 0xe0e0ff, preferredRange: 190 }),
  peak_brute: M({ id: 'peak_brute', name: 'Peak Brute', look: 'brute', hp: 39, damage: 8, element: 'physical', speed: 44, xp: 4, radius: 20, ai: 'melee', attackRange: 42, attackCooldown: 1800, dropChance: 45, gold: [20, 50], scale: 1.1, pack: [1, 1] }),

  // The Abyss
  abyss_ghoul: M({ id: 'abyss_ghoul', name: 'Abyss Ghoul', look: 'ghoul', hp: 25, damage: 4, element: 'physical', speed: 105, xp: 3, radius: 11, ai: 'melee', attackRange: 28, attackCooldown: 850, dropChance: 24, gold: [4, 10], scale: 1, pack: [3, 5] }),
  abyss_spider: M({ id: 'abyss_spider', name: 'Abyss Spider', look: 'spider', hp: 23, damage: 3, element: 'poison', speed: 85, xp: 3, radius: 12, ai: 'melee', attackRange: 30, attackCooldown: 1100, dropChance: 26, gold: [4, 10], scale: 1, pack: [2, 4] }),
  void_wraith: M({ id: 'void_wraith', name: 'Void Wraith', look: 'wraith', hp: 25, damage: 6, element: 'cold', speed: 52, xp: 3, radius: 13, ai: 'ranged', attackRange: 260, attackCooldown: 2100, dropChance: 38, gold: [6, 16], scale: 1, pack: [1, 2], hover: 4, preferredRange: 195 }),
  abyss_necromancer: M({ id: 'abyss_necromancer', name: 'Abyss Necromancer', look: 'necromancer', hp: 31, damage: 7, element: 'poison', speed: 50, xp: 3, radius: 13, ai: 'ranged', attackRange: 280, attackCooldown: 2400, dropChance: 50, gold: [16, 44], scale: 1, pack: [1, 1], preferredRange: 210 }),
  abyssal_horror: M({ id: 'abyssal_horror', name: 'Abyssal Horror', look: 'troll', hp: 44, damage: 10, element: 'physical', speed: 48, xp: 5, radius: 22, ai: 'melee', attackRange: 46, attackCooldown: 2000, dropChance: 55, gold: [34, 80], scale: 1.25, pack: [1, 1] }),
  doom_golem: M({ id: 'doom_golem', name: 'Doom Golem', look: 'golem', hp: 49, damage: 14, element: 'fire', speed: 36, xp: 5, radius: 24, ai: 'melee', attackRange: 50, attackCooldown: 2300, dropChance: 70, gold: [55, 120], scale: 1.3, pack: [1, 1], glow: 0xff3030 }),

  // Throne of the Fallen
  fallen_archer: M({ id: 'fallen_archer', name: 'Fallen Archer', look: 'archer', hp: 25, damage: 4, element: 'physical', speed: 54, xp: 3, radius: 13, ai: 'ranged', attackRange: 300, attackCooldown: 1900, dropChance: 34, gold: [6, 16], scale: 1, pack: [1, 2], preferredRange: 220 }),
  ember_wisp: M({ id: 'ember_wisp', name: 'Ember Wisp', look: 'wisp', hp: 24, damage: 6, element: 'fire', speed: 72, xp: 3, radius: 9, ai: 'ranged', attackRange: 240, attackCooldown: 1700, dropChance: 30, gold: [6, 16], scale: 1, pack: [1, 2], hover: 16, glow: 0xffb040, preferredRange: 180 }),
  fallen_knight: M({ id: 'fallen_knight', name: 'Fallen Knight', look: 'revenant', hp: 39, damage: 8, element: 'physical', speed: 60, xp: 4, radius: 14, ai: 'melee', attackRange: 36, attackCooldown: 1300, dropChance: 45, gold: [18, 46], scale: 1, pack: [1, 2] }),
  royal_necromancer: M({ id: 'royal_necromancer', name: 'Royal Necromancer', look: 'necromancer', hp: 32, damage: 6, element: 'poison', speed: 50, xp: 4, radius: 13, ai: 'ranged', attackRange: 280, attackCooldown: 2400, dropChance: 50, gold: [18, 48], scale: 1, pack: [1, 1], preferredRange: 210 }),
  throne_golem: M({ id: 'throne_golem', name: 'Throne Golem', look: 'golem', hp: 50, damage: 14, element: 'physical', speed: 36, xp: 6, radius: 24, ai: 'melee', attackRange: 50, attackCooldown: 2300, dropChance: 70, gold: [60, 140], scale: 1.3, pack: [1, 1], glow: 0xffc040 }),
};

/**
 * How a monster's numbers grow with its zone's level. Base damage is kept
 * roughly flat across zones (regulars 3-10, heavies up to 20) so this growth
 * is the only ramp; heroes grow only through the five points a level and gear.
 */
export const MONSTER_RULES = {
  /** Monsters ignore the hero beyond this many px until hit. */
  aggroRange: 300,
  /** Hitting a monster also wakes every monster within this many px of it. */
  alertRange: 100,
  hpPerLevel: 0.12,
  dmgPerLevel: 0.055,
  /** Past the hero's level cap (the difficulty page) life compounds so that level 1000 has `lifeAtInferno` times level 1 life; damage adds this much of the base per level. */
  beyondLevel: 100,
  infernoLevel: 1000,
  lifeAtInferno: 26000,
  beyondDmgPerLevel: 0.1,
  xpPerLevel: 0.15,
  goldPerLevel: 0.08,
};

/**
 * Life and damage multipliers for a monster of this level. Every monster is a
 * level 1 creature (13-50 life, 3-25 damage): its zone's level does all the
 * growing. Life grows +12% of the base per level to the hero cap, then
 * compounds so that level 1000 has 26,000 times its level 1 life (338,000 to
 * 1,300,000). Damage grows +5.5% per level to the cap, then +10% per level.
 */
export function monsterScale(level: number): { hp: number; dmg: number } {
  const r = MONSTER_RULES;
  const base = Math.min(level, r.beyondLevel) - 1;
  const beyond = Math.max(0, level - r.beyondLevel);
  const hpAtCap = 1 + r.hpPerLevel * (r.beyondLevel - 1);
  const rate = Math.pow(r.lifeAtInferno / hpAtCap, 1 / (r.infernoLevel - r.beyondLevel));
  return { hp: (1 + r.hpPerLevel * base) * Math.pow(rate, beyond), dmg: 1 + r.dmgPerLevel * base + r.beyondDmgPerLevel * beyond };
}
