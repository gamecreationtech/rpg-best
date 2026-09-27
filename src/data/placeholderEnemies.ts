/**
 * PLACEHOLDER enemies for the Proving Grounds, so the combat, XP and loot loop can
 * be tested before the real monster data arrives. Replace this file when it does.
 * Visuals reuse the showcase recipes by `recipeId`.
 */
export type EnemyAi = 'melee' | 'ranged' | 'wanderer';

export interface EnemyDef {
  id: string;
  name: string;
  recipeId: 'ghoul' | 'skeleton' | 'brute' | 'wraith';
  hp: number;
  damage: number;
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
}

export const PLACEHOLDER_ENEMIES: EnemyDef[] = [
  { id: 'ghoul', name: 'Ghoul', recipeId: 'ghoul', hp: 22, damage: 4, speed: 95, xp: 2, radius: 11, ai: 'melee', attackRange: 28, attackCooldown: 900, dropChance: 22, gold: [1, 5], scale: 0.95 },
  { id: 'skeleton', name: 'Skeleton', recipeId: 'skeleton', hp: 35, damage: 6, speed: 58, xp: 3, radius: 13, ai: 'melee', attackRange: 32, attackCooldown: 1400, dropChance: 28, gold: [2, 8], scale: 1 },
  { id: 'wraith', name: 'Wraith', recipeId: 'wraith', hp: 28, damage: 9, speed: 48, xp: 4, radius: 13, ai: 'ranged', attackRange: 260, attackCooldown: 2200, dropChance: 38, gold: [4, 12], scale: 1 },
  { id: 'brute', name: 'Brute', recipeId: 'brute', hp: 220, damage: 18, speed: 42, xp: 20, radius: 20, ai: 'melee', attackRange: 42, attackCooldown: 1800, dropChance: 45, gold: [15, 40], scale: 1.1 },
];

/** Spawn weights and level scaling for the placeholder area. */
export const PROVING_GROUNDS = {
  name: 'Proving Grounds',
  spawnWeights: { ghoul: 40, skeleton: 35, wraith: 18, brute: 7 } as Record<string, number>,
  maxAlive: 40,
  spawnInterval: 1.6,
  /** Enemies scale with the player: hp and damage grow per player level. */
  hpPerLevel: 0.18,
  dmgPerLevel: 0.12,
  xpPerLevel: 0.15,
  rangedPreferredRange: 195,
};
