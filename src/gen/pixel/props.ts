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

/**
 * The town waypoint: twice the size of a portal (52 by 68) and drawn at that
 * size, not scaled (producer's call, 2026-10-04). A stone arch laid in
 * wedge-shaped blocks with a keystone gem, two pillars with capitals, plinths
 * and carved runes that light up in turn, a two-step stone base, and a golden
 * swirl inside with a bright rim, a white-hot core and sparks rising through it.
 */
export function waypointProp(color: number, pal: Palette, size: SpriteSize, outline: boolean): Prop {
  const s = size === 'large' ? 2 : 1;
  const stone = ramp(pal.wall, pal.contrast);
  const glow = ramp(color, pal.contrast);
  const white: Rgb = [0xff, 0xf8, 0xe0];
  const W = 52;
  const H = 68;
  const cx = 25.5;
  const springY = 24;
  const outerR = 25.5;
  const innerR = 16;
  const FRAMES = 8;
  // Small rune shapes carved into the pillars, 3 by 4
  const RUNES = [
    ['x.x', '.x.', 'x.x', '.x.'],
    ['xxx', 'x..', 'xx.', 'x..'],
    ['.x.', 'xxx', '.x.', 'x.x'],
  ];
  const inOpening = (x: number, y: number): boolean => {
    if (y < springY) return Math.hypot(x - cx, y - springY) < innerR - 0.5;
    return x >= 10 && x <= 41 && y <= 57;
  };
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < FRAMES; f++) {
    const b = new PixelBuffer((W + 2) * s, (H + 2) * s);
    const set = (x: number, y: number, c: Rgb) => b.rect((1 + x) * s, (1 + y) * s, s, s, c);
    // The swirl, filling the opening: spiral bands turning, a bright core, a glowing rim against the stone
    for (let y = 0; y <= 57; y++) {
      for (let x = 10; x <= 41; x++) {
        if (!inOpening(x, y)) continue;
        const dx = (x - cx) / 16;
        const dy = (y - 34) / 24;
        const r = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx) + r * 5 - (f / FRAMES) * Math.PI * 2;
        const band = (((a / Math.PI) * 3) % 2 + 2) % 2;
        // Mostly deep gold, with one bright band per turn so the spiral reads
        let c: Rgb = band < 0.8 ? glow[0] : band < 1.4 ? glow[1] : band < 1.7 ? glow[2] : glow[1];
        if (r < 0.26) c = glow[2];
        if (r < 0.15) c = glow[3];
        if (r < 0.07) c = white;
        const rim = !inOpening(x - 1, y) || !inOpening(x + 1, y) || !inOpening(x, y - 1) || !inOpening(x, y + 1);
        if (rim) c = glow[2];
        set(x, y, c);
      }
    }
    // Sparks rising through the swirl, each on its own column and pace
    for (let k = 0; k < 7; k++) {
      const x = 13 + ((k * 11) % 26);
      const y = 54 - ((f * (3 + (k % 3)) + k * 9) % 42);
      if (inOpening(x, y)) set(x, y, k % 2 ? white : glow[3]);
      if (inOpening(x, y + 1) && k % 3 === 0) set(x, y + 1, glow[2]);
    }
    // The arch: wedge-shaped blocks with dark joints, lit from the left, a tall keystone on top
    for (let y = 0; y <= springY; y++) {
      for (let x = 0; x < W; x++) {
        const r = Math.hypot(x - cx, y - springY);
        const ang = Math.atan2(y - springY, x - cx); // -PI (left) .. 0 (right), -PI/2 at the top
        const key = Math.abs(ang + Math.PI / 2) < 0.2;
        if (r < innerR - 0.5 || r > outerR + (key ? 2 : 0)) continue;
        const seg = ((ang + Math.PI) / Math.PI) * 9;
        const joint = Math.abs(seg - Math.round(seg)) < 0.09 * (outerR / Math.max(r, 1));
        let c: Rgb = stone[1];
        if (r > outerR - 1.2 || x < cx - 18) c = stone[2];
        if (r < innerR + 0.8) c = stone[0];
        if (noise(x, y, 7) > 0.82) c = stone[0];
        if (joint && !key) c = stone[0];
        if (key) {
          c = r > outerR + 0.5 ? stone[3] : stone[2];
          if (Math.abs(x - cx) < 1 && Math.abs(r - (innerR + outerR) / 2) < 1.6) c = f % 4 < 2 ? white : glow[3];
          else if (Math.abs(x - cx) < 2 && Math.abs(r - (innerR + outerR) / 2) < 2.6) c = glow[2];
        }
        set(x, y, c);
      }
    }
    // Pillars: courses of blocks with staggered joints, a capital where the arch springs, a plinth at the foot
    for (const [x0, x1] of [[1, 9], [42, 50]] as [number, number][]) {
      for (let y = springY + 1; y <= 57; y++) {
        const course = Math.floor((y - springY - 1) / 6);
        for (let x = x0; x <= x1; x++) {
          let c: Rgb = x === x0 ? stone[2] : x === x1 ? stone[0] : stone[1];
          if ((y - springY - 1) % 6 === 5) c = stone[0];
          if (x === x0 + 3 + (course % 2) * 3 && (y - springY - 1) % 6 !== 5) c = stone[0];
          if (noise(x, y, 3) > 0.86) c = stone[0];
          set(x, y, c);
        }
      }
      // Capital and plinth stick out a pixel on each side
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        set(x, springY, x === x0 - 1 ? stone[3] : stone[2]);
        set(x, springY + 1, stone[0]);
        set(x, 55, stone[2]);
        set(x, 56, stone[1]);
        set(x, 57, stone[0]);
      }
      // Three runes down the face, lighting up one after another
      RUNES.forEach((rune, i) => {
        const lit = (f >> 1) % 4 === i;
        const c = lit ? glow[3] : glow[0];
        rune.forEach((row, ry) => {
          for (let rx = 0; rx < 3; rx++) if (row[rx] === 'x') set(x0 + 3 + rx, 30 + i * 8 + ry, c);
        });
        if (lit) set(x0 + 4, 29 + i * 8, glow[2]);
      });
    }
    // Two steps of stone at the base, top faces catching the light, joints staggered
    const step = (x0: number, x1: number, y0: number, h: number, off: number) => {
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x <= x1; x++) {
          let c: Rgb = y === y0 ? stone[3] : y === y0 + 1 ? stone[2] : y === y0 + h - 1 ? stone[0] : stone[1];
          if (y > y0 + 1 && (x - x0 + off) % 9 === 0) c = stone[0];
          if (y > y0 + 1 && noise(x, y, 11) > 0.88) c = stone[0];
          set(x, y, c);
        }
      }
    };
    step(3, 48, 58, 4, 4);
    step(0, 51, 62, 6, 0);
    // The swirl's glow spills onto the top step
    for (let x = 12; x <= 39; x++) if ((x + f) % 3 !== 0) set(x, 58, glow[2]);
    if (outline) b.outline(hex(pal.outline));
    frames.push(b.toCanvas());
  }
  return prop(frames, (1 + 26) * s, (H + 1) * s, 0.1);
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

export type DecorKind = 'rubble' | 'bones' | 'mushrooms' | 'ice';

/** Ground clutter that gives each zone its character. */
export function decorProp(kind: DecorKind, seed: number, pal: Palette, size: SpriteSize, outline: boolean): Prop {
  if (kind === 'rubble') return rubbleProp(seed, pal, size, outline);
  const s = size === 'large' ? 2 : 1;
  const W = 16 * s;
  const H = 10 * s;
  const b = new PixelBuffer(W + 2, H + 2);
  if (kind === 'bones') {
    const bone = ramp(pal.bone, pal.contrast);
    // A skull and a couple of long bones
    const sx = 1 + Math.floor(noise(seed, 1, 3) * 8 * s);
    b.ellipse(sx + 3 * s, 1 + 5 * s, 3 * s, 2.5 * s, bone[1]);
    b.set(sx + 2 * s, 1 + 5 * s, hex(pal.outline));
    b.set(sx + 4 * s, 1 + 5 * s, hex(pal.outline));
    b.rect(sx + 2 * s, 1 + 7 * s, 3 * s, 1, bone[0]);
    for (let i = 0; i < 2; i++) {
      const x0 = 1 + Math.floor(noise(seed, i + 2, 3) * 10 * s);
      const y0 = 1 + 7 * s + i * s;
      b.rect(x0, y0, 5 * s, 1, bone[1]);
      b.set(x0 - 1, y0 - 1, bone[2]);
      b.set(x0 + 5 * s, y0 + 1, bone[2]);
    }
  } else if (kind === 'mushrooms') {
    const cap = ramp(0x8ab070, pal.contrast);
    const stem = ramp(0xd8d0b8, pal.contrast);
    for (let i = 0; i < 3; i++) {
      const x = 1 + Math.floor(noise(seed, i, 5) * 11 * s) + 2 * s;
      const h = (2 + Math.floor(noise(seed, i, 6) * 3)) * s;
      b.rect(x, 1 + H - h - 1, s, h, stem[1]);
      b.ellipse(x + 0.5 * s, 1 + H - h - 1, 2 * s, 1.5 * s, cap[1]);
      b.set(x, 1 + H - h - 2 * s, cap[3]);
    }
  } else {
    const ice = ramp(pal.ice, pal.contrast);
    // Ice shards jutting up
    for (let i = 0; i < 3; i++) {
      const x = 1 + Math.floor(noise(seed, i, 7) * 12 * s) + s;
      const h = (3 + Math.floor(noise(seed, i, 8) * 5)) * s;
      for (let y = 0; y < h; y++) {
        const half = Math.max(0, Math.round(((h - y) / h) * 1.5 * s) - (y === 0 ? 1 : 0));
        b.rect(x - half, 1 + H - 1 - y, half * 2 + 1, 1, y > h * 0.6 ? ice[2] : ice[1]);
      }
      b.set(x, 1 + H - h, ice[3]);
    }
  }
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
    case 'spark': {
      // Chain lightning's bolt: a short jagged streak of white-blue, flipping its zigzag between frames
      for (let f = 0; f < 2; f++) {
        const b = new PixelBuffer(14 * s, 7 * s);
        const zig = [3, 1, 4, 2, 5, 3, 2];
        for (let i = 0; i < 7; i++) {
          const y = (f ? 6 - zig[i]! : zig[i]!) * s;
          b.rect(i * 2 * s, y, 2 * s, s, c[3]);
          b.rect(i * 2 * s, y - s, 2 * s, s, [255, 255, 255]);
          if (i < 6) b.rect((i * 2 + 1) * s, y + s, s, s, c[2]);
        }
        frames.push(b.toCanvas());
      }
      return prop(frames, 7 * s, 3 * s, 0.05);
    }
    case 'orb': {
      // Ball lightning: a sphere of crackling light with a white core and arcs skating over its surface
      const R = 11 * s;
      for (let f = 0; f < 3; f++) {
        const b = new PixelBuffer(R * 2 + 2, R * 2 + 2);
        b.ellipse(R + 1, R + 1, R, R, c[0]);
        b.ellipse(R + 1, R + 1, R * 0.75, R * 0.75, c[1]);
        b.ellipse(R + 1, R + 1, R * 0.45, R * 0.45, c[3]);
        b.ellipse(R + 1, R + 1, R * 0.22, R * 0.22, [255, 255, 255]);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + f * 0.7;
          const x0 = Math.round(R + 1 + Math.cos(a) * R * 0.5);
          const y0 = Math.round(R + 1 + Math.sin(a) * R * 0.5);
          const x1 = Math.round(R + 1 + Math.cos(a + 0.5) * R * 0.95);
          const y1 = Math.round(R + 1 + Math.sin(a + 0.5) * R * 0.95);
          b.line(x0, y0, x1, y1, [255, 255, 255]);
        }
        frames.push(b.toCanvas());
      }
      return prop(frames, R + 1, R + 1, 0.07);
    }
    case 'lance': {
      // A spear of ice: a long crystal shaft, a faceted head, a blue-white glow along the core and frost flaking off the tail
      const L = 26 * s;
      const ice = ramp(0x9fe0ff, pal.contrast);
      for (let f = 0; f < 2; f++) {
        const b = new PixelBuffer(L, 7 * s);
        b.rect(3 * s, 2 * s, L - 8 * s, s, ice[2]);
        b.rect(3 * s, 3 * s, L - 8 * s, s, [255, 255, 255]);
        b.rect(3 * s, 4 * s, L - 8 * s, s, ice[1]);
        // Head: widening then to a point
        b.rect(L - 6 * s, s, 2 * s, 5 * s, ice[2]);
        b.rect(L - 4 * s, 2 * s, 2 * s, 3 * s, ice[3]);
        b.rect(L - 2 * s, 3 * s, 2 * s, s, [255, 255, 255]);
        // Facets down the shaft
        for (let i = 0; i < 4; i++) b.set((7 + i * 4 + f) * s, 2 * s, ice[3]);
        // Frost flaking off behind
        for (let i = 0; i < 3; i++) b.set((i + f) * s, (1 + i * 2) * s, ice[3], 200);
        frames.push(b.toCanvas());
      }
      return prop(frames, L >> 1, 3 * s, 0.08);
    }
    case 'greatarrow': {
      // The daemon's arrow: a black shaft as long as a hero is tall, a broad barbed head, ragged dark
      // fletching, and runes down the shaft that glow in the pledge's colour and blink between frames
      const L = 30 * s;
      const dark = ramp(0x1a1418, pal.contrast);
      for (let f = 0; f < 2; f++) {
        const b = new PixelBuffer(L, 7 * s);
        b.rect(0, 3 * s, L - 6 * s, Math.max(1, s), dark[2]);
        b.rect(0, 2 * s, L - 6 * s, Math.max(1, s), dark[1]);
        b.rect(0, 4 * s, L - 6 * s, Math.max(1, s), dark[0]);
        // Barbed head
        b.rect(L - 7 * s, 2 * s, 5 * s, 3 * s, dark[3]);
        b.rect(L - 9 * s, s, 3 * s, s, dark[3]);
        b.rect(L - 9 * s, 5 * s, 3 * s, s, dark[3]);
        b.rect(L - 2 * s, 3 * s, 2 * s, s, c[3]);
        // Fletching: three ragged vanes
        for (let i = 0; i < 3; i++) {
          b.rect((1 + i * 2) * s, 0, s, 2 * s, dark[2]);
          b.rect((1 + i * 2) * s, 5 * s, s, 2 * s, dark[2]);
        }
        // Runes
        for (let i = 0; i < 5; i++) {
          const on = (i + f) % 2 === 0;
          b.set((9 + i * 3) * s, 3 * s, on ? c[3] : c[1]);
          if (on) b.set((9 + i * 3) * s, 2 * s, c[2]);
        }
        frames.push(b.toCanvas());
      }
      return prop(frames, L >> 1, 3 * s, 0.1);
    }
    case 'star': {
      // A holy star: a crisp five-pointed star with a dark outline so it reads
      // against the floor, a bright inner star, and sparkles off the tips
      // that blink as it turns through six angles
      const N = 32 * s;
      const C = 16 * s;
      const glow = ramp(0xffe070, pal.contrast);
      const dark = hex(pal.outline);
      const starPoints = (rot: number, outer: number, inner: number): [number, number][] => {
        const pts: [number, number][] = [];
        for (let k = 0; k < 10; k++) {
          const a = rot + (k / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = k % 2 === 0 ? outer : inner;
          pts.push([C + Math.cos(a) * rr, C + Math.sin(a) * rr]);
        }
        return pts;
      };
      const insideStar = (pts: [number, number][], x: number, y: number): boolean => {
        for (let k = 0; k < 10; k++) {
          const [ax, ay] = pts[k]!;
          const [bx, by] = pts[(k + 1) % 10]!;
          const d1 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
          const d2 = (C - bx) * (y - by) - (C - by) * (x - bx);
          const d3 = (ax - C) * (y - C) - (ay - C) * (x - C);
          if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) return true;
        }
        return false;
      };
      for (let f = 0; f < 6; f++) {
        const b = new PixelBuffer(N, N);
        const rot = (f / 6) * ((Math.PI * 2) / 5);
        const body = starPoints(rot, 13 * s, 5 * s);
        const core = starPoints(rot, 6 * s, 2.4 * s);
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            const cx = x + 0.5;
            const cy = y + 0.5;
            if (!insideStar(body, cx, cy)) continue;
            b.set(x, y, insideStar(core, cx, cy) ? glow[3] : glow[2]);
          }
        }
        b.outline(dark);
        // Sparkles: a bright dot just off every other tip, moving round each frame
        for (let k = 0; k < 5; k++) {
          if ((k + f) % 2) continue;
          const a = rot + (k / 5) * Math.PI * 2 - Math.PI / 2;
          b.set(Math.round(C + Math.cos(a) * 15 * s), Math.round(C + Math.sin(a) * 15 * s), glow[3]);
        }
        frames.push(b.toCanvas());
      }
      return prop(frames, C, C, 0.03);
    }
    case 'hammer': {
      // A holy war hammer a head taller than the hero, spinning fast through
      // eight angles: a long haft with a wrapped grip and a broad golden head
      // that glows, with a dithered halo that flickers as it turns
      const N = 36 * s;
      const C = 18 * s;
      const haft = 14 * s;
      const glow = ramp(0xffd860, pal.contrast);
      for (let f = 0; f < 8; f++) {
        const b = new PixelBuffer(N, N);
        const a = (f / 8) * Math.PI;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const hx = Math.round(C + dx * (haft - 3 * s));
        const hy = Math.round(C + dy * (haft - 3 * s));
        const across = 5 * s; // half-width across the haft
        const along = 3 * s; // half-depth along it
        // Halo: a soft ring of light around the head, dithered so it reads as glow
        const halo = 4 * s;
        for (let u = -along - halo; u <= along + halo; u++) {
          for (let v = -across - halo; v <= across + halo; v++) {
            const du = Math.max(0, Math.abs(u) - along);
            const dv = Math.max(0, Math.abs(v) - across);
            const dist = Math.hypot(du, dv);
            if (dist === 0 || dist > halo) continue;
            const x = Math.round(hx + dx * u - dy * v);
            const y = Math.round(hy + dy * u + dx * v);
            // Nearer the head is denser; the pattern shifts frame to frame so it flickers
            const density = 1 - dist / halo;
            const bayer = ((x * 3 + y * 5 + f) % 4) / 4;
            if (bayer < density * 0.8) b.set(x, y, dist < halo * 0.4 ? glow[2] : glow[1]);
          }
        }
        // Haft, three pixels thick, from the pommel to the head, with a darker wrapped grip
        for (let t = -1; t <= 1; t++) {
          b.line(Math.round(C - dx * haft - dy * t), Math.round(C - dy * haft + dx * t), Math.round(C + dx * (haft - 5 * s) - dy * t), Math.round(C + dy * (haft - 5 * s) + dx * t), t === 0 ? wood[1] : wood[0]);
        }
        for (let g = 0; g < 4 * s; g += 2) {
          const gx = Math.round(C - dx * (haft - 2 * s - g));
          const gy = Math.round(C - dy * (haft - 2 * s - g));
          b.rect(gx - s, gy - s, 3 * s, 3 * s, wood[0]);
        }
        // Head: a broad block across the haft's end, bright on the leading face, dark at the edges
        for (let u = -along; u <= along; u++) {
          for (let v = -across; v <= across; v++) {
            const x = Math.round(hx + dx * u - dy * v);
            const y = Math.round(hy + dy * u + dx * v);
            const edge = Math.abs(v) === across || Math.abs(u) === along;
            b.set(x, y, edge ? glow[0] : u < -s ? glow[3] : u < along - s ? glow[2] : glow[1]);
          }
        }
        // A rune on each face
        for (const side of [-1, 1]) {
          const rx = Math.round(hx - dy * side * (across >> 1));
          const ry = Math.round(hy + dx * side * (across >> 1));
          b.set(rx, ry, glow[0]);
        }
        frames.push(b.toCanvas());
      }
      return prop(frames, C, C, 0.022);
    }
  }
}
