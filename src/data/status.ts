import type { Element } from './stats';

/** Base proc chances per element, in percent. Equipment can add to fire and poison. */
export const PROC_CHANCE: Record<Element, { burn?: number; slow?: number; freeze?: number; shock?: number; electrocute?: number; poison?: number }> = {
  physical: {},
  fire: { burn: 25 },
  cold: { slow: 10, freeze: 10 },
  lightning: { shock: 10, electrocute: 10 },
  poison: { poison: 25 },
};

export const STATUS_RULES = {
  slowFactor: 0.5,
  /** Poison: 5 ticks of 5% base damage, once per second. */
  poisonTicks: 5,
  poisonTickPct: 5,
  poisonInterval: 1000,
  /** Burn: 30 ticks of 1% base damage every 100 ms. */
  burnTicks: 30,
  burnTickPct: 1,
  burnInterval: 100,
  shockDuration: 1000,
  electrocuteBonusPct: 100,
  freezeDuration: 1500,
  slowDuration: 2000,
};

export const COMBAT_RULES = {
  armorConstant: 650,
  maxReductionPct: 75,
  baseCritChance: 5,
  baseCritDamage: 150,
  critPerDex: 0.07,
  moveSpeedPerDex: 0.1,
  dodgePerDex: 0.05,
  damagePerStr: 0.5,
  spellPerInt: 0.5,
  armorPerVit: 1,
  baseMoveSpeedPx: 145,
  minAtkSpd: 0.3,
  /** Dodge and block chance can never pass this, whatever the gear. */
  maxDodgePct: 75,
  maxBlockPct: 75,
  /** Melee reach in px with no weapon in hand, any class. */
  unarmedRange: 20,
  /** Attack speed from gear can add at most this share of the weapon's own rate (100 = double it). */
  maxGearAtkSpdPct: 100,
};
