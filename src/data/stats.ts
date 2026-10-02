export type Element = 'physical' | 'fire' | 'cold' | 'lightning' | 'poison';
export const ELEMENTS: Element[] = ['physical', 'fire', 'cold', 'lightning', 'poison'];

export const ELEMENT_COLORS: Record<Element, number> = {
  physical: 0xd8d0c0,
  fire: 0xff7a2a,
  cold: 0x7fd8ff,
  lightning: 0xa8c8ff,
  poison: 0x66e070,
};

/** Every stat an item, passive or buff can carry. */
export type StatKey =
  | 'str' | 'dex' | 'int' | 'vit'
  | 'life' | 'mana' | 'armor' | 'damage' | 'spellDmg'
  | 'atkSpd' | 'critChance' | 'critDamage' | 'dodge' | 'block'
  | 'moveSpeed' | 'range' | 'projSpeed' | 'pierce'
  | 'lifeOnHit' | 'manaOnHit' | 'lifeSteal' | 'hpRegen' | 'manaRegen'
  | 'fasterCast' | 'cdr' | 'magicFind' | 'goldFind' | 'itemFind'
  | 'fireRes' | 'coldRes' | 'lightningRes' | 'poisonRes' | 'allResists'
  | 'burnChance' | 'poisonChance'
  /** Passive-only stats (producer's list, 2026-10-02): a point on every attribute, attack speed as a percent, extra projectiles, pledge-skill damage, an energy shield as a share of life, summon life, and chances to shock, freeze or slow on hit. */
  | 'allStats' | 'atkSpdPct' | 'split' | 'pledgeDmgPct' | 'energyShieldPct' | 'summonLifePct' | 'shockChance' | 'freezeChance' | 'slowChance';

export interface StatDef {
  name: string;
  /** How the number is shown: flat, percent, or per second. */
  format: 'flat' | 'pct' | 'perSec' | 'mult';
}

export const STAT_DEFS: Record<StatKey, StatDef> = {
  str: { name: 'Strength', format: 'flat' },
  dex: { name: 'Dexterity', format: 'flat' },
  int: { name: 'Intelligence', format: 'flat' },
  vit: { name: 'Endurance', format: 'flat' },
  life: { name: 'Life', format: 'flat' },
  mana: { name: 'Mana', format: 'flat' },
  armor: { name: 'Armor', format: 'flat' },
  damage: { name: 'Damage', format: 'flat' },
  spellDmg: { name: 'Spell Damage', format: 'flat' },
  atkSpd: { name: 'Attack Speed', format: 'mult' },
  critChance: { name: 'Critical Chance', format: 'pct' },
  critDamage: { name: 'Critical Damage', format: 'pct' },
  dodge: { name: 'Dodge', format: 'pct' },
  block: { name: 'Block Chance', format: 'pct' },
  moveSpeed: { name: 'Movement Speed', format: 'pct' },
  range: { name: 'Range', format: 'flat' },
  projSpeed: { name: 'Projectile Speed', format: 'pct' },
  pierce: { name: 'Pierce', format: 'flat' },
  lifeOnHit: { name: 'Life on Hit', format: 'flat' },
  manaOnHit: { name: 'Mana on Hit', format: 'flat' },
  lifeSteal: { name: 'Life Steal', format: 'pct' },
  hpRegen: { name: 'Life Regeneration', format: 'perSec' },
  manaRegen: { name: 'Mana Regeneration', format: 'perSec' },
  fasterCast: { name: 'Faster Cast Rate', format: 'pct' },
  cdr: { name: 'Cooldown Reduction', format: 'pct' },
  magicFind: { name: 'Magic Find', format: 'pct' },
  goldFind: { name: 'Gold Find', format: 'pct' },
  itemFind: { name: 'Item Find', format: 'pct' },
  fireRes: { name: 'Fire Resistance', format: 'pct' },
  coldRes: { name: 'Cold Resistance', format: 'pct' },
  lightningRes: { name: 'Lightning Resistance', format: 'pct' },
  poisonRes: { name: 'Poison Resistance', format: 'pct' },
  allResists: { name: 'All Resistances', format: 'pct' },
  burnChance: { name: 'Burn Chance', format: 'pct' },
  poisonChance: { name: 'Poison Chance', format: 'pct' },
  allStats: { name: 'to All Attributes', format: 'flat' },
  atkSpdPct: { name: 'Attack Speed', format: 'pct' },
  split: { name: 'Projectile Split', format: 'flat' },
  pledgeDmgPct: { name: 'Pledge Skill Damage', format: 'pct' },
  energyShieldPct: { name: 'of Life as Energy Shield', format: 'pct' },
  summonLifePct: { name: 'Summon Life', format: 'pct' },
  shockChance: { name: 'Shock Chance', format: 'pct' },
  freezeChance: { name: 'Freeze Chance', format: 'pct' },
  slowChance: { name: 'Slow Chance', format: 'pct' },
};

export type StatMap = Partial<Record<StatKey, number>>;

export function formatStat(key: StatKey, value: number): string {
  const def = STAT_DEFS[key];
  const sign = value >= 0 ? '+' : '';
  switch (def.format) {
    case 'pct':
      return `${sign}${round1(value)}% ${def.name}`;
    case 'perSec':
      return `${sign}${round1(value)} ${def.name} per second`;
    case 'mult':
      return `${sign}${round1(value)} ${def.name}`;
    default:
      return `${sign}${Math.round(value)} ${def.name}`;
  }
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function addStats(target: StatMap, source: StatMap, scale = 1): void {
  for (const k in source) {
    const key = k as StatKey;
    target[key] = (target[key] ?? 0) + (source[key] ?? 0) * scale;
  }
}
