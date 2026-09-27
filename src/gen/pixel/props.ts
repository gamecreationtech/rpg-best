import type { ProjectileShape } from '../../sim/types';
import type { Palette } from './palettes';
import { PixelBuffer, hex, noise, ramp, type Rgb } from './pixel';
import type { SpriteSize } from './sprites';

/**
 * Sprites for the things that live in the world besides characters: the town
 * stations, portals, decorations, projectiles and dropped loot. All from code.
 */

export interface Prop {
  frames: HTMLCanvasElement[];
  /** Pixel under the object's centre on the floor. */
  originX: number;
  originY: number;
  frameTime: number;
}

function prop(frames: HTMLCanvasElement[], originX: number, originY: number, frameTime = 0.2): Prop {
  return { frames, originX, originY, frameTime };
}

function rgbKey(c: Rgb): string {
  return c.join(',');
}

/** Iron anvil on a stone block with a fire behind it. */
export function forgeProp(pal: Palette, size: SpriteSize, outline: boolean): Prop {
  const s = size === 'large' ? 2 : 1;
  const stone = ramp(pal.wall, pal.contrast);
  const iron = ramp(0x3a3a44, pal.contrast);
  const fire = ramp(pal.fire, pal.contrast);
  const core = hex(pal.fireCore);
  const W = 30 * s;
  const H = 30 * s;
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 3; f++) {
    const b = new PixelBuffer(W + 2, H + 2);
    // Chimney and hearth at the back
    b.rect(1 + 16 * s, 1, 10 * s, 24 * s, stone[1]);
    b.rect(1 + 18 * s, 1 + 8 * s, 6 * s, 8 * s, hex(pal.outline));
    b.ellipse(1 + 21 * s, 1 + 12 * s + (f % 2) * s, 2 * s, 3 * s, fire[1]);
    b.ellipse(1 + 21 * s + (f - 1) * s, 1 + 13 * s, 1.5 * s, 2 * s, fire[2]);
    b.set(1 + 21 * s, 1 + 13 * s, core);
    // Stone block and anvil in front
    b.rect(1 + 2 * s, 1 + 20 * s, 12 * s, 8 * s, stone[0]);
    b.rect(1 + 3 * s, 1 + 16 * s, 10 * s, 3 * s, iron[1]);
    b.rect(1 + 1 * s, 1 + 15 * s, 5 * s, 2 * s, iron[2]);
    b.rect(1 + 6 * s, 1 + 19 * s, 4 * s, 2 * s, iron[0]);
    b.shadeRamp((c) => (rgbKey(c) === rgbKey(stone[1]) ? stone : rgbKey(c) === rgbKey(iron[1]) ? iron : null));
    if (outline) b.outline(hex(pal.outline));
    frames.push(b.toCanvas());
  }
  return prop(frames, 1 + 12 * s, H + 1, 0.15);
}

/** A stone basin filled with blood, dripping from a carved face. */
export function bloodFountainProp(pal: Palette, size: SpriteSize, outline: boolean): Prop {
  const s = size === 'large' ? 2 : 1;
  const stone = ramp(pal.wall, pal.contrast);
  const blood = ramp(pal.blood, pal.contrast);
  const W = 30 * s;
  const H = 26 * s;
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 2; f++) {
    const b = new PixelBuffer(W + 2, H + 2);
    b.rect(1 + 12 * s, 1, 6 * s, 14 * s, stone[1]);
    b.rect(1 + 10 * s, 1, 10 * s, 3 * s, stone[2]);
    b.ellipse(1 + 15 * s, 1 + 19 * s, 14 * s, 5 * s, stone[0]);
    b.ellipse(1 + 15 * s, 1 + 18 * s, 12 * s, 4 * s, blood[1]);
    b.ellipse(1 + 15 * s + (f ? 2 : -3) * s, 1 + 18 * s, 3 * s, 1 * s, blood[2]);
    b.rect(1 + 14 * s, 1 + 6 * s + f * s, 2 * s, 9 * s, blood[1]);
    b.shadeRamp((c) => (rgbKey(c) === rgbKey(stone[1]) || rgbKey(c) === rgbKey(stone[0]) ? stone : null));
    if (outline) b.outline(hex(pal.outline));
    frames.push(b.toCanvas());
  }
  return prop(frames, 1 + 15 * s, H + 1, 0.4);
}

/** A floating crystal above a carved pedestal. */
export function arcanaProp(pal: Palette, size: SpriteSize, outline: boolean): Prop {
  const s = size === 'large' ? 2 : 1;
  const stone = ramp(pal.wall, pal.contrast);
  const crystal = ramp(0xb066ff, pal.contrast);
  const W = 20 * s;
  const H = 32 * s;
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 4; f++) {
    const b = new PixelBuffer(W + 2, H + 2);
    b.rect(1 + 6 * s, 1 + 18 * s, 8 * s, 12 * s, stone[1]);
    b.rect(1 + 4 * s, 1 + 28 * s, 12 * s, 3 * s, stone[0]);
    b.rect(1 + 5 * s, 1 + 17 * s, 10 * s, 2 * s, stone[2]);
    const bob = Math.round(Math.sin((f / 4) * Math.PI * 2) * s);
    const cy = 1 + 9 * s + bob;
    for (let y = -6 * s; y <= 6 * s; y++) {
      const half = Math.round((1 - Math.abs(y) / (6 * s)) * 3 * s);
      b.rect(1 + 10 * s - half, cy + y, half * 2 + 1, 1, y < 0 ? crystal[2] : crystal[1]);
    }
    b.set(1 + 10 * s, cy - 2 * s, crystal[3]);
    b.shadeRamp((c) => (rgbKey(c) === rgbKey(stone[1]) ? stone : null));
    if (outline) b.outline(hex(pal.outline));
    frames.push(b.toCanvas());
  }
  return prop(frames, 1 + 10 * s, H + 1, 0.25);
}

/** A stone arch with a swirl of colour inside it. */
export function portalProp(color: number, pal: Palette, size: SpriteSize, outline: boolean): Prop {
  const s = size === 'large' ? 2 : 1;
  const stone = ramp(pal.wall, pal.contrast);
  const glow = ramp(color, pal.contrast);
  const W = 26 * s;
  const H = 34 * s;
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 4; f++) {
    const b = new PixelBuffer(W + 2, H + 2);
    // Swirl
    for (let y = 4 * s; y < 30 * s; y++) {
      for (let x = 4 * s; x < 22 * s; x++) {
        const dx = (x - 13 * s) / (9 * s);
        const dy = (y - 17 * s) / (13 * s);
        const r = Math.hypot(dx, dy);
        if (r > 1) continue;
        const a = Math.atan2(dy, dx) + r * 4 - f * 0.8;
        const band = Math.floor(((a / Math.PI) * 2 + 8) % 2);
        b.set(1 + x, 1 + y, r < 0.25 ? glow[3] : band ? glow[1] : glow[0]);
      }
    }
    // Arch
    for (let y = 0; y < 34 * s; y++) {
      const t = Math.max(0, 1 - y / (12 * s));
      const inset = Math.round(Math.sqrt(Math.max(0, 1 - (1 - t) ** 2)) * 0) + Math.round((1 - Math.sqrt(1 - t * t)) * 9 * s);
      const c = y % (4 * s) === 0 ? stone[0] : stone[1];
      b.rect(1 + inset, 1 + y, 3 * s, 1, c);
      b.rect(1 + 23 * s - inset, 1 + y, 3 * s, 1, c);
      if (y < 4 * s) b.rect(1 + inset + 3 * s, 1 + y, 20 * s - 2 * inset, 1, c);
    }
    b.rect(1, 1 + 31 * s, 26 * s, 3 * s, stone[0]);
    if (outline) b.outline(hex(pal.outline));
    frames.push(b.toCanvas());
  }
  return prop(frames, 1 + 13 * s, H + 1, 0.12);
}

/** A few broken stones. */
export function rubbleProp(seed: number, pal: Palette, size: SpriteSize, outline: boolean): Prop {
  const s = size === 'large' ? 2 : 1;
  const stone = ramp(pal.wall, pal.contrast);
  const W = 16 * s;
  const H = 8 * s;
  const b = new PixelBuffer(W + 2, H + 2);
  for (let i = 0; i < 4; i++) {
    const x = 1 + Math.floor(noise(i, 1, seed) * 12 * s);
    const y = 1 + Math.floor(noise(i, 2, seed) * 4 * s);
    const w = (2 + Math.floor(noise(i, 3, seed) * 3)) * s;
    b.rect(x, y + 2 * s, w, 2 * s, noise(i, 4, seed) > 0.5 ? stone[1] : stone[0]);
  }
  b.shadeRamp((c) => (rgbKey(c) === rgbKey(stone[1]) ? stone : null));
  if (outline) b.outline(hex(pal.outline));
  return prop([b.toCanvas()], 1 + 8 * s, H + 1);
}

/** A dropped item: a small sack with the rarity colour on the tie, or a pile of coins. */
export function dropProp(color: number | null, pal: Palette, size: SpriteSize, outline: boolean): Prop {
  const s = size === 'large' ? 2 : 1;
  if (color === null) {
    const gold = ramp(pal.gold, pal.contrast);
    const b = new PixelBuffer(8 * s + 2, 5 * s + 2);
    b.ellipse(1 + 4 * s, 1 + 3 * s, 4 * s, 1.5 * s, gold[0]);
    b.ellipse(1 + 3 * s, 1 + 2 * s, 2 * s, 1 * s, gold[1]);
    b.ellipse(1 + 5 * s, 1 + 2 * s, 2 * s, 1 * s, gold[2]);
    b.set(1 + 5 * s, 1 + 1 * s, gold[3]);
    if (outline) b.outline(hex(pal.outline));
    return prop([b.toCanvas()], 1 + 4 * s, 5 * s + 1);
  }
  const sack = ramp(pal.leather, pal.contrast);
  const tie = ramp(color, pal.contrast);
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 2; f++) {
    const b = new PixelBuffer(9 * s + 2, 10 * s + 2);
    b.ellipse(1 + 4.5 * s, 1 + 6 * s, 4 * s, 3.5 * s, sack[1]);
    b.rect(1 + 3 * s, 1 + 1 * s, 3 * s, 3 * s, sack[0]);
    b.rect(1 + 2 * s, 1 + 3 * s, 5 * s, 1 * s, tie[1]);
    b.set(1 + 4 * s + (f ? 1 : 0), 1 + 2 * s, tie[3]);
    b.shadeRamp((c) => (rgbKey(c) === rgbKey(sack[1]) ? sack : null));
    if (outline) b.outline(hex(pal.outline));
    frames.push(b.toCanvas());
  }
  return prop(frames, 1 + 4 * s, 10 * s + 1, 0.4);
}

/** Projectiles are drawn pointing right and rotated in place when drawn. */
export function projectileProp(shape: ProjectileShape, color: number, pal: Palette, size: SpriteSize): Prop {
  const s = size === 'large' ? 2 : 1;
  const c = ramp(color, pal.contrast);
  const frames: HTMLCanvasElement[] = [];
  const steel = ramp(pal.steel, pal.contrast);
  const wood = ramp(pal.wood, pal.contrast);
  switch (shape) {
    case 'bolt':
    case 'enemy_bolt': {
      for (let f = 0; f < 2; f++) {
        const b = new PixelBuffer(10 * s, 6 * s);
        b.ellipse(6 * s, 3 * s, 3 * s, 2 * s, c[1]);
        b.ellipse(7 * s, 3 * s, 1.5 * s, 1 * s, c[3]);
        b.rect(1 * s + f * s, 3 * s - (s >> 1), 3 * s, Math.max(1, s), c[0]);
        frames.push(b.toCanvas());
      }
      return prop(frames, 6 * s, 3 * s, 0.08);
    }
    case 'ball':
    case 'boulder': {
      const R = shape === 'boulder' ? 5 * s : 4 * s;
      for (let f = 0; f < 3; f++) {
        const b = new PixelBuffer(R * 4, R * 2 + 2);
        if (shape === 'boulder') {
          const rock = ramp(0x6a6058, pal.contrast);
          b.ellipse(R * 2.5, R, R, R, rock[1]);
          b.ellipse(R * 2.5 - 1, R - 1, R * 0.5, R * 0.5, rock[2]);
          b.shadeRamp((k) => (rgbKey(k) === rgbKey(rock[1]) ? rock : null));
        } else {
          b.ellipse(R * 2.5, R, R, R * 0.85, c[0]);
          b.ellipse(R * 1.6 - f * s, R, R, R * 0.6, c[0]);
          b.ellipse(R * 2.6, R, R * 0.7, R * 0.6, c[1]);
          b.ellipse(R * 2.9, R, R * 0.35, R * 0.35, c[3]);
          for (let i = 0; i < 3; i++) b.set(Math.round(R * 0.8 - i * s + ((f + i) % 2) * s), R + (i - 1) * s, c[2]);
        }
        frames.push(b.toCanvas());
      }
      return prop(frames, R * 2.5, R, 0.06);
    }
    case 'dagger': {
      const b = new PixelBuffer(9 * s, 3 * s);
      b.rect(3 * s, s, 6 * s, Math.max(1, s), steel[2]);
      b.rect(0, s, 3 * s, Math.max(1, s), wood[1]);
      b.rect(3 * s, 0, Math.max(1, s), 3 * s, wood[0]);
      frames.push(b.toCanvas());
      return prop(frames, 4 * s, s, 1);
    }
    case 'arrow': {
      const b = new PixelBuffer(12 * s, 3 * s);
      b.rect(0, s, 11 * s, Math.max(1, s), wood[1]);
      b.rect(10 * s, s, 2 * s, Math.max(1, s), steel[2]);
      b.rect(0, 0, 2 * s, Math.max(1, s), c[1]);
      b.rect(0, 2 * s, 2 * s, Math.max(1, s), c[1]);
      frames.push(b.toCanvas());
      return prop(frames, 6 * s, s, 1);
    }
    case 'hammer': {
      for (let f = 0; f < 4; f++) {
        const b = new PixelBuffer(10 * s, 10 * s);
        // Spinning: draw the hammer at four angles
        const a = (f / 4) * Math.PI;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        b.line(Math.round(5 * s - dx * 4 * s), Math.round(5 * s - dy * 4 * s), Math.round(5 * s + dx * 4 * s), Math.round(5 * s + dy * 4 * s), wood[1]);
        b.rect(Math.round(5 * s + dx * 4 * s) - s, Math.round(5 * s + dy * 4 * s) - s, 3 * s, 3 * s, steel[1]);
        frames.push(b.toCanvas());
      }
      return prop(frames, 5 * s, 5 * s, 0.05);
    }
  }
}
