import type { ClassId } from '../../data/classes';
import type { WeaponType } from '../../data/items';
import { PLEDGES } from '../../data/pledges';
import { Part, PartBuilder, type PartId, type Vec3 } from '../parts';
import type { CharacterRecipe } from './types';
import { addShield, addWeapon } from './weapons';

export interface HeroLook {
  classId: ClassId;
  pledgeId: string | null;
  weapon: WeaponType | null;
  /** null = no shield, else whether it is the wooden one. */
  shield: 'wooden' | 'iron' | null;
}

export function heroLookKey(look: HeroLook): string {
  return `${look.classId}:${look.pledgeId ?? ''}:${look.weapon ?? ''}:${look.shield ?? ''}`;
}

const SKIN = 0xd9c2a8;
const SHADOW = 0x0a0c14;

function knight(b: PartBuilder, look: HeroLook, accent: number, bright: number): void {
  const STEEL = 0x767b88;
  const DARK = 0x3f4450;
  const torsoPivot: Vec3 = [0, 0.95, 0];
  b.box({ at: [0, 1.18, 0], size: [0.72, 0.72, 0.46], taper: [1.12, 1.05], color: STEEL, part: Part.Torso, pivot: torsoPivot });
  b.box({ at: [0, 0.82, 0.03], size: [0.5, 0.5, 0.5], taper: [0.95, 0.95], color: accent, part: Part.Torso, pivot: torsoPivot });
  b.box({ at: [0, 0.98, 0], size: [0.66, 0.1, 0.5], color: DARK, part: Part.Torso, pivot: torsoPivot });
  b.box({ at: [-0.44, 1.52, 0], size: [0.32, 0.22, 0.42], taper: [0.65, 0.8], color: DARK, part: Part.Torso, pivot: torsoPivot });
  b.box({ at: [0.44, 1.52, 0], size: [0.32, 0.22, 0.42], taper: [0.65, 0.8], color: DARK, part: Part.Torso, pivot: torsoPivot });
  b.box({ at: [0, 1.08, -0.32], size: [0.62, 1.15, 0.06], taper: [0.8, 1], color: accent, part: Part.Torso, pivot: torsoPivot });

  const headPivot: Vec3 = [0, 1.56, 0];
  b.box({ at: [0, 1.8, 0], size: [0.38, 0.4, 0.38], taper: [0.85, 0.85], color: STEEL, part: Part.Head, pivot: headPivot });
  b.box({ at: [0, 1.78, 0.19], size: [0.3, 0.07, 0.03], color: SHADOW, part: Part.Head, pivot: headPivot });
  b.box({ at: [-0.07, 1.78, 0.2], size: [0.06, 0.03, 0.02], color: 0x9fd0ff, part: Part.Head, pivot: headPivot, glow: 0.5 });
  b.box({ at: [0.07, 1.78, 0.2], size: [0.06, 0.03, 0.02], color: 0x9fd0ff, part: Part.Head, pivot: headPivot, glow: 0.5 });
  b.box({ at: [0, 1.1, 0.27], size: [0.16, 0.16, 0.03], color: bright, part: Part.Torso, pivot: torsoPivot, glow: 0.25 });
  b.box({ at: [0, 2.02, -0.04], size: [0.08, 0.14, 0.3], taper: [0.5, 0.9], color: accent, part: Part.Head, pivot: headPivot });

  const arm = (side: -1 | 1, part: PartId) => {
    const pivot: Vec3 = [side * 0.44, 1.46, 0];
    b.box({ at: [side * 0.47, 1.14, 0], size: [0.21, 0.6, 0.22], taper: [0.85, 0.85], color: STEEL, part, pivot });
    b.box({ at: [side * 0.47, 0.8, 0], size: [0.19, 0.17, 0.19], color: DARK, part, pivot });
  };
  arm(-1, Part.ArmL);
  arm(1, Part.ArmR);
  if (look.weapon) addWeapon(b, look.weapon, [0.47, 0.8, 0], [0.44, 1.46, 0], Part.ArmR);
  if (look.shield) addShield(b, look.shield === 'wooden', [-0.47, 1.05, 0], [-0.44, 1.46, 0], Part.ArmL);

  const leg = (side: -1 | 1, part: PartId) => {
    const pivot: Vec3 = [side * 0.17, 0.82, 0];
    b.box({ at: [side * 0.17, 0.45, 0], size: [0.23, 0.74, 0.27], taper: [0.9, 0.9], color: DARK, part, pivot });
    b.box({ at: [side * 0.17, 0.08, 0.05], size: [0.25, 0.16, 0.36], color: 0x2a2018, part, pivot });
  };
  leg(-1, Part.LegL);
  leg(1, Part.LegR);
}

function sorcerer(b: PartBuilder, look: HeroLook, accent: number, bright: number): void {
  const ROBE = 0x1b2340;
  const TRIM = 0x9a7a2e;
  const torsoPivot: Vec3 = [0, 0.95, 0];
  b.box({ at: [0, 0.85, 0], size: [0.72, 1.2, 0.52], taper: [0.72, 0.78], color: ROBE, part: Part.Torso, pivot: torsoPivot });
  b.box({ at: [0, 0.31, 0], size: [0.76, 0.16, 0.56], color: accent, part: Part.Torso, pivot: torsoPivot });
  b.box({ at: [0, 1.0, 0], size: [0.62, 0.1, 0.46], color: TRIM, part: Part.Torso, pivot: torsoPivot });
  b.box({ at: [-0.34, 1.44, 0], size: [0.26, 0.14, 0.38], taper: [0.8, 0.8], color: 0x2a3560, part: Part.Torso, pivot: torsoPivot });
  b.box({ at: [0.34, 1.44, 0], size: [0.26, 0.14, 0.38], taper: [0.8, 0.8], color: 0x2a3560, part: Part.Torso, pivot: torsoPivot });
  b.box({ at: [0, 1.5, 0], size: [0.36, 0.1, 0.3], color: TRIM, part: Part.Torso, pivot: torsoPivot });
  const headPivot: Vec3 = [0, 1.52, 0];
  b.box({ at: [0, 1.76, -0.08], size: [0.44, 0.48, 0.36], taper: [0.45, 0.5], color: ROBE, part: Part.Head, pivot: headPivot });
  b.box({ at: [0, 1.68, 0.08], size: [0.24, 0.26, 0.16], color: SKIN, part: Part.Head, pivot: headPivot });
  b.box({ at: [0, 1.66, 0.13], size: [0.26, 0.3, 0.06], color: SHADOW, part: Part.Head, pivot: headPivot });
  b.box({ at: [-0.06, 1.7, 0.165], size: [0.05, 0.035, 0.02], color: bright, part: Part.Head, pivot: headPivot, glow: 1 });
  b.box({ at: [0.06, 1.7, 0.165], size: [0.05, 0.035, 0.02], color: bright, part: Part.Head, pivot: headPivot, glow: 1 });
  const arm = (side: -1 | 1, part: PartId) => {
    const pivot: Vec3 = [side * 0.42, 1.42, 0];
    b.box({ at: [side * 0.45, 1.12, 0], size: [0.2, 0.62, 0.22], taper: [0.85, 0.85], color: ROBE, part, pivot });
    b.box({ at: [side * 0.45, 0.78, 0], size: [0.14, 0.14, 0.14], color: SKIN, part, pivot });
  };
  arm(-1, Part.ArmL);
  arm(1, Part.ArmR);
  if (look.weapon) addWeapon(b, look.weapon, [0.45, 0.78, 0], [0.42, 1.42, 0], Part.ArmR);
  if (look.shield) addShield(b, look.shield === 'wooden', [-0.45, 1.05, 0], [-0.42, 1.42, 0], Part.ArmL);
  b.box({ at: [-0.15, 0.15, 0.04], size: [0.2, 0.3, 0.28], color: 0x2a2018, part: Part.LegL, pivot: [-0.15, 0.4, 0] });
  b.box({ at: [0.15, 0.15, 0.04], size: [0.2, 0.3, 0.28], color: 0x2a2018, part: Part.LegR, pivot: [0.15, 0.4, 0] });
}

function rogue(b: PartBuilder, look: HeroLook, accent: number, bright: number): void {
  const LEATHER = 0x5a4030;
  const STRAP = 0x2a2018;
  const CLOAK = 0x2f4a2f;
  const torsoPivot: Vec3 = [0, 0.95, 0];
  b.box({ at: [0, 1.16, 0], size: [0.56, 0.64, 0.4], taper: [1.05, 1], color: LEATHER, part: Part.Torso, pivot: torsoPivot });
  b.box({ at: [0, 1.2, 0.02], size: [0.14, 0.6, 0.44], rotate: [0, 0, 0.5], color: STRAP, part: Part.Torso, pivot: torsoPivot });
  b.box({ at: [0, 0.88, 0], size: [0.58, 0.1, 0.42], color: STRAP, part: Part.Torso, pivot: torsoPivot });
  b.box({ at: [0.22, 0.84, 0.2], size: [0.14, 0.14, 0.1], color: 0x7a5a3a, part: Part.Torso, pivot: torsoPivot });
  b.box({ at: [0, 1.32, -0.24], size: [0.6, 0.5, 0.05], taper: [0.9, 1], color: CLOAK, part: Part.Torso, pivot: torsoPivot });
  b.box({ at: [0.2, 1.25, -0.3], size: [0.16, 0.7, 0.16], taper: [0.9, 0.9], rotate: [0, 0, -0.25], color: 0x3a2a1a, part: Part.Torso, pivot: torsoPivot });
  for (let i = 0; i < 3; i++) {
    b.box({ at: [0.14 + i * 0.05, 1.66, -0.3 + (i % 2) * 0.05], size: [0.02, 0.2, 0.02], color: 0xd8cfb4, part: Part.Torso, pivot: torsoPivot });
  }
  const headPivot: Vec3 = [0, 1.5, 0];
  b.box({ at: [0, 1.76, -0.06], size: [0.4, 0.44, 0.36], taper: [0.5, 0.55], color: CLOAK, part: Part.Head, pivot: headPivot });
  b.box({ at: [0, 1.66, 0.08], size: [0.22, 0.24, 0.16], color: SKIN, part: Part.Head, pivot: headPivot });
  b.box({ at: [0, 1.66, 0.13], size: [0.24, 0.28, 0.06], color: SHADOW, part: Part.Head, pivot: headPivot });
  b.box({ at: [-0.055, 1.68, 0.165], size: [0.045, 0.03, 0.02], color: bright, part: Part.Head, pivot: headPivot, glow: 0.9 });
  b.box({ at: [0.055, 1.68, 0.165], size: [0.045, 0.03, 0.02], color: bright, part: Part.Head, pivot: headPivot, glow: 0.9 });
  const arm = (side: -1 | 1, part: PartId) => {
    const pivot: Vec3 = [side * 0.36, 1.42, 0];
    b.box({ at: [side * 0.4, 1.12, 0], size: [0.17, 0.58, 0.18], taper: [0.85, 0.85], color: LEATHER, part, pivot });
    b.box({ at: [side * 0.4, 0.8, 0], size: [0.15, 0.15, 0.15], color: STRAP, part, pivot });
  };
  arm(-1, Part.ArmL);
  arm(1, Part.ArmR);
  if (look.weapon === 'bow') addWeapon(b, 'bow', [-0.4, 0.95, 0.1], [-0.36, 1.42, 0], Part.ArmL);
  else if (look.weapon) addWeapon(b, look.weapon, [0.4, 0.8, 0], [0.36, 1.42, 0], Part.ArmR);
  if (look.shield) addShield(b, look.shield === 'wooden', [-0.4, 1.05, 0], [-0.36, 1.42, 0], Part.ArmL);
  const leg = (side: -1 | 1, part: PartId) => {
    const pivot: Vec3 = [side * 0.15, 0.82, 0];
    b.box({ at: [side * 0.15, 0.45, 0], size: [0.2, 0.74, 0.22], taper: [0.9, 0.9], color: 0x3a3028, part, pivot });
    b.box({ at: [side * 0.15, 0.08, 0.05], size: [0.22, 0.16, 0.32], color: STRAP, part, pivot });
  };
  leg(-1, Part.LegL);
  leg(1, Part.LegR);
}

export const HERO_HEIGHT: Record<ClassId, number> = { knight: 2.1, sorcerer: 2.2, rogue: 1.95 };

/** Builds a hero body with the equipped weapon and shield. Cached by the renderer per look. */
function darken(hex: number, k: number): number {
  const r = Math.round(((hex >> 16) & 255) * k);
  const g = Math.round(((hex >> 8) & 255) * k);
  const b = Math.round((hex & 255) * k);
  return (r << 16) | (g << 8) | b;
}

export function buildHero(look: HeroLook): CharacterRecipe {
  const bright = look.pledgeId ? PLEDGES[look.pledgeId]?.color ?? 0xffffff : look.classId === 'knight' ? 0x7a2a2a : look.classId === 'sorcerer' ? 0x66ccff : 0x8fe08f;
  // Cloth takes a muted version of the pledge colour; eyes and trim keep it bright
  const accent = darken(bright, look.pledgeId ? 0.5 : 1);
  return {
    id: heroLookKey(look),
    name: look.classId,
    blurb: '',
    height: HERO_HEIGHT[look.classId],
    glowColor: bright,
    build() {
      const b = new PartBuilder();
      if (look.classId === 'knight') knight(b, look, accent, bright);
      else if (look.classId === 'sorcerer') sorcerer(b, look, accent, bright);
      else rogue(b, look, accent, bright);
      return b.build();
    },
  };
}
