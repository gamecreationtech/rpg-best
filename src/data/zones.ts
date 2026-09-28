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
    spawns: { ghoul: 42, skeleton: 35, wraith: 18, brute: 5 }, maxAlive: 36, spawnInterval: 1.6,
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
    spawns: { frost_wraith: 28, revenant: 22, necromancer: 14, ice_golem: 6, skeleton: 30 }, maxAlive: 40, spawnInterval: 1.5,
    tiles: { floor: 0x3e4658, floorAlt: 0x384052, seam: 0x1e2434, wall: 0x4a5670, wallTop: 0x6a7a96 },
    lightColor: 0x7fd8ff, darkness: 0.62, decor: 'ice',
  },
  {
    id: 'ember_foundry', name: 'Ember Foundry', blurb: 'A dwarven forge that never went cold. Cinder bats in the rafters, imps in the slag, and golems still working the furnaces.',
    level: 26, layout: 'ruins', cols: 84, rows: 66,
    spawns: { cinder_bat: 30, ash_ghoul: 32, magma_imp: 22, slag_brute: 10, forge_golem: 6 }, maxAlive: 48, spawnInterval: 1.4,
    tiles: { floor: 0x4a3230, floorAlt: 0x442c2a, seam: 0x2a1614, wall: 0x5a3a34, wallTop: 0x7a4a3c },
    lightColor: 0xff6a2a, darkness: 0.6, decor: 'rubble',
  },
  {
    id: 'sunken_temple', name: 'Sunken Temple', blurb: 'Flooded halls of a drowned god. The drowned wander the shallows, spiders nest above the water, and the guardians still keep their posts.',
    level: 35, layout: 'caves', cols: 90, rows: 70,
    spawns: { drowned: 32, deep_spider: 26, tide_wraith: 20, temple_guardian: 16, sunken_troll: 6 }, maxAlive: 48, spawnInterval: 1.4,
    tiles: { floor: 0x2e4444, floorAlt: 0x2a3e3e, seam: 0x162424, wall: 0x3a4e4c, wallTop: 0x4c645e },
    lightColor: 0x60d0c0, darkness: 0.66, decor: 'mushrooms',
  },
  {
    id: 'blighted_orchard', name: 'Blighted Orchard', blurb: 'Rows of dead trees over poisoned soil. Rats by the dozen, crawlers under the roots, archers in the branches and the trolls that tend them.',
    level: 45, layout: 'field', cols: 84, rows: 64,
    spawns: { orchard_rat: 30, blighted_ghoul: 26, plague_archer: 18, blight_crawler: 18, rot_troll: 8 }, maxAlive: 52, spawnInterval: 1.3,
    tiles: { floor: 0x3e4430, floorAlt: 0x383e2a, seam: 0x1e2416, wall: 0x4a4e3a, wallTop: 0x60664a },
    lightColor: 0xb0ff70, darkness: 0.56, decor: 'mushrooms',
  },
  {
    id: 'obsidian_halls', name: 'Obsidian Halls', blurb: 'Black glass corridors under the mountain. Knights of obsidian, wisps of storm, necromancers of the void and the golems they carved.',
    level: 58, layout: 'crypt', cols: 86, rows: 70,
    spawns: { crypt_bat: 24, storm_wisp: 24, obsidian_knight: 28, void_necromancer: 16, obsidian_golem: 8 }, maxAlive: 46, spawnInterval: 1.5,
    tiles: { floor: 0x2e2838, floorAlt: 0x2a2434, seam: 0x14101c, wall: 0x3c3448, wallTop: 0x54486a },
    lightColor: 0xb080ff, darkness: 0.68, decor: 'bones',
  },
  {
    id: 'storm_peaks', name: 'Storm Peaks', blurb: 'A mountain top in an endless storm. Bats that crackle, skeletons of frost, archers on the ledges, wraiths in the clouds and brutes on the passes.',
    level: 72, layout: 'field', cols: 84, rows: 64,
    spawns: { thunder_bat: 28, frost_skeleton: 28, sky_archer: 18, storm_wraith: 16, peak_brute: 10 }, maxAlive: 50, spawnInterval: 1.4,
    tiles: { floor: 0x46505e, floorAlt: 0x404a58, seam: 0x242c38, wall: 0x56607a, wallTop: 0x78849c },
    lightColor: 0xd0e8ff, darkness: 0.5, decor: 'ice',
  },
  {
    id: 'the_abyss', name: 'The Abyss', blurb: 'The pit under the world. Everything that fell in is still down here, hungry, and the golems of doom guard the way further down.',
    level: 88, layout: 'caves', cols: 92, rows: 72,
    spawns: { abyss_ghoul: 30, abyss_spider: 24, void_wraith: 18, abyss_necromancer: 14, abyssal_horror: 8, doom_golem: 6 }, maxAlive: 50, spawnInterval: 1.4,
    tiles: { floor: 0x2a2026, floorAlt: 0x261c22, seam: 0x3a1018, wall: 0x36282e, wallTop: 0x4a3038 },
    lightColor: 0xff3060, darkness: 0.72, decor: 'bones',
  },
  {
    id: 'throne_of_the_fallen', name: 'Throne of the Fallen', blurb: 'The last hall, where the fallen king holds court. His knights, his archers, his necromancers and the golem that carries his throne.',
    level: 100, layout: 'crypt', cols: 86, rows: 70,
    spawns: { fallen_archer: 24, ember_wisp: 22, fallen_knight: 30, royal_necromancer: 16, throne_golem: 8 }, maxAlive: 46, spawnInterval: 1.5,
    tiles: { floor: 0x3a3226, floorAlt: 0x342c20, seam: 0x1c1810, wall: 0x4c4030, wallTop: 0x6a5a40 },
    lightColor: 0xffc040, darkness: 0.62, decor: 'rubble',
  },
];

export function zoneById(id: string): ZoneDef {
  return ZONES.find((z) => z.id === id) ?? ZONES[0]!;
}
