import type { BuffMods } from './skills';
import { formatStat, type StatKey, type StatMap } from './stats';

/**
 * Item sets: hand-written pieces that share a name, and a bonus for wearing
 * every piece. Pieces drop only in the zones listed, at the set's own weight
 * out of 100 (set rarity has no weight anywhere else).
 */
export interface SetDef {
  id: string;
  name: string;
  /** Base item ids, one per piece. */
  pieces: string[];
  /** Granted while every piece is worn. */
  bonus: StatMap;
  /** Percentage modifiers granted with the full set, the same kind a buff carries (attack speed, damage, movement). */
  mods?: BuffMods;
  /** Zone ids where the pieces can drop. */
  zones: string[];
  /** Weight out of 100 for a drop in those zones to be a set piece. */
  dropWeight: number;
  blurb: string;
}

export const SETS: Record<string, SetDef> = {
  pilgrim: {
    id: 'pilgrim',
    name: "Pilgrim's Vestments",
    pieces: ['pilgrim_cap', 'pilgrim_coat', 'pilgrim_gloves', 'pilgrim_boots'],
    bonus: { moveSpeed: 25, str: 10, dex: 10, int: 10, vit: 10, goldFind: 25 },
    zones: ['proving_grounds', 'cursed_hollow'],
    dropWeight: 2,
    blurb: 'Travelling clothes for the first road out of town. Worn by every class.',
  },
  prisoner: {
    id: 'prisoner',
    name: "Prisoner's Nightmare",
    pieces: ['prisoner_cuffs', 'prisoner_ball'],
    bonus: {},
    mods: { moveSpdPct: -50, atkSpdPct: -50, dmgPct: 200 },
    zones: ['ashen_marsh', 'frozen_crypt'],
    dropWeight: 2,
    blurb: 'Shackles that drag you down and slow your arm, and turn every blow into a hammer.',
  },
};

/** The full-set bonus as card lines: stats first, then the percentage modifiers. */
export function describeSetBonus(set: SetDef): string[] {
  const lines = (Object.entries(set.bonus) as [StatKey, number][]).map(([k, v]) => formatStat(k, v));
  const m = set.mods;
  const pct = (v: number | undefined, name: string) => (v ? lines.push(`${v > 0 ? '+' : ''}${v}% ${name}`) : undefined);
  if (m) {
    pct(m.dmgPct, 'Damage');
    pct(m.atkSpdPct, 'Attack Speed');
    pct(m.moveSpdPct, 'Movement Speed');
  }
  return lines;
}

/** The sets whose pieces can drop in a zone. */
export function setsForZone(zoneId: string): SetDef[] {
  return Object.values(SETS).filter((s) => s.zones.includes(zoneId));
}
