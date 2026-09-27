import type { BufferGeometry } from 'three';
import { Part, PartBuilder, type PartId } from './parts';
import type { CharacterRecipe } from './characters/types';

const WOOD = 0x4a3524;
const WOOD_LIGHT = 0x6a5034;
const STONE = 0x3a3a40;
const STONE_LIGHT = 0x5a5a62;
const IRON = 0x2a2a30;
const STRAW = 0xb89a5a;

/** The merchant: stout, aproned, with a wide hat. Uses the character shader so he idles. */
export const vendorRecipe: CharacterRecipe = {
  id: 'vendor',
  name: 'Merchant',
  blurb: '',
  height: 1.9,
  glowColor: 0xffc060,
  build() {
    const b = new PartBuilder();
    const tp: [number, number, number] = [0, 0.9, 0];
    b.box({ at: [0, 1.0, 0], size: [0.8, 0.8, 0.6], taper: [0.85, 0.9], color: 0x6a3a2a, part: Part.Torso, pivot: tp });
    b.box({ at: [0, 0.8, 0.12], size: [0.5, 0.7, 0.42], taper: [0.9, 0.9], color: 0xc8b89a, part: Part.Torso, pivot: tp });
    b.box({ at: [0, 1.42, 0], size: [0.72, 0.12, 0.5], color: 0x3a2a1a, part: Part.Torso, pivot: tp });
    const hp: [number, number, number] = [0, 1.5, 0];
    b.box({ at: [0, 1.68, 0.02], size: [0.34, 0.32, 0.32], color: 0xd9b28a, part: Part.Head, pivot: hp });
    b.box({ at: [0, 1.56, 0.12], size: [0.3, 0.14, 0.14], color: 0x7a6a5a, part: Part.Head, pivot: hp });
    b.box({ at: [0, 1.88, 0], size: [0.6, 0.05, 0.6], color: 0x3a2a1a, part: Part.Head, pivot: hp });
    b.box({ at: [0, 1.98, 0], size: [0.34, 0.2, 0.34], taper: [0.85, 0.85], color: 0x3a2a1a, part: Part.Head, pivot: hp });
    b.box({ at: [-0.07, 1.7, 0.17], size: [0.05, 0.03, 0.02], color: 0x1a1a1a, part: Part.Head, pivot: hp });
    b.box({ at: [0.07, 1.7, 0.17], size: [0.05, 0.03, 0.02], color: 0x1a1a1a, part: Part.Head, pivot: hp });
    const arm = (s: -1 | 1, part: PartId) => {
      const pivot: [number, number, number] = [s * 0.48, 1.32, 0];
      b.box({ at: [s * 0.52, 1.02, 0.05], size: [0.2, 0.56, 0.22], color: 0x6a3a2a, part, pivot });
      b.box({ at: [s * 0.52, 0.7, 0.08], size: [0.16, 0.14, 0.16], color: 0xd9b28a, part, pivot });
    };
    arm(-1, Part.ArmL);
    arm(1, Part.ArmR);
    const leg = (s: -1 | 1, part: PartId) => {
      const pivot: [number, number, number] = [s * 0.18, 0.62, 0];
      b.box({ at: [s * 0.18, 0.32, 0], size: [0.24, 0.6, 0.26], color: 0x3a3028, part, pivot });
      b.box({ at: [s * 0.18, 0.08, 0.05], size: [0.26, 0.16, 0.34], color: 0x2a2018, part, pivot });
    };
    leg(-1, Part.LegL);
    leg(1, Part.LegR);
    return b.build();
  },
};

/** Training dummy: post, crossbar and a straw body with an element-coloured band. */
export function dummyRecipe(color: number): CharacterRecipe {
  return {
    id: `dummy_${color.toString(16)}`,
    name: 'Training Dummy',
    blurb: '',
    height: 1.9,
    glowColor: color,
    build() {
      const b = new PartBuilder();
      const tp: [number, number, number] = [0, 0.6, 0];
      b.prism([0, 0.06, 0], 0.4, 0.12, STONE, Part.Extra, 8);
      b.box({ at: [0, 0.9, 0], size: [0.12, 1.7, 0.12], color: WOOD, part: Part.Extra });
      b.box({ at: [0, 1.15, 0], size: [0.5, 0.6, 0.4], taper: [0.9, 0.9], color: STRAW, part: Part.Torso, pivot: tp });
      b.box({ at: [0, 1.15, 0], size: [0.54, 0.12, 0.44], color, part: Part.Torso, pivot: tp, glow: 0.35 });
      b.box({ at: [0, 1.35, 0], size: [1.1, 0.08, 0.1], color: WOOD_LIGHT, part: Part.Torso, pivot: tp });
      b.box({ at: [0, 1.66, 0], size: [0.3, 0.3, 0.3], taper: [0.8, 0.8], color: STRAW, part: Part.Head, pivot: [0, 1.5, 0] });
      b.box({ at: [0, 1.66, 0.155], size: [0.16, 0.05, 0.02], color: 0x2a2018, part: Part.Head, pivot: [0, 1.5, 0] });
      return b.build();
    },
  };
}

export function buildStashChest(): BufferGeometry {
  const b = new PartBuilder();
  b.box({ at: [0, 0.3, 0], size: [1.1, 0.6, 0.7], color: WOOD, part: Part.Extra });
  b.box({ at: [0, 0.7, 0], size: [1.14, 0.24, 0.74], taper: [0.9, 0.7], color: WOOD_LIGHT, part: Part.Extra });
  b.box({ at: [0, 0.45, 0.36], size: [0.16, 0.2, 0.04], color: 0xb08a3a, part: Part.Extra });
  for (const x of [-0.4, 0.4]) b.box({ at: [x, 0.5, 0], size: [0.06, 1.0, 0.76], color: IRON, part: Part.Extra });
  return b.build();
}

export function buildForge(): BufferGeometry {
  const b = new PartBuilder();
  b.box({ at: [0, 0.45, 0], size: [1.3, 0.9, 1.0], taper: [0.9, 0.9], color: STONE, part: Part.Extra });
  b.box({ at: [0, 1.0, 0], size: [0.9, 0.2, 0.7], color: STONE_LIGHT, part: Part.Extra });
  b.box({ at: [0, 1.06, 0], size: [0.7, 0.1, 0.5], color: 0xffa040, part: Part.Extra, glow: 0.9 });
  b.box({ at: [0.9, 0.5, 0.3], size: [0.5, 0.3, 0.3], taper: [0.7, 1], color: IRON, part: Part.Extra });
  b.box({ at: [0.9, 0.2, 0.3], size: [0.3, 0.3, 0.3], color: IRON, part: Part.Extra });
  b.box({ at: [0, 1.8, -0.4], size: [0.4, 1.4, 0.4], taper: [0.8, 0.8], color: STONE, part: Part.Extra });
  return b.build();
}

export function buildBloodFountain(): BufferGeometry {
  const b = new PartBuilder();
  b.prism([0, 0.15, 0], 0.9, 0.3, STONE, Part.Extra, 8);
  b.prism([0, 0.45, 0], 0.8, 0.3, STONE_LIGHT, Part.Extra, 8, 0.7);
  b.prism([0, 0.62, 0], 0.62, 0.06, 0xcc1111, Part.Extra, 8);
  const g = b;
  g.prism([0, 0.9, 0], 0.12, 0.7, STONE, Part.Extra, 6);
  g.prism([0, 1.3, 0], 0.32, 0.12, STONE_LIGHT, Part.Extra, 8, 0.2);
  g.prism([0, 1.4, 0], 0.24, 0.05, 0xff2020, Part.Extra, 8);
  const geo = g.build();
  const glow = geo.getAttribute('aGlow');
  const col = geo.getAttribute('color');
  for (let i = 0; i < col.count; i++) if (col.getX(i) > 0.5 && col.getY(i) < 0.1) glow.setX(i, 0.7);
  return geo;
}

export function buildArcanaOracle(): BufferGeometry {
  const b = new PartBuilder();
  b.prism([0, 0.2, 0], 0.7, 0.4, STONE, Part.Extra, 6);
  b.prism([0, 0.75, 0], 0.3, 0.7, STONE_LIGHT, Part.Extra, 6, 0.36);
  b.box({ at: [0, 1.55, 0], size: [0.5, 0.8, 0.5], taper: [0.05, 0.05], color: 0xbb66ff, part: Part.Extra, glow: 0.7 });
  b.box({ at: [0, 1.0, 0], size: [0.5, 0.5, 0.5], taper: [0.05, 0.05], rotate: [Math.PI, 0, 0], color: 0x9955ee, part: Part.Extra, glow: 0.5 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.box({ at: [Math.cos(a) * 0.9, 0.5, Math.sin(a) * 0.9], size: [0.16, 1.0, 0.16], taper: [0.5, 0.5], color: STONE, part: Part.Extra });
  }
  return b.build();
}

/** A ring of standing stones with a glowing floor. `color` tints the glow. */
export function buildPortal(color: number, arch = false): BufferGeometry {
  const b = new PartBuilder();
  b.prism([0, 0.05, 0], 1.1, 0.1, STONE, Part.Extra, 12);
  b.prism([0, 0.11, 0], 0.85, 0.04, color, Part.Extra, 12);
  if (arch) {
    b.box({ at: [-0.9, 1.2, 0], size: [0.3, 2.4, 0.3], color: STONE, part: Part.Extra });
    b.box({ at: [0.9, 1.2, 0], size: [0.3, 2.4, 0.3], color: STONE, part: Part.Extra });
    b.box({ at: [0, 2.5, 0], size: [2.1, 0.3, 0.3], color: STONE_LIGHT, part: Part.Extra });
    b.box({ at: [0, 1.25, 0], size: [1.5, 2.2, 0.06], color, part: Part.Extra, glow: 0.5 });
  } else {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.box({ at: [Math.cos(a) * 1.05, 0.5 + (i % 2) * 0.2, Math.sin(a) * 1.05], size: [0.24, 1.0 + (i % 2) * 0.4, 0.24], taper: [0.6, 0.6], rotate: [0, -a, 0], color: STONE, part: Part.Extra });
    }
  }
  const geo = b.build();
  const glow = geo.getAttribute('aGlow');
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0.12 && pos.getY(i) < 0.14) glow.setX(i, 0.8);
  return geo;
}
