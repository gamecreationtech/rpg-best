import { Part, PartBuilder } from '../parts';
import type { CharacterRecipe } from './types';

const SKIN = 0x6e3a38;
const SKIN_DARK = 0x4a2624;
const BELLY = 0x8a4a44;
const HORN = 0xd8cfb4;
const CLOTH = 0x3a2a20;
const EYES = 0xff7020;

export const brute: CharacterRecipe = {
  id: 'brute',
  name: 'Brute',
  blurb: 'Slow, huge, hits like a falling roof.',
  height: 2.5,
  glowColor: EYES,
  build() {
    const b = new PartBuilder();
    const torsoPivot: [number, number, number] = [0, 1.05, 0];
    const lean: [number, number, number] = [0.22, 0, 0];

    b.box({ at: [0, 1.55, 0], size: [1.0, 0.9, 0.62], taper: [1.3, 1.1], rotate: lean, color: SKIN, part: Part.Torso, pivot: torsoPivot });
    b.box({ at: [0, 1.2, 0.12], size: [0.82, 0.5, 0.56], taper: [1.1, 1.0], rotate: lean, color: BELLY, part: Part.Torso, pivot: torsoPivot });
    b.box({ at: [-0.64, 2.0, 0], size: [0.42, 0.3, 0.5], taper: [0.8, 0.8], rotate: lean, color: SKIN_DARK, part: Part.Torso, pivot: torsoPivot });
    b.box({ at: [0.64, 2.0, 0], size: [0.42, 0.3, 0.5], taper: [0.8, 0.8], rotate: lean, color: SKIN_DARK, part: Part.Torso, pivot: torsoPivot });
    b.box({ at: [0, 0.86, 0.24], size: [0.5, 0.46, 0.06], color: CLOTH, part: Part.Torso, pivot: torsoPivot });
    // Back spikes
    for (let i = 0; i < 3; i++) {
      b.box({ at: [-0.25 + i * 0.25, 2.02, -0.3], size: [0.12, 0.28, 0.12], taper: [0.2, 0.2], rotate: [-0.4, 0, 0], color: HORN, part: Part.Torso, pivot: torsoPivot });
    }

    const headPivot: [number, number, number] = [0, 1.98, 0.22];
    b.box({ at: [0, 2.12, 0.34], size: [0.38, 0.34, 0.4], taper: [0.85, 0.9], color: SKIN, part: Part.Head, pivot: headPivot });
    b.box({ at: [0, 1.97, 0.42], size: [0.32, 0.12, 0.22], color: SKIN_DARK, part: Part.Head, pivot: headPivot });
    b.box({ at: [-0.09, 2.15, 0.54], size: [0.08, 0.06, 0.02], color: EYES, part: Part.Head, pivot: headPivot, glow: 1 });
    b.box({ at: [0.09, 2.15, 0.54], size: [0.08, 0.06, 0.02], color: EYES, part: Part.Head, pivot: headPivot, glow: 1 });
    b.box({ at: [-0.2, 2.36, 0.28], size: [0.11, 0.34, 0.11], taper: [0.25, 0.25], rotate: [0, 0, 0.55], color: HORN, part: Part.Head, pivot: headPivot });
    b.box({ at: [0.2, 2.36, 0.28], size: [0.11, 0.34, 0.11], taper: [0.25, 0.25], rotate: [0, 0, -0.55], color: HORN, part: Part.Head, pivot: headPivot });
    // Tusks
    b.box({ at: [-0.1, 2.02, 0.52], size: [0.05, 0.12, 0.05], taper: [0.4, 0.4], color: HORN, part: Part.Head, pivot: headPivot });
    b.box({ at: [0.1, 2.02, 0.52], size: [0.05, 0.12, 0.05], taper: [0.4, 0.4], color: HORN, part: Part.Head, pivot: headPivot });

    const arm = (side: -1 | 1, part: typeof Part.ArmL | typeof Part.ArmR) => {
      const pivot: [number, number, number] = [side * 0.78, 1.88, 0.04];
      b.box({ at: [side * 0.8, 1.38, 0.08], size: [0.32, 1.0, 0.32], taper: [0.85, 0.85], color: SKIN, part, pivot });
      b.box({ at: [side * 0.8, 0.8, 0.1], size: [0.38, 0.36, 0.38], color: SKIN_DARK, part, pivot });
      b.box({ at: [side * 0.8, 1.0, 0.1], size: [0.4, 0.08, 0.4], color: CLOTH, part, pivot });
    };
    arm(-1, Part.ArmL);
    arm(1, Part.ArmR);

    const leg = (side: -1 | 1, part: typeof Part.LegL | typeof Part.LegR) => {
      const pivot: [number, number, number] = [side * 0.32, 1.02, 0];
      b.box({ at: [side * 0.32, 0.55, 0], size: [0.36, 1.0, 0.38], taper: [1.05, 1.05], color: SKIN, part, pivot });
      b.box({ at: [side * 0.32, 0.09, 0.1], size: [0.38, 0.18, 0.5], color: SKIN_DARK, part, pivot });
    };
    leg(-1, Part.LegL);
    leg(1, Part.LegR);
    return b.build();
  },
};
