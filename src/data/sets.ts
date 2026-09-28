import type { StatMap } from './stats';

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
};

/** The sets whose pieces can drop in a zone. */
export function setsForZone(zoneId: string): SetDef[] {
  return Object.values(SETS).filter((s) => s.zones.includes(zoneId));
}
