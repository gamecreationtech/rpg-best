import type { Palette } from './palettes';
import { PixelBuffer, hex, noise, ramp, type Ramp, type Rgb } from './pixel';

export type SpriteSize = 'small' | 'large';

/** Frames of one animation, all the same size. Side views are drawn facing right. */
export interface SpriteAnim {
  frames: HTMLCanvasElement[];
  /** Pixel under the feet, relative to the frame's top-left. */
  originX: number;
  originY: number;
  /** Seconds per frame. */
  frameTime: number;
}

// ---------------------------------------------------------------- tiles and props

export interface TileSet {
  floor: HTMLCanvasElement[];
  wall: HTMLCanvasElement;
  tileW: number;
  tileH: number;
  wallH: number;
}

function speckle(buf: PixelBuffer, x: number, y: number, r: Ramp, seed: number, amount: number, grain = 1): void {
  const n = noise(Math.floor(x / grain), Math.floor(y / grain), seed);
  if (n < amount * 0.35) buf.set(x, y, r[0]);
  else if (n > 1 - amount * 0.25) buf.set(x, y, r[2]);
  else buf.set(x, y, r[1]);
}

/** Isometric 2:1 diamond floor tiles and a wall block. */
export function isoTiles(pal: Palette, size: SpriteSize, seed: number): TileSet {
  const tileW = size === 'large' ? 64 : 32;
  const tileH = tileW / 2;
  const floors: HTMLCanvasElement[] = [];
  const rf = ramp(pal.floor, pal.contrast);
  const ra = ramp(pal.floorAlt, pal.contrast);
  const grain = size === 'large' ? 2 : 1;
  for (let v = 0; v < 4; v++) {
    const buf = new PixelBuffer(tileW, tileH);
    const r = v === 3 ? ra : rf;
    for (let y = 0; y < tileH; y++) {
      const half = Math.round(((y < tileH / 2 ? y + 0.5 : tileH - y - 0.5) / (tileH / 2)) * (tileW / 2));
      for (let x = tileW / 2 - half; x < tileW / 2 + half; x++) speckle(buf, x, y, r, seed + v, 0.3, grain);
    }
    // Darker lower edges so tiles read as slabs
    for (let y = tileH / 2; y < tileH; y++) {
      const half = Math.round(((tileH - y - 0.5) / (tileH / 2)) * (tileW / 2));
      buf.set(tileW / 2 - half, y, hex(pal.seam));
      buf.set(tileW / 2 + half - 1, y, hex(pal.seam));
    }
    // A crack now and then
    if (v === 3) {
      let cx = tileW / 2 - 4;
      let cy = tileH / 2 - 2;
      for (let i = 0; i < 6; i++) {
        buf.set(cx, cy, hex(pal.seam));
        cx += noise(i, v, seed) > 0.5 ? 1 : 0;
        cy += 1;
      }
    }
    floors.push(buf.toCanvas());
  }
  const wallH = Math.round(tileH * 1.75);
  const wall = new PixelBuffer(tileW, tileH + wallH);
  const rw = ramp(pal.wall, pal.contrast);
  const rt = ramp(pal.wallTop, pal.contrast);
  // Left and right faces hang from the diamond's two front edges; the left
  // face is in shadow, the right one catches the light. Bricks with mortar.
  const seam = hex(pal.seam);
  const rowH = Math.max(4, Math.round(tileH / 4));
  const brickW = Math.max(6, Math.round(tileW / 4));
  for (let y = 0; y < wallH + tileH / 2; y++) {
    for (let x = 0; x < tileW; x++) {
      const isLeft = x < tileW / 2;
      const edge = isLeft ? Math.round((x / (tileW / 2)) * (tileH / 2)) : Math.round(((tileW - x) / (tileW / 2)) * (tileH / 2));
      const top = tileH / 2 + edge;
      const yy = y + tileH / 2;
      if (yy < top || yy >= top + wallH) continue;
      const depth = yy - top;
      const row = Math.floor(depth / rowH);
      const u = isLeft ? x : tileW - 1 - x;
      const mortar = depth % rowH === 0 || (u + (row % 2) * (brickW >> 1)) % brickW === 0;
      let c = isLeft ? rw[0] : rw[1];
      if (mortar) c = isLeft ? seam : rw[0];
      else if (depth === 1) c = isLeft ? rw[1] : rw[2];
      else if (noise(x, yy, seed + 9) > 0.92) c = isLeft ? seam : rw[0];
      wall.set(x, yy, c);
    }
  }
  // Top diamond with a seam around it
  for (let y = 0; y < tileH; y++) {
    const half = Math.round(((y < tileH / 2 ? y + 0.5 : tileH - y - 0.5) / (tileH / 2)) * (tileW / 2));
    for (let x = tileW / 2 - half; x < tileW / 2 + half; x++) speckle(wall, x, y, rt, seed + 5, 0.25, grain);
    wall.set(tileW / 2 - half, y, seam);
    wall.set(tileW / 2 + half - 1, y, seam);
  }
  wall.outline(hex(pal.outline));
  return { floor: floors, wall: wall.toCanvas(), tileW, tileH, wallH };
}

/** Square top-down tiles for a 16-bit look. */
export function topTiles(pal: Palette, size: SpriteSize, seed: number): TileSet {
  const tileW = size === 'large' ? 32 : 16;
  const tileH = tileW;
  const floors: HTMLCanvasElement[] = [];
  const rf = ramp(pal.floor, pal.contrast);
  const ra = ramp(pal.floorAlt, pal.contrast);
  const grain = size === 'large' ? 2 : 1;
  for (let v = 0; v < 4; v++) {
    const buf = new PixelBuffer(tileW, tileH);
    const r = v === 3 ? ra : rf;
    for (let y = 0; y < tileH; y++) for (let x = 0; x < tileW; x++) speckle(buf, x, y, r, seed + v, 0.3, grain);
    // Flagstone seams
    for (let x = 0; x < tileW; x++) buf.set(x, tileH - 1, hex(pal.seam));
    for (let y = 0; y < tileH; y++) buf.set(tileW - 1, y, hex(pal.seam));
    if (v >= 2) for (let x = 0; x < tileW / 2; x++) buf.set(x, tileH / 2, hex(pal.seam));
    floors.push(buf.toCanvas());
  }
  const wallH = tileH;
  const wall = new PixelBuffer(tileW, tileH + wallH);
  const rw = ramp(pal.wall, pal.contrast);
  const rt = ramp(pal.wallTop, pal.contrast);
  for (let y = 0; y < tileH; y++) for (let x = 0; x < tileW; x++) speckle(wall, x, y, rt, seed + 5, 0.25, grain);
  for (let y = tileH; y < tileH + wallH; y++) {
    for (let x = 0; x < tileW; x++) {
      const row = Math.floor((y - tileH) / Math.max(3, tileH / 4));
      const brickEdge = (x + (row % 2) * (tileW / 4)) % (tileW / 2) === 0 || (y - tileH) % Math.max(3, tileH / 4) === 0;
      wall.set(x, y, brickEdge ? rw[0] : noise(x, y, seed + 7) > 0.85 ? rw[2] : rw[1]);
    }
  }
  wall.outline(hex(pal.outline));
  return { floor: floors, wall: wall.toCanvas(), tileW, tileH, wallH };
}

export interface PropSprites {
  pillar: HTMLCanvasElement;
  brazier: HTMLCanvasElement[];
  chest: HTMLCanvasElement;
}

export function propSprites(pal: Palette, size: SpriteSize, outline: boolean): PropSprites {
  const s = size === 'large' ? 2 : 1;
  const stone = ramp(pal.wall, pal.contrast);
  const cap = ramp(pal.wallTop, pal.contrast);
  const pillar = new PixelBuffer(14 * s + 2, 40 * s + 2);
  pillar.rect(1 + 3 * s, 1 + 4 * s, 8 * s, 34 * s, stone[1]);
  pillar.rect(1 + 2 * s, 1 + 2 * s, 10 * s, 3 * s, cap[1]);
  pillar.rect(1 + 1 * s, 1 + 36 * s, 12 * s, 4 * s, cap[0]);
  for (let y = 1 + 4 * s; y < 1 + 38 * s; y++) pillar.set(1 + 3 * s, y, stone[2]);
  for (let y = 1 + 4 * s; y < 1 + 38 * s; y++) pillar.set(1 + 10 * s, y, stone[0]);
  pillar.shadeRamp((c) => (c.join() === stone[1].join() ? stone : c.join() === cap[1].join() ? cap : null));
  if (outline) pillar.outline(hex(pal.outline));

  const iron = ramp(0x2a2a30, pal.contrast);
  const fire = ramp(pal.fire, pal.contrast);
  const brazier: HTMLCanvasElement[] = [];
  for (let f = 0; f < 3; f++) {
    const b = new PixelBuffer(12 * s + 2, 22 * s + 2);
    b.rect(1 + 3 * s, 1 + 12 * s, 6 * s, 2 * s, iron[1]);
    b.rect(1 + 5 * s, 1 + 14 * s, 2 * s, 6 * s, iron[1]);
    b.rect(1 + 2 * s, 1 + 20 * s, 8 * s, 2 * s, iron[0]);
    // Flames: stacked ellipses jittering per frame
    const fc = fire;
    const core = hex(pal.fireCore);
    b.ellipse(6 * s + 1, 1 + 10 * s, 4 * s, 3 * s, fc[0]);
    b.ellipse(6 * s + 1 + (f - 1) * s, 1 + 7 * s, 3 * s, 4 * s, fc[1]);
    b.ellipse(6 * s + 1 - (f - 1) * s, 1 + 4 * s + (f % 2) * s, 2 * s, 3 * s, fc[2]);
    b.ellipse(6 * s + 1, 1 + 8 * s, Math.max(1, s), 2 * s, core);
    if (outline) b.outline(hex(pal.outline));
    brazier.push(b.toCanvas());
  }

  const wood = ramp(pal.wood, pal.contrast);
  const gold = ramp(pal.gold, pal.contrast);
  const chest = new PixelBuffer(14 * s + 2, 10 * s + 2);
  chest.rect(1, 1 + 3 * s, 14 * s, 7 * s, wood[1]);
  chest.rect(1, 1, 14 * s, 3 * s, wood[2]);
  chest.rect(1 + 6 * s, 1 + 3 * s, 2 * s, 2 * s, gold[1]);
  chest.rect(1, 1 + 3 * s, 14 * s, 1, gold[0]);
  chest.shadeRamp((c) => (c.join() === wood[1].join() || c.join() === wood[2].join() ? wood : null));
  if (outline) chest.outline(hex(pal.outline));
  return { pillar: pillar.toCanvas(), brazier, chest: chest.toCanvas() };
}

// ---------------------------------------------------------------- effects

export interface EffectSprites {
  fireball: HTMLCanvasElement[];
  explosion: HTMLCanvasElement[];
  frostRing: HTMLCanvasElement[];
  shadow: HTMLCanvasElement;
  /** The boulder Boulder Toss drops: a rock wider than the hero is tall. */
  boulder: HTMLCanvasElement;
  /** Three small rocks that circle a Rock Solid hero. */
  rocks: HTMLCanvasElement[];
  /** Earthen Spikes: a stone spike at three heights, short to full, bottom-aligned in 10x18. */
  spikes: HTMLCanvasElement[];
  /** Rockfall's stones: between a rock and the boulder. */
  stones: HTMLCanvasElement[];
  /** The big skull Death raises over its area. */
  skull: HTMLCanvasElement;
  /** Four frames of a standing tongue of flame, a hero tall, for Fire Prison's bars. */
  flame: HTMLCanvasElement[];
  /** Two big six-armed snowflakes, the ones Blizzard drops on enemies. */
  snowflakes: HTMLCanvasElement[];
  /** A big arrow seen point-down, the kind Arrow Storm rains from the sky. */
  bigArrow: HTMLCanvasElement;
  /** Spear Wall's spears, standing upright: a leaf-bladed one and a barbed one, bottom-aligned. */
  spears: HTMLCanvasElement[];
  /** A javelin seen side on, point to the right, for Reckless Charge's escort. */
  javelin: HTMLCanvasElement;
  /** Consecrated Blade's holy sword, point-down and taller than the hero, that comes down on every hit. */
  holySword: HTMLCanvasElement;
  /** The daemon Arrow of Beyond raises: bow drawn, then loosed. Faces right. */
  daemon: HTMLCanvasElement[];
  /** Meat Shield's titan: standing, fists raised, fists down. Faces right. */
  titan: HTMLCanvasElement[];
  /** The rogue's eagle: wings up, wings level, wings down, then the dive with talons out. Faces right. */
  eagle: HTMLCanvasElement[];
  /** The paladin's fallen angel: at rest, and mid-cut. Faces right. */
  angel: HTMLCanvasElement[];
}

export function effectSprites(pal: Palette, size: SpriteSize): EffectSprites {
  const s = size === 'large' ? 2 : 1;
  const fire = ramp(pal.fire, pal.contrast);
  const core = hex(pal.fireCore);
  const fireball: HTMLCanvasElement[] = [];
  for (let f = 0; f < 3; f++) {
    const b = new PixelBuffer(16 * s, 10 * s);
    b.ellipse(11 * s, 5 * s, 4 * s, 3.5 * s, fire[0]);
    b.ellipse(8 * s - f * s, 5 * s, 4 * s, 2.5 * s, fire[0]);
    b.ellipse(11 * s, 5 * s, 3 * s, 2.5 * s, fire[1]);
    b.ellipse(12 * s, 5 * s, 1.5 * s, 1.5 * s, core);
    for (let i = 0; i < 3; i++) b.set(3 * s - i * s + ((f + i) % 2) * s, 5 * s + (i - 1) * s, fire[2]);
    fireball.push(b.toCanvas());
  }
  const explosion: HTMLCanvasElement[] = [];
  for (let f = 0; f < 5; f++) {
    const R = (6 + f * 4) * s;
    const b = new PixelBuffer(R * 2 + 2, R * 2 + 2);
    const fade = f / 5;
    for (let y = 0; y <= R * 2; y++) {
      for (let x = 0; x <= R * 2; x++) {
        const d = Math.hypot(x - R, y - R) / R + noise(x, y, f) * 0.25;
        if (d > 1) continue;
        const c = d < 0.35 - fade * 0.3 ? core : d < 0.7 - fade * 0.2 ? fire[2] : d < 0.9 ? fire[1] : fire[0];
        if (fade > 0.5 && noise(x + 3, y, f) < fade - 0.4) continue;
        b.set(x, y, c);
      }
    }
    explosion.push(b.toCanvas());
  }
  const ice = ramp(pal.ice, pal.contrast);
  const frostRing: HTMLCanvasElement[] = [];
  for (let f = 0; f < 5; f++) {
    const R = (8 + f * 10) * s;
    const b = new PixelBuffer(R * 2 + 2, R + 2);
    for (let y = 0; y <= R; y++) {
      for (let x = 0; x <= R * 2; x++) {
        const d = Math.hypot((x - R) / R, ((y - R / 2) / R) * 2);
        if (d > 1 || d < 0.72 - f * 0.05) continue;
        b.set(x, y, d > 0.9 ? ice[0] : noise(x, y, f) > 0.6 ? ice[3] : ice[1]);
      }
    }
    frostRing.push(b.toCanvas());
  }
  const shadow = new PixelBuffer(12 * s, 6 * s);
  for (let y = 0; y < 6 * s; y++) for (let x = 0; x < 12 * s; x++) if (Math.hypot((x - 6 * s) / (6 * s), (y - 3 * s) / (3 * s)) <= 1 && (x + y) % 2 === 0) shadow.set(x, y, [0, 0, 0], 255);
  const rockRamp = ramp(0x6a6058, pal.contrast);
  const boulderBuf = new PixelBuffer(30 * s, 24 * s);
  boulderBuf.ellipse(15 * s, 12 * s, 14 * s, 11 * s, rockRamp[1]);
  boulderBuf.ellipse(9 * s, 7 * s, 5 * s, 4 * s, rockRamp[2]);
  boulderBuf.ellipse(20 * s, 16 * s, 6 * s, 4 * s, rockRamp[0]);
  boulderBuf.shadeRamp((c) => (c[0] === rockRamp[1][0] && c[1] === rockRamp[1][1] && c[2] === rockRamp[1][2] ? rockRamp : null));
  // Cracks and a chipped edge
  boulderBuf.line(17 * s, 4 * s, 13 * s, 12 * s, rockRamp[0]);
  boulderBuf.line(13 * s, 12 * s, 16 * s, 20 * s, rockRamp[0]);
  boulderBuf.line(5 * s, 14 * s, 9 * s, 16 * s, rockRamp[0]);
  boulderBuf.set(4 * s, 8 * s, rockRamp[3]);
  boulderBuf.set(8 * s, 5 * s, rockRamp[3]);
  const rocks: HTMLCanvasElement[] = [];
  const rockShapes: [number, number][] = [[9, 7], [10, 8], [8, 6]];
  for (let i = 0; i < rockShapes.length; i++) {
    const [rw, rh] = rockShapes[i]!;
    const b = new PixelBuffer(rw * s + 2, rh * s + 2);
    b.ellipse((rw / 2) * s + 1, (rh / 2) * s + 1, (rw / 2) * s, (rh / 2) * s, rockRamp[1]);
    b.set(Math.round(rw * 0.35) * s + 1, Math.round(rh * 0.3) * s + 1, rockRamp[3]);
    b.shadeRamp((c) => (c[0] === rockRamp[1][0] && c[1] === rockRamp[1][1] && c[2] === rockRamp[1][2] ? rockRamp : null));
    rocks.push(b.toCanvas());
  }
  // Spikes: a tapering shard of stone, lit from the left, at three heights
  const spikes: HTMLCanvasElement[] = [];
  for (const h of [7, 12, 18]) {
    const b = new PixelBuffer(10 * s, 18 * s);
    for (let row = 0; row < h; row++) {
      const half = Math.max(1, Math.round((row / h) * 4.5));
      const y = (18 - h + row) * s;
      b.rect((5 - half) * s, y, half * s, s, rockRamp[2]);
      b.rect(5 * s, y, half * s, s, rockRamp[1]);
      b.rect((5 - half) * s, y, s, s, rockRamp[0]);
      b.rect((4 + half) * s, y, s, s, rockRamp[0]);
    }
    b.rect(4 * s, (18 - h) * s, s, s, rockRamp[3]);
    spikes.push(b.toCanvas());
  }
  // Stones: two lumps with a crack across each
  const stones: HTMLCanvasElement[] = [];
  for (const [sw, sh] of [[16, 13], [14, 11]] as [number, number][]) {
    const b = new PixelBuffer(sw * s + 2, sh * s + 2);
    b.ellipse((sw / 2) * s + 1, (sh / 2) * s + 1, (sw / 2) * s, (sh / 2) * s, rockRamp[1]);
    b.ellipse((sw * 0.35) * s + 1, (sh * 0.35) * s + 1, (sw / 4) * s, (sh / 4) * s, rockRamp[2]);
    b.shadeRamp((c) => (c[0] === rockRamp[1][0] && c[1] === rockRamp[1][1] && c[2] === rockRamp[1][2] ? rockRamp : null));
    b.line((sw * 0.55) * s, 2 * s, (sw * 0.4) * s, (sh - 2) * s, rockRamp[0]);
    b.set((sw * 0.3) * s + 1, (sh * 0.3) * s + 1, rockRamp[3]);
    stones.push(b.toCanvas());
  }
  // A skull, 26 wide: domed cranium, hollow eyes, a nose slit and a row of teeth, with a dark outline
  const bone: Rgb = [232, 224, 200];
  const boneDark: Rgb = [160, 150, 128];
  const hollow: Rgb = [40, 16, 56];
  const outline: Rgb = [26, 20, 16];
  const skull = new PixelBuffer(26 * s, 28 * s);
  skull.ellipse(13 * s, 11 * s, 12 * s, 11 * s, outline);
  skull.rect(6 * s, 16 * s, 14 * s, 11 * s, outline);
  skull.ellipse(13 * s, 11 * s, 11 * s, 10 * s, bone);
  skull.rect(7 * s, 16 * s, 12 * s, 9 * s, bone);
  skull.rect(7 * s, 18 * s, 12 * s, 2 * s, boneDark); // the cheek line
  skull.ellipse(8.5 * s, 11 * s, 3.5 * s, 3.5 * s, hollow);
  skull.ellipse(17.5 * s, 11 * s, 3.5 * s, 3.5 * s, hollow);
  skull.rect(12 * s, 14 * s, 2 * s, 3 * s, hollow);
  for (let i = 0; i < 5; i++) skull.rect((8 + i * 2.2) * s, 22 * s, Math.max(1, s), 4 * s, i % 2 ? boneDark : outline);
  skull.rect(7 * s, 26 * s, 12 * s, Math.max(1, s), outline);
  skull.set(6 * s, 6 * s, [255, 255, 255]);
  skull.set(7 * s, 5 * s, [255, 255, 255]);
  const flame: HTMLCanvasElement[] = [];
  const FH = 24;
  for (let f = 0; f < 4; f++) {
    const b = new PixelBuffer(7 * s, FH * s);
    for (let y = 0; y < FH * s; y++) {
      // Wide at the foot, a point at the top, the whole tongue leaning with the frame
      const up = 1 - y / (FH * s);
      const half = Math.max(0.5, (3.2 * (1 - up * up) + 0.6) * s);
      const lean = Math.sin(f * 1.6 + up * 6) * 1.2 * s * up;
      const cx = 3.5 * s + lean;
      for (let x = 0; x < 7 * s; x++) {
        const d = Math.abs(x + 0.5 - cx) / half;
        if (d > 1) continue;
        const n = noise(x, y, f);
        if (up > 0.82 && n < 0.45) continue;
        const c = d < 0.3 && up < 0.7 ? core : d < 0.62 ? fire[2] : d < 0.85 ? fire[1] : fire[0];
        b.set(x, y, up > 0.9 && n > 0.7 ? [255, 255, 255] : c);
      }
    }
    flame.push(b.toCanvas());
  }
  const snowflakes: HTMLCanvasElement[] = [];
  for (const R of [7, 9]) {
    const b = new PixelBuffer((R * 2 + 1) * s, (R * 2 + 1) * s);
    const c = R * s;
    for (let arm = 0; arm < 6; arm++) {
      const a = (arm / 6) * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      for (let r = 0; r <= R * s; r++) {
        const x = Math.round(c + dx * r);
        const y = Math.round(c + dy * r);
        b.set(x, y, r < R * s * 0.35 ? [255, 255, 255] : ice[3]);
        // Side branches two thirds of the way out
        if (r === Math.round(R * s * 0.6)) {
          for (const side of [-1, 1]) {
            const ba = a + side * Math.PI / 3;
            for (let q = 1; q <= Math.round(R * s * 0.35); q++) b.set(Math.round(x + Math.cos(ba) * q), Math.round(y + Math.sin(ba) * q), ice[2]);
          }
        }
      }
    }
    b.set(c, c, [255, 255, 255]);
    snowflakes.push(b.toCanvas());
  }
  // The falling arrow: 22 tall, point at the bottom, fletched at the top, with a dark outline
  const woodRamp = ramp(pal.wood, pal.contrast);
  const steelRamp = ramp(pal.steel, pal.contrast);
  const arrow = new PixelBuffer(7 * s, 22 * s);
  arrow.rect(2 * s, 0, 3 * s, 22 * s, [26, 20, 16]);
  arrow.rect(3 * s, 0, s, 18 * s, woodRamp[2]);
  arrow.rect(3 * s, 0, s, 2 * s, woodRamp[0]);
  // Fletching: two feathers angled off the shaft
  for (let i = 0; i < 4; i++) {
    arrow.rect((1 + (i >> 1)) * s, (1 + i) * s, s, s, [232, 224, 200]);
    arrow.rect((5 - (i >> 1)) * s, (1 + i) * s, s, s, [232, 224, 200]);
    arrow.set(1 * s, (i + 1) * s, [26, 20, 16], i > 1 ? 255 : 0);
  }
  arrow.rect(0, 0, s, 4 * s, [26, 20, 16]);
  arrow.rect(6 * s, 0, s, 4 * s, [26, 20, 16]);
  arrow.rect(1 * s, 0, s, 3 * s, [232, 224, 200]);
  arrow.rect(5 * s, 0, s, 3 * s, [232, 224, 200]);
  // Head: a broad steel point
  arrow.rect(2 * s, 16 * s, 3 * s, 2 * s, steelRamp[2]);
  arrow.rect(2 * s, 18 * s, 3 * s, 2 * s, steelRamp[1]);
  arrow.rect(3 * s, 20 * s, s, 2 * s, steelRamp[3]);
  arrow.rect(1 * s, 15 * s, s, 4 * s, [26, 20, 16]);
  arrow.rect(5 * s, 15 * s, s, 4 * s, [26, 20, 16]);
  // Spear Wall's spears: a hero-tall ash shaft with a steel head. The first has a leaf blade, the second a barbed
  // head with two side spikes, so the wall reads as a row of real spears and not a line of sticks
  const outlineInk: Rgb = [26, 20, 16];
  const spears: HTMLCanvasElement[] = [];
  for (let v = 0; v < 2; v++) {
    const W = 11 * s;
    const H = 30 * s;
    const b = new PixelBuffer(W, H);
    const cx = 5 * s;
    // Shaft, lit down the left
    b.rect(cx, 9 * s, s, 21 * s, woodRamp[2]);
    b.rect(cx + s, 10 * s, s, 20 * s, woodRamp[1]);
    b.rect(cx, 9 * s, s, 3 * s, woodRamp[3]);
    // Binding where the head meets the shaft
    b.rect(cx - s, 8 * s, 3 * s, 2 * s, [58, 50, 68]);
    // Head: a tapering blade, bright on the left edge
    for (let row = 0; row < 8; row++) {
      const half = Math.max(1, Math.round((row / 7) * 2));
      const y = row * s;
      b.rect(cx - (half - 1) * s, y, (half * 2 - 1) * s, s, steelRamp[2]);
      b.rect(cx - (half - 1) * s, y, s, s, steelRamp[3]);
      if (half > 1) b.rect(cx + (half - 1) * s, y, s, s, steelRamp[1]);
    }
    if (v === 1) {
      // Barbs: two spikes jutting out either side of the socket
      for (const side of [-1, 1]) {
        b.rect(cx + side * 2 * s, 7 * s, s, s, steelRamp[2]);
        b.rect(cx + side * 3 * s, 6 * s, s, s, steelRamp[2]);
        b.rect(cx + side * 4 * s, 5 * s, s, s, steelRamp[3]);
      }
    }
    b.outline(outlineInk);
    spears.push(b.toCanvas());
  }
  // The javelin: a short ash shaft with a long steel point and a red tassel at the butt, seen side on, point right
  const jav = new PixelBuffer(22 * s, 5 * s);
  jav.rect(3 * s, 2 * s, 13 * s, s, woodRamp[2]);
  jav.rect(3 * s, 2 * s, 4 * s, s, woodRamp[3]);
  jav.rect(16 * s, 2 * s, 5 * s, s, steelRamp[2]);
  jav.rect(16 * s, s, 3 * s, s, steelRamp[3]);
  jav.rect(16 * s, 3 * s, 3 * s, s, steelRamp[1]);
  jav.rect(21 * s, 2 * s, s, s, steelRamp[3]);
  jav.rect(s, s, 2 * s, s, [170, 40, 40]);
  jav.rect(0, 2 * s, 3 * s, s, [200, 60, 50]);
  jav.rect(s, 3 * s, 2 * s, s, [170, 40, 40]);
  jav.outline(outlineInk);
  // The holy sword: a broad gold blade point-down, a white edge, a wide cross guard and a dark grip, taller than the hero
  const gold = ramp(0xffd860, pal.contrast);
  const sw = new PixelBuffer(15 * s, 38 * s);
  const scx = 7 * s;
  for (let row = 0; row < 26; row++) {
    const half = row < 20 ? 2 : Math.max(0, 2 - Math.round(((row - 19) / 6) * 2));
    const y = (10 + row) * s;
    sw.rect(scx - half * s, y, (half * 2 + 1) * s, s, gold[2]);
    sw.rect(scx, y, s, s, [255, 255, 255]);
    if (half > 0) sw.rect(scx - half * s, y, s, s, gold[3]);
    if (half > 0) sw.rect(scx + half * s, y, s, s, gold[1]);
  }
  sw.rect(scx, 35 * s, s, 2 * s, [255, 255, 255]);
  // Guard, grip and pommel
  sw.rect(scx - 6 * s, 8 * s, 13 * s, 2 * s, gold[2]);
  sw.rect(scx - 6 * s, 8 * s, 13 * s, s, gold[3]);
  sw.rect(scx - s, 2 * s, 3 * s, 6 * s, [58, 50, 68]);
  sw.rect(scx, 2 * s, s, 6 * s, [90, 80, 100]);
  sw.rect(scx - s, 0, 3 * s, 2 * s, gold[3]);
  sw.outline(outlineInk);
  return { fireball, explosion, frostRing, shadow: shadow.toCanvas(), boulder: boulderBuf.toCanvas(), rocks, spikes, stones, skull: skull.toCanvas(), flame, snowflakes, bigArrow: arrow.toCanvas(), spears, javelin: jav.toCanvas(), holySword: sw.toCanvas(), daemon: daemonFrames(s), titan: titanFrames(s), eagle: eagleFrames(s), angel: angelFrames(s) };
}

/** Head and horns of the daemon, placed pixel by pixel, 52 wide. See `DAEMON_INK` for what each mark means. */
const DAEMON_HEAD = [
  '......bb....................................bb......',
  '.....#bb#..................................#bb#.....',
  '.....#bBb#................................#bBb#.....',
  '......#bBB#..............................#BBb#......',
  '.......#bBB#............................#BBb#.......',
  '........#bBB#..........................#BBb#........',
  '.........#BBB#........................#BBB#.........',
  '..........#BBB#......................#BBB#..........',
  '...........#BBB#....................#BBB#...........',
  '............#BB##..................##BB#............',
  '.............#BB####################BB#.............',
  '..............#BB#33333333333333333#BB#.............',
  '.............#B##3444333333333334443##B#............',
  '................#3311111111111111133#...............',
  '................#31#eee#22222#eee#13#...............',
  '................#31#eEe#22222#eEe#13#...............',
  '................#31#####22222#####13#...............',
  '................#33222221#2#12222233#...............',
  '................#3322221111111222233#...............',
  '.................#11222222222222211#................',
  '..................#111111111111111#.................',
  '...................###############..................',
];

/** The marks in `DAEMON_HEAD`: outline, four skin tones, bone, eye and eye core. */
const DAEMON_INK: Record<string, Rgb> = {
  '#': [10, 8, 12],
  '1': [46, 10, 24],
  '2': [90, 26, 46],
  '3': [126, 42, 66],
  '4': [162, 64, 90],
  b: [232, 224, 200],
  B: [176, 164, 136],
  e: [140, 255, 90],
  E: [244, 255, 232],
};

/**
 * The daemon of the beyond, 56 wide and 60 tall, facing right. Horns and
 * face are placed by hand; the hunched body, arms, loincloth and hooves are
 * built from row bounds and lit from the upper left, with muscle lines laid
 * in as shadow. The great recurve bow stands in its right fist. Frame 0 has
 * the string drawn to the jaw with the arrow nocked, frame 1 has just loosed
 * it: string straight, draw arm swung back.
 */
function daemonFrames(s: number): HTMLCanvasElement[] {
  // The body is laid out on a 56-wide plan; the wings need room either side, so the canvas is wider and everything shifts right by BX
  const BX = 16;
  const W = 56 + BX * 2;
  const H = 60;
  const OX = 2; // the head strip is 52 wide, centred on the 56-wide plan
  const skin: Rgb[] = [DAEMON_INK['1']!, DAEMON_INK['2']!, DAEMON_INK['3']!, DAEMON_INK['4']!];
  const outline = DAEMON_INK['#']!;
  const bone = DAEMON_INK.b!;
  const boneDark = DAEMON_INK.B!;
  const clothDark: Rgb = [30, 26, 36];
  const cloth: Rgb = [58, 50, 68];
  const belt: Rgb = [106, 74, 42];
  const beltLight: Rgb = [150, 108, 62];
  const woodDark: Rgb = [42, 28, 20];
  const wood: Rgb = [90, 60, 40];
  const woodLight: Rgb = [134, 92, 60];
  const string: Rgb = [216, 208, 184];
  const shaft: Rgb = [20, 16, 24];
  const shaftLight: Rgb = [58, 50, 70];
  const steel: Rgb = [106, 122, 128];
  const steelLight: Rgb = [170, 184, 190];
  const rune = DAEMON_INK.e!;
  // Torso silhouette: [y, left, right], neck to waist
  const torso: [number, number, number][] = [
    [22, 21, 35], [23, 16, 40], [24, 13, 43], [25, 12, 44], [26, 11, 45], [27, 11, 45], [28, 11, 45], [29, 12, 44],
    [30, 12, 44], [31, 13, 43], [32, 14, 42], [33, 14, 42], [34, 15, 41], [35, 16, 40], [36, 16, 40], [37, 17, 39],
    [38, 17, 39], [39, 18, 38], [40, 18, 38], [41, 19, 37], [42, 19, 37],
  ];
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 2; f++) {
    const grid: (Rgb | null)[][] = [];
    for (let y = 0; y < H; y++) grid.push(new Array<Rgb | null>(W).fill(null));
    const put = (px: number, y: number, c: Rgb): void => {
      const x = px + BX;
      if (x >= 0 && x < W && y >= 0 && y < H) grid[y]![x] = c;
    };
    const get = (px: number, y: number): Rgb | null => {
      const x = px + BX;
      return x >= 0 && x < W && y >= 0 && y < H ? grid[y]![x]! : null;
    };
    const isSkin = (c: Rgb | null): boolean => !!c && skin.some((k) => k === c);
    // A solid block of skin between two x bounds on one row, lit from the upper left
    const skinRow = (y: number, l: number, r: number, topLit: boolean): void => {
      for (let x = l; x <= r; x++) {
        const fromLeft = x - l;
        const fromRight = r - x;
        let c = skin[1]!;
        if (fromLeft <= 1 || (topLit && fromLeft <= 3)) c = skin[2]!;
        if (topLit && fromLeft >= 2 && fromLeft <= 5) c = skin[3]!;
        if (fromRight <= 1) c = skin[0]!;
        put(x, y, c);
      }
    };
    const thickLine = (x0: number, y0: number, x1: number, y1: number, half: number, c: Rgb): void => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= n; i++) {
        const x = Math.round(x0 + ((x1 - x0) * i) / n);
        const y = Math.round(y0 + ((y1 - y0) * i) / n);
        for (let d = -half; d <= half; d++) put(x, y + d, c);
      }
    };
    // ---- wings, behind everything: an arm bone from the shoulder blade up to a wrist high and wide, four finger
    // bones fanning out from it with claws at the tips, and a dark membrane stretched between them, scalloped
    // along the trailing edge. They flare up a little on the loosed frame.
    const membrane: Rgb = [46, 14, 40];
    const membraneLight: Rgb = [72, 26, 62];
    const membraneDark: Rgb = [30, 8, 26];
    const lift = f === 1 ? 3 : 0;
    const fillTri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: Rgb): void => {
      const minX = Math.min(ax, bx, cx);
      const maxX = Math.max(ax, bx, cx);
      const minY = Math.min(ay, by, cy);
      const maxY = Math.max(ay, by, cy);
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const w0 = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / area;
          const w1 = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 >= -0.02 && w1 >= -0.02 && w2 >= -0.02) put(x, y, c);
        }
      }
    };
    const wing = (sign: 1 | -1): void => {
      const cx = 28;
      const sx = cx + sign * 12;
      const sy = 26;
      const ex = cx + sign * 24;
      const ey = 13 - lift;
      const wx = cx + sign * 27;
      const wy = 4 - lift;
      const tips: [number, number][] = [
        [cx + sign * 41, 7 - lift],
        [cx + sign * 43, 21 - lift],
        [cx + sign * 37, 34 - lift],
        [cx + sign * 26, 42],
      ];
      // Membrane panels between the fingers, then the panel back to the elbow and the one down to the body
      for (let i = 0; i < tips.length - 1; i++) fillTri(wx, wy, tips[i]![0], tips[i]![1], tips[i + 1]![0], tips[i + 1]![1], i % 2 ? membrane : membraneLight);
      fillTri(ex, ey, wx, wy, tips[0]![0], tips[0]![1], membraneLight);
      fillTri(sx, sy, ex, ey, tips[3]![0], tips[3]![1], membraneDark);
      fillTri(sx, sy, wx, wy, tips[3]![0], tips[3]![1], membraneDark);
      // Scallops: a bite out of the trailing edge between each pair of finger tips
      for (let i = 0; i < tips.length - 1; i++) {
        const mx = (tips[i]![0] + tips[i + 1]![0]) / 2;
        const my = (tips[i]![1] + tips[i + 1]![1]) / 2;
        for (let y = Math.floor(my - 6); y <= Math.ceil(my + 6); y++) {
          for (let x = Math.floor(mx - 6); x <= Math.ceil(mx + 6); x++) {
            if (Math.hypot(x - mx, y - my) <= 5.5 && get(x, y) !== null) grid[y]![x + BX] = null;
          }
        }
      }
      // Bones: arm to elbow to wrist, then the fingers, each with a lit edge and a claw
      thickLine(sx, sy, ex, ey, 1, skin[0]!);
      thickLine(ex, ey, wx, wy, 1, skin[0]!);
      thickLine(sx, sy - 1, ex, ey - 1, 0, skin[2]!);
      thickLine(ex - sign, ey, wx - sign, wy, 0, skin[2]!);
      for (const [tx, ty] of tips) {
        thickLine(wx, wy, tx, ty, 0, skin[0]!);
        put(tx, ty, bone);
        put(tx + sign, ty + (ty < wy + 10 ? -1 : 1), bone);
      }
      put(wx, wy - 1, bone);
      put(wx + sign, wy - 2, bone);
    };
    wing(-1);
    wing(1);

    // ---- body
    for (const [y, l, r] of torso) skinRow(y, l, r, y <= 27);
    // Neck shadow under the jaw, collarbones, sternum, pectorals and abdomen laid in as shadow
    for (let x = 22; x <= 34; x++) put(x, 22, skin[0]!);
    for (let x = 16; x <= 24; x++) put(x, 25, skin[0]!);
    for (let x = 32; x <= 40; x++) put(x, 25, skin[0]!);
    for (let y = 26; y <= 34; y++) put(28, y, skin[0]!);
    for (let x = 15; x <= 26; x++) put(x, 31 + Math.round(Math.abs(x - 20) / 6), skin[0]!);
    for (let x = 30; x <= 41; x++) put(x, 31 + Math.round(Math.abs(x - 36) / 6), skin[0]!);
    for (let x = 18; x <= 26; x++) put(x, 27, skin[3]!); // the light catching the top of the chest
    for (let x = 30; x <= 38; x++) put(x, 27, skin[2]!);
    for (const y of [35, 38, 41]) {
      for (let x = 22; x <= 26; x++) put(x, y, skin[0]!);
      for (let x = 30; x <= 34; x++) put(x, y, skin[0]!);
    }
    for (let y = 35; y <= 41; y++) put(28, y, skin[0]!);
    // ---- loincloth with a belt and a ragged hem
    for (let x = 19; x <= 37; x++) {
      put(x, 42, belt);
      put(x, 43, x % 5 === 2 ? beltLight : belt);
    }
    put(28, 42, boneDark);
    put(28, 43, bone);
    for (let y = 44; y <= 50; y++) {
      const l = 20 + (y > 47 ? y - 47 : 0);
      const r = 36 - (y > 47 ? y - 47 : 0);
      for (let x = l; x <= r; x++) put(x, y, x < 24 || (x > 30 && x < 33) ? cloth : clothDark);
    }
    for (const x of [21, 25, 29, 33]) put(x, 51, clothDark);
    for (const x of [23, 31]) put(x, 52, clothDark);
    // ---- legs: thick thighs, tapering shins, cloven hooves
    const leg = (l: number, r: number): void => {
      for (let y = 44; y <= 53; y++) {
        const shrink = y > 49 ? y - 49 : 0;
        skinRow(y, l + shrink, r - shrink, false);
      }
      // Hooves: dark horn with a lit rim at the top and a cleft down the middle
      const hoof: Rgb = [44, 32, 38];
      const hoofLight: Rgb = [92, 74, 80];
      for (let y = 54; y <= 58; y++) {
        for (let x = l - 1; x <= r + 1; x++) put(x, y, y === 54 ? skin[0]! : x === l + 3 || x === l + 4 ? [12, 6, 10] : y === 55 ? hoofLight : hoof);
      }
    };
    leg(16, 23);
    leg(33, 40);
    // The loincloth hangs over the top of the thighs
    for (let y = 44; y <= 50; y++) {
      const l = 20 + (y > 47 ? y - 47 : 0);
      const r = 36 - (y > 47 ? y - 47 : 0);
      for (let x = l; x <= r; x++) put(x, y, x < 24 || (x > 30 && x < 33) ? cloth : clothDark);
    }
    // ---- head and horns from the strip
    for (let y = 0; y < DAEMON_HEAD.length; y++) {
      const row = DAEMON_HEAD[y]!;
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]!;
        if (ch === '.') continue;
        put(x + OX, y, DAEMON_INK[ch]!);
      }
    }
    // ---- bow arm: from the right shoulder out to the fist round the grip
    thickLine(40, 27, 47, 30, 2, skin[1]!);
    thickLine(40, 26, 47, 29, 0, skin[2]!);
    for (let y = 27; y <= 33; y++) for (let x = 46; x <= 50; x++) put(x, y, x === 46 || y === 27 ? skin[2]! : skin[1]!);
    put(48, 34, bone); // a claw
    put(50, 34, bone);
    // ---- the great recurve bow, its grip in the fist, limbs bowing toward the target and hooking back at the tips
    const gripX = 49;
    const bowY0 = 3;
    const bowY1 = 57;
    for (let y = bowY0; y <= bowY1; y++) {
      const t = (y - 30) / 27;
      const bend = Math.round(5 * Math.sin(Math.PI * Math.min(1, Math.abs(t))));
      const x = gripX + bend;
      put(x - 1, y, outline);
      put(x + 2, y, outline);
      put(x, y, Math.abs(t) > 0.92 ? boneDark : woodLight);
      put(x + 1, y, Math.abs(t) > 0.92 ? bone : Math.abs(t) < 0.12 ? woodDark : wood);
    }
    put(gripX - 1, bowY0 - 1, outline);
    put(gripX - 1, bowY1 + 1, outline);
    // ---- string and draw arm
    if (f === 0) {
      // Drawn: the string runs from each tip to the fist at the jaw; the forearm comes across the chest to it
      thickLine(gripX, bowY0, 39, 19, 0, string);
      thickLine(gripX, bowY1, 39, 21, 0, string);
      thickLine(9, 26, 36, 20, 2, skin[1]!);
      thickLine(9, 25, 36, 19, 0, skin[2]!);
      for (let y = 17; y <= 22; y++) for (let x = 36; x <= 40; x++) put(x, y, x === 36 || y === 17 ? skin[2]! : skin[1]!);
      put(37, 23, bone);
      put(39, 23, bone);
      // The nocked arrow from the fist out past the bow: black shaft, blinking runes, barbed steel head
      for (let x = 40; x <= 55; x++) {
        put(x, 19, x % 4 === 1 ? rune : shaft);
        put(x, 20, shaft);
        put(x, 18, x % 4 === 1 ? rune : shaftLight);
      }
      for (let x = 51; x <= 55; x++) {
        put(x, 18, x < 54 ? steelLight : steel);
        put(x, 19, steelLight);
        put(x, 20, steel);
      }
      put(50, 17, steel);
      put(50, 21, steel);
      put(55, 19, bone);
    } else {
      // Loosed: string straight, draw hand thrown back past the shoulder
      thickLine(gripX - 1, bowY0, gripX - 1, bowY1, 0, string);
      thickLine(10, 27, 3, 20, 2, skin[1]!);
      thickLine(10, 26, 3, 19, 0, skin[2]!);
      for (let y = 15; y <= 20; y++) for (let x = 0; x <= 4; x++) put(x, y, x === 0 || y === 15 ? skin[2]! : skin[1]!);
      put(1, 14, bone);
      put(3, 14, bone);
    }
    // ---- outline everything that has no outline yet: any painted pixel next to an empty one
    const painted = grid.map((row) => row.map((c) => c !== null));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (painted[y]![x]) continue;
        const near = (painted[y - 1]?.[x] ?? false) || (painted[y + 1]?.[x] ?? false) || (painted[y]![x - 1] ?? false) || (painted[y]![x + 1] ?? false);
        if (near) grid[y]![x] = outline;
      }
    }
    // Skin against skin from a different part (arm over chest) gets a one-pixel shadow seam so the parts read
    for (let y = 1; y < H; y++) {
      for (let x = 1; x < W; x++) {
        const c = get(x, y);
        if (!isSkin(c)) continue;
        const above = get(x, y - 1);
        if (above === null) grid[y]![x] = skin[3]!; // a lit top edge wherever skin meets the sky
      }
    }
    // ---- paint
    const b = new PixelBuffer(W * s, H * s);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = grid[y]![x];
        if (!c) continue;
        b.rect(x * s, y * s, s, s, c);
      }
    }
    frames.push(b.toCanvas());
  }
  return frames;
}

/**
 * The titan of Meat Shield, 64 wide and 76 tall, facing right: a colossal
 * stitched-together corpse. Dead grey-green flesh with bruised patches and
 * stitch lines across them, bone plates riveted over the shoulders, a small
 * head sunk between them with one burning red eye, and fists like boulders.
 * Frame 0 stands, frame 1 raises both fists, frame 2 brings them down.
 */
function titanFrames(s: number): HTMLCanvasElement[] {
  const W = 64;
  const H = 76;
  const flesh: Rgb[] = [[52, 60, 52], [82, 94, 78], [116, 130, 106], [150, 166, 136]];
  const bruise: Rgb = [86, 66, 82];
  const bruiseDark: Rgb = [62, 46, 60];
  const stitch: Rgb = [24, 20, 26];
  const thread: Rgb = [206, 196, 164];
  const bone: Rgb = [214, 206, 182];
  const boneDark: Rgb = [156, 146, 122];
  const rivet: Rgb = [70, 74, 84];
  const eye: Rgb = [255, 64, 48];
  const eyeCore: Rgb = [255, 226, 200];
  const outline: Rgb = [10, 8, 12];
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 3; f++) {
    const grid: (Rgb | null)[][] = [];
    for (let y = 0; y < H; y++) grid.push(new Array<Rgb | null>(W).fill(null));
    const put = (x: number, y: number, c: Rgb): void => {
      if (x >= 0 && x < W && y >= 0 && y < H) grid[y]![x] = c;
    };
    const get = (x: number, y: number): Rgb | null => (x >= 0 && x < W && y >= 0 && y < H ? grid[y]![x]! : null);
    const isFlesh = (c: Rgb | null): boolean => !!c && (flesh.includes(c) || c === bruise || c === bruiseDark);
    const row = (y: number, l: number, r: number, lit: boolean): void => {
      for (let x = l; x <= r; x++) {
        const fl = x - l;
        const fr = r - x;
        let c = flesh[1]!;
        if (fl <= 1 || (lit && fl <= 4)) c = flesh[2]!;
        if (lit && fl >= 2 && fl <= 6) c = flesh[3]!;
        if (fr <= 1) c = flesh[0]!;
        put(x, y, c);
      }
    };
    const blob = (cx: number, cy: number, rx: number, ry: number, lit: boolean): void => {
      for (let y = Math.round(cy - ry); y <= Math.round(cy + ry); y++) {
        const t = (y - cy) / ry;
        const half = Math.sqrt(Math.max(0, 1 - t * t)) * rx;
        if (half < 0.5) continue;
        row(y, Math.round(cx - half), Math.round(cx + half), lit && y < cy);
      }
    };
    const patch = (cx: number, cy: number, rx: number, ry: number): void => {
      for (let y = Math.round(cy - ry); y <= Math.round(cy + ry); y++) {
        for (let x = Math.round(cx - rx); x <= Math.round(cx + rx); x++) {
          const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
          if (d <= 1 && isFlesh(get(x, y))) put(x, y, d > 0.75 ? bruiseDark : bruise);
        }
      }
    };
    const seam = (x0: number, y0: number, x1: number, y1: number): void => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      const across = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
      for (let i = 0; i <= n; i++) {
        const x = Math.round(x0 + ((x1 - x0) * i) / n);
        const y = Math.round(y0 + ((y1 - y0) * i) / n);
        if (!isFlesh(get(x, y))) continue;
        put(x, y, stitch);
        if (i % 3 === 1) {
          if (across) {
            put(x, y - 1, thread);
            put(x, y + 1, thread);
          } else {
            put(x - 1, y, thread);
            put(x + 1, y, thread);
          }
        }
      }
    };
    const raised = f === 1;
    const smash = f === 2;
    const crouch = smash ? 3 : 0;
    // ---- legs and feet, planted wide
    for (const lx of [16, 34]) {
      for (let y = 52 + crouch; y <= 68; y++) row(y, lx + (y > 62 ? 1 : 0), lx + 13 - (y > 62 ? 1 : 0), false);
      for (let y = 68; y <= 74; y++) for (let x = lx - 2; x <= lx + 15; x++) put(x, y, y === 68 ? flesh[0]! : x < lx + 1 || x > lx + 12 ? flesh[0]! : flesh[1]!);
      for (const tx of [lx, lx + 5, lx + 10]) put(tx, 74, bone); // toe claws
    }
    // ---- torso: a great slab, shoulders wider than the hips
    const torso: [number, number, number][] = [];
    for (let y = 18 + crouch; y <= 54 + crouch; y++) {
      const t = (y - 18 - crouch) / 36;
      const half = Math.round(26 - 8 * t * t);
      torso.push([y, 32 - half, 32 + half]);
    }
    for (const [y, l, r] of torso) row(y, l, r, y < 30 + crouch);
    // Belly rolls and a spine of shadow
    for (let x = 22; x <= 42; x++) {
      put(x, 40 + crouch + Math.round(Math.abs(x - 32) / 8), flesh[0]!);
      put(x, 48 + crouch + Math.round(Math.abs(x - 32) / 8), flesh[0]!);
    }
    for (let x = 14; x <= 26; x++) put(x, 30 + crouch + Math.round(Math.abs(x - 20) / 5), flesh[0]!); // pectoral folds
    for (let x = 38; x <= 50; x++) put(x, 30 + crouch + Math.round(Math.abs(x - 44) / 5), flesh[0]!);
    // Bruised patches of other men's skin, stitched on
    patch(20, 36 + crouch, 7, 5);
    patch(44, 44 + crouch, 6, 6);
    patch(30, 26 + crouch, 5, 4);
    seam(13, 36 + crouch, 27, 36 + crouch);
    seam(44, 38 + crouch, 44, 50 + crouch);
    seam(32, 20 + crouch, 32, 54 + crouch);
    seam(25, 26 + crouch, 35, 26 + crouch);
    // ---- arms: from the shoulders to fists like boulders
    const arm = (side: -1 | 1): void => {
      const sx = 32 + side * 22;
      const sy = 22 + crouch;
      let ex: number;
      let ey: number;
      let hx: number;
      let hy: number;
      if (raised) {
        ex = 32 + side * 27;
        ey = 8;
        hx = 32 + side * 16;
        hy = 2;
      } else if (smash) {
        ex = 32 + side * 29;
        ey = 40;
        hx = 32 + side * 12;
        hy = 62;
      } else {
        ex = 32 + side * 28;
        ey = 38;
        hx = 32 + side * 27;
        hy = 56;
      }
      const seg = (x0: number, y0: number, x1: number, y1: number, half: number): void => {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let i = 0; i <= n; i++) {
          const x = Math.round(x0 + ((x1 - x0) * i) / n);
          const y = Math.round(y0 + ((y1 - y0) * i) / n);
          row(y, x - half, x + half, true);
        }
      };
      seg(sx, sy, ex, ey, 5);
      seg(ex, ey, hx, hy, 4);
      blob(hx, hy, 6, 5, true);
      // Knuckles
      for (let k = -1; k <= 1; k++) put(hx + k * 3, hy - 4, flesh[3]!);
      seam(ex - 3, ey, ex + 3, ey);
    };
    arm(-1);
    arm(1);
    // ---- shoulder plates of bone, riveted on, over the arms
    for (const side of [-1, 1] as const) {
      const cx = 32 + side * 20;
      for (let y = 12 + crouch; y <= 22 + crouch; y++) {
        const t = (y - 12 - crouch) / 10;
        const half = Math.round(10 * Math.sqrt(1 - (1 - t) * (1 - t)) + 2);
        for (let x = cx - half; x <= cx + half; x++) put(x, y, y < 15 + crouch || x === cx - half ? bone : x > cx + half - 3 ? boneDark : bone);
      }
      put(cx - 5, 16 + crouch, rivet);
      put(cx + 5, 16 + crouch, rivet);
      put(cx, 19 + crouch, rivet);
      put(cx - 8, 20 + crouch, rivet);
      put(cx + 8, 20 + crouch, rivet);
    }
    // ---- head, sunk between the shoulders: a lopsided skull of flesh with one great eye
    blob(34, 13 + crouch, 8, 7, true);
    for (let x = 28; x <= 41; x++) put(x, 17 + crouch, flesh[0]!); // the jaw line
    for (let x = 30; x <= 39; x++) put(x, 20 + crouch, flesh[0]!); // neck fold
    seam(28, 10 + crouch, 38, 8 + crouch);
    put(36, 12 + crouch, outline);
    put(37, 12 + crouch, outline);
    put(38, 12 + crouch, outline);
    put(36, 13 + crouch, outline);
    put(37, 13 + crouch, eye);
    put(38, 13 + crouch, eye);
    put(39, 13 + crouch, outline);
    put(37, 14 + crouch, eye);
    put(38, 14 + crouch, eyeCore);
    put(36, 14 + crouch, outline);
    put(39, 14 + crouch, outline);
    put(30, 12 + crouch, stitch); // the other eye, sewn shut
    put(31, 12 + crouch, thread);
    put(32, 12 + crouch, stitch);
    // Outline every painted edge
    const painted = grid.map((r) => r.map((c) => c !== null));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (painted[y]![x]) continue;
        const near = (painted[y - 1]?.[x] ?? false) || (painted[y + 1]?.[x] ?? false) || (painted[y]![x - 1] ?? false) || (painted[y]![x + 1] ?? false);
        if (near) grid[y]![x] = outline;
      }
    }
    const b = new PixelBuffer(W * s, H * s);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = grid[y]![x];
        if (c) b.rect(x * s, y * s, s, s, c);
      }
    }
    frames.push(b.toCanvas());
  }
  return frames;
}

/** Paints a grid of colour cells into a scaled pixel buffer, outlining every painted edge first. */
function paintGrid(grid: (Rgb | null)[][], W: number, H: number, s: number, outline: Rgb): HTMLCanvasElement {
  const painted = grid.map((r) => r.map((c) => c !== null));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (painted[y]![x]) continue;
      const near = (painted[y - 1]?.[x] ?? false) || (painted[y + 1]?.[x] ?? false) || (painted[y]![x - 1] ?? false) || (painted[y]![x + 1] ?? false);
      if (near) grid[y]![x] = outline;
    }
  }
  const b = new PixelBuffer(W * s, H * s);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = grid[y]![x];
      if (c) b.rect(x * s, y * s, s, s, c);
    }
  }
  return b.toCanvas();
}

/**
 * The eagle, 30 wide and 18 tall, facing right: a dark brown body, a white
 * head with a hooked yellow beak, wide wings in three beats and a fourth
 * frame folded back for the dive with the talons thrust forward.
 */
function eagleFrames(s: number): HTMLCanvasElement[] {
  const W = 30;
  const H = 18;
  const brown: Rgb[] = [[52, 34, 22], [92, 60, 34], [128, 88, 50]];
  const white: Rgb = [236, 232, 220];
  const whiteDark: Rgb = [190, 184, 170];
  const beak: Rgb = [230, 180, 40];
  const talon: Rgb = [214, 170, 50];
  const eye: Rgb = [20, 14, 10];
  const outline: Rgb = [10, 8, 12];
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 4; f++) {
    const grid: (Rgb | null)[][] = [];
    for (let y = 0; y < H; y++) grid.push(new Array<Rgb | null>(W).fill(null));
    const put = (x: number, y: number, c: Rgb): void => {
      if (x >= 0 && x < W && y >= 0 && y < H) grid[y]![x] = c;
    };
    const dive = f === 3;
    // Body: a tapered oval, dark above and lighter below, tail feathers fanned behind
    const by = dive ? 8 : 10;
    for (let x = 6; x <= 21; x++) {
      const t = (x - 6) / 15;
      const half = Math.round(2.5 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.5);
      for (let d = -half; d <= half; d++) put(x, by + d, d < 0 ? brown[0]! : d === 0 ? brown[1]! : brown[2]!);
    }
    for (let i = 0; i < 3; i++) put(3 + i, by - 1 + i, i === 2 ? white : brown[1]!); // tail
    for (let i = 0; i < 3; i++) put(3 + i, by + 1 + (i >> 1), white);
    // Wings: one beat per frame, spread wide in flight and swept back in the dive
    const wing = (dir: -1 | 1): void => {
      if (dive) {
        for (let i = 0; i < 9; i++) {
          const x = 8 + i;
          const y = by + 2 + (i >> 1);
          put(x, y, brown[0]!);
          put(x, y + 1, brown[1]!);
        }
        return;
      }
      const lift = f === 0 ? -6 : f === 1 ? -2 : 3;
      for (let i = 0; i < 11; i++) {
        const x = 9 + i;
        const y = by + Math.round(lift * (i / 10)) - (dir === 1 ? 0 : 1) + (f === 2 ? 0 : -1);
        put(x, y, brown[0]!);
        put(x, y + 1, i % 3 === 2 ? brown[2]! : brown[1]!);
        if (i > 6) put(x, y + 2, brown[0]!); // primaries fingered at the tip
      }
    };
    wing(1);
    // Head: white, hooked beak, a dark eye
    for (let x = 21; x <= 25; x++) for (let d = -2; d <= 1; d++) put(x, by + d, d === 1 ? whiteDark : white);
    put(26, by - 1, beak);
    put(27, by - 1, beak);
    put(27, by, beak);
    put(23, by - 1, eye);
    // Talons, tucked in flight, thrust forward in the dive
    if (dive) {
      for (let i = 0; i < 3; i++) {
        put(22 + i, by + 3 + i, talon);
        put(18 + i, by + 3 + i, talon);
      }
    } else {
      put(16, by + 3, talon);
      put(18, by + 3, talon);
    }
    frames.push(paintGrid(grid, W, H, s, outline));
  }
  return frames;
}

/**
 * The Angel Knight, 64 wide and 52 tall, facing right: a great helm of gold
 * with a white feather crest and a glowing halo, gold plate with wide
 * pauldrons over a white tabard bearing a gold cross, a heater shield on the
 * left arm, a greatsword in the right, and two great wings of white feathers
 * spread behind. Frame 0 holds the sword upright, frame 1 sweeps it out.
 */
function angelFrames(s: number): HTMLCanvasElement[] {
  const W = 64;
  const H = 52;
  const cx = 32;
  const gold: Rgb[] = [[110, 74, 20], [178, 128, 36], [232, 186, 64], [255, 236, 150]];
  const white: Rgb = [246, 244, 236];
  const whiteShade: Rgb = [212, 208, 196];
  const featherShade: Rgb = [168, 164, 156];
  const halo: Rgb = [255, 240, 160];
  const haloCore: Rgb = [255, 255, 230];
  const skin: Rgb = [226, 200, 180];
  const eye: Rgb = [140, 220, 255];
  const blade: Rgb = [226, 234, 244];
  const bladeDark: Rgb = [150, 160, 176];
  const bladeGlow: Rgb = [255, 250, 210];
  const gem: Rgb = [90, 170, 255];
  const grip: Rgb = [70, 40, 30];
  const outline: Rgb = [10, 8, 12];
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 2; f++) {
    const grid: (Rgb | null)[][] = [];
    for (let y = 0; y < H; y++) grid.push(new Array<Rgb | null>(W).fill(null));
    const put = (x: number, y: number, c: Rgb): void => {
      if (x >= 0 && x < W && y >= 0 && y < H) grid[y]![x] = c;
    };
    const rect = (x: number, y: number, w: number, h: number, c: Rgb): void => {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, c);
    };
    const line = (x0: number, y0: number, x1: number, y1: number, c: Rgb, half = 0): void => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= n; i++) {
        const x = Math.round(x0 + ((x1 - x0) * i) / n);
        const y = Math.round(y0 + ((y1 - y0) * i) / n);
        for (let d = -half; d <= half; d++) put(x, y + d, c);
      }
    };
    // Gold plate lit from the upper left: highlight band, mid, then shadow toward the right and bottom
    const plate = (x: number, y: number, w: number, h: number): void => {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          const fl = xx - x;
          const fr = x + w - 1 - xx;
          const ft = yy - y;
          let c = gold[2]!;
          if (fr <= 1 || yy === y + h - 1) c = gold[1]!;
          if (fl <= 1 && ft >= 1) c = gold[3]!;
          if (ft === 0) c = gold[3]!;
          if (fr === 0 && ft > 0) c = gold[0]!;
          put(xx, yy, c);
        }
      }
    };
    // ---- wings, behind everything: a curved leading edge from the shoulder up and out, then rows of feathers
    // hanging from it, long white primaries at the tip, shorter coverts near the body, each feather shaded underneath
    for (const side of [-1, 1] as const) {
      const ax = cx + side * 5;
      const ay = 15;
      const edge: [number, number][] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        edge.push([ax + side * Math.round(t * 26), ay - Math.round(Math.sin(t * Math.PI * 0.85) * 13)]);
      }
      // Coverts first (they sit under the primaries), then primaries from the outer part of the edge
      for (let i = 1; i <= 5; i++) {
        const [ex, ey] = edge[i * 2]!;
        const len = 9 + i;
        line(ex, ey, ex + side * Math.round(i * 1.2), ey + len, featherShade, 1);
        line(ex, ey, ex + side * Math.round(i * 1.2), ey + len, whiteShade, 0);
      }
      for (let i = 3; i <= 12; i++) {
        const [ex, ey] = edge[i]!;
        const t = (i - 3) / 9;
        const len = 14 + Math.round(t * 12);
        const tx = ex + side * Math.round(4 + t * 8);
        const ty = ey + len;
        line(ex, ey, tx, ty, whiteShade, 1);
        line(ex, ey, tx, ty, white, 0);
        put(tx, ty, white);
        put(tx, ty + 1, whiteShade);
      }
      // The leading edge itself, thick and bright
      for (let i = 0; i < edge.length - 1; i++) {
        const [x0, y0] = edge[i]!;
        const [x1, y1] = edge[i + 1]!;
        line(x0, y0, x1, y1, whiteShade, 1);
        line(x0, y0 - 1, x1, y1 - 1, white, 0);
      }
    }
    // ---- legs: gold greaves and sabatons
    for (const lx of [cx - 6, cx + 1]) {
      plate(lx, 38, 5, 9);
      put(lx + 1, 41, gold[3]!); // the knee
      rect(lx - 1, 47, 7, 3, gold[1]!);
      rect(lx - 1, 47, 7, 1, gold[2]!);
    }
    // ---- tabard: white, gold hem, a gold cross
    for (let y = 29; y <= 43; y++) {
      const half = 6 + (y > 36 ? 1 : 0);
      for (let x = cx - half; x <= cx + half; x++) put(x, y, x > cx + 3 ? whiteShade : white);
    }
    rect(cx - 7, 43, 15, 1, gold[2]!);
    rect(cx - 1, 31, 2, 11, gold[2]!);
    rect(cx - 4, 34, 8, 2, gold[2]!);
    put(cx - 1, 31, gold[3]!);
    put(cx - 4, 34, gold[3]!);
    // ---- breastplate and belt
    for (let y = 17; y <= 30; y++) {
      const half = y < 20 ? 8 : y < 27 ? 7 : 6;
      plate(cx - half, y, half * 2 + 1, 1);
    }
    for (let y = 18; y <= 27; y++) put(cx, y, gold[1]!); // the seam
    put(cx - 4, 21, gold[3]!);
    put(cx - 3, 21, gold[3]!);
    put(cx - 4, 22, gold[3]!);
    rect(cx - 6, 29, 13, 2, gold[0]!);
    rect(cx - 1, 29, 3, 2, gold[2]!);
    put(cx, 29, gem);
    put(cx, 30, gem);
    // ---- pauldrons: wide, rounded, with a bright rim
    for (const side of [-1, 1] as const) {
      for (let y = 14; y <= 20; y++) {
        const t = (y - 14) / 6;
        const half = Math.round(4 + t * 2);
        const px = cx + side * 10;
        for (let x = px - half; x <= px + half; x++) put(x, y, y === 14 ? gold[3]! : (side === -1 ? x < px : x > px) ? gold[1]! : gold[2]!);
      }
      put(cx + side * 10, 17, gold[3]!);
    }
    // ---- neck and the great helm with its visor and a white feather crest on each side
    rect(cx - 2, 14, 5, 3, skin);
    for (let y = 3; y <= 14; y++) {
      const half = y < 5 ? 3 : y < 7 ? 5 : 6;
      plate(cx - half, y, half * 2 + 1, 1);
    }
    rect(cx - 6, 8, 13, 1, outline); // the visor slit
    put(cx - 2, 8, eye);
    put(cx + 2, 8, eye);
    rect(cx, 9, 1, 4, outline); // the nasal
    put(cx + 4, 11, gold[1]!);
    put(cx - 4, 11, gold[1]!);
    for (const side of [-1, 1] as const) {
      // Feather crests sweeping back and up off the temples
      for (let i = 0; i < 6; i++) {
        put(cx + side * (7 + i), 7 - i, i > 3 ? whiteShade : white);
        put(cx + side * (7 + i), 8 - i, i > 2 ? whiteShade : white);
      }
    }
    // ---- halo: a ring of light floating over the helm
    for (let x = cx - 7; x <= cx + 7; x++) {
      const t = (x - cx) / 7;
      const dy = Math.round((1 - t * t) * 1.2);
      put(x, 1 - dy + 1, Math.abs(t) < 0.35 ? haloCore : halo);
      put(x, 3 - dy + 1, halo);
    }
    // ---- shield on the left arm: a gold heater with a white cross
    line(cx - 10, 19, cx - 14, 25, gold[1]!, 1);
    for (let y = 22; y <= 36; y++) {
      const t = (y - 22) / 14;
      const half = y < 28 ? 5 : Math.round(5 * (1 - (t - 0.43) * 1.6));
      if (half < 1) continue;
      const sx = cx - 16;
      for (let x = sx - half; x <= sx + half; x++) put(x, y, y === 22 || x === sx - half ? gold[3]! : x === sx + half ? gold[0]! : gold[2]!);
    }
    rect(cx - 17, 24, 3, 8, white);
    rect(cx - 19, 26, 7, 2, white);
    // ---- sword arm and the greatsword: upright at rest, swept out and up on the cut
    if (f === 0) {
      line(cx + 11, 19, cx + 13, 27, gold[2]!, 1);
      line(cx + 13, 27, cx + 14, 33, gold[2]!, 1);
      rect(cx + 12, 33, 5, 3, gold[1]!); // gauntlet
      rect(cx + 14, 9, 1, 24, blade);
      rect(cx + 15, 9, 1, 24, bladeDark);
      rect(cx + 13, 9, 1, 24, bladeGlow);
      put(cx + 14, 7, blade);
      put(cx + 14, 8, blade);
      rect(cx + 10, 32, 9, 1, gold[2]!); // crossguard
      put(cx + 10, 32, gold[3]!);
      rect(cx + 14, 36, 1, 3, grip);
      put(cx + 14, 39, gold[2]!); // pommel
    } else {
      line(cx + 11, 19, cx + 17, 20, gold[2]!, 1);
      line(cx + 17, 20, cx + 21, 18, gold[2]!, 1);
      rect(cx + 20, 16, 4, 4, gold[1]!);
      // Blade up and out to the right, glowing along its edge
      line(cx + 23, 17, cx + 31, 2, bladeDark, 0);
      line(cx + 22, 17, cx + 30, 2, blade, 0);
      line(cx + 21, 17, cx + 29, 2, bladeGlow, 0);
      put(cx + 30, 1, haloCore);
      line(cx + 19, 15, cx + 25, 21, gold[2]!, 0); // crossguard
      put(cx + 19, 15, gold[3]!);
      line(cx + 20, 20, cx + 18, 23, grip, 0);
      put(cx + 17, 24, gold[2]!);
    }
    frames.push(paintGrid(grid, W, H, s, outline));
  }
  return frames;
}
