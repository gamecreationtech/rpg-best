import { Part, PartBuilder } from '../parts';
import type { CharacterRecipe } from './types';

const SKIN = 0x5c6b52;
const SKIN_DARK = 0x3f4a38;
const BELLY = 0x7c8c6a;
const BONE = 0xd8d0b8;
const EYES = 0xf0e040;

export const ghoul: CharacterRecipe = {
  id: 'ghoul',
  name: 'Ghoul',
  blurb: 'Hunched, fast, comes in packs.',
  height: 1.6,
  glowColor: EYES,
  build() {
    const b = new PartBuilder();
    const torsoPivot: [number, number, number] = [0, 0.72, 0];
    const lean: [number, number, number] = [0.5, 0, 0];

    b.box({ at: [0, 1.0, 0.02], size: [0.5, 0.62, 0.36], taper: [1.3, 1.1], rotate: lean, color: SKIN, part: Part.Torso, pivot: torsoPivot });
    b.box({ at: [0, 0.9, 0.2], size: [0.3, 0.36, 0.14], rotate: lean, color: BELLY, part: Part.Torso, pivot: torsoPivot });
    // Spine ridges
    for (let i = 0; i < 4; i++) {
      b.box({ at: [0, 0.8 + i * 0.13, -0.2], size: [0.08, 0.06, 0.08], rotate: lean, color: SKIN_DARK, part: Part.Torso, pivot: torsoPivot });
    }

    const headPivot: [number, number, number] = [0, 1.22, 0.24];
    b.box({ at: [0, 1.3, 0.4], size: [0.32, 0.26, 0.34], taper: [0.8, 0.9], rotate: [0.25, 0, 0], color: SKIN, part: Part.Head, pivot: headPivot });
    b.box({ at: [0, 1.19, 0.5], size: [0.22, 0.1, 0.16], color: SKIN_DARK, part: Part.Head, pivot: headPivot });
    b.box({ at: [-0.08, 1.33, 0.565], size: [0.06, 0.05, 0.03], color: EYES, part: Part.Head, pivot: headPivot, glow: 1 });
    b.box({ at: [0.08, 1.33, 0.565], size: [0.06, 0.05, 0.03], color: EYES, part: Part.Head, pivot: headPivot, glow: 1 });
    // Teeth
    b.box({ at: [0, 1.235, 0.57], size: [0.16, 0.03, 0.03], color: BONE, part: Part.Head, pivot: headPivot });

    const arm = (side: -1 | 1, part: typeof Part.ArmL | typeof Part.ArmR) => {
      const pivot: [number, number, number] = [side * 0.34, 1.12, 0.12];
      b.box({ at: [side * 0.37, 0.72, 0.16], size: [0.15, 0.8, 0.15], taper: [0.8, 0.8], color: SKIN, part, pivot });
      b.box({ at: [side * 0.37, 0.3, 0.18], size: [0.17, 0.14, 0.18], color: SKIN_DARK, part, pivot });
      for (let i = -1; i <= 1; i++) {
        b.box({ at: [side * 0.37 + i * 0.05, 0.2, 0.29], size: [0.035, 0.1, 0.12], taper: [0.4, 0.3], rotate: [1.4, 0, 0], color: BONE, part, pivot });
      }
    };
    arm(-1, Part.ArmL);
    arm(1, Part.ArmR);

    const leg = (side: -1 | 1, part: typeof Part.LegL | typeof Part.LegR) => {
      const pivot: [number, number, number] = [side * 0.15, 0.66, 0];
      b.box({ at: [side * 0.15, 0.36, 0], size: [0.19, 0.62, 0.2], taper: [0.9, 0.9], color: SKIN_DARK, part, pivot });
      b.box({ at: [side * 0.15, 0.06, 0.08], size: [0.2, 0.12, 0.32], taper: [1, 1.1], color: SKIN_DARK, part, pivot });
    };
    leg(-1, Part.LegL);
    leg(1, Part.LegR);
    return b.build();
  },
};
