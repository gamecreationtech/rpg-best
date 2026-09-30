import type { ClassId } from './classes';

export interface PledgeDef {
  id: string;
  classId: ClassId;
  name: string;
  title: string;
  color: number;
  /** Robe or tabard colour when it should not be the pledge colour darkened. */
  cloth?: number;
  /** Knights: plate, the darker legs and cape, and the trim. Rogues: leathers, the darker legs and hood, and the belt. */
  armor?: { plate: number; dark: number; trim: number };
  description: string;
  /** Skill ids unlocked by this pledge. */
  skills: string[];
  /** True when the pledge lets a class that normally cannot carry a shield do so (the Impaler). */
  shields?: boolean;
}

export const PLEDGES: Record<string, PledgeDef> = {
  paladin: {
    id: 'paladin', classId: 'knight', name: 'Paladin', title: 'Knight of Light', color: 0xffe87a, armor: { plate: 0xc8a040, dark: 0x8a6a20, trim: 0xffe87a },
    description: 'Blessed by the heavens, the Paladin wields divine power to smite evil and protect the innocent.',
    skills: ['prayer', 'hammer_of_gods', 'sanctuary'],
  },
  titan: {
    id: 'titan', classId: 'knight', name: 'Titan', title: 'God of Earth', color: 0xc8945a, armor: { plate: 0x7a5636, dark: 0x7a2a2a, trim: 0xb03a2a },
    description: 'Born from stone and soil, the Titan is an immovable force of nature: raw, relentless, unbreakable.',
    skills: ['rock_solid', 'boulder_toss', 'leap'],
  },
  nightlord: {
    id: 'nightlord', classId: 'knight', name: 'Nightlord', title: 'Knight of Darkness', color: 0xaa66cc, armor: { plate: 0x2a2a34, dark: 0x16161c, trim: 0x5a3a7a },
    description: 'Sworn to the void, the Nightlord commands the shadows: feared, ruthless, and shrouded in darkness.',
    skills: ['rite_of_blood', 'hemorrhage', 'void_slash'],
  },
  necromancer: {
    id: 'necromancer', classId: 'sorcerer', name: 'Necromancer', title: 'Master of Death', color: 0xb090c8, cloth: 0x1a1620,
    description: 'A sorcerer who has gazed beyond the veil. Bends life and death itself: draining vitality, spreading plague, cursing enemies into oblivion.',
    skills: ['death', 'poison_nova', 'life_touch', 'skeleton_army'],
  },
  stormsinger: {
    id: 'stormsinger', classId: 'sorcerer', name: 'Stormsinger', title: 'Voice of the Storm', color: 0xffd83a, cloth: 0x8a6a14,
    description: 'Where thunder breaks, the Stormsinger stands. A master of lightning and wind, calling down the fury of the sky.',
    skills: ['call_of_the_wind', 'storm', 'lightning_strike'],
  },
  wintercaller: {
    id: 'wintercaller', classId: 'sorcerer', name: 'Wintercaller', title: 'Herald of the Frost', color: 0x6aa8ff, cloth: 0x2a4a9a,
    description: 'The Wintercaller commands the eternal freeze: encasing foes in ice, blanketing the battlefield in blizzard.',
    skills: ['frozen_armor', 'frost_nova', 'blizzard'],
  },
  quiverbound: {
    id: 'quiverbound', classId: 'rogue', name: 'Quiverbound', title: 'Master of the Hunt', color: 0x55cc33, armor: { plate: 0x3e7a2e, dark: 0x264a1e, trim: 0x8fe08f },
    description: 'Eyes sharp as a hawk, bow always drawn: rains death from afar with unmatched precision.',
    skills: ['arrow_of_beyond', 'arrow_storm', 'ricochet', 'autoaim', 'quickshot'],
  },
  impaler: {
    id: 'impaler', classId: 'rogue', name: 'Impaler', title: 'Lance of the Wilds', color: 0xff9a2a, armor: { plate: 0xb8621e, dark: 0x7a3a12, trim: 0xffb050 },
    description: 'Where others dodge and weave, the Impaler charges forward: skewering foes on steel with reckless ferocity.',
    shields: true,
    skills: ['spear_wall', 'impale', 'reckless_charge'],
  },
  silverblade: {
    id: 'silverblade', classId: 'rogue', name: 'Silverblade', title: 'Shadow of Daggers', color: 0xb0b0d0, armor: { plate: 0x363640, dark: 0x1c1c24, trim: 0xb0b0d0 },
    description: 'A ghost in the dark: closes in unseen, then ends the fight before it begins.',
    skills: ['gods_hand', 'cutthroat', 'daggers_protection'],
  },
};

export function pledgesFor(classId: ClassId): PledgeDef[] {
  return Object.values(PLEDGES).filter((p) => p.classId === classId);
}
