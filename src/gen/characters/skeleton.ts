import { Part, PartBuilder } from '../parts';
import type { CharacterRecipe } from './types';

const BONE = 0xd8cfb4;
const BONE_DARK = 0x8f8468;
const STEEL = 0x7a6e60;
const CLOTH = 0x3a2f2a;
const EYES = 0x40ff90;

export const skeleton: CharacterRecipe = {
  id: 'skeleton',
  name: 'Skeleton',
  blurb: 'Rattling bones with a rusted blade.',
  height: 1.85,
  glowColor: EYES,
  build() {
    const b = new PartBuilder();
    const torsoPivot: [number, number, number] = [0, 0.92, 0];

    b.box({ at: [0, 0.92, 0], size: [0.36, 0.16, 0.22], color: BONE_DARK, part: Part.Torso, pivot: torsoPivot });
    b.box({ at: [0, 1.16, -0.02], size: [0.1, 0.34, 0.1], color: BONE_DARK, part: Part.Torso, pivot: torsoPivot });
    for (let i = 0; i < 4; i++) {
      const w = 0.44 - i * 0.03;
      b.box({ at: [0, 1.2 + i * 0.1, 0.02], size: [w, 0.05, 0.28 - i * 0.02], color: BONE, part: Part.Torso, pivot: torsoPivot });
    }
    b.box({ at: [0, 1.32, 0.15], size: [0.08, 0.3, 0.05], color: BONE, part: Part.Torso, pivot: torsoPivot });
    b.box({ at: [0, 1.54, 0], size: [0.54, 0.1, 0.14], color: BONE, part: Part.Torso, pivot: torsoPivot });
    b.box({ at: [0, 0.76, 0], size: [0.38, 0.3, 0.08], color: CLOTH, part: Part.Torso, pivot: torsoPivot });

    const headPivot: [number, number, number] = [0, 1.58, 0];
    b.box({ at: [0, 1.74, 0], size: [0.28, 0.3, 0.3], taper: [0.9, 0.9], color: BONE, part: Part.Head, pivot: headPivot });
    b.box({ at: [0, 1.6, 0.04], size: [0.2, 0.08, 0.2], color: BONE_DARK, part: Part.Head, pivot: headPivot });
    b.box({ at: [-0.065, 1.76, 0.152], size: [0.08, 0.07, 0.02], color: EYES, part: Part.Head, pivot: headPivot, glow: 1 });
    b.box({ at: [0.065, 1.76, 0.152], size: [0.08, 0.07, 0.02], color: EYES, part: Part.Head, pivot: headPivot, glow: 1 });
    b.box({ at: [0, 1.66, 0.152], size: [0.05, 0.05, 0.02], color: 0x1a1810, part: Part.Head, pivot: headPivot });

    const arm = (side: -1 | 1, part: typeof Part.ArmL | typeof Part.ArmR) => {
      const pivot: [number, number, number] = [side * 0.3, 1.52, 0];
      b.box({ at: [side * 0.3, 1.24, 0], size: [0.09, 0.5, 0.09], color: BONE, part, pivot });
      b.box({ at: [side * 0.3, 1.0, 0], size: [0.11, 0.06, 0.11], color: BONE_DARK, part, pivot });
      b.box({ at: [side * 0.3, 0.86, 0.02], size: [0.08, 0.26, 0.08], color: BONE, part, pivot });
      b.box({ at: [side * 0.3, 0.72, 0.06], size: [0.11, 0.1, 0.12], color: BONE_DARK, part, pivot });
    };
    arm(-1, Part.ArmL);
    arm(1, Part.ArmR);

    // Sword held in the right hand, blade up
    const rPivot: [number, number, number] = [0.3, 1.52, 0];
    b.box({ at: [0.31, 0.72, 0.2], size: [0.06, 0.18, 0.06], color: CLOTH, part: Part.ArmR, pivot: rPivot });
    b.box({ at: [0.31, 0.82, 0.2], size: [0.24, 0.05, 0.08], color: STEEL, part: Part.ArmR, pivot: rPivot });
    b.box({ at: [0.31, 1.3, 0.2], size: [0.05, 0.9, 0.14], taper: [0.5, 0.3], color: 0x8e8e94, part: Part.ArmR, pivot: rPivot });

    const leg = (side: -1 | 1, part: typeof Part.LegL | typeof Part.LegR) => {
      const pivot: [number, number, number] = [side * 0.12, 0.86, 0];
      b.box({ at: [side * 0.12, 0.66, 0], size: [0.1, 0.4, 0.1], color: BONE, part, pivot });
      b.box({ at: [side * 0.12, 0.45, 0], size: [0.12, 0.06, 0.12], color: BONE_DARK, part, pivot });
      b.box({ at: [side * 0.12, 0.25, 0], size: [0.09, 0.36, 0.09], color: BONE, part, pivot });
      b.box({ at: [side * 0.12, 0.05, 0.08], size: [0.12, 0.09, 0.28], color: BONE_DARK, part, pivot });
    };
    leg(-1, Part.LegL);
    leg(1, Part.LegR);
    return b.build();
  },
};
