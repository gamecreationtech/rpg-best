import type { Palette } from './palettes';
import { PixelBuffer, hex, noise, ramp, type Ramp, type Rgb } from './pixel';

export type SpriteSize = 'small' | 'large';
export type Facing = 'right' | 'left';

/** Frames of one animation, all the same size, drawn facing right. */
export interface SpriteAnim {
  frames: HTMLCanvasElement[];
  /** Pixel under the feet, relative to the frame's top-left. */
  originX: number;
  originY: number;
  /** Seconds per frame. */
  frameTime: number;
}

export interface CharacterSprites {
  idle: SpriteAnim;
  walk: SpriteAnim;
  attack: SpriteAnim;
  height: number;
}

type Doll = {
  H: number;
  W: number;
  buf: PixelBuffer;
  ramps: Map<string, Ramp>;
  outline: boolean;
};

function px(v: number): number {
  return Math.round(v);
}

/** Finishes a part-coloured silhouette: edge shading per material, then the outline. */
function finish(d: Doll, outlineColor: Rgb): HTMLCanvasElement {
  const byKey = new Map<string, Ramp>();
  for (const r of d.ramps.values()) byKey.set(r[1].join(','), r);
  d.buf.shadeRamp((c) => byKey.get(c.join(',')) ?? null);
  if (d.outline) d.buf.outline(outlineColor);
  return d.buf.toCanvas();
}

function doll(H: number, W: number, pal: Palette, outline: boolean, materials: Record<string, number>): Doll {
  const ramps = new Map<string, Ramp>();
  for (const [k, v] of Object.entries(materials)) ramps.set(k, ramp(v, pal.contrast));
  return { H, W, buf: new PixelBuffer(W + 2, H + 2), ramps, outline };
}

function base(d: Doll, key: string): Rgb {
  return d.ramps.get(key)![1];
}

/** Draws a humanoid frame. `pose` tweaks legs and arms. */
function humanoid(
  d: Doll,
  pal: Palette,
  look: { skin: string; body: string; head: string; legs: string; arms?: string; trim?: string; hood?: boolean; helm?: boolean; cape?: string },
  pose: { legL: number; legR: number; armF: number; armB: number; bob: number; lean: number },
  weapon: ((d: Doll, hx: number, hy: number, raise: number) => void) | null,
): void {
  const { H, W } = d;
  const ox = 1;
  const oy = 1 + pose.bob;
  const hw = W / 2;
  // Back arm and back leg first so the front ones overlap them
  const legW = Math.max(2, px(W * 0.2));
  const legTop = px(H * 0.6);
  const legLen = H - legTop;
  const drawLeg = (offset: number, key: string) => {
    const x = px(ox + hw - legW - 1 + offset * W * 0.12 + pose.lean);
    const lift = Math.max(0, -offset) * Math.max(1, px(H * 0.03));
    d.buf.rect(x, oy + legTop, legW, legLen - lift, base(d, key));
    d.buf.rect(x, oy + H - Math.max(1, px(H * 0.06)) - lift, legW + 1, Math.max(1, px(H * 0.06)), base(d, 'leather'));
  };
  drawLeg(pose.legR, look.legs);
  const armW = Math.max(2, px(W * 0.16));
  const armTop = px(H * 0.36);
  const armLen = px(H * 0.26);
  const drawArm = (side: number, swing: number, key: string) => {
    const x = px(ox + hw + side * (W * 0.32) - armW / 2 + swing * W * 0.1 + pose.lean * 0.5);
    const raise = Math.max(0, -swing) * px(H * 0.12);
    d.buf.rect(x, oy + armTop - raise, armW, armLen, base(d, key));
    d.buf.rect(x, oy + armTop - raise + armLen, armW, Math.max(1, px(H * 0.05)), base(d, look.skin));
  };
  drawArm(-1, pose.armB, look.arms ?? look.body);
  // Cape behind the torso
  if (look.cape) {
    d.buf.rect(px(ox + hw - W * 0.3 + pose.lean), oy + px(H * 0.3), px(W * 0.45), px(H * 0.4), base(d, look.cape));
  }
  // Torso: broad shoulders, narrower waist, a belt where the legs start
  const torsoTop = px(H * 0.3);
  const torsoH = legTop - torsoTop + 1;
  const torsoW = px(W * 0.5);
  const tx = px(ox + hw - torsoW / 2 + pose.lean);
  const waist = Math.max(1, px(W * 0.06));
  d.buf.rect(tx, oy + torsoTop, torsoW, torsoH, base(d, look.body));
  d.buf.rect(tx + waist, oy + torsoTop + px(torsoH * 0.55), torsoW - waist * 2, px(torsoH * 0.45), base(d, look.body));
  // Carve the waist: clear the sides of the lower torso
  for (let y = oy + torsoTop + px(torsoH * 0.55); y < oy + torsoTop + torsoH; y++) {
    for (let i = 0; i < waist; i++) {
      d.buf.set(tx + i, y, [0, 0, 0], 0);
      d.buf.set(tx + torsoW - 1 - i, y, [0, 0, 0], 0);
    }
  }
  const shoulderH = Math.max(1, px(H * 0.06));
  d.buf.rect(tx - 1, oy + torsoTop, torsoW + 2, shoulderH, base(d, look.arms ?? look.body));
  const beltH = Math.max(1, px(H * 0.05));
  d.buf.rect(tx + waist, oy + legTop - beltH, torsoW - waist * 2, beltH, base(d, look.trim ?? 'leather'));
  // Head
  const headR = Math.max(2, px(H * 0.12));
  const hx = px(ox + hw + W * 0.05 + pose.lean);
  const hy = oy + px(H * 0.17);
  if (look.hood) {
    d.buf.ellipse(hx - 1, hy, headR + 1, headR + 1, base(d, look.head));
    d.buf.rect(hx, hy - px(headR * 0.4), headR, px(headR * 1.1), base(d, look.skin));
    d.buf.set(hx + 1, hy - 1, hex(pal.eyeGlow));
  } else if (look.helm) {
    // Rounded helm with a dark visor slit and a small crest
    d.buf.ellipse(hx, hy, headR, headR + 1, base(d, look.head));
    d.buf.rect(hx - headR + 1, hy - 1, headR * 2 - 1, Math.max(1, px(headR * 0.5)), hex(pal.outline));
    d.buf.rect(hx - 1, hy - headR - 1, 2, Math.max(1, px(headR * 0.5)), base(d, look.trim ?? look.head));
    d.buf.set(hx + 1, hy - 1, hex(pal.eyeGlow));
  } else {
    d.buf.ellipse(hx, hy, headR, headR, base(d, look.skin));
    d.buf.rect(hx - headR, hy - headR, headR * 2, px(headR * 0.8), base(d, look.head));
    d.buf.set(hx + Math.max(1, px(headR * 0.5)), hy, hex(pal.outline));
  }
  // Front leg and front arm on top
  drawLeg(pose.legL, look.legs);
  drawArm(1, pose.armF, look.arms ?? look.body);
  if (weapon) {
    const handX = px(ox + hw + W * 0.32 + pose.armF * W * 0.1 + pose.lean * 0.5);
    const raise = Math.max(0, -pose.armF) * px(H * 0.12);
    weapon(d, handX, oy + armTop - raise + armLen, Math.max(0, -pose.armF));
  }
}

const POSES = {
  idle: [{ legL: 0, legR: 0, armF: 0, armB: 0, bob: 0, lean: 0 }, { legL: 0, legR: 0, armF: 0.1, armB: -0.1, bob: 1, lean: 0 }],
  walk: [
    { legL: 1, legR: -1, armF: -0.6, armB: 0.6, bob: 0, lean: 0.5 },
    { legL: 0, legR: 0, armF: 0, armB: 0, bob: 1, lean: 0.5 },
    { legL: -1, legR: 1, armF: 0.6, armB: -0.6, bob: 0, lean: 0.5 },
    { legL: 0, legR: 0, armF: 0, armB: 0, bob: 1, lean: 0.5 },
  ],
  attack: [
    { legL: 0.5, legR: -0.5, armF: -1.2, armB: 0.3, bob: 0, lean: -0.5 },
    { legL: 0.5, legR: -0.5, armF: -1.6, armB: 0.3, bob: 0, lean: -0.5 },
    { legL: 1, legR: -1, armF: 1.2, armB: -0.3, bob: 1, lean: 1.5 },
    { legL: 1, legR: -1, armF: 0.8, armB: 0, bob: 0, lean: 1 },
  ],
};

function sword(pal: Palette) {
  return (d: Doll, hx: number, hy: number, raise: number) => {
    const len = px(d.H * 0.42);
    const steel = base(d, 'steel');
    const wood = base(d, 'wood');
    if (raise > 0.8) {
      // Held overhead, blade pointing up and back
      d.buf.line(hx + 1, hy - 1, hx - px(len * 0.3), hy - len, steel);
      d.buf.line(hx + 2, hy - 1, hx - px(len * 0.3) + 1, hy - len, steel);
      d.buf.rect(hx - 1, hy - 2, 4, 2, wood);
    } else if (raise > 0) {
      d.buf.line(hx + 1, hy, hx + len, hy - px(len * 0.5), steel);
      d.buf.line(hx + 1, hy + 1, hx + len, hy - px(len * 0.5) + 1, steel);
      d.buf.rect(hx, hy - 1, 3, 3, wood);
    } else {
      d.buf.line(hx + 1, hy + 1, hx + 2, hy + len, steel);
      d.buf.line(hx + 2, hy + 1, hx + 3, hy + len, steel);
      d.buf.rect(hx, hy - 1, 4, 2, wood);
    }
    void pal;
  };
}

function staff(pal: Palette) {
  return (d: Doll, hx: number, hy: number, raise: number) => {
    const wood = base(d, 'wood');
    const top = hy - px(d.H * 0.55) - px(raise * d.H * 0.1);
    d.buf.rect(hx + 1, top, 2, hy + px(d.H * 0.15) - top, wood);
    const ice = ramp(pal.ice, pal.contrast);
    d.buf.ellipse(hx + 2, top - 1, 2, 3, ice[2]);
    d.buf.set(hx + 2, top - 2, ice[3]);
  };
}

function bow(pal: Palette) {
  return (d: Doll, hx: number, hy: number) => {
    const wood = base(d, 'wood');
    const len = px(d.H * 0.4);
    for (let i = -len / 2; i <= len / 2; i++) {
      const bend = px(Math.sqrt(Math.max(0, 1 - (i / (len / 2)) ** 2)) * d.W * 0.18);
      d.buf.set(hx + 2 + bend, px(hy - d.H * 0.1 + i), wood);
    }
    d.buf.line(hx + 2, px(hy - d.H * 0.1 - len / 2), hx + 2, px(hy - d.H * 0.1 + len / 2), hex(pal.bone));
  };
}

function anim(frames: HTMLCanvasElement[], W: number, H: number, frameTime: number): SpriteAnim {
  return { frames, originX: Math.round(W / 2) + 1, originY: H + 1, frameTime };
}

export type HeroClass = 'knight' | 'sorcerer' | 'rogue';

/** Hero sprite sheets: idle, walk and attack, facing right. */
export function heroSprites(cls: HeroClass, pal: Palette, size: SpriteSize, outline: boolean): CharacterSprites {
  const H = size === 'large' ? 44 : 22;
  const W = Math.round(H * 0.7);
  const materials = { skin: pal.skin, cloth: pal.heroCloth, trim: pal.heroTrim, leather: pal.leather, steel: pal.steel, wood: pal.wood, cape: cls === 'knight' ? 0x7a2a2a : pal.heroCloth };
  const look =
    cls === 'knight'
      ? { skin: 'skin', body: 'cloth', head: 'steel', legs: 'leather', arms: 'steel', trim: 'trim', helm: true, cape: 'cape' }
      : cls === 'sorcerer'
        ? { skin: 'skin', body: 'cloth', head: 'cloth', legs: 'cloth', arms: 'cloth', trim: 'trim', hood: true }
        : { skin: 'skin', body: 'leather', head: 'leather', legs: 'leather', arms: 'skin', trim: 'wood', hood: true };
  const weapon = cls === 'knight' ? sword(pal) : cls === 'sorcerer' ? staff(pal) : bow(pal);
  const make = (poses: (typeof POSES)['walk']) =>
    poses.map((p) => {
      const d = doll(H, W, pal, outline, materials);
      humanoid(d, pal, look, p, weapon);
      return finish(d, hex(pal.outline));
    });
  return {
    idle: anim(make(POSES.idle), W, H, 0.5),
    walk: anim(make(POSES.walk), W, H, 0.12),
    attack: anim(make(POSES.attack), W, H, 0.09),
    height: H,
  };
}

export type MonsterKind = 'ghoul' | 'skeleton' | 'brute' | 'wraith';

export function monsterSprites(kind: MonsterKind, pal: Palette, size: SpriteSize, outline: boolean): CharacterSprites {
  const scale = size === 'large' ? 2 : 1;
  if (kind === 'wraith') return wraithSprites(pal, scale, outline);
  const H = (kind === 'brute' ? 28 : kind === 'ghoul' ? 18 : 22) * scale;
  const W = Math.round(H * (kind === 'brute' ? 0.9 : 0.7));
  const materials = { skin: pal.ghoul, dark: pal.ghoulDark, bone: pal.bone, boneDark: 0x9a9078, brute: pal.brute, bruteDark: pal.bruteDark, leather: pal.leather, steel: pal.steel, wood: pal.wood };
  const look =
    kind === 'ghoul'
      ? { skin: 'skin', body: 'skin', head: 'dark', legs: 'dark' }
      : kind === 'skeleton'
        ? { skin: 'bone', body: 'bone', head: 'bone', legs: 'boneDark' }
        : { skin: 'brute', body: 'brute', head: 'bruteDark', legs: 'bruteDark', trim: 'leather' };
  const extra = (d: Doll, frame: number) => {
    const eye = hex(pal.eyeGlow);
    const hx = 1 + Math.round(W / 2 + W * 0.05);
    const hy = 1 + Math.round(H * 0.17);
    if (kind === 'skeleton') {
      // Ribs and dark eye sockets
      for (let i = 0; i < 3; i++) d.buf.rect(px(1 + W * 0.28), 1 + px(H * 0.36) + i * Math.max(2, px(H * 0.06)), px(W * 0.44), 1, base(d, 'boneDark'));
      d.buf.set(hx + 1, hy, hex(pal.outline));
      d.buf.set(hx + 1, hy, [0x40, 0xff, 0x90]);
    } else if (kind === 'brute') {
      // Horns and tusks
      d.buf.line(hx - px(H * 0.1), hy - px(H * 0.1), hx - px(H * 0.16), hy - px(H * 0.2), base(d, 'bone'));
      d.buf.line(hx + px(H * 0.06), hy - px(H * 0.1), hx + px(H * 0.14), hy - px(H * 0.2), base(d, 'bone'));
      d.buf.set(hx + 2, hy, [0xff, 0x70, 0x20]);
    } else {
      d.buf.set(hx + 1, hy, eye);
      // Claws on the front hand
      const cy = 1 + px(H * 0.36) + px(H * 0.26) + (frame % 2);
      d.buf.line(px(1 + W * 0.84), cy, px(1 + W * 0.84) + 2, cy + 2, base(d, 'bone'));
    }
  };
  const make = (poses: (typeof POSES)['walk'], hunch: number) =>
    poses.map((p, i) => {
      const d = doll(H, W, pal, outline, materials);
      humanoid(d, pal, look, { ...p, lean: p.lean + hunch }, null);
      extra(d, i);
      return finish(d, hex(pal.outline));
    });
  const hunch = kind === 'ghoul' ? 1.5 : 0;
  return {
    idle: anim(make(POSES.idle, hunch), W, H, 0.5),
    walk: anim(make(POSES.walk, hunch), W, H, kind === 'brute' ? 0.18 : 0.1),
    attack: anim(make(POSES.attack, hunch), W, H, 0.09),
    height: H,
  };
}

function wraithSprites(pal: Palette, scale: number, outline: boolean): CharacterSprites {
  const H = 24 * scale;
  const W = 14 * scale;
  const materials = { cloth: pal.wraith, dark: pal.outline };
  const frame = (bob: number, flutter: number) => {
    const d = doll(H, W, pal, outline, materials);
    const c = base(d, 'cloth');
    const hw = W / 2 + 1;
    // Hood and tapering cloak
    d.buf.ellipse(hw, 1 + px(H * 0.2) + bob, px(W * 0.35), px(H * 0.16), c);
    for (let y = px(H * 0.3); y < H - px(H * 0.08); y++) {
      const t = (y - H * 0.3) / (H * 0.62);
      const half = px(W * 0.4 * (1 - t * 0.5));
      const wave = Math.round(Math.sin(y * 0.6 + flutter) * (t > 0.6 ? 1 : 0));
      d.buf.rect(hw - half + wave, 1 + y + bob, half * 2, 1, c);
    }
    // Torn hem
    for (let x = hw - px(W * 0.3); x <= hw + px(W * 0.3); x += 2) d.buf.rect(x + (flutter > 0 ? 1 : 0), 1 + H - px(H * 0.08) + bob, 1, px(H * 0.06), c);
    d.buf.rect(hw - 2, 1 + px(H * 0.2) + bob, 3, 2, hex(pal.outline));
    d.buf.set(hw - 1, 1 + px(H * 0.2) + bob, [0x9f, 0xe0, 0xff]);
    d.buf.set(hw + 1, 1 + px(H * 0.2) + bob, [0x9f, 0xe0, 0xff]);
    return finish(d, hex(pal.outline));
  };
  const idle = [frame(0, 0), frame(1, 1), frame(0, 2), frame(-1, 3)];
  return { idle: anim(idle, W, H, 0.2), walk: anim(idle, W, H, 0.15), attack: anim([frame(-2, 0), frame(-2, 1)], W, H, 0.12), height: H };
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
  const wallH = Math.round(tileH * 2.2);
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
  return { fireball, explosion, frostRing, shadow: shadow.toCanvas() };
}
