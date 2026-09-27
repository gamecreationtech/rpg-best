import { AFFIX_POOL, RARITY_ORDER, type EquipSlot } from '../../data/items';
import { ARCANA_OPS, BLOOD_OPS, FORGE_MAX_USES, FORGE_OPS, type ArcanaOp, type BloodOp, type ForgeOp } from '../../data/crafting';
import type { StatKey } from '../../data/stats';
import type { Rng } from '../../gen/rng';
import { itemValue, statMultiplier, type Item } from './item';

export interface CraftResult {
  ok: boolean;
  reason?: string;
  /** Plain-language line for the message log. */
  message?: string;
}

function slotOk(slots: EquipSlot[], item: Item): boolean {
  return slots.length === 0 || slots.includes(item.slot);
}

export function canForge(op: ForgeOp, item: Item): CraftResult {
  if (!slotOk(op.slots, item)) return { ok: false, reason: 'Wrong item type' };
  if (item.forge[op.stack] >= FORGE_MAX_USES) return { ok: false, reason: 'Fully smelted' };
  if ((op.stack === 'dmg' || op.stack === 'spd') && !item.weapon) return { ok: false, reason: 'Needs a weapon' };
  return { ok: true };
}

export function applyForge(op: ForgeOp, item: Item): CraftResult {
  const check = canForge(op, item);
  if (!check.ok) return check;
  item.forge[op.stack]++;
  const f = 1 + op.pct / 100;
  switch (op.stack) {
    case 'dmg':
      item.weapon!.dmgMin = Math.max(1, Math.round(item.weapon!.dmgMin * f));
      item.weapon!.dmgMax = Math.max(1, Math.round(item.weapon!.dmgMax * f));
      break;
    case 'spd':
      item.weapon!.atkSpd = Math.round(item.weapon!.atkSpd * f * 100) / 100;
      break;
    case 'block':
      item.stats.block = Math.round(((item.stats.block ?? 0) + op.pct) * 100) / 100;
      break;
    case 'armor':
      item.stats.armor = Math.round((item.stats.armor ?? 0) * f);
      break;
  }
  return { ok: true, message: `${item.name}: ${op.description}` };
}

export function canBlood(op: BloodOp, item: Item): CraftResult {
  if (!slotOk(op.slots, item)) return { ok: false, reason: 'Wrong item type' };
  return { ok: true };
}

export function applyBlood(op: BloodOp, item: Item): CraftResult {
  const check = canBlood(op, item);
  if (!check.ok) return check;
  item.stats[op.stat] = (item.stats[op.stat] ?? 0) + op.delta;
  return { ok: true, message: `${item.name}: ${op.description}` };
}

export function applyArcana(op: ArcanaOp, item: Item, rng: Rng): CraftResult {
  switch (op.id) {
    case 'enchant': {
      const affix = AFFIX_POOL[rng.int(0, AFFIX_POOL.length - 1)]!;
      const mult = statMultiplier(item.rarity, item.ilvl);
      const delta = affix.stat === 'atkSpd' || affix.stat === 'critChance' ? Math.round(affix.delta * mult * 100) / 100 : Math.round(affix.delta * mult);
      item.stats[affix.stat] = (item.stats[affix.stat] ?? 0) + delta;
      item.affixes.push(affix.suffix);
      if (item.affixes.length === 1) item.name = `${item.name} ${affix.suffix}`;
      return { ok: true, message: `${item.name} gained ${affix.suffix}` };
    }
    case 'transmute': {
      const idx = RARITY_ORDER.indexOf(item.rarity);
      if (idx >= RARITY_ORDER.length - 1) return { ok: false, reason: 'Already divine' };
      const from = statMultiplier(item.rarity, item.ilvl);
      item.rarity = RARITY_ORDER[idx + 1]!;
      const to = statMultiplier(item.rarity, item.ilvl);
      const f = to / from;
      for (const k in item.stats) {
        const key = k as StatKey;
        item.stats[key] = key === 'atkSpd' || key === 'critChance' ? Math.round(item.stats[key]! * f * 100) / 100 : Math.round(item.stats[key]! * f);
      }
      if (item.weapon) {
        item.weapon.dmgMin = Math.round(item.weapon.dmgMin * f);
        item.weapon.dmgMax = Math.round(item.weapon.dmgMax * f);
      }
      item.value = itemValue(item.rarity, item.size, item.ilvl);
      return { ok: true, message: `${item.name} is now ${item.rarity}` };
    }
    case 'infuse': {
      const keys = Object.keys(item.stats) as StatKey[];
      const pick: StatKey = keys.length ? keys[rng.int(0, keys.length - 1)]! : 'armor';
      const delta = pick === 'atkSpd' ? 0.15 : pick === 'critChance' ? 1.5 : 15;
      item.stats[pick] = Math.round(((item.stats[pick] ?? 0) + delta) * 100) / 100;
      return { ok: true, message: `${item.name}: +${delta} ${pick}` };
    }
    case 'reroll': {
      for (const k in item.stats) {
        const key = k as StatKey;
        const f = rng.range(0.6, 1.4);
        item.stats[key] = key === 'atkSpd' || key === 'critChance' ? Math.round(item.stats[key]! * f * 100) / 100 : Math.round(item.stats[key]! * f);
      }
      if (item.weapon) {
        const f = rng.range(0.6, 1.4);
        item.weapon.dmgMin = Math.max(1, Math.round(item.weapon.dmgMin * f));
        item.weapon.dmgMax = Math.max(item.weapon.dmgMin, Math.round(item.weapon.dmgMax * f));
      }
      return { ok: true, message: `${item.name} was rerolled` };
    }
  }
}

export { ARCANA_OPS, BLOOD_OPS, FORGE_OPS };
