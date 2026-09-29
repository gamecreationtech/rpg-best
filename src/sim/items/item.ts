import { AFFIX_POOL, ALL_BASES, ITEM_RULES, RARITIES, RARITY_ORDER, SET_BASES, SPECIAL_BASES, baseItem, type BaseItem, type EquipSlot, type OffhandKind, type Rarity, type WeaponProps } from '../../data/items';
import type { StatKey, StatMap } from '../../data/stats';
import { LEVELING } from '../../data/classes';
import { PROCS, type ItemProc } from '../../data/procs';
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
  /** Lantern, skull or quiver: sits in the shield slot but is not a shield. */
  offhand?: OffhandKind;
  /** The set this piece belongs to, if any. */
  setId?: string;
  /** Chance to fire a proc on every weapon hit. */
  proc?: ItemProc;
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

/** Weapon damage, armour and block grow fast with rarity and level. */
export function statMultiplier(rarity: Rarity, ilvl: number): number {
  return RARITIES[rarity].mult * (1 + (ilvl - 1) * ITEM_RULES.levelScale);
}

/** Attribute bonuses grow gently, so a low-level item gives a point or two. */
export function bonusMultiplier(rarity: Rarity, ilvl: number): number {
  return RARITIES[rarity].bonus * (1 + (ilvl - 1) * ITEM_RULES.bonusLevelScale);
}

/** The stats that use the big multiplier; everything else is an attribute bonus. */
const HEAVY_STATS: StatKey[] = ['armor', 'block'];

/** Small decimal stats keep their precision; everything else rounds to whole numbers. */
const DECIMAL_STATS: StatKey[] = ['atkSpd', 'critChance', 'lifeSteal', 'dodge'];

function scaleStat(key: StatKey, value: number, mult: number): number {
  const v = value * mult;
  return DECIMAL_STATS.includes(key) ? Math.round(v * 100) / 100 : Math.round(v);
}

/** Drops past the cap (Beyond 100 zones) stay wearable: the requirement never exceeds the level cap. */
export function reqLevelFor(ilvl: number): number {
  return Math.min(LEVELING.maxLevel, Math.max(1, Math.round(ilvl * 0.8)));
}

/** Builds an item from a base definition at a rarity and item level. */
export function makeItem(base: BaseItem, rarity: Rarity, ilvl: number, rng: Rng | null): Item {
  // Starters, set pieces and the divine specials carry their numbers as written
  const fixed = base.noDrop || !!base.rarity;
  const mult = fixed ? 1 : statMultiplier(rarity, ilvl);
  const bonus = fixed ? 1 : bonusMultiplier(rarity, ilvl);
  const multFor = (key: StatKey) => (HEAVY_STATS.includes(key) ? mult : bonus);
  const stats: StatMap = {};
  for (const k in base.stats) {
    const key = k as StatKey;
    stats[key] = scaleStat(key, base.stats[key]!, multFor(key));
  }
  // Ranged stats roll once, whole numbers; without a generator they sit at the midpoint
  for (const k in base.rolls ?? {}) {
    const key = k as StatKey;
    const [lo, hi] = base.rolls![key]!;
    stats[key] = Math.round(rng ? rng.range(lo, hi) : (lo + hi) / 2);
  }
  const affixes: string[] = [];
  // Hand-written items (starters, set pieces, divine specials) never roll affixes either
  if (rng && !fixed && RARITIES[rarity].affixes > 0) {
    const pool = [...AFFIX_POOL];
    for (let i = 0; i < RARITIES[rarity].affixes && pool.length; i++) {
      const idx = rng.int(0, pool.length - 1);
      const affix = pool.splice(idx, 1)[0]!;
      const key = affix.stat as StatKey;
      stats[key] = (stats[key] ?? 0) + scaleStat(key, affix.delta, multFor(key));
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
    reqLevel: base.noDrop ? 1 : base.reqLevel ?? reqLevelFor(ilvl),
    size: [base.size[0], base.size[1]],
    stats,
    weapon,
    offhand: base.offhand,
    setId: base.setId,
    proc: base.proc,
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

/** Rolls a rarity. Magic find scales every weight above common. Set has no weight of its own: the zone's sets supply one. */
export function rollRarity(rng: Rng, magicFind = 0, maxRarity: Rarity = 'divine', setWeight = 0): Rarity {
  const maxIdx = RARITY_ORDER.indexOf(maxRarity);
  const mf = 1 + magicFind / 100;
  const weights = RARITY_ORDER.map((r, i) => (i > maxIdx ? 0 : (r === 'set' ? setWeight : RARITIES[r].dropWeight) * (r === 'common' ? 1 : mf)));
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
  /** Sets whose pieces may drop here, and the weight out of 100 for a set piece. */
  sets?: string[];
  setWeight?: number;
}

const DROPPABLE = ALL_BASES.filter((b) => !b.noDrop && !b.rarity);

/**
 * Rolls a drop. Divine items are only ever the hand-written specials: no
 * ordinary base is ever divine. A divine roll for a slot with no special
 * settles for a mythic of that slot instead.
 */
export function generateItem(rng: Rng, opts: GenerateOptions): Item {
  let rarity = opts.rarity ?? rollRarity(rng, opts.magicFind ?? 0, opts.maxRarity ?? 'divine', opts.sets?.length ? opts.setWeight ?? 0 : 0);
  let pool = rarity === 'divine' ? SPECIAL_BASES : rarity === 'set' ? SET_BASES.filter((b) => opts.sets?.includes(b.setId!)) : DROPPABLE;
  if (opts.slot) pool = pool.filter((b) => b.slot === opts.slot);
  if (!pool.length) {
    rarity = 'mythic';
    pool = DROPPABLE.filter((b) => b.slot === opts.slot);
  }
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
  if (item.proc) {
    const def = PROCS[item.proc.id];
    if (def) lines.push(`${item.proc.chance}% chance to cast ${def.name} on attack`, def.description);
  }
  return lines;
}
