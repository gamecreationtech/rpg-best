import { Part, PartBuilder } from '../parts';
import type { CharacterRecipe } from './types';

const ROBE = 0x1b2340;
const ROBE_DARK = 0x11162a;
const TRIM = 0x9a7a2e;
const SKIN = 0xd9c2a8;
const WOOD = 0x4a3524;
const CRYSTAL = 0x66ccff;

export const sorcerer: CharacterRecipe = {
  id: 'sorcerer',
  name: 'Sorcerer',
  blurb: 'The first hero. Fire, frost and lightning.',
  height: 2.2,
  glowColor: CRYSTAL,
  build() {
    const b = new PartBuilder();
    const torsoPivot: [number, number, number] = [0, 0.95, 0];

    // Robe, hem and belt
    b.box({ at: [0, 0.85, 0], size: [0.72, 1.2, 0.52], taper: [0.72, 0.78], color: ROBE, part: Part.Torso, pivot: torsoPivot });
    b.box({ at: [0, 0.31, 0], size: [0.76, 0.16, 0.56], color: ROBE_DARK, part: Part.Torso, pivot: torsoPivot });
    b.box({ at: [0, 1.0, 0], size: [0.62, 0.1, 0.46], color: TRIM, part: Part.Torso, pivot: torsoPivot });
    // Shoulder pads
    b.box({ at: [-0.34, 1.44, 0], size: [0.26, 0.14, 0.38], taper: [0.8, 0.8], color: 0x2a3560, part: Part.Torso, pivot: torsoPivot });
    b.box({ at: [0.34, 1.44, 0], size: [0.26, 0.14, 0.38], taper: [0.8, 0.8], color: 0x2a3560, part: Part.Torso, pivot: torsoPivot });
    // Collar
    b.box({ at: [0, 1.5, 0], size: [0.36, 0.1, 0.3], color: TRIM, part: Part.Torso, pivot: torsoPivot });

    // Head: hood over a shadowed face with glowing eyes
    const headPivot: [number, number, number] = [0, 1.52, 0];
    b.box({ at: [0, 1.76, -0.08], size: [0.44, 0.48, 0.36], taper: [0.45, 0.5], color: ROBE, part: Part.Head, pivot: headPivot });
    b.box({ at: [0, 1.68, 0.08], size: [0.24, 0.26, 0.16], color: SKIN, part: Part.Head, pivot: headPivot });
    b.box({ at: [0, 1.66, 0.13], size: [0.26, 0.3, 0.06], color: 0x0a0c14, part: Part.Head, pivot: headPivot });
    b.box({ at: [-0.06, 1.7, 0.165], size: [0.05, 0.035, 0.02], color: CRYSTAL, part: Part.Head, pivot: headPivot, glow: 1 });
    b.box({ at: [0.06, 1.7, 0.165], size: [0.05, 0.035, 0.02], color: CRYSTAL, part: Part.Head, pivot: headPivot, glow: 1 });

    // Arms and hands
    const lPivot: [number, number, number] = [-0.42, 1.42, 0];
    const rPivot: [number, number, number] = [0.42, 1.42, 0];
    b.box({ at: [-0.45, 1.12, 0], size: [0.2, 0.62, 0.22], taper: [0.85, 0.85], color: ROBE, part: Part.ArmL, pivot: lPivot });
    b.box({ at: [-0.45, 0.78, 0], size: [0.14, 0.14, 0.14], color: SKIN, part: Part.ArmL, pivot: lPivot });
    b.box({ at: [0.45, 1.12, 0], size: [0.2, 0.62, 0.22], taper: [0.85, 0.85], color: ROBE, part: Part.ArmR, pivot: rPivot });
    b.box({ at: [0.45, 0.78, 0], size: [0.14, 0.14, 0.14], color: SKIN, part: Part.ArmR, pivot: rPivot });

    // Staff in the right hand, crystal on top
    b.box({ at: [0.5, 1.05, 0.12], size: [0.07, 2.1, 0.07], color: WOOD, part: Part.ArmR, pivot: rPivot });
    b.box({ at: [0.5, 2.05, 0.12], size: [0.16, 0.12, 0.16], color: TRIM, part: Part.ArmR, pivot: rPivot });
    b.box({ at: [0.5, 2.28, 0.12], size: [0.2, 0.34, 0.2], taper: [0.15, 0.15], color: CRYSTAL, part: Part.ArmR, pivot: rPivot, glow: 0.4 });

    // Boots
    b.box({ at: [-0.15, 0.15, 0.04], size: [0.2, 0.3, 0.28], color: 0x2a2018, part: Part.LegL, pivot: [-0.15, 0.4, 0] });
    b.box({ at: [0.15, 0.15, 0.04], size: [0.2, 0.3, 0.28], color: 0x2a2018, part: Part.LegR, pivot: [0.15, 0.4, 0] });
    return b.build();
  },
};
