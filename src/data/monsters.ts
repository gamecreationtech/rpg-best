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
  ghoul: M({ id: 'ghoul', name: 'Ghoul', look: 'ghoul', hp: 22, damage: 4, element: 'physical', speed: 95, xp: 2, radius: 11, ai: 'melee', attackRange: 28, attackCooldown: 900, dropChance: 22, gold: [1, 5], scale: 0.95, pack: [2, 4] }),
  skeleton: M({ id: 'skeleton', name: 'Skeleton', look: 'skeleton', hp: 35, damage: 6, element: 'physical', speed: 58, xp: 3, radius: 13, ai: 'melee', attackRange: 32, attackCooldown: 1400, dropChance: 28, gold: [2, 8], scale: 1, pack: [1, 2] }),
  wraith: M({ id: 'wraith', name: 'Wraith', look: 'wraith', hp: 28, damage: 9, element: 'physical', speed: 48, xp: 4, radius: 13, ai: 'ranged', attackRange: 260, attackCooldown: 2200, dropChance: 38, gold: [4, 12], scale: 1, pack: [1, 1], hover: 4, preferredRange: 195 }),
  brute: M({ id: 'brute', name: 'Brute', look: 'brute', hp: 220, damage: 18, element: 'physical', speed: 42, xp: 20, radius: 20, ai: 'melee', attackRange: 42, attackCooldown: 1800, dropChance: 45, gold: [15, 40], scale: 1.1, pack: [1, 1] }),

  // Cursed Hollow
  blood_bat: M({ id: 'blood_bat', name: 'Blood Bat', look: 'bat', hp: 14, damage: 3, element: 'physical', speed: 140, xp: 2, radius: 9, ai: 'melee', attackRange: 24, attackCooldown: 700, dropChance: 12, gold: [1, 3], scale: 1, pack: [3, 6], hover: 14 }),
  cave_spider: M({ id: 'cave_spider', name: 'Cave Spider', look: 'spider', hp: 30, damage: 5, element: 'poison', speed: 80, xp: 4, radius: 12, ai: 'melee', attackRange: 30, attackCooldown: 1100, dropChance: 26, gold: [2, 7], scale: 1, pack: [2, 3] }),
  bone_archer: M({ id: 'bone_archer', name: 'Bone Archer', look: 'archer', hp: 34, damage: 8, element: 'physical', speed: 52, xp: 5, radius: 13, ai: 'ranged', attackRange: 300, attackCooldown: 1900, dropChance: 34, gold: [3, 10], scale: 1, pack: [1, 2], preferredRange: 220 }),
  hollow_ghoul: M({ id: 'hollow_ghoul', name: 'Hollow Ghoul', look: 'ghoul', hp: 40, damage: 7, element: 'physical', speed: 100, xp: 4, radius: 11, ai: 'melee', attackRange: 28, attackCooldown: 850, dropChance: 24, gold: [2, 6], scale: 1, pack: [2, 4] }),

  // Ashen Marsh
  plague_rat: M({ id: 'plague_rat', name: 'Plague Rat', look: 'rat', hp: 18, damage: 4, element: 'poison', speed: 125, xp: 2, radius: 8, ai: 'melee', attackRange: 22, attackCooldown: 600, dropChance: 10, gold: [1, 3], scale: 1, pack: [4, 7] }),
  bog_crawler: M({ id: 'bog_crawler', name: 'Bog Crawler', look: 'crawler', hp: 140, damage: 12, element: 'poison', speed: 40, xp: 12, radius: 18, ai: 'melee', attackRange: 40, attackCooldown: 1600, dropChance: 40, gold: [8, 22], scale: 1, pack: [1, 1] }),
  marsh_wisp: M({ id: 'marsh_wisp', name: 'Marsh Wisp', look: 'wisp', hp: 26, damage: 11, element: 'lightning', speed: 70, xp: 6, radius: 9, ai: 'ranged', attackRange: 240, attackCooldown: 1700, dropChance: 30, gold: [4, 12], scale: 1, pack: [1, 2], hover: 16, glow: 0x8fffc0, preferredRange: 180 }),
  marsh_troll: M({ id: 'marsh_troll', name: 'Marsh Troll', look: 'troll', hp: 420, damage: 26, element: 'physical', speed: 46, xp: 40, radius: 22, ai: 'melee', attackRange: 46, attackCooldown: 2000, dropChance: 55, gold: [25, 60], scale: 1.2, pack: [1, 1] }),

  // Frozen Crypt
  frost_wraith: M({ id: 'frost_wraith', name: 'Frost Wraith', look: 'frostwraith', hp: 60, damage: 16, element: 'cold', speed: 55, xp: 10, radius: 13, ai: 'ranged', attackRange: 260, attackCooldown: 2000, dropChance: 40, gold: [6, 16], scale: 1, pack: [1, 2], hover: 4, glow: 0x9fe0ff, preferredRange: 190 }),
  revenant: M({ id: 'revenant', name: 'Revenant Knight', look: 'revenant', hp: 180, damage: 22, element: 'physical', speed: 60, xp: 22, radius: 14, ai: 'melee', attackRange: 36, attackCooldown: 1300, dropChance: 45, gold: [10, 30], scale: 1, pack: [1, 2] }),
  necromancer: M({ id: 'necromancer', name: 'Necromancer', look: 'necromancer', hp: 90, damage: 18, element: 'poison', speed: 50, xp: 18, radius: 13, ai: 'ranged', attackRange: 280, attackCooldown: 2400, dropChance: 50, gold: [12, 34], scale: 1, pack: [1, 1], preferredRange: 210 }),
  ice_golem: M({ id: 'ice_golem', name: 'Ice Golem', look: 'golem', hp: 700, damage: 34, element: 'cold', speed: 36, xp: 70, radius: 24, ai: 'melee', attackRange: 50, attackCooldown: 2300, dropChance: 70, gold: [40, 90], scale: 1.25, pack: [1, 1], glow: 0x7fd8ff }),
};

/** How a monster's numbers grow with its zone's level. */
export const MONSTER_RULES = {
  hpPerLevel: 0.18,
  dmgPerLevel: 0.12,
  xpPerLevel: 0.15,
  goldPerLevel: 0.08,
};
