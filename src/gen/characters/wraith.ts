import { Part, PartBuilder } from '../parts';
import type { CharacterRecipe } from './types';

const CLOTH = 0x3a4160;
const CLOTH_DARK = 0x232840;
const BONE = 0x8a8a90;
const EYES = 0x9fe0ff;

export const wraith: CharacterRecipe = {
  id: 'wraith',
  name: 'Wraith',
  blurb: 'Drifts above the ground. Cold to the touch.',
  height: 2.4,
  hover: true,
  glowColor: EYES,
  build() {
    const b = new PartBuilder();
    const torsoPivot: [number, number, number] = [0, 0.95, 0];

    b.box({ at: [0, 1.05, 0], size: [0.56, 1.3, 0.44], taper: [0.7, 0.75], color: CLOTH, part: Part.Torso, pivot: torsoPivot, glow: 0.12 });
    // Tattered hem
    const tatters: [number, number, number, number][] = [
      [-0.2, 0.22, 0.1, 0.42],
      [0.05, 0.28, -0.08, 0.5],
      [0.22, 0.26, 0.06, 0.34],
      [-0.06, 0.2, 0.16, 0.38],
    ];
    for (const [x, y, z, h] of tatters) {
      b.box({ at: [x, y, z], size: [0.14, h, 0.12], taper: [1.6, 1.4], color: CLOTH_DARK, part: Part.Torso, pivot: torsoPivot, glow: 0.18 });
    }
    b.box({ at: [0, 1.55, 0], size: [0.5, 0.14, 0.4], taper: [0.9, 0.9], color: CLOTH_DARK, part: Part.Torso, pivot: torsoPivot });

    const headPivot: [number, number, number] = [0, 1.62, 0];
    b.box({ at: [0, 1.88, -0.06], size: [0.46, 0.5, 0.4], taper: [0.45, 0.5], color: CLOTH, part: Part.Head, pivot: headPivot, glow: 0.1 });
    b.box({ at: [0, 1.8, 0.08], size: [0.28, 0.3, 0.14], color: 0x04050a, part: Part.Head, pivot: headPivot });
    b.box({ at: [-0.065, 1.83, 0.155], size: [0.07, 0.05, 0.02], color: EYES, part: Part.Head, pivot: headPivot, glow: 1 });
    b.box({ at: [0.065, 1.83, 0.155], size: [0.07, 0.05, 0.02], color: EYES, part: Part.Head, pivot: headPivot, glow: 1 });

    const arm = (side: -1 | 1, part: typeof Part.ArmL | typeof Part.ArmR) => {
      const pivot: [number, number, number] = [side * 0.36, 1.52, 0];
      b.box({ at: [side * 0.4, 1.2, 0.1], size: [0.2, 0.7, 0.2], taper: [0.7, 0.7], rotate: [-0.35, 0, side * -0.15], color: CLOTH, part, pivot, glow: 0.1 });
      b.box({ at: [side * 0.44, 0.9, 0.36], size: [0.1, 0.16, 0.1], color: BONE, part, pivot });
      for (let i = -1; i <= 1; i++) {
        b.box({ at: [side * 0.44 + i * 0.04, 0.78, 0.4], size: [0.025, 0.14, 0.025], taper: [0.5, 0.5], color: BONE, part, pivot });
      }
    };
    arm(-1, Part.ArmL);
    arm(1, Part.ArmR);
    return b.build();
  },
};
