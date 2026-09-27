/**
 * Zones reachable from the town waypoint. Each has its own map generator, stone
 * colours, light colour and monster roster. Monster numbers scale with the
 * zone's level (see MONSTER_RULES), so the hero grows into the next zone.
 */

export type ZoneLayout = 'field' | 'caves' | 'ruins' | 'crypt';

export interface ZoneTiles {
  floor: number;
  floorAlt: number;
  seam: number;
  wall: number;
  wallTop: number;
}

export interface ZoneDef {
  id: string;
  name: string;
  blurb: string;
  /** Monster level; also the level the zone is meant for. */
  level: number;
  layout: ZoneLayout;
  cols: number;
  rows: number;
  /** Monster id to spawn weight. */
  spawns: Record<string, number>;
  maxAlive: number;
  spawnInterval: number;
  tiles: ZoneTiles;
  /** Colour of the zone's fixed lights. */
  lightColor: number;
  /** Ambient darkness, 0 lit to 1 black. */
  darkness: number;
  /** What the scattered decoration looks like. */
  decor: 'rubble' | 'bones' | 'mushrooms' | 'ice';
}

export const ZONES: ZoneDef[] = [
  {
    id: 'proving_grounds', name: 'Proving Grounds', blurb: 'An open field of broken stone where the dead shamble. The first steps beyond the walls.',
    level: 1, layout: 'field', cols: 80, rows: 60,
    spawns: { ghoul: 40, skeleton: 35, wraith: 18, brute: 7 }, maxAlive: 40, spawnInterval: 1.6,
    tiles: { floor: 0x46403a, floorAlt: 0x423c36, seam: 0x2a2520, wall: 0x4e4842, wallTop: 0x625a50 },
    lightColor: 0xff8a3a, darkness: 0.55, decor: 'rubble',
  },
  {
    id: 'cursed_hollow', name: 'Cursed Hollow', blurb: 'Winding caves under the hills. Bats in the dark, spiders in the cracks, archers who never ran out of arrows.',
    level: 6, layout: 'caves', cols: 90, rows: 70,
    spawns: { blood_bat: 34, cave_spider: 30, hollow_ghoul: 24, bone_archer: 12 }, maxAlive: 48, spawnInterval: 1.3,
    tiles: { floor: 0x3a3634, floorAlt: 0x363230, seam: 0x201c1a, wall: 0x3e3a38, wallTop: 0x4c4744 },
    lightColor: 0xffa050, darkness: 0.66, decor: 'bones',
  },
  {
    id: 'ashen_marsh', name: 'Ashen Marsh', blurb: 'Sunken ruins in a poisoned bog. Rats in packs, crawlers in the mud, wisps that bite with lightning, and the trolls that rule it.',
    level: 12, layout: 'ruins', cols: 84, rows: 66,
    spawns: { plague_rat: 34, bog_crawler: 22, marsh_wisp: 26, marsh_troll: 8, hollow_ghoul: 10 }, maxAlive: 52, spawnInterval: 1.4,
    tiles: { floor: 0x3c4436, floorAlt: 0x364030, seam: 0x1e2419, wall: 0x4a4e44, wallTop: 0x5c6254 },
    lightColor: 0x9fffb0, darkness: 0.6, decor: 'mushrooms',
  },
  {
    id: 'frozen_crypt', name: 'Frozen Crypt', blurb: 'Halls of ice beneath a dead king. Wraiths of frost, knights who will not stay buried, necromancers, and the golems they woke.',
    level: 18, layout: 'crypt', cols: 84, rows: 70,
    spawns: { frost_wraith: 30, revenant: 30, necromancer: 16, ice_golem: 6, skeleton: 18 }, maxAlive: 44, spawnInterval: 1.5,
    tiles: { floor: 0x3e4658, floorAlt: 0x384052, seam: 0x1e2434, wall: 0x4a5670, wallTop: 0x6a7a96 },
    lightColor: 0x7fd8ff, darkness: 0.62, decor: 'ice',
  },
];

export function zoneById(id: string): ZoneDef {
  return ZONES.find((z) => z.id === id) ?? ZONES[0]!;
}
