import { CLASSES, LEVELING, type BaseStats, type ClassId, xpForLevel } from '../data/classes';
import type { ConsumableId } from '../data/consumables';
import { CONSUMABLES } from '../data/consumables';
import { PROFESSIONS, PROFESSION_RULES, type ProfessionId } from '../data/professions';
import { passivesFor } from '../data/passives';
import { SKILLS, SKILL_RULES, skillsFor, type BuffMods } from '../data/skills';
import { COMBAT_RULES } from '../data/status';
import { addStats, type StatKey, type StatMap } from '../data/stats';
import type { OffhandKind, WeaponType } from '../data/items';
import { ITEM_RULES } from '../data/items';
import { PX } from '../data/units';
import { Equipment } from './items/equipment';
import { Inventory } from './items/inventory';
import { makeStarterItem, type Item } from './items/item';

export const SLOT_COUNT = 6;
export const ATTACK_SLOT = 'attack';

/** Everything about the character that is saved. */
export interface PlayerState {
  classId: ClassId;
  pledgeId: string | null;
  level: number;
  xp: number;
  xpToNext: number;
  allocated: BaseStats;
  statPoints: number;
  skillPoints: number;
  passivePoints: number;
  ultimatePoints: number;
  skillRanks: Record<string, number>;
  passiveRanks: Record<string, number>;
  /** Slot 0 is the primary (tap on enemy) action; 1-5 are the skill buttons. */
  slots: (string | null)[];
  unlockedUltimates: string[];
  hp: number;
  mana: number;
  gold: number;
  potions: Record<ConsumableId, number>;
  professions: Record<ProfessionId, { level: number; xp: number }>;
  inventory: Inventory;
  equipment: Equipment;
  stash: Inventory[];
  kills: number;
}

/** An active buff on the player. */
export interface Buff {
  id: string;
  name: string;
  remaining: number;
  duration: number;
  mods: BuffMods;
  color: number;
  /** Remaining damage shield, if the buff grants one. */
  shield: number;
  /** Per-buff bookkeeping (orbit angle, self cost, etc.). */
  data: Record<string, number>;
}

/** Numbers the combat code reads every tick. Recomputed when anything changes. */
export interface DerivedStats {
  str: number;
  dex: number;
  int: number;
  vit: number;
  maxHp: number;
  maxMana: number;
  armor: number;
  /** Weapon roll range. */
  dmgMin: number;
  dmgMax: number;
  bonusDamage: number;
  spellDmg: number;
  atkSpd: number;
  /** World units per second. */
  moveSpeed: number;
  critChance: number;
  critDamage: number;
  dodge: number;
  block: number;
  lifeSteal: number;
  lifeOnHit: number;
  manaOnHit: number;
  hpRegen: number;
  manaRegen: number;
  fasterCast: number;
  cdr: number;
  magicFind: number;
  goldFind: number;
  /** Scales every monster's chance to drop an item at all. */
  itemFind: number;
  pierce: number;
  poisonChance: number;
  burnChance: number;
  /** Bonus melee reach or projectile range in px. */
  range: number;
  projSpeedPct: number;
  res: { fire: number; cold: number; lightning: number; poison: number };
  isMagicWeapon: boolean;
  isRanged: boolean;
  weaponType: string | null;
  hasShield: boolean;
  /** Melee reach in px including buffs. */
  meleeRange: number;
  dmgMult: number;
  /** Seconds between casts for zero-cooldown spells. */
  castInterval: number;
}

export function createPlayer(classId: ClassId, pledgeId: string | null): PlayerState {
  const cls = CLASSES[classId];
  const p: PlayerState = {
    classId,
    pledgeId,
    level: 1,
    xp: 0,
    xpToNext: xpForLevel(1),
    allocated: { str: 0, dex: 0, int: 0, vit: 0 },
    statPoints: 0,
    skillPoints: 1,
    passivePoints: 0,
    ultimatePoints: 0,
    skillRanks: {},
    passiveRanks: {},
    slots: [ATTACK_SLOT, null, null, null, null, null],
    unlockedUltimates: [],
    hp: 0,
    mana: 0,
    gold: 0,
    potions: { hp_potion: 3, bandage: 2, mp_potion: 3, incense: 1 },
    professions: Object.fromEntries(PROFESSIONS.map((pr) => [pr.id, { level: 1, xp: 0 }])) as PlayerState['professions'],
    inventory: new Inventory(ITEM_RULES.inventoryCols, ITEM_RULES.inventoryRows),
    equipment: new Equipment(),
    stash: Array.from({ length: ITEM_RULES.stashPages }, () => new Inventory(ITEM_RULES.stashCols, ITEM_RULES.stashRows)),
    kills: 0,
  };
  for (const id of cls.startingGear) p.equipment.equip(makeStarterItem(id), 1);
  for (const id of cls.startingBag ?? []) p.inventory.add(makeStarterItem(id));
  // The first class skill starts at rank 1 in slot 1
  const first = skillsFor(classId, pledgeId).find((s) => s.tier === 'base' && (s.reqLevel ?? 1) <= 1);
  if (first) {
    p.skillRanks[first.id] = 1;
    p.skillPoints = 0;
    p.slots[1] = first.id;
  }
  const d = deriveStats(p, [], {});
  p.hp = d.maxHp;
  p.mana = d.maxMana;
  return p;
}

export function totalBaseStats(p: PlayerState): BaseStats {
  const cls = CLASSES[p.classId];
  const lv = p.level - 1;
  return {
    str: cls.base.str + cls.perLevel.str * lv + p.allocated.str,
    dex: cls.base.dex + cls.perLevel.dex * lv + p.allocated.dex,
    int: cls.base.int + cls.perLevel.int * lv + p.allocated.int,
    vit: cls.base.vit + cls.perLevel.vit * lv + p.allocated.vit,
  };
}

/** Sum of stats from equipment and passives. */
export function gearStats(p: PlayerState): StatMap {
  const total: StatMap = {};
  for (const item of p.equipment.all()) addStats(total, item.stats);
  for (const def of passivesFor(p.classId)) {
    const rank = p.passiveRanks[def.id] ?? 0;
    if (rank > 0) addStats(total, { [def.stat]: def.perRank } as StatMap, rank);
  }
  return total;
}

export function unlockedSlots(level: number): number {
  return 1 + LEVELING.slotUnlockLevels.filter((l) => level >= l).length;
}

/**
 * Builds the numbers combat uses. `zoneMods` carries aura effects (Sanctuary, Wind)
 * the player currently stands in.
 */
/** `extra` is a stat source outside the character sheet, such as the development menu. */
export function deriveStats(p: PlayerState, buffs: Buff[], zoneMods: BuffMods, extra: StatMap | null = null): DerivedStats {
  const cls = CLASSES[p.classId];
  const base = totalBaseStats(p);
  const gear = gearStats(p);
  const g = (k: StatKey) => (gear[k] ?? 0) + (extra?.[k] ?? 0);
  const str = base.str + g('str');
  const dex = base.dex + g('dex');
  const int = base.int + g('int');
  const vit = base.vit + g('vit');
  const weapon = p.equipment.get('weapon');
  const w = weapon?.weapon;

  let armor = vit * COMBAT_RULES.armorPerVit + g('armor');
  let allRes = g('allResists');
  let atkSpdPct = 0;
  let dmgPct = 0;
  let moveSpdPct = 0;
  let meleeRangeOverride = 0;
  const mods: BuffMods[] = [zoneMods, ...buffs.map((b) => b.mods)];
  for (const m of mods) {
    armor += m.armor ?? 0;
    allRes += m.allResists ?? 0;
    atkSpdPct += m.atkSpdPct ?? 0;
    dmgPct += m.dmgPct ?? 0;
    moveSpdPct += m.moveSpdPct ?? 0;
    if (m.meleeRange) meleeRangeOverride = Math.max(meleeRangeOverride, m.meleeRange);
  }

  // Only a real shield blocks; a lantern, skull or quiver in the slot does not
  const shieldItem = p.equipment.get('shield');
  const hasShield = !!shieldItem && !shieldItem.offhand;
  const moveSpeedPercent = 100 + g('moveSpeed') + dex * COMBAT_RULES.moveSpeedPerDex;
  const moveSpeedPx = Math.round(COMBAT_RULES.baseMoveSpeedPx * (moveSpeedPercent / 100)) * (1 + moveSpdPct / 100);
  const baseAtkSpd = (w?.atkSpd ?? 1.0) + g('atkSpd');
  const atkSpd = Math.max(COMBAT_RULES.minAtkSpd, baseAtkSpd * (1 + atkSpdPct / 100));
  const fasterCast = g('fasterCast');
  const castInterval = Math.max(SKILL_RULES.minCastInterval, Math.round(1000 / (1 + fasterCast / 100))) / 1000;
  const res = (k: StatKey) => Math.min(COMBAT_RULES.maxReductionPct, g(k) + allRes);
  const baseRange = w?.range ?? 80;

  return {
    str, dex, int, vit,
    maxHp: cls.baseHp + vit * cls.hpPerVit + g('life'),
    maxMana: cls.baseMana + int * cls.manaPerInt + g('mana'),
    armor,
    dmgMin: w?.dmgMin ?? 1,
    dmgMax: w?.dmgMax ?? 2,
    bonusDamage: g('damage'),
    spellDmg: g('spellDmg'),
    atkSpd,
    moveSpeed: moveSpeedPx * PX,
    critChance: COMBAT_RULES.baseCritChance + g('critChance') + dex * COMBAT_RULES.critPerDex,
    critDamage: COMBAT_RULES.baseCritDamage + g('critDamage'),
    dodge: g('dodge') + dex * COMBAT_RULES.dodgePerDex,
    block: hasShield ? g('block') : 0,
    lifeSteal: g('lifeSteal'),
    lifeOnHit: g('lifeOnHit'),
    manaOnHit: g('manaOnHit'),
    hpRegen: g('hpRegen'),
    manaRegen: g('manaRegen'),
    fasterCast,
    cdr: Math.min(60, g('cdr')),
    magicFind: g('magicFind'),
    goldFind: g('goldFind'),
    itemFind: g('itemFind'),
    pierce: g('pierce'),
    poisonChance: g('poisonChance'),
    burnChance: g('burnChance'),
    range: g('range'),
    projSpeedPct: g('projSpeed'),
    res: { fire: res('fireRes'), cold: res('coldRes'), lightning: res('lightningRes'), poison: res('poisonRes') },
    isMagicWeapon: !!w?.magic,
    isRanged: !!w?.ranged,
    weaponType: w?.type ?? null,
    hasShield,
    meleeRange: meleeRangeOverride || (w && !w.ranged ? baseRange : 80) + g('range'),
    dmgMult: 1 + dmgPct / 100,
    castInterval,
  };
}

export interface LevelUpResult {
  levels: number;
  ultimatePointGained: boolean;
}

/** Adds experience and applies every level gained. */
export function addXp(p: PlayerState, amount: number): LevelUpResult {
  const result: LevelUpResult = { levels: 0, ultimatePointGained: false };
  if (p.level >= LEVELING.maxLevel) return result;
  p.xp += amount;
  while (p.xp >= p.xpToNext && p.level < LEVELING.maxLevel) {
    p.xp -= p.xpToNext;
    p.level++;
    p.xpToNext = xpForLevel(p.level);
    p.statPoints += LEVELING.statPointsPerLevel;
    p.skillPoints += LEVELING.skillPointsPerLevel;
    p.passivePoints += LEVELING.passivePointsPerLevel;
    if (p.level === LEVELING.ultimatePointLevel) {
      p.ultimatePoints++;
      result.ultimatePointGained = true;
    }
    result.levels++;
  }
  return result;
}

export function allocateStat(p: PlayerState, stat: keyof BaseStats): boolean {
  if (p.statPoints <= 0) return false;
  p.statPoints--;
  p.allocated[stat]++;
  return true;
}

export function skillRank(p: PlayerState, id: string): number {
  return p.skillRanks[id] ?? 0;
}

/** Class weapon rules: a knight only ever holds a sword, mace or bardiche. */
export function canEquipItem(p: PlayerState, item: { weapon?: { type: WeaponType }; offhand?: OffhandKind }): { ok: boolean; reason?: string } {
  const allowed = CLASSES[p.classId].allowedWeapons;
  if (item.weapon && allowed && !allowed.includes(item.weapon.type)) {
    const names = allowed.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ');
    return { ok: false, reason: `${CLASSES[p.classId].name}s only use ${names}` };
  }
  if (item.offhand === 'quiver' && p.equipment.get('weapon')?.weapon?.type !== 'bow') return { ok: false, reason: 'A quiver needs a bow' };
  return { ok: true };
}

export function canLearnSkill(p: PlayerState, id: string): { ok: boolean; reason?: string } {
  const def = SKILLS[id];
  if (!def) return { ok: false, reason: 'Unknown skill' };
  if (def.tier === 'ultimate') return { ok: false, reason: 'Ultimates are unlocked, not ranked' };
  if (def.classId !== p.classId) return { ok: false, reason: 'Wrong class' };
  if (def.tier === 'pledge' && def.pledgeId !== p.pledgeId) return { ok: false, reason: 'Wrong pledge' };
  if ((def.reqLevel ?? 1) > p.level) return { ok: false, reason: `Requires level ${def.reqLevel}` };
  if (skillRank(p, id) >= SKILL_RULES.maxRank) return { ok: false, reason: 'Max rank' };
  if (p.skillPoints <= 0) return { ok: false, reason: 'No skill points' };
  return { ok: true };
}

export function learnSkill(p: PlayerState, id: string): boolean {
  if (!canLearnSkill(p, id).ok) return false;
  p.skillPoints--;
  p.skillRanks[id] = skillRank(p, id) + 1;
  // Put a first-time skill in the first free unlocked slot
  if (p.skillRanks[id] === 1 && !p.slots.includes(id)) {
    const max = unlockedSlots(p.level);
    for (let i = 1; i < max; i++) {
      if (!p.slots[i]) {
        p.slots[i] = id;
        break;
      }
    }
  }
  return true;
}

/** Takes one rank back and refunds the point. A skill at rank 0 leaves the bar. */
export function unlearnSkill(p: PlayerState, id: string): boolean {
  const rank = skillRank(p, id);
  if (rank <= 0) return false;
  const def = SKILLS[id];
  if (def?.upgradesTo && p.unlockedUltimates.includes(def.upgradesTo)) return false; // undo the ultimate first
  p.skillPoints++;
  if (rank === 1) {
    delete p.skillRanks[id];
    p.slots = p.slots.map((s, i) => (s === id ? (i === 0 ? ATTACK_SLOT : null) : s));
  } else {
    p.skillRanks[id] = rank - 1;
  }
  return true;
}

export function canUnlockUltimate(p: PlayerState, baseId: string): { ok: boolean; reason?: string } {
  const base = SKILLS[baseId];
  if (!base?.upgradesTo) return { ok: false, reason: 'No ultimate' };
  if (p.unlockedUltimates.includes(base.upgradesTo)) return { ok: false, reason: 'Already unlocked' };
  if (skillRank(p, baseId) < SKILL_RULES.maxRank) return { ok: false, reason: 'Base skill must be rank 5' };
  if (p.ultimatePoints <= 0) return { ok: false, reason: 'No ultimate point' };
  const ult = SKILLS[base.upgradesTo]!;
  if ((ult.reqLevel ?? 1) > p.level) return { ok: false, reason: `Requires level ${ult.reqLevel}` };
  return { ok: true };
}

/** Swaps the base skill for its ultimate everywhere it is slotted. */
export function unlockUltimate(p: PlayerState, baseId: string): boolean {
  if (!canUnlockUltimate(p, baseId).ok) return false;
  const ult = SKILLS[baseId]!.upgradesTo!;
  p.ultimatePoints--;
  p.unlockedUltimates.push(ult);
  p.skillRanks[ult] = p.skillRanks[baseId] ?? 0;
  p.slots = p.slots.map((s) => (s === baseId ? ult : s));
  return true;
}

/** Undo: refunds the ultimate point and returns the base skill to the slots. */
export function revokeUltimate(p: PlayerState, ultId: string): boolean {
  const idx = p.unlockedUltimates.indexOf(ultId);
  if (idx < 0) return false;
  const base = Object.values(SKILLS).find((s) => s.upgradesTo === ultId);
  if (!base) return false;
  p.unlockedUltimates.splice(idx, 1);
  p.ultimatePoints++;
  delete p.skillRanks[ultId];
  p.slots = p.slots.map((s) => (s === ultId ? base.id : s));
  return true;
}

/** The skill actually used for a slot: the ultimate if unlocked, else the base. */
export function resolveSlotSkill(p: PlayerState, id: string | null): string | null {
  if (!id || id === ATTACK_SLOT) return id;
  const def = SKILLS[id];
  if (def?.upgradesTo && p.unlockedUltimates.includes(def.upgradesTo)) return def.upgradesTo;
  return id;
}

export function canLearnPassive(p: PlayerState, id: string): { ok: boolean; reason?: string } {
  const def = passivesFor(p.classId).find((d) => d.id === id);
  if (!def) return { ok: false, reason: 'Unknown passive' };
  if ((p.passiveRanks[id] ?? 0) >= def.maxRank) return { ok: false, reason: 'Max rank' };
  if (def.requires && (p.passiveRanks[def.requires] ?? 0) <= 0) return { ok: false, reason: 'Requires a previous passive' };
  if (p.passivePoints <= 0) return { ok: false, reason: 'No passive points' };
  return { ok: true };
}

export function learnPassive(p: PlayerState, id: string): boolean {
  if (!canLearnPassive(p, id).ok) return false;
  p.passivePoints--;
  p.passiveRanks[id] = (p.passiveRanks[id] ?? 0) + 1;
  return true;
}

export function addProfessionXp(p: PlayerState, id: ProfessionId, amount: number): boolean {
  const pr = p.professions[id];
  pr.xp += amount;
  let leveled = false;
  let need = Math.round(PROFESSION_RULES.xpStart * Math.pow(PROFESSION_RULES.xpGrowth, pr.level - 1));
  while (pr.xp >= need && pr.level < PROFESSION_RULES.maxLevel) {
    pr.xp -= need;
    pr.level++;
    leveled = true;
    need = Math.round(PROFESSION_RULES.xpStart * Math.pow(PROFESSION_RULES.xpGrowth, pr.level - 1));
  }
  return leveled;
}

export function professionXpToNext(level: number): number {
  return Math.round(PROFESSION_RULES.xpStart * Math.pow(PROFESSION_RULES.xpGrowth, level - 1));
}

/** Kills slowly refill potions. */
export function rechargePotions(p: PlayerState, fraction: Record<ConsumableId, number>): void {
  for (const c of CONSUMABLES) {
    fraction[c.id] += c.rechargePerKill;
    while (fraction[c.id] >= 1) {
      fraction[c.id] -= 1;
      p.potions[c.id] = Math.min(c.maxCharges, p.potions[c.id] + 1);
    }
  }
}

/** Puts an item into the bag; returns false if there is no room. */
export function giveItem(p: PlayerState, item: Item): boolean {
  return p.inventory.add(item);
}
