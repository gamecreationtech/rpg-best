/**
 * Where everything in town stands, in tiles (the town is 44 by 33, open from
 * 2 to 42 across and 2 to 31 down). The simulation reads the stations, the
 * merchant, the dummies and the hero's start from here; the renderer reads
 * the decorations. Creator mode (Menu, Creator mode, in town) moves these and
 * gives the producer a code to paste back, which is copied in here by hand.
 * Each spot is [x, z]: x grows toward the lower right of the screen, z
 * toward the lower left.
 */
export type Spot = [number, number];

export interface TownLayoutData {
  /** Where the hero appears on entering town. */
  spawn: Spot;
  vendor: Spot;
  /** The merchant's caravan and the chest beside him. */
  caravan: Spot;
  merchantChest: Spot;
  stash: Spot;
  forge: Spot;
  bloodfountain: Spot;
  arcana: Spot;
  waypoint: Spot;
  /** Where the return portal appears after visiting the Proving Grounds. */
  returnPortal: Spot;
  /** The five training dummies, in the order of `DUMMIES`. */
  dummies: Spot[];
  braziers: Spot[];
  pillars: Spot[];
  rubble: Spot[];
}

export const TOWN_LAYOUT: TownLayoutData = {
  spawn: [23, 15],
  vendor: [15.5, 12.5],
  caravan: [13.9, 12.7],
  merchantChest: [16.8, 12.6],
  stash: [19.5, 9.5],
  forge: [27.5, 9.5],
  bloodfountain: [31.5, 12.5],
  arcana: [23.5, 8],
  waypoint: [30.5, 18.5],
  returnPortal: [34.5, 21.5],
  dummies: [[12.5, 22.5], [15.5, 22.5], [18.5, 22.5], [21.5, 22.5], [24.5, 22.5]],
  braziers: [[6.5, 6.5], [38.5, 6.5], [6.5, 27.5], [38.5, 27.5], [22.5, 4.5], [14.5, 17.5], [30.5, 14.5]],
  pillars: [[3.5, 29.5], [10.5, 3.5], [17.5, 29.5], [24.5, 3.5], [31.5, 29.5], [38.5, 3.5], [7.5, 29.5], [14.5, 3.5], [21.5, 29.5], [28.5, 3.5], [40.5, 6], [3.5, 10], [40.5, 14], [3.5, 18], [40.5, 22], [3.5, 26]],
  rubble: [[4.5, 4.5], [15.5, 11.5], [26.5, 18.5], [37.5, 25.5], [12.5, 7.5], [23.5, 14.5], [34.5, 21.5], [9.5, 28.5], [20.5, 10.5], [31.5, 17.5], [6.5, 24.5], [17.5, 6.5], [28.5, 13.5], [39.5, 20.5], [14.5, 27.5], [25.5, 9.5], [36.5, 16.5], [11.5, 23.5], [22.5, 5.5], [33.5, 12.5], [8.5, 19.5], [19.5, 26.5], [30.5, 8.5], [5.5, 15.5]],
};

/** The single pieces, in the order creator mode lists them, with their names. */
export const TOWN_SINGLES: [keyof TownLayoutData, string][] = [
  ['spawn', 'Hero start'],
  ['vendor', 'Merchant'],
  ['caravan', 'Caravan'],
  ['merchantChest', 'Merchant chest'],
  ['stash', 'Stash'],
  ['forge', 'Forge of Heaven'],
  ['bloodfountain', 'Blood Fountain'],
  ['arcana', 'Arcana Oracle'],
  ['waypoint', 'Waypoint'],
  ['returnPortal', 'Return portal'],
];

/** The lists of pieces, with the name of one of them. */
export const TOWN_LISTS: ['dummies' | 'braziers' | 'pillars' | 'rubble', string][] = [
  ['dummies', 'Training dummy'],
  ['braziers', 'Brazier'],
  ['pillars', 'Pillar'],
  ['rubble', 'Rubble'],
];

/** One movable piece: `stash`, or `braziers.3` for one of a list. */
export interface TownPiece {
  path: string;
  label: string;
  spot: Spot;
}

/** Every piece of a layout, singles first; the spots are the layout's own arrays, so changing one moves the piece. */
export function townPieces(layout: TownLayoutData): TownPiece[] {
  const out: TownPiece[] = TOWN_SINGLES.map(([key, label]) => ({ path: key, label, spot: layout[key] as Spot }));
  for (const [key, label] of TOWN_LISTS) layout[key].forEach((spot, i) => out.push({ path: `${key}.${i}`, label: `${label} ${i + 1}`, spot }));
  return out;
}

/** A deep copy, so a draft can change without touching the original. */
export function copyTownLayout(layout: TownLayoutData): TownLayoutData {
  return JSON.parse(JSON.stringify(layout)) as TownLayoutData;
}

/** The open part of town a piece may stand in. */
export const TOWN_BOUNDS = { minX: 2.5, maxX: 41.5, minZ: 2.5, maxZ: 30.5 };

const CODE_HEADER = 'FALLING-SKY-TOWN v1';

/** The code creator mode hands the producer: a header line, then the layout as JSON with one piece per line. */
export function townLayoutCode(layout: TownLayoutData): string {
  const lines = Object.entries(layout).map(([key, v]) => `  "${key}": ${JSON.stringify(v)}`);
  return `${CODE_HEADER}\n{\n${lines.join(',\n')}\n}`;
}

/** Reads a code back, or null when it is not a valid town layout. */
export function parseTownLayoutCode(code: string): TownLayoutData | null {
  const at = code.indexOf('{');
  if (!code.trim().startsWith(CODE_HEADER) || at < 0) return null;
  try {
    const data = JSON.parse(code.slice(at)) as Record<string, unknown>;
    const isSpot = (v: unknown): v is Spot => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
    for (const [key] of TOWN_SINGLES) if (!isSpot(data[key])) return null;
    for (const [key] of TOWN_LISTS) {
      const list = data[key];
      if (!Array.isArray(list) || list.length !== TOWN_LAYOUT[key].length || !list.every(isSpot)) return null;
    }
    return data as unknown as TownLayoutData;
  } catch {
    return null;
  }
}
