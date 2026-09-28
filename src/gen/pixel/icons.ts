import { RARITIES, type EquipSlot, type OffhandKind, type Rarity, type WeaponType } from '../../data/items';
import { PixelBuffer, hex, ramp } from './pixel';

/**
 * Item icons for the bag and the paper doll: 14x14 pixel drawings by slot and
 * weapon type, coloured by the item's rarity, with a dark outline.
 */

const ICON = 14;
const OUTLINE = hex(0x0a0a12);
const cache = new Map<string, HTMLCanvasElement>();

export function itemIconSprite(slot: EquipSlot, weaponType: WeaponType | null, rarity: Rarity, offhand: OffhandKind | null = null, baseId = ''): HTMLCanvasElement {
  const key = `${slot}:${weaponType ?? ''}:${rarity}:${offhand ?? ''}:${slot === 'shield' ? baseId : ''}`;
  let c = cache.get(key);
  if (!c) {
    c = draw(slot, weaponType, rarity, offhand, baseId);
    cache.set(key, c);
  }
  return c;
}

function draw(slot: EquipSlot, weaponType: WeaponType | null, rarity: Rarity, offhand: OffhandKind | null, baseId: string): HTMLCanvasElement {
  const b = new PixelBuffer(ICON + 2, ICON + 2);
  const r = ramp(RARITIES[rarity].color, 1);
  const steel = ramp(0x8e94a2, 1);
  const wood = ramp(0x6a4a30, 1);
  const leather = ramp(0x6a4a34, 1);
  const o = 1;
  const M = r[1];
  switch (slot) {
    case 'weapon':
      drawWeapon(b, weaponType ?? 'sword', r, steel, wood);
      break;
    case 'shield':
      if (offhand) {
        drawOffhand(b, offhand, r, steel, wood, leather);
        break;
      }
      drawShield(b, baseId, r, steel, wood);
      break;
    case 'helmet':
      b.ellipse(o + 7, o + 6, 5.5, 5, steel[1]);
      b.rect(o + 2, o + 7, 11, 1, OUTLINE);
      b.rect(o + 2, o + 8, 3, 4, steel[1]);
      b.rect(o + 9, o + 8, 3, 4, steel[1]);
      b.rect(o + 6, o + 1, 2, 3, M);
      break;
    case 'chest':
      b.rect(o + 3, o + 2, 8, 10, leather[1]);
      b.rect(o + 1, o + 2, 3, 3, leather[1]);
      b.rect(o + 10, o + 2, 3, 3, leather[1]);
      b.rect(o + 6, o + 2, 2, 10, M);
      b.rect(o + 3, o + 11, 8, 2, M);
      break;
    case 'gloves':
      b.rect(o + 4, o + 1, 2, 6, leather[1]);
      b.rect(o + 7, o + 1, 2, 6, leather[1]);
      b.rect(o + 2, o + 4, 2, 5, leather[1]);
      b.rect(o + 4, o + 6, 6, 5, leather[1]);
      b.rect(o + 4, o + 11, 6, 2, M);
      break;
    case 'boots':
      b.rect(o + 3, o + 1, 5, 8, leather[1]);
      b.rect(o + 3, o + 9, 9, 4, leather[1]);
      b.rect(o + 3, o + 1, 5, 2, M);
      b.rect(o + 3, o + 12, 9, 1, M);
      break;
    case 'ring':
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        const d = Math.hypot(x - 4, y - 4);
        if (d <= 4.5 && d >= 2.6) b.set(o + 3 + x, o + 4 + y, y < 4 ? r[2] : r[1]);
      }
      b.rect(o + 6, o + 1, 3, 3, r[3]);
      break;
    case 'belt':
      b.rect(o + 1, o + 5, 13, 4, leather[1]);
      b.rect(o + 5, o + 4, 4, 6, M);
      b.rect(o + 6, o + 5, 2, 4, leather[0]);
      break;
    case 'amulet':
      for (let y = 0; y < 7; y++) for (let x = 0; x < 11; x++) {
        const d = Math.hypot(x - 5, y - 6);
        if (d <= 6 && d >= 4.8) b.set(o + 2 + x, o + 1 + y, steel[2]);
      }
      b.rect(o + 5, o + 7, 5, 5, M);
      b.rect(o + 6, o + 8, 3, 3, r[3]);
      break;
    case 'totem':
      b.rect(o + 5, o + 1, 4, 12, wood[1]);
      b.rect(o + 3, o + 3, 8, 2, M);
      b.rect(o + 3, o + 8, 8, 2, M);
      b.rect(o + 6, o + 5, 2, 2, r[3]);
      break;
    case 'relic':
      for (let y = 0; y < 12; y++) {
        const half = y < 4 ? y + 1 : 5 - Math.round(((y - 4) / 8) * 4);
        b.rect(o + 7 - half, o + 1 + y, half * 2, 1, y < 4 ? r[2] : r[1]);
      }
      b.set(o + 7, o + 4, r[3]);
      break;
    default:
      // Charm: a small heart
      b.ellipse(o + 5, o + 5, 3, 3, r[1]);
      b.ellipse(o + 9, o + 5, 3, 3, r[1]);
      for (let y = 0; y < 6; y++) b.rect(o + 2 + y, o + 6 + y, 11 - y * 2, 1, r[1]);
      b.set(o + 4, o + 4, r[3]);
      break;
  }
  b.outline(OUTLINE);
  return b.toCanvas();
}

type Ramp = ReturnType<typeof ramp>;

/** The four shields: round (wood), heater (kite, steel), tower (tall slab) and energy (a glowing disc). */
function drawShield(b: PixelBuffer, baseId: string, r: Ramp, steel: Ramp, wood: Ramp): void {
  const o = 1;
  const M = r[1];
  if (baseId === 'wooden_shield' || baseId === 'wooden_shield_base') {
    b.ellipse(o + 7, o + 7, 6, 6, wood[1]);
    b.ellipse(o + 7, o + 7, 6, 2, wood[2]);
    b.rect(o + 6, o + 6, 3, 3, steel[1]);
    b.set(o + 7, o + 7, M);
  } else if (baseId === 'tower_shield') {
    b.rect(o + 3, o + 0, 9, 14, steel[1]);
    b.rect(o + 3, o + 0, 9, 2, steel[2]);
    b.rect(o + 4, o + 3, 7, 10, steel[0]);
    b.rect(o + 7, o + 3, 1, 10, M);
    b.rect(o + 4, o + 7, 7, 1, M);
  } else if (baseId === 'energy_shield') {
    const glow = ramp(0x6fd0ff, 1);
    for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
      const d = Math.hypot(x - 6, y - 6);
      if (d <= 6.3) b.set(o + 1 + x, o + 1 + y, d > 4.6 ? glow[2] : d > 2.2 ? glow[1] : glow[3]);
    }
    b.set(o + 7, o + 7, M);
  } else {
    // Heater shield: the kite with a rarity-coloured cross
    for (let y = 0; y < 13; y++) {
      const half = y < 8 ? 5 : 5 - Math.round(((y - 8) / 5) * 4);
      b.rect(o + 7 - half, o + y, half * 2, 1, y < 2 ? steel[2] : steel[1]);
    }
    b.rect(o + 6, o + 3, 2, 6, M);
    b.rect(o + 4, o + 5, 6, 2, M);
  }
}

/** Lantern, skull and quiver: the offhands that share the shield slot. */
function drawOffhand(b: PixelBuffer, kind: OffhandKind, r: Ramp, steel: Ramp, wood: Ramp, leather: Ramp): void {
  const o = 1;
  const M = r[1];
  if (kind === 'lantern') {
    const glow = ramp(0xffc850, 1);
    // Handle, a steel frame, warm glass and a rarity-coloured base
    b.rect(o + 6, o + 1, 2, 1, steel[2]);
    b.set(o + 5, o + 2, steel[2]);
    b.set(o + 8, o + 2, steel[2]);
    b.rect(o + 4, o + 3, 6, 9, steel[1]);
    b.rect(o + 5, o + 4, 4, 7, glow[1]);
    b.rect(o + 6, o + 6, 2, 3, glow[2]);
    b.rect(o + 4, o + 12, 6, 1, M);
  } else if (kind === 'skull') {
    const bone = ramp(0xe8e0d0, 1);
    b.ellipse(o + 7, o + 6, 5, 5, bone[1]);
    b.rect(o + 5, o + 10, 5, 3, bone[1]);
    b.rect(o + 4, o + 5, 2, 2, OUTLINE);
    b.rect(o + 8, o + 5, 2, 2, OUTLINE);
    b.set(o + 4, o + 5, M);
    b.set(o + 8, o + 5, M);
    b.set(o + 7, o + 8, OUTLINE);
    b.set(o + 6, o + 12, OUTLINE);
    b.set(o + 8, o + 12, OUTLINE);
  } else {
    // Quiver: a leather tube with a rarity band and two arrows standing in it
    b.rect(o + 5, o + 5, 5, 8, leather[1]);
    b.rect(o + 5, o + 7, 5, 1, M);
    b.rect(o + 6, o + 2, 1, 3, wood[1]);
    b.rect(o + 8, o + 1, 1, 4, wood[1]);
    b.set(o + 6, o + 1, steel[2]);
    b.set(o + 8, o + 0, steel[2]);
  }
}

function drawWeapon(b: PixelBuffer, type: WeaponType, r: Ramp, steel: Ramp, wood: Ramp): void {
  const o = 1;
  const diag = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number], w = 1) => {
    for (let i = 0; i < w; i++) b.line(x0 + i, y0, x1 + i, y1, c);
  };
  switch (type) {
    case 'sword':
      diag(o + 11, o + 1, o + 4, o + 8, steel[2], 2);
      diag(o + 2, o + 7, o + 6, o + 11, r[1]);
      diag(o + 3, o + 10, o + 1, o + 12, wood[1], 2);
      break;
    case 'dagger':
      diag(o + 10, o + 3, o + 6, o + 7, steel[2], 2);
      diag(o + 4, o + 7, o + 8, o + 9, r[1]);
      diag(o + 5, o + 9, o + 3, o + 11, wood[1], 2);
      break;
    case 'axe':
      diag(o + 3, o + 12, o + 10, o + 5, wood[1], 2);
      b.rect(o + 8, o + 1, 5, 6, steel[1]);
      b.rect(o + 12, o + 2, 1, 4, steel[2]);
      b.rect(o + 8, o + 3, 2, 2, r[1]);
      break;
    case 'mace':
      diag(o + 3, o + 12, o + 8, o + 7, wood[1], 2);
      b.ellipse(o + 9.5, o + 4.5, 3.5, 3.5, steel[1]);
      b.set(o + 9, o + 4, r[1]);
      b.set(o + 10, o + 4, r[1]);
      break;
    case 'spear':
      diag(o + 1, o + 13, o + 10, o + 4, wood[1], 2);
      diag(o + 12, o + 1, o + 9, o + 4, steel[2], 2);
      b.set(o + 9, o + 5, r[1]);
      break;
    case 'bow':
      for (let y = 0; y < 13; y++) {
        const bend = Math.round(Math.sqrt(Math.max(0, 1 - ((y - 6) / 6) ** 2)) * 4);
        b.set(o + 8 + bend, o + y, wood[1]);
      }
      b.rect(o + 8, o + 1, 1, 12, r[2]);
      diag(o + 2, o + 7, o + 10, o + 7, steel[2]);
      break;
    case 'crossbow':
      b.rect(o + 6, o + 4, 3, 9, wood[1]);
      b.rect(o + 1, o + 3, 13, 2, wood[0]);
      b.rect(o + 1, o + 5, 13, 1, r[2]);
      b.rect(o + 7, o + 1, 1, 4, steel[2]);
      break;
    case 'wand':
      diag(o + 3, o + 12, o + 9, o + 6, wood[1], 2);
      b.ellipse(o + 10, o + 4, 2, 2, r[2]);
      b.set(o + 10, o + 3, r[3]);
      break;
    case 'staff':
      diag(o + 2, o + 13, o + 10, o + 5, wood[1], 2);
      b.ellipse(o + 10.5, o + 3.5, 2.5, 2.5, r[2]);
      b.set(o + 10, o + 3, r[3]);
      break;
    case 'blowgun':
      diag(o + 2, o + 12, o + 12, o + 2, wood[1], 2);
      b.set(o + 12, o + 2, r[1]);
      break;
    case 'bardiche':
      diag(o + 1, o + 13, o + 9, o + 5, wood[1], 2);
      b.rect(o + 9, o + 1, 2, 9, steel[1]);
      b.rect(o + 11, o + 2, 2, 7, steel[2]);
      b.rect(o + 9, o + 4, 1, 3, r[1]);
      break;
    case 'spellbook':
      b.rect(o + 2, o + 2, 10, 11, r[1]);
      b.rect(o + 3, o + 3, 8, 9, steel[3]);
      b.rect(o + 7, o + 3, 1, 9, r[0]);
      b.rect(o + 5, o + 6, 4, 3, r[2]);
      break;
    case 'warpike':
      diag(o + 1, o + 13, o + 9, o + 5, wood[1], 2);
      diag(o + 13, o + 1, o + 8, o + 6, steel[2], 2);
      b.rect(o + 6, o + 6, 2, 1, steel[1]);
      b.rect(o + 9, o + 8, 1, 2, steel[1]);
      b.set(o + 9, o + 5, r[1]);
      break;
  }
}
