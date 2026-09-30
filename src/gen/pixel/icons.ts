import { RARITIES, type EquipSlot, type OffhandKind, type Rarity, type WeaponType } from '../../data/items';
import type { ConsumableId } from '../../data/consumables';
import { PixelBuffer, hex, ramp } from './pixel';
import { itemImage } from '../../art/images';

/**
 * Item icons for the bag and the paper doll: 14x14 pixel drawings by slot and
 * weapon type, coloured by the item's rarity, with a dark outline.
 */

const ICON = 14;
const OUTLINE = hex(0x0a0a12);
const cache = new Map<string, HTMLCanvasElement>();

/** Hand-written items with a drawing of their own rather than the slot's. */
const CUSTOM_ICONS = new Set(['prisoner_cuffs', 'prisoner_ball']);

export function itemIconSprite(slot: EquipSlot, weaponType: WeaponType | null, rarity: Rarity, offhand: OffhandKind | null = null, baseId = ''): HTMLCanvasElement {
  // A hand-made icon, when one was dropped into public/art, wins over the drawing
  const drawn = itemImage(baseId);
  if (drawn) return drawn;
  const key = `${slot}:${weaponType ?? ''}:${rarity}:${offhand ?? ''}:${slot === 'shield' || CUSTOM_ICONS.has(baseId) ? baseId : ''}`;
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
  if (CUSTOM_ICONS.has(baseId)) {
    drawCustom(b, baseId, r, steel, leather);
    b.outline(OUTLINE);
    return b.toCanvas();
  }
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

/** Prisoner's Nightmare: a pair of handcuffs joined by a chain, and a boot dragging an iron ball. */
function drawCustom(b: PixelBuffer, baseId: string, r: Ramp, steel: Ramp, leather: Ramp): void {
  const o = 1;
  const ring = (cx: number, cy: number) => {
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      const d = Math.hypot(x, y);
      if (d <= 3.4 && d >= 2) b.set(o + cx + x, o + cy + y, y < 0 ? steel[2] : steel[1]);
    }
  };
  if (baseId === 'prisoner_cuffs') {
    ring(3, 4);
    ring(10, 10);
    // Chain links between the cuffs, one in the rarity colour
    b.rect(o + 5, o + 6, 2, 1, steel[0]);
    b.rect(o + 6, o + 7, 2, 1, r[1]);
    b.rect(o + 7, o + 8, 2, 1, steel[0]);
  } else {
    // Boot on the right, chain to the ankle, iron ball bottom left
    b.rect(o + 8, o + 1, 4, 7, leather[1]);
    b.rect(o + 8, o + 8, 6, 3, leather[1]);
    b.rect(o + 8, o + 1, 4, 2, r[1]);
    b.rect(o + 8, o + 10, 6, 1, leather[0]);
    b.set(o + 7, o + 7, steel[0]);
    b.set(o + 6, o + 8, steel[2]);
    b.set(o + 5, o + 9, steel[0]);
    b.ellipse(o + 3.5, o + 11, 3.2, 3, steel[0]);
    b.set(o + 2, o + 9, steel[1]);
  }
}

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
    case 'warfork':
      diag(o + 1, o + 13, o + 9, o + 5, wood[1], 2);
      b.rect(o + 9, o + 1, 1, 5, steel[2]);
      b.rect(o + 12, o + 1, 1, 5, steel[2]);
      b.rect(o + 9, o + 5, 4, 1, steel[1]);
      b.set(o + 10, o + 6, r[1]);
      b.set(o + 11, o + 6, r[1]);
      break;
    case 'javelin':
      diag(o + 1, o + 13, o + 10, o + 4, wood[1]);
      diag(o + 13, o + 1, o + 11, o + 3, steel[2], 2);
      b.set(o + 5, o + 9, r[1]);
      b.set(o + 6, o + 8, r[1]);
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

const consumableCache = new Map<string, HTMLCanvasElement>();

/**
 * The four consumables on the HUD, 14x14: a corked flask of red or blue, a
 * rolled bandage, and a smoking incense stick in a small holder. `fill` from
 * 0 to 1 sets how much liquid the flask holds, how much of the roll is left,
 * and how much of the stick remains, so the button shows the dose refilling.
 */
export function consumableIcon(id: ConsumableId, fill: number): HTMLCanvasElement {
  const level = Math.max(0, Math.min(8, Math.round(fill * 8)));
  const key = `${id}:${level}`;
  let c = consumableCache.get(key);
  if (!c) {
    c = drawConsumable(id, level / 8);
    consumableCache.set(key, c);
  }
  return c;
}

function drawConsumable(id: ConsumableId, fill: number): HTMLCanvasElement {
  const b = new PixelBuffer(ICON, ICON);
  const glass = hex(0xb8c8d8);
  const cork = hex(0x8a6030);
  const white = hex(0xffffff);
  if (id === 'hp_potion' || id === 'mp_potion') {
    const liquid = ramp(id === 'hp_potion' ? 0xd82a2a : 0x3a6aff, 1.2);
    // Neck and shoulders, then a round belly
    b.rect(4, 3, 6, 2, OUTLINE);
    b.rect(5, 0, 4, 3, OUTLINE);
    b.rect(6, 1, 2, 2, cork);
    b.ellipse(7, 9, 5.5, 4.8, OUTLINE);
    b.ellipse(7, 9, 4.5, 3.8, glass);
    b.rect(5, 4, 4, 3, glass);
    // Liquid from the bottom up to the fill line
    const top = 13 - Math.round(fill * 8);
    for (let y = 13; y >= top; y--) {
      for (let x = 0; x < ICON; x++) {
        const d = Math.hypot((x + 0.5 - 7) / 4.5, (y + 0.5 - 9) / 3.8);
        const inNeck = y < 7 && x >= 5 && x <= 8;
        if (d <= 1 || inNeck) b.set(x, y, y === top ? liquid[3] : x < 6 ? liquid[2] : liquid[1]);
      }
    }
    b.set(4, 7, white);
    b.set(4, 8, white);
  } else if (id === 'bandage') {
    const cloth = ramp(0xe8dcc8, 1.1);
    // A strip trailing off to the left of a fat roll on the right; the roll shrinks as the dose is used
    const r = 2 + Math.round(fill * 2.5);
    b.rect(1, 6, 10, 5, OUTLINE);
    b.rect(2, 7, 9, 3, cloth[2]);
    b.rect(2, 8, 9, 1, cloth[1]);
    b.ellipse(9.5, 8.5, r + 1, r + 1, OUTLINE);
    b.ellipse(9.5, 8.5, r, r, cloth[2]);
    b.ellipse(9.5, 8.5, Math.max(0.6, r - 1.5), Math.max(0.6, r - 1.5), cloth[1]);
    b.set(9, 8, cloth[0]);
    b.set(3, 8, hex(0xc03030)); // a spot of blood on the loose end
  } else {
    const wood = ramp(0x6a4020, 1.1);
    const ember = hex(0xff6a20);
    const smoke = hex(0x9a9ab0);
    // A small clay holder at the bottom, the stick rising from it
    b.rect(3, 11, 8, 3, OUTLINE);
    b.rect(4, 12, 6, 1, hex(0x7a5a40));
    const h = 3 + Math.round(fill * 7);
    b.rect(6, 12 - h, 2, h, OUTLINE);
    b.rect(6, 12 - h, 1, h, wood[2]);
    b.rect(7, 12 - h, 1, h, wood[1]);
    b.set(6, 11 - h, ember);
    b.set(7, 11 - h, ember);
    // A thread of smoke curling up and away
    const sx = [7, 8, 8, 7, 6];
    for (let i = 0; i < 5; i++) {
      const y = 9 - h - i;
      if (y < 0) break;
      b.set(sx[i]!, y, smoke, i < 3 ? 200 : 120);
    }
  }
  return b.toCanvas();
}
