import type { WeaponType } from '../../data/items';
import { PartBuilder, type PartId, type Vec3 } from '../parts';

const STEEL = 0x9aa0ac;
const STEEL_DARK = 0x4a4f5a;
const WOOD = 0x4a3524;
const GRIP = 0x2a2018;
const CRYSTAL = 0x66ccff;
const BONE = 0xd8cfb4;

/** Adds a weapon to a hand. `hand` is the hand centre; `pivot` is the shoulder joint the arm rotates around. */
export function addWeapon(b: PartBuilder, type: WeaponType, hand: Vec3, pivot: Vec3, part: PartId): void {
  const [hx, hy, hz] = hand;
  const fz = hz + 0.12;
  switch (type) {
    case 'sword':
      b.box({ at: [hx, hy - 0.1, fz], size: [0.06, 0.2, 0.06], color: GRIP, part, pivot });
      b.box({ at: [hx, hy + 0.02, fz], size: [0.26, 0.05, 0.08], color: STEEL_DARK, part, pivot });
      b.box({ at: [hx, hy + 0.5, fz], size: [0.06, 0.92, 0.14], taper: [0.5, 0.25], color: STEEL, part, pivot });
      break;
    case 'dagger':
      b.box({ at: [hx, hy - 0.08, fz], size: [0.05, 0.16, 0.05], color: GRIP, part, pivot });
      b.box({ at: [hx, hy + 0.02, fz], size: [0.16, 0.04, 0.07], color: STEEL_DARK, part, pivot });
      b.box({ at: [hx, hy + 0.26, fz], size: [0.05, 0.44, 0.1], taper: [0.5, 0.2], color: STEEL, part, pivot });
      break;
    case 'axe':
      b.box({ at: [hx, hy + 0.25, fz], size: [0.06, 1.0, 0.06], color: WOOD, part, pivot });
      b.box({ at: [hx, hy + 0.55, fz + 0.16], size: [0.06, 0.36, 0.26], taper: [1, 1.5], color: STEEL, part, pivot });
      break;
    case 'mace':
      b.box({ at: [hx, hy + 0.25, fz], size: [0.06, 0.9, 0.06], color: WOOD, part, pivot });
      b.prism([hx, hy + 0.74, fz], 0.14, 0.24, STEEL_DARK, part, 6, 0.14, pivot);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        b.box({ at: [hx + Math.cos(a) * 0.17, hy + 0.74, fz + Math.sin(a) * 0.17], size: [0.06, 0.08, 0.06], color: STEEL, part, pivot });
      }
      break;
    case 'spear':
      b.box({ at: [hx, hy + 0.5, fz], size: [0.05, 2.2, 0.05], color: WOOD, part, pivot });
      b.box({ at: [hx, hy + 1.75, fz], size: [0.07, 0.4, 0.12], taper: [0.2, 0.15], color: STEEL, part, pivot });
      break;
    case 'bow': {
      // Held vertically; limbs lean away from the grip
      b.box({ at: [hx, hy, fz], size: [0.06, 0.34, 0.07], color: GRIP, part, pivot });
      b.box({ at: [hx, hy + 0.45, fz - 0.06], size: [0.05, 0.62, 0.05], taper: [0.6, 0.6], rotate: [0.35, 0, 0], color: WOOD, part, pivot });
      b.box({ at: [hx, hy - 0.45, fz - 0.06], size: [0.05, 0.62, 0.05], taper: [0.6, 0.6], rotate: [-0.35, 0, 0], color: WOOD, part, pivot });
      b.box({ at: [hx, hy, fz - 0.24], size: [0.015, 1.36, 0.015], color: BONE, part, pivot });
      break;
    }
    case 'crossbow':
      b.box({ at: [hx, hy, fz + 0.2], size: [0.07, 0.08, 0.7], color: WOOD, part, pivot });
      b.box({ at: [hx, hy + 0.02, fz + 0.5], size: [0.7, 0.04, 0.06], taper: [1, 1], color: STEEL_DARK, part, pivot });
      b.box({ at: [hx, hy + 0.02, fz + 0.42], size: [0.68, 0.015, 0.015], color: BONE, part, pivot });
      break;
    case 'wand':
      b.box({ at: [hx, hy + 0.15, fz], size: [0.045, 0.46, 0.045], color: WOOD, part, pivot });
      b.box({ at: [hx, hy + 0.42, fz], size: [0.09, 0.12, 0.09], taper: [0.3, 0.3], color: CRYSTAL, part, pivot, glow: 0.5 });
      break;
    case 'staff':
      b.box({ at: [hx + 0.05, hy + 0.3, fz], size: [0.07, 2.1, 0.07], color: WOOD, part, pivot });
      b.box({ at: [hx + 0.05, hy + 1.3, fz], size: [0.16, 0.12, 0.16], color: 0x9a7a2e, part, pivot });
      b.box({ at: [hx + 0.05, hy + 1.53, fz], size: [0.2, 0.34, 0.2], taper: [0.15, 0.15], color: CRYSTAL, part, pivot, glow: 0.4 });
      break;
    case 'blowgun':
      b.box({ at: [hx, hy + 0.05, fz + 0.3], size: [0.05, 0.05, 0.95], color: 0x6a5a3a, part, pivot });
      break;
    case 'bardiche':
      b.box({ at: [hx, hy + 0.5, fz], size: [0.07, 2.0, 0.07], color: WOOD, part, pivot });
      b.box({ at: [hx + 0.18, hy + 1.2, fz], size: [0.3, 0.6, 0.05], taper: [0.6, 0.6], color: STEEL, part, pivot });
      break;
    case 'spellbook':
      b.box({ at: [hx, hy + 0.05, fz + 0.1], size: [0.34, 0.42, 0.1], color: 0x5a2a2a, part, pivot });
      b.box({ at: [hx, hy + 0.05, fz + 0.16], size: [0.28, 0.34, 0.02], color: BONE, part, pivot });
      break;
    case 'warfork':
      b.box({ at: [hx, hy + 0.3, fz], size: [0.05, 1.4, 0.05], color: WOOD, part, pivot });
      b.box({ at: [hx - 0.07, hy + 1.15, fz], size: [0.04, 0.4, 0.04], color: STEEL, part, pivot });
      b.box({ at: [hx + 0.07, hy + 1.15, fz], size: [0.04, 0.4, 0.04], color: STEEL, part, pivot });
      break;
    case 'javelin':
      b.box({ at: [hx, hy + 0.4, fz], size: [0.035, 1.6, 0.035], color: WOOD, part, pivot });
      b.box({ at: [hx, hy + 1.3, fz], size: [0.05, 0.25, 0.08], taper: [0.2, 0.15], color: STEEL, part, pivot });
      break;
    case 'warpike':
      b.box({ at: [hx, hy + 0.6, fz], size: [0.06, 2.4, 0.06], color: WOOD, part, pivot });
      b.box({ at: [hx, hy + 1.95, fz], size: [0.1, 0.5, 0.06], taper: [0.2, 0.2], color: STEEL, part, pivot });
      b.box({ at: [hx, hy + 1.65, fz], size: [0.28, 0.05, 0.06], color: STEEL_DARK, part, pivot });
      break;
  }
}

/** A shield strapped to an arm. */
export function addShield(b: PartBuilder, wooden: boolean, arm: Vec3, pivot: Vec3, part: PartId): void {
  const [ax, ay, az] = arm;
  const face = wooden ? 0x6a4a2a : 0x7a808c;
  const rim = wooden ? 0x4a3524 : STEEL_DARK;
  const boss = wooden ? STEEL_DARK : STEEL;
  const x = ax - 0.16;
  b.box({ at: [x, ay + 0.05, az + 0.05], size: [0.08, 0.72, 0.54], taper: [1, 0.55], color: face, part, pivot });
  b.box({ at: [x - 0.03, ay + 0.05, az + 0.05], size: [0.05, 0.78, 0.6], taper: [1, 0.55], color: rim, part, pivot });
  b.box({ at: [x - 0.08, ay + 0.1, az + 0.05], size: [0.06, 0.14, 0.14], color: boss, part, pivot });
}
