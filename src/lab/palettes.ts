/** Named materials so every sprite reads its colours from one palette. */
export interface Palette {
  id: string;
  name: string;
  blurb: string;
  outline: number;
  background: number;
  floor: number;
  floorAlt: number;
  seam: number;
  wall: number;
  wallTop: number;
  grass: number;
  skin: number;
  heroCloth: number;
  heroTrim: number;
  leather: number;
  steel: number;
  wood: number;
  ghoul: number;
  ghoulDark: number;
  bone: number;
  brute: number;
  bruteDark: number;
  wraith: number;
  fire: number;
  fireCore: number;
  ice: number;
  poison: number;
  gold: number;
  blood: number;
  eyeGlow: number;
  /** How much the ramps spread between shadow and highlight. */
  contrast: number;
  /** Ambient darkness away from lights, 0 = fully lit, 1 = black. */
  darkness: number;
}

export const PALETTES: Palette[] = [
  {
    id: 'grim', name: 'Grim', blurb: 'Diablo 1 mood: cold stone, deep shadow, warm fire.',
    outline: 0x0a0a12, background: 0x06070c, floor: 0x3e3e4a, floorAlt: 0x3a3a46, seam: 0x25252d, wall: 0x4a4a56, wallTop: 0x5c5c6a, grass: 0x3a4a32,
    skin: 0xb8927a, heroCloth: 0x2c3c70, heroTrim: 0xc8a040, leather: 0x6a4a34, steel: 0x8e94a2, wood: 0x5a4030,
    ghoul: 0x6a7a5c, ghoulDark: 0x46523e, bone: 0xd8d0b8, brute: 0x8a3e3a, bruteDark: 0x5a2826, wraith: 0x46508a,
    fire: 0xff8a2a, fireCore: 0xffe08a, ice: 0x9fe0ff, poison: 0x70e070, gold: 0xe8c050, blood: 0x8a1818, eyeGlow: 0xffe066,
    contrast: 1.0, darkness: 0.7,
  },
  {
    id: 'ember', name: 'Ember', blurb: 'Warm earth and torchlight, browner and softer.',
    outline: 0x1a1008, background: 0x120c08, floor: 0x5a4636, floorAlt: 0x544232, seam: 0x36281c, wall: 0x6a5240, wallTop: 0x7e6450, grass: 0x5a6a3a,
    skin: 0xd0a080, heroCloth: 0x4a3a6a, heroTrim: 0xe0b050, leather: 0x7a5a3a, steel: 0xa0a0a8, wood: 0x6a4a30,
    ghoul: 0x7a8a5c, ghoulDark: 0x56603e, bone: 0xe8dcc0, brute: 0x9a4a3a, bruteDark: 0x6a3026, wraith: 0x5a5a8a,
    fire: 0xffa040, fireCore: 0xfff0a0, ice: 0xb0e8ff, poison: 0x80e860, gold: 0xf0c860, blood: 0x9a2020, eyeGlow: 0xfff080,
    contrast: 0.9, darkness: 0.55,
  },
  {
    id: 'classic', name: 'Classic 16-bit', blurb: 'Bright and saturated, like a console RPG.',
    outline: 0x101020, background: 0x181828, floor: 0x707088, floorAlt: 0x6a6a82, seam: 0x484860, wall: 0x8888a0, wallTop: 0xa0a0b8, grass: 0x58a048,
    skin: 0xf0c8a0, heroCloth: 0x3858c8, heroTrim: 0xf8d050, leather: 0x906040, steel: 0xc0c8d8, wood: 0x805838,
    ghoul: 0x88b070, ghoulDark: 0x587848, bone: 0xf8f0e0, brute: 0xc05048, bruteDark: 0x803030, wraith: 0x6870c0,
    fire: 0xff9030, fireCore: 0xfff8b0, ice: 0xb8f0ff, poison: 0x88f870, gold: 0xf8d860, blood: 0xc02828, eyeGlow: 0xfff8a0,
    contrast: 1.1, darkness: 0.3,
  },
];
