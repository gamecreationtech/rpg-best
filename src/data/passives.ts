import { kinOf, type ClassId } from './classes';
import type { StatKey } from './stats';

/** One passive: each rank adds every effect once. No prerequisites (producer's list, 2026-10-02). */
export interface PassiveDef {
  id: string;
  name: string;
  maxRank: number;
  effects: { stat: StatKey; perRank: number }[];
  requires?: string;
}

const one = (id: string, name: string, maxRank: number, stat: StatKey, perRank: number): PassiveDef => ({ id, name, maxRank, effects: [{ stat, perRank }] });

/** Standard passives: every hero gets these. */
export const GENERAL_TREE: PassiveDef[] = [
  one('std_move', 'Fleet of Foot', 5, 'moveSpeed', 5),
  one('std_life', 'Vitality', 5, 'life', 25),
  one('std_mana', 'Wisdom', 5, 'mana', 25),
  one('std_cdr', 'Alacrity', 4, 'cdr', 2.5),
  one('std_allstats', 'Well Rounded', 5, 'allStats', 2),
  one('std_magicfind', 'Fortune', 5, 'magicFind', 5),
  one('std_itemfind', 'Scavenger', 5, 'itemFind', 5),
];

/** Class passives. */
export const CLASS_TREES: Partial<Record<ClassId, PassiveDef[]>> = {
  knight: [
    one('kn_life', 'Iron Constitution', 4, 'life', 25),
    one('kn_armor', 'Plated', 4, 'armor', 10),
    one('kn_block', 'Shield Wall', 4, 'block', 2.5),
    one('kn_damage', 'Heavy Hand', 4, 'damage', 5),
    one('kn_regen', 'Second Wind', 4, 'hpRegen', 2.5),
  ],
  sorcerer: [
    one('sor_cast', 'Quick Casting', 4, 'fasterCast', 5),
    one('sor_burn', 'Kindling', 4, 'burnChance', 5),
    one('sor_mana', 'Deep Well', 4, 'mana', 25),
    one('sor_shield', 'Energy Shield', 4, 'energyShieldPct', 5),
    one('sor_manaregen', 'Meditation', 4, 'manaRegen', 2.5),
  ],
  rogue: [
    one('rog_crit', 'Keen Eye', 4, 'critChance', 2.5),
    one('rog_critdmg', 'Vital Strikes', 4, 'critDamage', 10),
    one('rog_move', 'Swiftness', 4, 'moveSpeed', 10),
    one('rog_dodge', 'Evasion', 4, 'dodge', 2.5),
    one('rog_atkspd', 'Agility', 4, 'atkSpdPct', 2.5),
  ],
};

/** Pledge passives, opened by swearing. */
export const PLEDGE_TREES: Record<string, PassiveDef[]> = {
  paladin: [
    one('pal_holy', 'Holy Might', 3, 'pledgeDmgPct', 25),
    one('pal_regen', 'Blessing', 3, 'hpRegen', 5),
    one('pal_armor', 'Sacred Plate', 3, 'armor', 20),
  ],
  titan: [
    one('tit_earth', 'Earthen Might', 3, 'pledgeDmgPct', 25),
    one('tit_life', "Mountain's Blood", 3, 'life', 50),
    one('tit_cdr', 'Tectonic Rhythm', 3, 'cdr', 5),
  ],
  nightlord: [
    one('nl_void', 'Void Edge', 3, 'pledgeDmgPct', 25),
    one('nl_cdr', 'Dark Haste', 3, 'cdr', 5),
    { id: 'nl_crit', name: 'Assassin\'s Eye', maxRank: 3, effects: [{ stat: 'critChance', perRank: 5 }, { stat: 'critDamage', perRank: 10 }] },
  ],
  necromancer: [
    one('nec_poison', 'Plague Touch', 3, 'poisonChance', 20),
    one('nec_cdr', 'Grave Haste', 3, 'cdr', 5),
    one('nec_summon', 'Unholy Vigor', 3, 'summonLifePct', 25),
  ],
  stormsinger: [
    one('storm_shock', 'Static Charge', 3, 'shockChance', 10),
    one('storm_cdr', 'Storm Haste', 3, 'cdr', 10),
    one('storm_manaregen', 'Charged Mind', 3, 'manaRegen', 5),
  ],
  wintercaller: [
    one('win_freeze', 'Frost Touch', 3, 'freezeChance', 10),
    one('win_slow', 'Numbing Cold', 3, 'slowChance', 15),
    one('win_cdr', 'Winter Haste', 3, 'cdr', 10),
  ],
  quiverbound: [
    one('quiv_pierce', 'Piercing Shots', 3, 'pierce', 1),
    one('quiv_split', 'Split Shot', 3, 'split', 1),
    one('quiv_poison', 'Venom Tips', 3, 'poisonChance', 10),
  ],
  impaler: [
    one('imp_move', 'Charger', 3, 'moveSpeed', 15),
    one('imp_dodge', 'Sidestep', 3, 'dodge', 5),
    one('imp_atkspd', 'Spear Drill', 3, 'atkSpdPct', 5),
  ],
  silverblade: [
    one('silv_crit', 'Silver Eye', 3, 'critChance', 5),
    one('silv_critdmg', 'Silver Edge', 3, 'critDamage', 20),
    one('silv_atkspd', 'Blade Dance', 3, 'atkSpdPct', 5),
  ],
};

/** Every passive a hero can learn: the standard tree, the class tree and, once sworn, the pledge tree. */
export function passivesFor(classId: ClassId, pledgeId: string | null = null): PassiveDef[] {
  return [...GENERAL_TREE, ...(CLASS_TREES[kinOf(classId)] ?? []), ...(pledgeId ? PLEDGE_TREES[pledgeId] ?? [] : [])];
}
