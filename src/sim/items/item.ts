import { AFFIX_POOL, ALL_BASES, ITEM_RULES, RARITIES, RARITY_ORDER, SPECIAL_BASES, baseItem, type BaseItem, type EquipSlot, type Rarity, type WeaponProps } from '../../data/items';
import type { StatKey, StatMap } from '../../data/stats';
import type { Rng } from '../../gen/rng';

export interface ForgeStacks {
  dmg: number;
  spd: number;
  block: number;
  armor: number;
}

export interface Item {
  uid: number;
  baseId: string;
  name: string;
  slot: EquipSlot;
  rarity: Rarity;
  ilvl: number;
  reqLevel: number;
  size: [number, number];
  stats: StatMap;
  weapon?: WeaponProps;
  affixes: string[];
  forge: ForgeStacks;
  value: number;
  /** Grid position while in an inventory or stash. */
  col: number;
  row: number;
}

let nextUid = 1;
export function resetItemUids(from: number): void {
  nextUid = from;
}
export function peekItemUid(): number {
  return nextUid;
}

export function itemValue(rarity: Rarity, size: [number, number], ilvl: number): number {
  return Math.round(RARITIES[rarity].gold * size[0] * size[1] * (1 + (ilvl - 1) * ITEM_RULES.valueScale));
}

export function statMultiplier(rarity: Rarity, ilvl: number): number {
  return RARITIES[rarity].mult * (1 + (ilvl - 1) * ITEM_RULES.levelScale);
}

/** Small decimal stats keep their precision; everything else rounds to whole numbers. */
const DECIMAL_STATS: StatKey[] = ['atkSpd', 'critChance', 'lifeSteal', 'dodge'];

function scaleStat(key: StatKey, value: number, mult: number): number {
  const v = value * mult;
  return DECIMAL_STATS.includes(key) ? Math.round(v * 100) / 100 : Math.round(v);
}

export function reqLevelFor(ilvl: number): number {
  return Math.max(1, Math.round(ilvl * 0.8));
}

/** Builds an item from a base definition at a rarity and item level. */
export function makeItem(base: BaseItem, rarity: Rarity, ilvl: number, rng: Rng | null): Item {
  const mult = base.noDrop ? 1 : statMultiplier(rarity, ilvl);
  const stats: StatMap = {};
  for (const k in base.stats) {
    const key = k as StatKey;
    stats[key] = scaleStat(key, base.stats[key]!, mult);
  }
  const affixes: string[] = [];
  if (rng && RARITIES[rarity].affixes > 0) {
    const pool = [...AFFIX_POOL];
    for (let i = 0; i < RARITIES[rarity].affixes && pool.length; i++) {
      const idx = rng.int(0, pool.length - 1);
      const affix = pool.splice(idx, 1)[0]!;
      stats[affix.stat] = (stats[affix.stat] ?? 0) + scaleStat(affix.stat as StatKey, affix.delta, mult);
      affixes.push(affix.suffix);
    }
  }
  const weapon = base.weapon
    ? { ...base.weapon, dmgMin: Math.max(1, Math.round(base.weapon.dmgMin * mult)), dmgMax: Math.max(1, Math.round(base.weapon.dmgMax * mult)) }
    : undefined;
  return {
    uid: nextUid++,
    baseId: base.id,
    name: affixes.length ? `${base.name} ${affixes[0]}` : base.name,
    slot: base.slot,
    rarity,
    ilvl,
    reqLevel: base.noDrop ? 1 : reqLevelFor(ilvl),
    size: [base.size[0], base.size[1]],
    stats,
    weapon,
    affixes,
    forge: { dmg: 0, spd: 0, block: 0, armor: 0 },
    value: base.value ?? itemValue(rarity, base.size, ilvl),
    col: -1,
    row: -1,
  };
}

export function makeStarterItem(id: string): Item {
  return makeItem(baseItem(id), 'common', 1, null);
}

/** Rolls a rarity. Magic find scales every weight above common. */
export function rollRarity(rng: Rng, magicFind = 0, maxRarity: Rarity = 'divine'): Rarity {
  const maxIdx = RARITY_ORDER.indexOf(maxRarity);
  const mf = 1 + magicFind / 100;
  const weights = RARITY_ORDER.map((r, i) => (i > maxIdx ? 0 : RARITIES[r].dropWeight * (r === 'common' ? 1 : mf)));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return RARITY_ORDER[i]!;
  }
  return 'common';
}

export interface GenerateOptions {
  ilvl: number;
  magicFind?: number;
  maxRarity?: Rarity;
  rarity?: Rarity;
  slot?: EquipSlot;
}

const DROPPABLE = ALL_BASES.filter((b) => !b.noDrop && !b.rarity);

export function generateItem(rng: Rng, opts: GenerateOptions): Item {
  const rarity = opts.rarity ?? rollRarity(rng, opts.magicFind ?? 0, opts.maxRarity ?? 'divine');
  let pool = DROPPABLE;
  if (opts.slot) pool = pool.filter((b) => b.slot === opts.slot);
  if (rarity === 'divine' && !opts.slot && rng.next() < 0.5) pool = SPECIAL_BASES;
  const base = pool[rng.int(0, pool.length - 1)] ?? DROPPABLE[0]!;
  return makeItem(base, base.rarity ?? rarity, Math.max(1, opts.ilvl), rng);
}

export function isTwoHanded(item: Item | null | undefined): boolean {
  return !!item?.weapon?.twoHanded;
}

/** Plain description lines for tooltips. */
export function describeItem(item: Item): string[] {
  const lines: string[] = [];
  if (item.weapon) {
    lines.push(`${item.weapon.dmgMin}-${item.weapon.dmgMax} damage, ${item.weapon.atkSpd.toFixed(2)} attacks/s`);
    const tags = [item.weapon.type, item.weapon.ranged ? 'ranged' : 'melee', item.weapon.magic ? 'magic' : '', item.weapon.twoHanded ? 'two-handed' : ''].filter(Boolean);
    lines.push(tags.join(', '));
  }
  return lines;
}
