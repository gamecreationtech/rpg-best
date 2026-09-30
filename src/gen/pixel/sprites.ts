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
  /** The big skull Death raises over its area. */
  skull: HTMLCanvasElement;
  /** Four frames of a standing tongue of flame, a hero tall, for Fire Prison's bars. */
  flame: HTMLCanvasElement[];
  /** Two big six-armed snowflakes, the ones Blizzard drops on enemies. */
  snowflakes: HTMLCanvasElement[];
  /** A big arrow seen point-down, the kind Arrow Storm rains from the sky. */
  bigArrow: HTMLCanvasElement;
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
  return { fireball, explosion, frostRing, shadow: shadow.toCanvas(), boulder: boulderBuf.toCanvas(), rocks, skull: skull.toCanvas(), flame, snowflakes, bigArrow: arrow.toCanvas() };
}
