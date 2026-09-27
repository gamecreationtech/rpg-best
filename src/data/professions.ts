export type ProfessionId = 'mining' | 'blacksmithing' | 'woodworking' | 'lumberjack' | 'arcanium';

export interface ProfessionDef {
  id: ProfessionId;
  name: string;
  color: number;
  description: string;
}

export const PROFESSIONS: ProfessionDef[] = [
  { id: 'mining', name: 'Mining', color: 0x7799bb, description: 'Excavate ore veins for raw materials' },
  { id: 'blacksmithing', name: 'Blacksmithing', color: 0xcc8844, description: 'Forge weapons and armor from ore' },
  { id: 'woodworking', name: 'Woodworking', color: 0x88bb55, description: 'Carve bows, staves, and tools' },
  { id: 'lumberjack', name: 'Lumberjack', color: 0xbb7744, description: 'Harvest timber from forest nodes' },
  { id: 'arcanium', name: 'Arcanium', color: 0xbb66ff, description: 'Master arcane enchantment' },
];

export interface ProfessionPerk {
  level: number;
  text: string;
}

/** Same milestone ladder for every profession. */
export const PROFESSION_PERKS: ProfessionPerk[] = [
  { level: 1, text: 'Basic crafting and gathering' },
  { level: 5, text: '+10% yield or +5 bonus stat' },
  { level: 10, text: 'Unlock new materials and tiers' },
  { level: 20, text: 'Sensing and advanced techniques' },
  { level: 30, text: 'Unlock rare materials' },
  { level: 50, text: 'Master perk: double yield, divine affixes, pierce' },
];

export const PROFESSION_RULES = {
  maxLevel: 50,
  xpStart: 50,
  xpGrowth: 1.3,
};
