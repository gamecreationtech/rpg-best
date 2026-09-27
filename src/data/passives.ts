import type { ClassId } from './classes';
import type { StatKey } from './stats';

export interface PassiveDef {
  id: string;
  name: string;
  maxRank: number;
  stat: StatKey;
  perRank: number;
  requires?: string;
}

export const GENERAL_TREE: PassiveDef[] = [
  { id: 'improved_strikes', name: 'Improved Strikes', maxRank: 3, stat: 'damage', perRank: 8 },
  { id: 'weapon_mastery', name: 'Weapon Mastery', maxRank: 3, stat: 'atkSpd', perRank: 0.2, requires: 'improved_strikes' },
  { id: 'critical_focus', name: 'Critical Focus', maxRank: 5, stat: 'critChance', perRank: 3, requires: 'weapon_mastery' },
  { id: 'deadly_blows', name: 'Deadly Blows', maxRank: 3, stat: 'critDamage', perRank: 25, requires: 'weapon_mastery' },
  { id: 'swiftness', name: 'Swiftness', maxRank: 3, stat: 'moveSpeed', perRank: 8 },
  { id: 'fortune', name: 'Fortune', maxRank: 3, stat: 'magicFind', perRank: 5 },
  { id: 'iron_constitution', name: 'Iron Constitution', maxRank: 5, stat: 'life', perRank: 50 },
  { id: 'thick_skin', name: 'Thick Skin', maxRank: 3, stat: 'armor', perRank: 12, requires: 'iron_constitution' },
  { id: 'regeneration', name: 'Regeneration', maxRank: 3, stat: 'hpRegen', perRank: 5, requires: 'iron_constitution' },
  { id: 'elemental_warding', name: 'Elemental Warding', maxRank: 3, stat: 'allResists', perRank: 10, requires: 'thick_skin' },
  { id: 'arcane_mind', name: 'Arcane Mind', maxRank: 3, stat: 'mana', perRank: 40 },
  { id: 'spell_power', name: 'Spell Power', maxRank: 3, stat: 'spellDmg', perRank: 8, requires: 'arcane_mind' },
  { id: 'focused_channeling', name: 'Focused Channeling', maxRank: 3, stat: 'fasterCast', perRank: 10, requires: 'spell_power' },
  { id: 'cooldown_mastery', name: 'Cooldown Mastery', maxRank: 3, stat: 'cdr', perRank: 8, requires: 'spell_power' },
];

export const CLASS_TREES: Record<ClassId, PassiveDef[]> = {
  knight: [
    { id: 'swords_k', name: 'Swordsmanship', maxRank: 3, stat: 'damage', perRank: 8 },
    { id: 'weapon_mastery_k', name: 'Weapon Mastery', maxRank: 3, stat: 'atkSpd', perRank: 0.2, requires: 'swords_k' },
    { id: 'lethal_blows_k', name: 'Lethal Blows', maxRank: 3, stat: 'critDamage', perRank: 30, requires: 'weapon_mastery_k' },
    { id: 'critical_focus_k', name: 'Critical Focus', maxRank: 5, stat: 'critChance', perRank: 3, requires: 'weapon_mastery_k' },
    { id: 'swiftness_k', name: 'Swiftness', maxRank: 3, stat: 'moveSpeed', perRank: 8 },
    { id: 'iron_constitution_k', name: 'Iron Constitution', maxRank: 5, stat: 'life', perRank: 50 },
    { id: 'thick_skin_k', name: 'Thick Skin', maxRank: 3, stat: 'armor', perRank: 12, requires: 'iron_constitution_k' },
    { id: 'elem_warding_k', name: 'Elemental Warding', maxRank: 3, stat: 'allResists', perRank: 10, requires: 'thick_skin_k' },
    { id: 'battle_hardened_k', name: 'Battle Hardened', maxRank: 3, stat: 'armor', perRank: 8 },
    { id: 'regeneration_k', name: 'Regeneration', maxRank: 3, stat: 'hpRegen', perRank: 5, requires: 'battle_hardened_k' },
    { id: 'shield_bearer_k', name: 'Shield Bearer', maxRank: 3, stat: 'block', perRank: 5 },
    { id: 'aegis_k', name: 'Aegis', maxRank: 3, stat: 'armor', perRank: 15, requires: 'shield_bearer_k' },
    { id: 'iron_fortress_k', name: 'Iron Fortress', maxRank: 3, stat: 'life', perRank: 70, requires: 'aegis_k' },
  ],
  sorcerer: [
    { id: 'arcane_mind_s', name: 'Arcane Mind', maxRank: 3, stat: 'mana', perRank: 40 },
    { id: 'spell_power_s', name: 'Spell Power', maxRank: 3, stat: 'spellDmg', perRank: 8, requires: 'arcane_mind_s' },
    { id: 'focused_channel_s', name: 'Focused Channeling', maxRank: 3, stat: 'fasterCast', perRank: 10, requires: 'spell_power_s' },
    { id: 'elem_mastery_s', name: 'Elemental Mastery', maxRank: 3, stat: 'spellDmg', perRank: 6 },
    { id: 'cdr_mastery_s', name: 'Cooldown Mastery', maxRank: 3, stat: 'cdr', perRank: 8, requires: 'spell_power_s' },
    { id: 'mana_pool_s', name: 'Mana Pool', maxRank: 5, stat: 'mana', perRank: 30 },
    { id: 'mana_flow_s', name: 'Mana Flow', maxRank: 3, stat: 'manaRegen', perRank: 4, requires: 'mana_pool_s' },
    { id: 'arcane_surge_s', name: 'Arcane Surge', maxRank: 3, stat: 'spellDmg', perRank: 12, requires: 'mana_flow_s' },
    { id: 'fortune_s', name: 'Fortune', maxRank: 3, stat: 'magicFind', perRank: 5 },
    { id: 'elem_warding_s', name: 'Elemental Warding', maxRank: 3, stat: 'allResists', perRank: 10 },
    { id: 'glass_cannon_s', name: 'Glass Cannon', maxRank: 3, stat: 'spellDmg', perRank: 12 },
    { id: 'shatter_s', name: 'Shatter', maxRank: 3, stat: 'critChance', perRank: 4, requires: 'glass_cannon_s' },
    { id: 'surge_s', name: 'Surge', maxRank: 3, stat: 'critDamage', perRank: 30, requires: 'shatter_s' },
  ],
  rogue: [
    { id: 'precision_r', name: 'Precision', maxRank: 5, stat: 'critChance', perRank: 4 },
    { id: 'finesse_r', name: 'Finesse', maxRank: 3, stat: 'critDamage', perRank: 25, requires: 'precision_r' },
    { id: 'assassinate_r', name: 'Assassinate', maxRank: 3, stat: 'damage', perRank: 10, requires: 'finesse_r' },
    { id: 'swiftness_r', name: 'Swiftness', maxRank: 3, stat: 'moveSpeed', perRank: 8 },
    { id: 'shadowstep_r', name: 'Shadowstep', maxRank: 3, stat: 'moveSpeed', perRank: 10, requires: 'swiftness_r' },
    { id: 'evasion_r', name: 'Evasion', maxRank: 3, stat: 'dodge', perRank: 5 },
    { id: 'agility_r', name: 'Agility', maxRank: 3, stat: 'atkSpd', perRank: 0.2, requires: 'evasion_r' },
    { id: 'fleet_footed_r', name: 'Fleet Footed', maxRank: 3, stat: 'moveSpeed', perRank: 8, requires: 'agility_r' },
    { id: 'venomcraft_r', name: 'Venomcraft', maxRank: 3, stat: 'poisonChance', perRank: 10 },
    { id: 'venom_mastery_r', name: 'Venom Mastery', maxRank: 3, stat: 'damage', perRank: 8, requires: 'venomcraft_r' },
    { id: 'predator_r', name: 'Predator', maxRank: 3, stat: 'damage', perRank: 15, requires: 'venom_mastery_r' },
    { id: 'ranged_mastery_r', name: 'Ranged Mastery', maxRank: 3, stat: 'atkSpd', perRank: 0.25 },
    { id: 'piercing_shots_r', name: 'Piercing Shots', maxRank: 2, stat: 'pierce', perRank: 1, requires: 'ranged_mastery_r' },
    { id: 'deadly_momentum_r', name: 'Deadly Momentum', maxRank: 5, stat: 'critDamage', perRank: 5, requires: 'piercing_shots_r' },
  ],
};

export function passivesFor(classId: ClassId): PassiveDef[] {
  return [...GENERAL_TREE, ...CLASS_TREES[classId]];
}
